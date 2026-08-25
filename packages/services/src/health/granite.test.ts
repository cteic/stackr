import { describe, expect, it, vi } from 'vitest';
import { fetchGranitePosition, normalizeGranitePosition } from './granite.js';
import { serializeClarityArg, type ClarityArg } from './clarity.js';

const COLLATERAL_ONE = 10n ** 8n; // collateral USD scale (Pyth, 8 dp)
const DEBT_ONE = 10n ** 6n; // borrow stablecoin scale (aeUSDC, 6 dp)
// liquidation-ltv is 8 dp, so 0.8 == 80_000_000n (used inline below)

const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const WALLET = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7';

describe('normalizeGranitePosition', () => {
  it('normalizes a borrowing position (risk = currentLtv / liquidationLtv)', () => {
    const position = normalizeGranitePosition(WALLET, {
      collateralRaw: 10_000n * COLLATERAL_ONE,
      debtRaw: 4_000n * DEBT_ONE,
      liquidationLtvRaw: 80_000_000n, // 0.8
    });

    expect(position).toMatchObject({
      chain: 'stx',
      protocol: 'granite',
      address: WALLET,
      collateralValueUsd: 10_000,
      debtValueUsd: 4_000,
      oracle: 'pyth',
      native: { ltv: 0.4, liquidationLtv: 0.8 },
    });
    expect(position?.liquidationRisk).toBe(0.5); // (4000/10000) / 0.8
  });

  it('maps an at-threshold position to risk 1 (soft-liquidation boundary)', () => {
    const position = normalizeGranitePosition(WALLET, {
      collateralRaw: 10_000n * COLLATERAL_ONE,
      debtRaw: 8_000n * DEBT_ONE,
      liquidationLtvRaw: 80_000_000n,
    });
    expect(position?.liquidationRisk).toBe(1);
  });

  it('exceeds 1 once the position is being softly liquidated', () => {
    const position = normalizeGranitePosition(WALLET, {
      collateralRaw: 10_000n * COLLATERAL_ONE,
      debtRaw: 9_000n * DEBT_ONE,
      liquidationLtvRaw: 80_000_000n,
    });
    expect(position?.liquidationRisk).toBeCloseTo(1.125, 6); // 0.9 / 0.8
    expect(position?.liquidationRisk).toBeGreaterThan(1);
  });

  it('maps a collateral-only position (no debt) to risk 0', () => {
    const position = normalizeGranitePosition(WALLET, {
      collateralRaw: 5_000n * COLLATERAL_ONE,
      debtRaw: 0n,
      liquidationLtvRaw: 80_000_000n,
    });
    expect(position).not.toBeNull();
    expect(position?.debtValueUsd).toBe(0);
    expect(position?.liquidationRisk).toBe(0);
  });

  it('returns null when the account has neither collateral nor debt', () => {
    expect(
      normalizeGranitePosition(WALLET, { collateralRaw: 0n, debtRaw: 0n, liquidationLtvRaw: 0n }),
    ).toBeNull();
  });
});

describe('fetchGranitePosition', () => {
  /** Wrap a Clarity arg as the hex of `(ok …)` / `(some …)`. */
  const okHex = (arg: ClarityArg) => `0x07${serializeClarityArg(arg).slice(2)}`;
  const someHex = (arg: ClarityArg) => `0x0a${serializeClarityArg(arg).slice(2)}`;

  /** Route the three composed reads by the function name in the URL. */
  function router(responses: { collateral: string; position: string; collateralParams: string }) {
    return vi.fn(async (url: string) => {
      if (url.includes('get-user-collaterals-value')) {
        return { ok: true, json: async () => ({ okay: true, result: responses.collateral }) };
      }
      if (url.includes('get-user-position')) {
        return { ok: true, json: async () => ({ okay: true, result: responses.position }) };
      }
      if (url.includes('get-collateral')) {
        return { ok: true, json: async () => ({ okay: true, result: responses.collateralParams }) };
      }
      throw new Error(`unexpected url ${url}`);
    });
  }

  it('composes collateral value + position + liquidation-ltv into a position', async () => {
    const fetchFn = router({
      collateral: okHex({ kind: 'uint', value: 10_000n * COLLATERAL_ONE }),
      position: someHex({
        kind: 'tuple',
        data: {
          'borrowed-amount': { kind: 'uint', value: 4_000n * DEBT_ONE },
          collaterals: { kind: 'list', values: [{ kind: 'contract-principal', contractId: SBTC }] },
        },
      }),
      collateralParams: someHex({
        kind: 'tuple',
        data: { 'liquidation-ltv': { kind: 'uint', value: 80_000_000n } },
      }),
    });

    const position = await fetchGranitePosition(WALLET, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(position?.collateralValueUsd).toBe(10_000);
    expect(position?.debtValueUsd).toBe(4_000);
    expect(position?.liquidationRisk).toBe(0.5);
  });

  it('returns null for an account with no collateral and no borrow position', async () => {
    const fetchFn = router({
      collateral: okHex({ kind: 'uint', value: 0n }),
      position: '0x09', // (none)
      collateralParams: '0x09',
    });

    const position = await fetchGranitePosition(WALLET, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(position).toBeNull();
  });

  it('propagates an upstream HTTP error (no swallowing)', async () => {
    const fetchFn = vi.fn(
      async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }) as Response,
    );
    await expect(fetchGranitePosition(WALLET, { fetchFn })).rejects.toThrow(/500/);
  });
});
