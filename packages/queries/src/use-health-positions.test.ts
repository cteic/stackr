import { describe, expect, it } from 'vitest';
import type { HealthPosition } from '@stackr/models';
import { healthQueryPairs, mergeHealthPositions } from './use-health-positions.js';

function position(
  overrides: Partial<HealthPosition> & { liquidationRisk: number },
): HealthPosition {
  return {
    chain: 'eth',
    protocol: 'aave-v3',
    address: '0xabc',
    collateralValueUsd: 1_000,
    debtValueUsd: 500,
    native: {},
    oracle: 'aave-oracle',
    updatedAt: '2026-06-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('mergeHealthPositions', () => {
  it('drops nulls (no position) and undefined (still loading)', () => {
    const merged = mergeHealthPositions([
      position({ liquidationRisk: 0.4 }),
      null,
      undefined,
      position({ liquidationRisk: 0.7 }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('sorts riskiest-first', () => {
    const merged = mergeHealthPositions([
      position({ address: '0x1', liquidationRisk: 0.2 }),
      position({ address: '0x2', liquidationRisk: 0.9 }),
      position({ address: '0x3', liquidationRisk: 0.5 }),
    ]);
    expect(merged.map(p => p.liquidationRisk)).toEqual([0.9, 0.5, 0.2]);
  });

  it('returns an empty array when everything is a miss', () => {
    expect(mergeHealthPositions([null, undefined])).toEqual([]);
  });

  it('keeps the other results when one adapter is undefined (errored / loading)', () => {
    // Per-adapter isolation: useQueries yields `undefined` for the failed pair
    // while the rest resolve — the merge drops only the gap, never the others.
    const merged = mergeHealthPositions([
      position({ protocol: 'aave-v3', chain: 'eth', liquidationRisk: 0.3 }),
      undefined, // e.g. the Kamino read rejected
      position({ protocol: 'kamino', chain: 'sol', liquidationRisk: 0.6 }),
    ]);
    expect(merged.map(p => p.protocol)).toEqual(['kamino', 'aave-v3']);
  });
});

describe('healthQueryPairs', () => {
  it('pairs each adapter only with addresses on its own chain', () => {
    const pairs = healthQueryPairs({ eth: ['0xabc'], sol: ['SoL1', 'SoL2'] });

    const byProtocol = pairs.map(({ adapter, address }) => `${adapter.protocol}:${address}`);
    expect(byProtocol).toContain('aave-v3:0xabc');
    expect(byProtocol).toContain('kamino:SoL1');
    expect(byProtocol).toContain('kamino:SoL2');
    // Aave never gets a Solana address, Kamino never gets an EVM one.
    expect(byProtocol).not.toContain('aave-v3:SoL1');
    expect(byProtocol).not.toContain('kamino:0xabc');
  });

  it('fans a single Stacks address out to every Stacks protocol (Zest + Granite + Arkadiko)', () => {
    const pairs = healthQueryPairs({ stx: ['SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7'] });
    const protocols = pairs
      .filter(({ adapter }) => adapter.chain === 'stx')
      .map(({ adapter }) => adapter.protocol);
    expect(protocols).toContain('zest');
    expect(protocols).toContain('granite');
    expect(protocols).toContain('arkadiko');
    // All Stacks pairs target the same address; neither EVM/SOL adapter fires.
    expect(pairs.every(({ adapter }) => adapter.chain === 'stx')).toBe(true);
    expect(pairs).toHaveLength(3);
  });

  it('emits no pairs for a chain with no addresses', () => {
    const pairs = healthQueryPairs({ eth: ['0xabc'] });
    expect(pairs.every(({ adapter }) => adapter.chain === 'eth')).toBe(true);
    expect(pairs).toHaveLength(1);
  });

  it('returns no pairs when no addresses are supplied', () => {
    expect(healthQueryPairs({})).toEqual([]);
  });
});
