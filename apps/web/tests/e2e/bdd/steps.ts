import { expect, type Page } from '@playwright/test';
import { defineStep, type StepContext } from './runner';

const MOCK_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TRUNCATED = `${MOCK_ADDRESS.slice(0, 6)}…${MOCK_ADDRESS.slice(-4)}`;

// --- Solana fixtures ------------------------------------------------------
//
// The Solana reads all go to the same-origin proxy (`sol-rpc.ts`), so one
// route stub covers the balance, the SPL positions and the activity feed, and
// nothing in a Solana scenario reaches the network.

/** The fixture account every Solana scenario connects. */
const SOL_ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const SOL_TRUNCATED = `${SOL_ADDRESS.slice(0, 6)}…${SOL_ADDRESS.slice(-4)}`;

/**
 * The 32 bytes `SOL_ADDRESS` decodes to. The Phantom adapter rebuilds its own
 * `PublicKey` from the provider's raw bytes, so the stub must hand back the
 * decode rather than the base58 string.
 */
const SOL_KEY_BYTES = [
  126, 140, 8, 135, 96, 191, 222, 29, 221, 207, 50, 193, 127, 32, 155, 130, 66, 238, 82, 170, 241,
  49, 250, 205, 136, 208, 234, 44, 109, 11, 6, 242,
];

/** The other side of the fixture transfer, shown only as a truncated address. */
const SOL_COUNTERPARTY = 'GDfnEsia2WLAW5t8yx2X5j2mkfA74i5kwGdDuZHt7XmG';
const SOL_SIGNATURE =
  '5h7Xb3Z1kqf3WqYxqkRZ8gQ6m1vGmK9xP2s5NqvL8t1hYq7pRtC4dWs9bE3jUuN2fA6kZzQ1rXm8yVbT4cH7dGkP';

/** A real registry mint (`sol-token-registry.ts`), so the row reads "USDC". */
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** The original SPL Token program — the batch's other half is Token-2022. */
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

const SOL_BLOCK_TIME = 1_726_000_000;
/** 2.5 SOL in lamports, rendered at the chain's nine decimals. */
const SOL_LAMPORTS = 2_500_000_000;
const SOL_BALANCE_TEXT = '2.500000000 SOL';
/** 125.5 USDC at six decimals. */
const USDC_RAW_AMOUNT = '125500000';
const USDC_AMOUNT_TEXT = '125.500000';
/** The lamport delta of the fixture transfer, as the activity rows render it. */
const SOL_TRANSFER_TEXT = '+0.500000000 SOL';

interface SolanaProviderKey {
  toBytes(): Uint8Array;
  toBase58(): string;
}

/**
 * The window marker a Solana extension injects, reduced to what the app's two
 * consumers touch: `wallet-detect.ts` probes for the global, and the Phantom
 * adapter reads the key and calls connect/disconnect on it.
 */
interface SolanaProviderMarker {
  isPhantom: boolean;
  isConnected: boolean;
  publicKey: SolanaProviderKey | null;
  connect(): Promise<{ publicKey: SolanaProviderKey }>;
  disconnect(): Promise<void>;
  on(): void;
  off(): void;
}

interface SolanaRpcCall {
  id: number;
  method: string;
  params: unknown;
}

interface SolanaFixture {
  /** Whether the SPL read reports a USDC position or an empty account. */
  holdsTokens: boolean;
}

/** Narrow a decoded request body to the JSON-RPC fields the stub answers on. */
function readRpcCall(value: unknown): SolanaRpcCall | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('id' in value) || !('method' in value)) return null;
  const { id, method } = value;
  if (typeof id !== 'number' || typeof method !== 'string') return null;
  return { id, method, params: 'params' in value ? value.params : undefined };
}

/** The program id a `getTokenAccountsByOwner` call filters on. */
function readProgramId(params: unknown): string | null {
  if (!Array.isArray(params)) return null;
  const filter: unknown = params[1];
  if (typeof filter !== 'object' || filter === null || !('programId' in filter)) return null;
  const { programId } = filter;
  return typeof programId === 'string' ? programId : null;
}

