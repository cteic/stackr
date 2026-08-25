import { describe, expect, it } from 'vitest';
import type { NftAsset } from '@stackr/models';
import { mergeNftAssets, nftQueryPairs } from './use-nft-holdings.js';

function asset(tokenId: string, owner: string): NftAsset {
  return {
    chain: 'stx',
    protocol: 'sip9',
    contractId: 'SP000.collection',
    tokenId,
    name: `Token #${tokenId}`,
    media: { url: `https://ipfs.io/ipfs/Qm/${tokenId}`, contentType: 'image/png' },
    owner,
  };
}

describe('nftQueryPairs', () => {
  it('pairs the SIP-9 adapter only with STX addresses', () => {
    const pairs = nftQueryPairs({ stx: ['SP1', 'SP2'], eth: ['0xabc'] });
    const byProtocol = pairs.map(({ adapter, address }) => `${adapter.protocol}:${address}`);
    expect(byProtocol).toContain('sip9:SP1');
    expect(byProtocol).toContain('sip9:SP2');
    // No NFT adapter serves EVM yet, so the EVM address yields no pair.
    expect(byProtocol).not.toContain('sip9:0xabc');
    expect(pairs.every(({ adapter }) => adapter.chain === 'stx')).toBe(true);
  });

  it('returns no pairs when no addresses are supplied', () => {
    expect(nftQueryPairs({})).toEqual([]);
  });
});

describe('mergeNftAssets', () => {
  it('concatenates every adapter × address result', () => {
    const merged = mergeNftAssets([[asset('1', 'SP1'), asset('2', 'SP1')], [asset('3', 'SP2')]]);
    expect(merged.map(a => a.tokenId)).toEqual(['1', '2', '3']);
  });

  it('drops undefined results (errored / loading) but keeps the rest — per-adapter isolation', () => {
    const merged = mergeNftAssets([[asset('1', 'SP1')], undefined, [asset('2', 'SP2')]]);
    expect(merged.map(a => a.tokenId)).toEqual(['1', '2']);
  });

  it('returns an empty array when every query is a miss', () => {
    expect(mergeNftAssets([undefined, undefined])).toEqual([]);
  });
});
