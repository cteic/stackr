import { describe, expect, it, vi } from 'vitest';
import { fetchZestPosition, normalizeZestGlobalData } from './zest.js';
import { serializeClarityArg, type ClarityArg, type ClarityValue } from './clarity.js';

/** Zest's `ONE_8` fixed-point scale, used to build figures in the wire shape. */
const ONE_8 = 100_000_000n;

interface GlobalDataFields {
  collateralUsd: number;
  debtUsd: number;
  ltv: number;
  liquidationThreshold: number;
  healthFactor: number;
}

/** `calculate-user-global-data` field names → 1e8-scaled BigInt values. */
function fields(input: GlobalDataFields): Record<string, bigint> {
  const scaled = (value: number): bigint => BigInt(Math.round(value * Number(ONE_8)));
  return {
    'total-collateral-balanceUSD': scaled(input.collateralUsd),
    'total-borrow-balanceUSD': scaled(input.debtUsd),
    'current-ltv': scaled(input.ltv),
    'current-liquidation-threshold': scaled(input.liquidationThreshold),
    'health-factor': scaled(input.healthFactor),
  };
}

/** A uint-only tuple as a decoded `ClarityValue` (what the normalizer reads). */
function clarityTuple(data: Record<string, bigint>): ClarityValue {
  return {
    kind: 'tuple',
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, { kind: 'uint' as const, value }]),
    ),
  };
}

/** A uint-only tuple as a `ClarityArg` (what the encoder serializes). */
function argTuple(data: Record<string, bigint>): ClarityArg {
  return {
    kind: 'tuple',
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, { kind: 'uint' as const, value }]),
    ),
  };
}

/** Build a decoded `calculate-user-global-data` tuple from the field map. */
function globalData(input: GlobalDataFields): ClarityValue {
  return clarityTuple(fields(input));
}

describe('normalizeZestGlobalData', () => {
  it('normalizes a borrowing position (risk = current-ltv / liquidation-threshold)', () => {
    const position = normalizeZestGlobalData(
      'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
      globalData({
        collateralUsd: 10_000,
        debtUsd: 4_000,
        ltv: 0.4,
        liquidationThreshold: 0.8,
        healthFactor: 50,
      }),
    );

    expect(position).toMatchObject({
      chain: 'stx',
      protocol: 'zest',
      address: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
      collateralValueUsd: 10_000,
      debtValueUsd: 4_000,
      oracle: 'zest-oracle',
      native: { ltv: 0.4, liquidationLtv: 0.8, healthFactor: 50 },
    });
    expect(position?.liquidationRisk).toBe(0.5); // 0.4 / 0.8
  });

  it('maps an at-threshold position (ltv == liqThreshold) to risk 1', () => {
    const position = normalizeZestGlobalData(
      'SPwallet',
      globalData({
        collateralUsd: 1_000,
        debtUsd: 800,
        ltv: 0.8,
        liquidationThreshold: 0.8,
        healthFactor: 1,
      }),
    );
    expect(position?.liquidationRisk).toBe(1);
  });

  it('exceeds 1 once current LTV passes the liquidation threshold', () => {
    const position = normalizeZestGlobalData(
      'SPwallet',
      globalData({
        collateralUsd: 1_000,
        debtUsd: 900,
        ltv: 0.9,
        liquidationThreshold: 0.8,
        healthFactor: 0,
      }),
    );
    expect(position?.liquidationRisk).toBeCloseTo(1.125, 6); // 0.9 / 0.8
    expect(position?.liquidationRisk).toBeGreaterThan(1);
  });

  it('maps a supply-only position (no borrow) to risk 0', () => {
    const position = normalizeZestGlobalData(
      'SPwallet',
      globalData({
        collateralUsd: 5_000,
        debtUsd: 0,
        ltv: 0,
        liquidationThreshold: 0.8,
        healthFactor: 100,
      }),
    );
    expect(position).not.toBeNull();
    expect(position?.debtValueUsd).toBe(0);
    expect(position?.liquidationRisk).toBe(0);
  });

  it('returns null when the account has neither collateral nor debt', () => {
    const position = normalizeZestGlobalData(
      'SPwallet',
      globalData({
        collateralUsd: 0,
        debtUsd: 0,
        ltv: 0,
        liquidationThreshold: 0,
        healthFactor: 0,
      }),
    );
    expect(position).toBeNull();
  });
});

describe('fetchZestPosition', () => {
  function okResponse(input: GlobalDataFields): Response {
    // Re-serialize the field map into the wire hex, wrapped in (ok …).
    const resultHex = `0x07${serializeClarityArg(argTuple(fields(input))).slice(2)}`;
    return {
      ok: true,
      json: async () => ({ okay: true, result: resultHex }),
    } as unknown as Response;
  }

  it('reads through call-read and normalizes the (ok …) result', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      okResponse({
        collateralUsd: 2_000,
        debtUsd: 1_000,
        ltv: 0.5,
        liquidationThreshold: 0.8,
        healthFactor: 30,
      }),
    );

    const position = await fetchZestPosition('SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7', {
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(position?.liquidationRisk).toBe(0.625); // 0.5 / 0.8
    expect(position?.collateralValueUsd).toBe(2_000);

    // The request hits calculate-user-global-data with the account as arg 0.
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('/pool-0-reserve-v2-0/calculate-user-global-data');
    const body = JSON.parse(init?.body as string);
    expect(body.arguments[0]).toBe(
      serializeClarityArg({
        kind: 'standard-principal',
        address: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
      }),
    );
  });

  it('propagates an upstream HTTP error (no swallowing)', async () => {
    const fetchFn = vi.fn(
      async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' }) as Response,
    );
    await expect(
      fetchZestPosition('SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7', {
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/503/);
  });
});
