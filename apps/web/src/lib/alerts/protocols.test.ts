import { describe, expect, it } from 'vitest';
import { alertableChains, protocolsForChain } from './protocols';

describe('protocolsForChain', () => {
  it('maps each chain to the protocols the health adapters actually serve', () => {
    expect(protocolsForChain('eth')).toEqual(['aave-v3']);
    expect(protocolsForChain('sol')).toEqual(['kamino']);
    expect(protocolsForChain('stx')).toEqual(['zest', 'granite', 'arkadiko']);
  });

  it('returns no protocols for chains without lending adapters', () => {
    expect(protocolsForChain('btc')).toEqual([]);
    expect(protocolsForChain('sui')).toEqual([]);
  });
});

describe('alertableChains', () => {
  it('lists each monitorable chain exactly once', () => {
    const chains = alertableChains();
    expect(chains).toEqual(['eth', 'sol', 'stx']);
  });
});
