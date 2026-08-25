import { describe, expect, it } from 'vitest';
import type { NftAsset } from '@stackr/models';
import {
  classifyNftMediaKind,
  createNftCardView,
  nftMediaPlayback,
} from './create-nft-card-view.js';

function assetWith(contentType: string | undefined, overrides: Partial<NftAsset> = {}): NftAsset {
  return {
    chain: 'stx',
    protocol: 'sip9',
    contractId: 'SP000.collection',
    tokenId: '1',
    name: 'Token #1',
    media: { url: 'https://ipfs.io/ipfs/Qm/1', contentType },
    owner: 'SP000',
    ...overrides,
  };
}

describe('classifyNftMediaKind', () => {
  it('maps content-type families to renderer kinds', () => {
    expect(classifyNftMediaKind('image/png')).toBe('image');
    expect(classifyNftMediaKind('image/svg+xml')).toBe('image');
    expect(classifyNftMediaKind('video/mp4')).toBe('video');
    expect(classifyNftMediaKind('audio/mpeg')).toBe('audio');
    expect(classifyNftMediaKind('model/gltf-binary')).toBe('model');
  });

  it('is unsupported for unknown or missing types', () => {
    expect(classifyNftMediaKind('application/json')).toBe('unsupported');
    expect(classifyNftMediaKind(undefined)).toBe('unsupported');
    expect(classifyNftMediaKind(null)).toBe('unsupported');
  });
});

describe('nftMediaPlayback', () => {
  it('autoplays muted, looped video thumbnails without controls', () => {
    expect(nftMediaPlayback('video', 'thumbnail')).toEqual({
      controls: false,
      autoPlay: true,
      loop: true,
      muted: true,
      playsInline: true,
    });
  });

  it('shows controls and does not autoplay in full mode', () => {
    expect(nftMediaPlayback('video', 'full')).toEqual({
      controls: true,
      autoPlay: false,
      loop: false,
      muted: false,
      playsInline: true,
    });
  });
});

describe('createNftCardView', () => {
  it('dispatches each media type to its renderer kind', () => {
    expect(createNftCardView(assetWith('image/png'), { hideBalance: false }).media.kind).toBe(
      'image',
    );
    expect(createNftCardView(assetWith('video/mp4'), { hideBalance: false }).media.kind).toBe(
      'video',
    );
    expect(createNftCardView(assetWith('audio/wav'), { hideBalance: false }).media.kind).toBe(
      'audio',
    );
    expect(createNftCardView(assetWith('model/gltf+json'), { hideBalance: false }).media.kind).toBe(
      'model',
    );
  });

  it('builds a stable key and passes the resolved media URL through', () => {
    const view = createNftCardView(assetWith('image/png'), { hideBalance: false });
    expect(view.key).toBe('SP000.collection:1');
    expect(view.media.url).toBe('https://ipfs.io/ipfs/Qm/1');
  });

  it('formats a labelled floor estimate and masks it when balances are hidden', () => {
    const withFloor = assetWith('image/png', {
      collection: { name: 'Collection', floorPrice: { amount: '125.5', symbol: 'STX' } },
    });
    expect(createNftCardView(withFloor, { hideBalance: false }).floorText).toBe('125.5 STX');
    expect(createNftCardView(withFloor, { hideBalance: false }).floorLabel).toBe('Floor (est.)');
    expect(createNftCardView(withFloor, { hideBalance: true }).floorText).toBe('••••');
  });

  it('has no floor label when the collection has no floor', () => {
    const view = createNftCardView(assetWith('image/png'), { hideBalance: false });
    expect(view.floorText).toBeNull();
    expect(view.floorLabel).toBeNull();
  });

  it('surfaces rarity and collection metadata', () => {
    const view = createNftCardView(
      assetWith('image/png', {
        rarityRank: 42,
        collection: { name: 'The Explorer Guild', explorerUrl: 'https://explorer/x' },
      }),
      { hideBalance: false },
    );
    expect(view.rarityText).toBe('Rank #42');
    expect(view.collectionName).toBe('The Explorer Guild');
    expect(view.explorerUrl).toBe('https://explorer/x');
  });
});
