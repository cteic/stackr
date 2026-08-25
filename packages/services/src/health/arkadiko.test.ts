import { describe, expect, it, vi } from 'vitest';
import {
  arkadikoRatioBps,
  fetchArkadikoPosition,
  normalizeArkadikoVaults,
  type ArkadikoVaultInputs,
} from './arkadiko.js';
import { serializeClarityArg, type ClarityArg } from './clarity.js';

/**
 * Build one vault's raw inputs. Defaults model a token priced at $1.00 on the
 * oracle's 1e6 scale with the live-verified protocol parameters (liquidation
 * ratio 14000 bps = 140%, stability fee 600 bps), zero blocks accrued.
 */
function vault(overrides: Partial<ArkadikoVaultInputs>): ArkadikoVaultInputs {
  return {
    collateralRaw: 0n,
    debtRaw: 0n,
    vaultLastBlock: 0n,
    liquidationRatioBps: 14_000n,
    stabilityFeeBps: 600n,
    priceRaw: 1_000_000n,
    priceScale: 1_000_000n,
    burnBlockHeight: 0n,
    ...overrides,
  };
}

describe('arkadikoRatioBps', () => {
  it('replicates the contract math on live-verified STX figures', () => {
    // 1000 STX (6dp) at the live-read oracle price $0.161407 (scale 1e6)
    // against 100 USDA: (1e9 × 161407 × 100) / 1e8 / (1e6/100) = 16140 bps.
    const ratio = arkadikoRatioBps(
      vault({
        collateralRaw: 1_000_000_000n,
        debtRaw: 100_000_000n,
        priceRaw: 161_407n,
      }),
    );
    expect(ratio).toBe(16_140n);
  });

  it('handles the 1e8 oracle scale of the BTC tokens (sBTC, 8dp collateral)', () => {
    // 0.5 sBTC at the live-read $58,347.22 (scale 1e8) against 20,000 USDA:
    // (5e7 × 58347220000 × 100) / 2e10 / (1e8/100) = 14586 bps.
    const ratio = arkadikoRatioBps(
      vault({
        collateralRaw: 50_000_000n,
        debtRaw: 20_000_000_000n,
        priceRaw: 58_347_220_000n,
        priceScale: 100_000_000n,
      }),
    );
    expect(ratio).toBe(14_586n);
  });

  it('accrues the stability fee per Bitcoin block, contract division order', () => {
    // 600 bps on 100 USDA over one 144×365-block year: fee floor path is
    // ((600 × 1e8) / 10000 / 52560) × 52560 = 114 × 52560 = 5.99184 USDA, so
    // 140 tokens at $1: 1.4e16 / 105_991_840 / 1e4 = 13208 bps (vs 14000 flat).
    const ratio = arkadikoRatioBps(
      vault({
        collateralRaw: 140_000_000n,
        debtRaw: 100_000_000n,
        vaultLastBlock: 1_000n,
        burnBlockHeight: 1_000n + 144n * 365n,
      }),
    );
    expect(ratio).toBe(13_208n);
  });

  it('returns 0 for a vault with no debt (not liquidatable)', () => {
    expect(arkadikoRatioBps(vault({ collateralRaw: 140_000_000n }))).toBe(0n);
  });
});

describe('normalizeArkadikoVaults', () => {
  it('maps an at-threshold vault (ratio == liquidation ratio) to risk 1', () => {
    // 140 tokens at $1 against 100 USDA → ratio 14000 bps == the threshold.
    const position = normalizeArkadikoVaults('SPWALLET', [
      vault({ collateralRaw: 140_000_000n, debtRaw: 100_000_000n }),
    ]);
    expect(position).toMatchObject({
      chain: 'stx',
      protocol: 'arkadiko',
      address: 'SPWALLET',
      collateralValueUsd: 140,
      debtValueUsd: 100,
      oracle: 'arkadiko-oracle',
      native: { collateralRatio: 1.4, liquidationRatio: 1.4 },
    });
    expect(position?.liquidationRisk).toBe(1);
  });

  it('exceeds 1 once the ratio falls under the liquidation ratio', () => {
    // 120 tokens at $1 against 100 USDA → ratio 12000 bps < 14000.
    const position = normalizeArkadikoVaults('SPWALLET', [
      vault({ collateralRaw: 120_000_000n, debtRaw: 100_000_000n }),
    ]);
    expect(position?.liquidationRisk).toBeCloseTo(14_000 / 12_000, 6);
    expect(position?.liquidationRisk).toBeGreaterThan(1);
  });

  it('aggregates vaults: sums USD across scales, takes the worst risk', () => {
    const position = normalizeArkadikoVaults('SPWALLET', [
      // 280 tokens at $1 vs 100 USDA → ratio 28000, risk 0.5 (safer).
      vault({ collateralRaw: 280_000_000n, debtRaw: 100_000_000n }),
      // The live-verified sBTC vault: ratio 14586, risk 14000/14586 (worse).
      vault({
        collateralRaw: 50_000_000n,
        debtRaw: 20_000_000_000n,
        priceRaw: 58_347_220_000n,
        priceScale: 100_000_000n,
      }),
    ]);
    expect(position?.collateralValueUsd).toBeCloseTo(280 + 29_173.61, 2);
    expect(position?.debtValueUsd).toBe(20_100);
    expect(position?.liquidationRisk).toBeCloseTo(14_000 / 14_586, 6);
    expect(position?.native).toMatchObject({ collateralRatio: 1.4586, liquidationRatio: 1.4 });
  });

  it('maps a collateral-only vault (no debt) to risk 0, still counting the USD', () => {
    const position = normalizeArkadikoVaults('SPWALLET', [vault({ collateralRaw: 140_000_000n })]);
    expect(position).not.toBeNull();
    expect(position?.collateralValueUsd).toBe(140);
    expect(position?.liquidationRisk).toBe(0);
  });

  it('returns null when every vault is empty', () => {
    expect(normalizeArkadikoVaults('SPWALLET', [vault({}), vault({})])).toBeNull();
    expect(normalizeArkadikoVaults('SPWALLET', [])).toBeNull();
  });
});