/**
 * One JSON-RPC answer, shaped to the ingress schemas in
 * `packages/services/src/sol.ts`, `sol-tokens.ts` and `transactions.ts` — a
 * looser payload is rejected by their Zod parse before it reaches the UI.
 */
function answerRpcCall(call: SolanaRpcCall, fixture: SolanaFixture): unknown {
  const envelope = { jsonrpc: '2.0', id: call.id };

  switch (call.method) {
    case 'getBalance':
      return { ...envelope, result: { context: { slot: 1 }, value: SOL_LAMPORTS } };

    case 'getTokenAccountsByOwner': {
      // Positions live under the original token program; Token-2022 answers
      // empty, which is the common real shape for an account like this.
      const holds = fixture.holdsTokens && readProgramId(call.params) === TOKEN_PROGRAM;
      return {
        ...envelope,
        result: {
          context: { slot: 1 },
          value: holds
            ? [
                {
                  pubkey: 'Bk3nZ6Dq3tJ6Uc2q3tXqjqDq9pQ4wCq5zVn8mLrT2yHf',
                  account: {
                    data: {
                      program: 'spl-token',
                      parsed: {
                        info: {
                          mint: USDC_MINT,
                          tokenAmount: { amount: USDC_RAW_AMOUNT, decimals: 6 },
                        },
                      },
                    },
                  },
                },
              ]
            : [],
        },
      };
    }

    case 'getSignaturesForAddress':
      return {
        ...envelope,
        result: [{ signature: SOL_SIGNATURE, slot: 1, blockTime: SOL_BLOCK_TIME, err: null }],
      };

    case 'getTransaction':
      // The owner sits at index 1, so it is not the fee payer and the lamport
      // delta is the transfer itself: 2.0 SOL to 2.5 SOL, a 0.5 SOL receive.
      return {
        ...envelope,
        result: {
          slot: 1,
          blockTime: SOL_BLOCK_TIME,
          transaction: {
            signatures: [SOL_SIGNATURE],
            message: { accountKeys: [{ pubkey: SOL_COUNTERPARTY }, { pubkey: SOL_ADDRESS }] },
          },
          meta: {
            fee: 5000,
            preBalances: [3_000_000_000, 2_000_000_000],
            postBalances: [2_494_995_000, SOL_LAMPORTS],
            err: null,
          },
        },
      };

    default:
      return { ...envelope, result: null };
  }
}

/**
 * Intercept every Solana JSON-RPC read. The services layer sends the SPL and
 * transaction-detail reads as JSON-RPC batches and the rest as single calls,
 * so the stub answers an array with an array.
 */
async function stubSolanaRpc(page: Page, fixture: SolanaFixture): Promise<void> {
  await page.route('**/api/rpc/solana', async route => {
    const body: unknown = route.request().postDataJSON();

    if (Array.isArray(body)) {
      const answers = body.flatMap(entry => {
        const call = readRpcCall(entry);
        return call ? [answerRpcCall(call, fixture)] : [];
      });
      await route.fulfill({ json: answers });
      return;
    }

    const call = readRpcCall(body);
    await route.fulfill({
      json: call ? answerRpcCall(call, fixture) : { jsonrpc: '2.0', id: 0, result: null },
    });
  });
}

const SYNC_CONFIGURED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== '';

function dialog({ page }: StepContext) {
  return page.getByRole('dialog', { name: 'Connect a wallet' });
}

function metamaskRow(ctx: StepContext) {
  return dialog(ctx).locator('li', { hasText: 'MetaMask' });
}

function stackrWalletRow(ctx: StepContext) {
  return dialog(ctx).locator('li', { hasText: 'Stackr Wallet' });
}

function phantomRow(ctx: StepContext) {
  return dialog(ctx).locator('li', { hasText: 'Phantom' });
}

// --- Givens ---------------------------------------------------------------

defineStep(/^a fresh visitor$/, async ({ page }) => {
  // Nothing persisted: a brand-new browser context is already fresh, but be
  // explicit so the step stays truthful if fixtures ever reuse contexts.
  await page.context().clearCookies();
});

defineStep(/^no wallet extensions are installed$/, async () => {
  // The default test browser has no extensions; nothing to do. The step
  // exists so the spec reads honestly.
});

