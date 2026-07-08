import { describe, expect, it } from 'vitest';
import { HealthPositionSchema, ProtocolSchema } from './health.js';

describe('HealthPositionSchema', () => {
  const validPosition = {
    chain: 'eth' as const,
    protocol: 'aave-v3' as const,
    address: '0xabc',
    collateralValueUsd: 10_000,
    debtValueUsd: 4_000,
    liquidationRisk: 0.5,
    native: { healthFactor: 2, ltv: 0.4, liquidationLtv: 0.8 },
    oracle: 'aave-oracle',
    updatedAt: '2026-06-11T00:00:00.000Z',
  };

  it('round-trips a fully-populated position', () => {
    const parsed = HealthPositionSchema.parse(validPosition);
    expect(parsed).toEqual(validPosition);
  });

  it('accepts an empty native block (protocols expose different subsets)', () => {
    const parsed = HealthPositionSchema.parse({ ...validPosition, native: {} });
    expect(parsed.native).toEqual({});
  });

  it('rejects a negative liquidationRisk', () => {
    expect(() => HealthPositionSchema.parse({ ...validPosition, liquidationRisk: -0.1 })).toThrow();
  });

  it('rejects a non-ISO updatedAt', () => {
    expect(() =>
      HealthPositionSchema.parse({ ...validPosition, updatedAt: 'yesterday' }),
    ).toThrow();
  });

  it('rejects an unknown protocol', () => {
    expect(() => HealthPositionSchema.parse({ ...validPosition, protocol: 'compound' })).toThrow();
  });

  it('pins the first-slice protocol union', () => {
    expect(ProtocolSchema.options).toEqual(['aave-v3', 'kamino', 'zest', 'granite', 'arkadiko']);
  });
});
