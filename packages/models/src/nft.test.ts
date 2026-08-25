import { describe, expect, it } from 'vitest';
import { NftAssetSchema, type NftAsset } from './nft.js';

const fullAsset: NftAsset = {
  chain: 'stx',
  protocol: 'sip9',
  contractId: 'SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.the-explorer-guild',
  tokenId: '3413',
  name: 'The Explorer Guild #3413',
  description: 'An explorer of the guild.',
  media: {
    url: 'https://ipfs.io/ipfs/QmHash/3413.png',
    contentType: 'image/png',
  },
  collection: {
    name: 'The Explorer Guild',
    explorerUrl:
      'https://explorer.hiro.so/txid/SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.the-explorer-guild',
    totalItems: 10000,
    floorPrice: { amount: '125.5', symbol: 'STX' },
  },
  attributes: [
    { trait: 'Background', value: 'Blue' },
    { trait: 'Eyes', value: 'Laser' },
  ],
  rarityRank: 42,
  owner: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86BZWVF6JM75H',
};

describe('NftAssetSchema', () => {
  it('round-trips a fully-populated asset', () => {
    const parsed = NftAssetSchema.parse(fullAsset);
    expect(parsed).toEqual(fullAsset);
  });

  it('accepts a minimal asset with only the required fields', () => {
    const minimal: NftAsset = {
      chain: 'stx',
      protocol: 'sip9',
      contractId: 'SP000.collection',
      tokenId: '1',
      name: 'Token #1',
      media: { url: 'https://example.com/1.png' },
      owner: 'SP000',
    };
    expect(NftAssetSchema.parse(minimal)).toEqual(minimal);
  });

  it('rejects an unknown protocol value', () => {
    expect(() => NftAssetSchema.parse({ ...fullAsset, protocol: 'erc721' })).toThrow();
  });

  it('rejects a non-Stacks-shaped asset missing required fields', () => {
    expect(() => NftAssetSchema.parse({ chain: 'stx', protocol: 'sip9' })).toThrow();
  });

  it('rejects a fractional rarity rank', () => {
    expect(() => NftAssetSchema.parse({ ...fullAsset, rarityRank: 1.5 })).toThrow();
  });
});