defineStep(/^the MetaMask extension is installed$/, async ({ page }) => {
  // Detection marker only (`'ethereum' in window` — see wallet-detect.ts).
  // The actual connect transport is wagmi's mock connector, enabled by the
  // web server's NEXT_PUBLIC_E2E_MOCK_WALLET flag, so no SDK probing happens.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ethereum', { value: { isMetaMask: true }, configurable: true });
  });
});

defineStep(/^the Phantom extension is installed$/, async ({ page }) => {
  // Detection marker only (`'phantom' in window` — see wallet-detect.ts). The
  // Phantom adapter also reads its provider off that same global, so the
  // marker carries the minimum that path touches: a public key, connect and
  // disconnect, and the two events the adapter subscribes to. No SDK, no
  // extension and no transport is involved.
  await page.addInitScript(
    ({ address, bytes }) => {
      const publicKey: SolanaProviderKey = {
        toBytes: () => Uint8Array.from(bytes),
        toBase58: () => address,
      };
      const provider: SolanaProviderMarker = {
        isPhantom: true,
        isConnected: false,
        publicKey: null,
        connect() {
          provider.isConnected = true;
          provider.publicKey = publicKey;
          return Promise.resolve({ publicKey });
        },
        disconnect() {
          provider.isConnected = false;
          provider.publicKey = null;
          return Promise.resolve();
        },
        on() {
          return undefined;
        },
        off() {
          return undefined;
        },
      };
      Object.defineProperty(window, 'phantom', { value: { solana: provider }, configurable: true });
      Object.defineProperty(window, 'isPhantomInstalled', { value: true, configurable: true });
    },
    { address: SOL_ADDRESS, bytes: SOL_KEY_BYTES },
  );
});

defineStep(
  /^the Solana account holds SOL, a token position and one past transfer$/,
  async ({ page }) => {
    await stubSolanaRpc(page, { holdsTokens: true });
  },
);

defineStep(/^the Solana account holds no tokens$/, async ({ page }) => {
  await stubSolanaRpc(page, { holdsTokens: false });
});

defineStep(/^the Solana reads are being rate limited$/, async ({ page }) => {
  // 429 is the one status the services layer separates from a fault — it maps
  // to `rate-limited`, which the Tokens panel renders as "come back shortly"
  // rather than "the read failed". See fetch-wrapper.ts and retry.ts.
  await page.route('**/api/rpc/solana', route =>
    route.fulfill({ status: 429, json: { error: 'rate limit exceeded' } }),
  );
});

defineStep(/^the sync service is not configured$/, async ({ testInfo }) => {
  testInfo.skip(SYNC_CONFIGURED, 'Supabase env is present; the unavailable state cannot render.');
});

defineStep(/^the sync service is configured$/, async ({ testInfo }) => {
  testInfo.skip(!SYNC_CONFIGURED, 'Set NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY to run the QR scenario.');
});

// --- Whens ----------------------------------------------------------------

defineStep(/^they open the dashboard$/, async ({ page }) => {
  await page.goto('/');
});

defineStep(/^they open the connect modal$/, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Connect a wallet' })).toBeVisible();
});

defineStep(/^they load the demo portfolio$/, async ({ page }) => {
  await page.getByRole('button', { name: 'Load demo portfolio' }).click();
});

defineStep(/^they connect MetaMask$/, async ctx => {
  await metamaskRow(ctx).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(metamaskRow(ctx).getByRole('button', { name: 'Disconnect' })).toBeVisible({
    timeout: 15_000,
  });
});

defineStep(/^they disconnect MetaMask$/, async ctx => {
  await metamaskRow(ctx).getByRole('button', { name: 'Disconnect' }).click();
});

defineStep(/^they connect Phantom$/, async ctx => {
  await phantomRow(ctx)
    .getByRole('button', { name: 'Connect', exact: true })
    .click({ timeout: 15_000 });
  await expect(phantomRow(ctx).getByRole('button', { name: 'Disconnect' })).toBeVisible({
    timeout: 15_000,
  });
});

