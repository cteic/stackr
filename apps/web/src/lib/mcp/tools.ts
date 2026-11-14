import { z } from 'zod';
import {
  chainMeta,
  ChainSchema,
  CurrencySchema,
  currencyMeta,
  validateAddress,
  type Chain,
  type Currency,
} from '@stackr/models';
import { fetchBalance, fetchPrices, formatFiat, getExplorerUrl } from '@stackr/services';
import { absoluteUrl, resolveSiteUrl } from '@/lib/site';

/**
 * The one tool the MCP endpoint exposes, and its implementation.
 *
 * `get_wallet_summary` answers the single question an agent would actually ask
 * Stackr: what is at this public address? The answer is public on-chain data,
 * so it needs no auth and holds no session.
 *
 * Security posture:
 * - Arguments are parsed with the domain Zod schemas in `strict()` mode, so an
 *   unexpected property — a `privateKey` or `mnemonic` an over-eager agent
 *   decided to helpfully include — is a validation error, never something this
 *   code reads, logs or forwards.
 * - Called server-side, the chain adapters resolve to their *public* upstream
 *   bases (see `resolveEtherscanBase` and friends), so no app-owned API key is
 *   in play on this path and none can appear in a response.
 * - Upstream failures collapse to a fixed message; upstream error text can echo
 *   a key-bearing URL and is never relayed.
 *
 * This lives in `lib/` rather than beside the route because a Next.js Route
 * Handler file may export nothing but its HTTP methods.
 */

export const WALLET_SUMMARY_TOOL_NAME = 'get_wallet_summary';

const WalletSummaryArgsSchema = z
  .object({
    chain: ChainSchema,
    address: z.string().trim().min(1).max(128),
    currency: CurrencySchema.optional(),
  })
  .strict();

/** The tool descriptors returned by `tools/list`, in MCP's shape. */
export const TOOLS = [
  {
    name: WALLET_SUMMARY_TOOL_NAME,
    title: 'Get wallet summary',
    description:
      'Read the current balance of a public blockchain address on Bitcoin, Stacks, Ethereum, Solana or Sui, valued in a fiat currency at the live spot price. Watch-only: this returns public on-chain data and never requires or accepts a private key, seed phrase or signature.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          enum: [...ChainSchema.options],
          description:
            'Which chain the address belongs to: btc (Bitcoin), stx (Stacks), eth (Ethereum), sol (Solana) or sui (Sui).',
        },
        address: {
          type: 'string',
          description:
            'The public receiving address to look up, in that chain’s standard text form. Never a private key or seed phrase.',
        },
        currency: {
          type: 'string',
          enum: [...CurrencySchema.options],
          description: 'Fiat currency to value the balance in. Defaults to usd.',
        },
      },
      required: ['chain', 'address'],
      additionalProperties: false,
    },
  },
];

export interface WalletSummary {
  chain: Chain;
  chainName: string;
  symbol: string;
  address: string;
  balance: string;
  rawBalance: string;
  currency: Currency;
  price: number | null;
  change24h: number | null;
  value: number | null;
  valueFormatted: string | null;
  explorerUrl: string;
  stackrUrl: string;
  updatedAt: string;
  disclaimer: string;
}

/** An MCP tool result: content blocks, plus `isError` for a tool-level failure. */
export interface ToolCallResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

function toolResult(payload: unknown): ToolCallResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function toolError(message: string): ToolCallResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export async function getWalletSummary(
  chain: Chain,
  address: string,
  currency: Currency,
): Promise<WalletSummary> {
  const balance = await fetchBalance(chain, address);

  // A missing price must not fail the balance read — the balance is the answer,
  // the fiat valuation is the garnish.
  const price = await fetchPrices([chain], currency).then(
    prices => prices.find(entry => entry.chain === chain) ?? null,
    () => null,
  );

  const numericBalance = Number.parseFloat(balance.balance);
  const value =
    price !== null && Number.isFinite(numericBalance) ? numericBalance * price.fiatPrice : null;
  const meta = chainMeta[chain];

  return {
    chain,
    chainName: meta.name,
    symbol: meta.symbol,
    address,
    balance: balance.balance,
    rawBalance: balance.rawBalance,
    currency,
    price: price?.fiatPrice ?? null,
    change24h: price?.change24h ?? null,
    value,
    valueFormatted: value === null ? null : formatFiat(value, currency),
    explorerUrl: getExplorerUrl(chain, 'address', address),
    stackrUrl: absoluteUrl(`/wallet/${chain}/${address}`, resolveSiteUrl()),
    updatedAt: balance.updatedAt,
    disclaimer: `Public on-chain data read by Stackr (${currencyMeta[currency].name} valuation at spot). Watch-only: Stackr never holds keys and cannot move funds.`,
  };
}

export async function callTool(name: string, rawArguments: unknown): Promise<ToolCallResult> {
  if (name !== WALLET_SUMMARY_TOOL_NAME) {
    return toolError(`Unknown tool: ${name}`);
  }

  const parsed = WalletSummaryArgsSchema.safeParse(rawArguments ?? {});
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    return toolError(
      `Invalid arguments: ${issue?.path.join('.') || 'arguments'} — ${issue?.message ?? 'invalid'}`,
    );
  }

  const { chain, address } = parsed.data;
  const currency = parsed.data.currency ?? 'usd';

  // Chain-shape validation before any upstream call, so a malformed address is
  // rejected here rather than becoming request material for a metered API.
  const addressCheck = validateAddress(chain, address);
  if (!addressCheck.valid) {
    return toolError(`Invalid address for ${chainMeta[chain].name}: ${addressCheck.error}`);
  }

  try {
    return toolResult(await getWalletSummary(chain, address, currency));
  } catch {
    // Fixed contract: upstream error text can echo a request URL, never relayed.
    return toolError(`Could not read the ${chainMeta[chain].name} balance for that address.`);
  }
}