describe('fetchArkadikoPosition', () => {
  const WALLET = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
  const WSTX = `${WALLET}.wstx-token`;

  /** Wrap a Clarity arg as the hex of `(ok …)`. */
  const okHex = (arg: ClarityArg) => `0x07${serializeClarityArg(arg).slice(2)}`;
  /** Bare (unwrapped) Clarity value hex — the oracle returns a plain tuple. */
  const bareHex = (arg: ClarityArg) => serializeClarityArg(arg);

  const tokenListHex = okHex({
    kind: 'list',
    values: [{ kind: 'contract-principal', contractId: WSTX }],
  });

  function vaultHex(collateral: bigint, debt: bigint): string {
    return okHex({
      kind: 'tuple',
      data: {
        collateral: { kind: 'uint', value: collateral },
        debt: { kind: 'uint', value: debt },
        'last-block': { kind: 'uint', value: 900_000n },
        status: { kind: 'uint', value: 101n },
      },
    });
  }

  const tokenParamsHex = okHex({
    kind: 'tuple',
    data: {
      'token-name': { kind: 'string-ascii', value: 'STX' },
      'liquidation-ratio': { kind: 'uint', value: 14_000n },
      'stability-fee': { kind: 'uint', value: 600n },
    },
  });

  const priceHex = bareHex({
    kind: 'tuple',
    data: {
      'last-price': { kind: 'uint', value: 1_000_000n },
      decimals: { kind: 'uint', value: 1_000_000n },
      'last-block': { kind: 'uint', value: 900_000n },
    },
  });

  /** Route the composed reads by the function name in the call-read URL. */
  function router(responses: Record<string, string>) {
    return vi.fn(async (url: string) => {
      for (const [fn, result] of Object.entries(responses)) {
        if (url.includes(fn)) {
          return { ok: true, json: async () => ({ okay: true, result }) };
        }
      }
      throw new Error(`unexpected url ${url}`);
    });
  }

  it('enumerates the live token list and composes a priced position', async () => {
    const fetchFn = router({
      'get-token-list': tokenListHex,
      'get-vault': vaultHex(140_000_000n, 100_000_000n),
      'get-token': tokenParamsHex,
      'get-price': priceHex,
    });

    const position = await fetchArkadikoPosition(WALLET, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(position?.protocol).toBe('arkadiko');
    expect(position?.collateralValueUsd).toBe(140);
    expect(position?.debtValueUsd).toBe(100);
    expect(position?.liquidationRisk).toBe(1);
  });

  it('skips pricing entirely for accounts with no vaults and returns null', async () => {
    const fetchFn = router({
      'get-token-list': tokenListHex,
      'get-vault': vaultHex(0n, 0n),
    });

    const position = await fetchArkadikoPosition(WALLET, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(position).toBeNull();
    const urls = fetchFn.mock.calls.map(([url]) => String(url));
    expect(urls.some(url => url.includes('get-price'))).toBe(false);
  });

  it('rejects an invalid address before any network call', async () => {
    const fetchFn = vi.fn();
    await expect(
      fetchArkadikoPosition('not-a-stacks-address', {
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('propagates a rejected call-read envelope (no swallowing)', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ okay: false, cause: 'Runtime error' }),
    }));
    await expect(
      fetchArkadikoPosition(WALLET, { fetchFn: fetchFn as unknown as typeof fetch }),
    ).rejects.toThrow('Runtime error');
  });
});