defineStep(/^they open the connected Solana wallet$/, async ctx => {
  // The connected account renders as an ordinary portfolio card, which the
  // open modal covers — so dismiss it first, then follow the card.
  await ctx.page.keyboard.press('Escape');
  await expect(dialog(ctx)).not.toBeVisible();
  await ctx.page
    .getByRole('link', { name: new RegExp(SOL_TRUNCATED) })
    .first()
    .click({ timeout: 15_000 });
  await expect(ctx.page.getByRole('heading', { name: 'Wallet' })).toBeVisible({ timeout: 15_000 });
});

defineStep(/^they close the connect modal$/, async ctx => {
  await ctx.page.keyboard.press('Escape');
  await expect(dialog(ctx)).not.toBeVisible();
});

defineStep(/^they choose to pair Stackr Wallet$/, async ctx => {
  await stackrWalletRow(ctx).getByRole('button', { name: 'Pair' }).click();
});

// --- Thens ----------------------------------------------------------------

defineStep(/^the get-started hero is visible$/, async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Get started' })).toBeVisible();
});

defineStep(/^the get-started hero is gone$/, async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Get started' })).not.toBeVisible();
});

defineStep(/^the "([^"]+)" action is available$/, async ({ page }, name) => {
  await expect(page.getByRole('button', { name })).toBeVisible();
});

defineStep(/^a demo wallet appears in the portfolio$/, async ({ page }) => {
  await expect(page.getByText('Demo ·').first()).toBeVisible();
});

defineStep(/^the MetaMask entry offers an install link$/, async ctx => {
  const installLink = metamaskRow(ctx).getByRole('link', { name: 'Install' });
  await expect(installLink).toBeVisible();
  await expect(installLink).toHaveAttribute('href', 'https://metamask.io/download');
});

defineStep(/^the MetaMask entry offers disconnect$/, async ctx => {
  await expect(metamaskRow(ctx).getByRole('button', { name: 'Disconnect' })).toBeVisible();
});

defineStep(/^the MetaMask entry offers connect$/, async ctx => {
  await expect(metamaskRow(ctx).getByRole('button', { name: 'Connect', exact: true })).toBeVisible({
    timeout: 15_000,
  });
});

defineStep(/^the header shows the wallets trigger$/, async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Wallets', exact: true })).toBeVisible();
});

defineStep(/^the connected address appears on the dashboard$/, async ({ page }) => {
  await expect(page.getByText(TRUNCATED).first()).toBeVisible({ timeout: 15_000 });
});

defineStep(/^the connected Solana address appears on the dashboard$/, async ({ page }) => {
  await expect(page.getByText(SOL_TRUNCATED).first()).toBeVisible({ timeout: 15_000 });
});

defineStep(/^the recent activity shows the incoming transfer$/, async ({ page }) => {
  await expect(page.getByText(SOL_TRANSFER_TEXT).first()).toBeVisible({ timeout: 15_000 });
});

defineStep(/^the balance card shows the SOL balance$/, async ({ page }) => {
  await expect(page.getByText(SOL_BALANCE_TEXT)).toBeVisible({ timeout: 15_000 });
});

defineStep(/^the token list shows the USDC position$/, async ({ page }) => {
  await expect(page.getByText('USDC', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(USDC_AMOUNT_TEXT)).toBeVisible();
});

defineStep(/^the token list says the account holds none$/, async ({ page }) => {
  await expect(page.getByText('No token balances on this account.')).toBeVisible({
    timeout: 15_000,
  });
});

defineStep(/^the token list says balances will load again shortly$/, async ({ page }) => {
  await expect(page.getByText('token balances will load again shortly')).toBeVisible({
    timeout: 15_000,
  });
});

defineStep(/^the token list does not report a failed read$/, async ({ page }) => {
  await expect(page.getByText('the Solana RPC read failed')).not.toBeVisible();
});

defineStep(/^the Stackr Wallet entry is unavailable$/, async ctx => {
  await expect(stackrWalletRow(ctx).getByRole('button', { name: 'Unavailable' })).toBeDisabled();
});

defineStep(/^the sync service explainer is shown$/, async ctx => {
  await expect(
    stackrWalletRow(ctx).getByText('Pairing needs the sync service configured'),
  ).toBeVisible();
});

defineStep(/^a pairing QR code is shown$/, async ({ page }) => {
  await expect(page.getByRole('img', { name: 'Stackr Link pairing QR code' })).toBeVisible({
    timeout: 15_000,
  });
});
