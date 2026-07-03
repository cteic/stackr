import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchKaminoPosition,
  normalizeKaminoObligations,
  type KaminoObligation,
} from './kamino.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Build a Kamino obligation in the upstream shape: decimal strings, with
 * `loanToValue` / `liquidationLtv` as 0..1 fractions and the totals in USD.
 */
function obligation(overrides: Partial<KaminoObligation>): KaminoObligation {
  return {
    loanToValue: '0',
    liquidationLtv: '0',
    userTotalDeposit: '0',
    userTotalBorrow: '0',
    ...overrides,
  };
}

describe('normalizeKaminoObligations', () => {
  it('normalizes a borrowing position (risk = currentLtv / liquidationLtv)', () => {
    const position = normalizeKaminoObligations('SoLwallet', [
      obligation({
        userTotalDeposit: '10000',
        userTotalBorrow: '4000',
        loanToValue: '0.4',
        liquidationLtv: '0.8',
      }),
    ]);

    expect(position).not.toBeNull();
    expect(position).toMatchObject({
      chain: 'sol',
      protocol: 'kamino',
      address: 'SoLwallet',
      collateralValueUsd: 10_000,
      debtValueUsd: 4_000,
      oracle: 'kamino-scope',
      native: { ltv: 0.4, liquidationLtv: 0.8 },
    });
    // 0.4 / 0.8 = 0.5
    expect(position?.liquidationRisk).toBe(0.5);
  });

  it('maps an at-threshold obligation (ltv == liqLtv) to risk >= 1 (liquidatable)', () => {
    const position = normalizeKaminoObligations('SoLwallet', [
      obligation({
        userTotalDeposit: '1000',
        userTotalBorrow: '850',
        loanToValue: '0.85',
        liquidationLtv: '0.85',
      }),
    ]);

    expect(position?.liquidationRisk).toBe(1);
  });

  it('exceeds 1 once current LTV passes the liquidation LTV', () => {
    const position = normalizeKaminoObligations('SoLwallet', [
      obligation({
        userTotalDeposit: '1000',
        userTotalBorrow: '900',
        loanToValue: '0.9',
        liquidationLtv: '0.8',
      }),
    ]);

    // 0.9 / 0.8 = 1.125 → past the threshold
    expect(position?.liquidationRisk).toBeCloseTo(1.125, 6);
    expect(position?.liquidationRisk).toBeGreaterThan(1);
  });

  it('aggregates multiple obligations: sums USD, takes the worst risk + its native LTVs', () => {
    const position = normalizeKaminoObligations('SoLwallet', [
      obligation({
        userTotalDeposit: '5000',
        userTotalBorrow: '1000',
        loanToValue: '0.2',
        liquidationLtv: '0.8', // risk 0.25 (safer)
      }),
      obligation({
        userTotalDeposit: '2000',
        userTotalBorrow: '1200',
        loanToValue: '0.6',
        liquidationLtv: '0.75', // risk 0.8 (worse → drives the pill)
      }),
    ]);

    expect(position?.collateralValueUsd).toBe(7_000);
    expect(position?.debtValueUsd).toBe(2_200);
    expect(position?.liquidationRisk).toBeCloseTo(0.8, 6);
    expect(position?.native).toMatchObject({ ltv: 0.6, liquidationLtv: 0.75 });
  });

  it('maps a supply-only obligation (no borrow) to risk 0', () => {
    const position = normalizeKaminoObligations('SoLwallet', [
      obligation({
        userTotalDeposit: '5000',
        userTotalBorrow: '0',
        loanToValue: '0',
        liquidationLtv: '0.8',
      }),
    ]);

    expect(position).not.toBeNull();
    expect(position?.debtValueUsd).toBe(0);
    expect(position?.liquidationRisk).toBe(0);
  });

  it('returns null for a wallet with no obligations (empty list, not an error)', () => {
    expect(normalizeKaminoObligations('SoLwallet', [])).toBeNull();
  });

  it('returns null when every obligation is empty (no collateral, no debt)', () => {
    expect(normalizeKaminoObligations('SoLwallet', [obligation({})])).toBeNull();
  });
});

describe('fetchKaminoPosition', () => {
  it('requests the un-versioned obligations route (the SDK `/v2` base 404s live)', async () => {
    const fn = vi.fn(async (_url?: unknown, _init?: unknown) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [],
    }));
    vi.stubGlobal('fetch', fn);

    await fetchKaminoPosition('SoLwallet');

    expect(fn).toHaveBeenCalledWith(
      'https://api.kamino.finance/kamino-market/7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF/users/SoLwallet/obligations',
    );
  });

  it('reads through the injected fetch and normalizes the result', async () => {
    const fetchObligations = vi.fn(
      async (): Promise<KaminoObligation[]> => [
        obligation({
          userTotalDeposit: '2000',
          userTotalBorrow: '1000',
          loanToValue: '0.5',
          liquidationLtv: '0.8',
        }),
      ],
    );

    const position = await fetchKaminoPosition('SoLwallet', fetchObligations);

    expect(fetchObligations).toHaveBeenCalledWith('SoLwallet');
    expect(position?.liquidationRisk).toBe(0.625); // 0.5 / 0.8
    expect(position?.collateralValueUsd).toBe(2_000);
  });

  it('returns null when the wallet has no obligations', async () => {
    const fetchObligations = vi.fn(async (): Promise<KaminoObligation[]> => []);
    expect(await fetchKaminoPosition('SoLwallet', fetchObligations)).toBeNull();
  });

  it('propagates an upstream error so the hook surfaces it (no swallowing)', async () => {
    const fetchObligations = vi.fn(async (): Promise<KaminoObligation[]> => {
      throw new Error('Kamino API error: 503 Service Unavailable');
    });

    await expect(fetchKaminoPosition('SoLwallet', fetchObligations)).rejects.toThrow(
      'Kamino API error: 503',
    );
  });
});
