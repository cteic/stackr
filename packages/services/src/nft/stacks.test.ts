import { describe, expect, it } from 'vitest';
import {
  fetchStacksNfts,
  parseAssetIdentifier,
  tokenIdFromRepr,
  normalizeStxFloor,
  mergeTokenMetadata,
} from './stacks.js';

// Sanitized Hiro holdings response (`/extended/v1/tokens/nft/holdings`). The
// `asset_identifier` is `<contract-id>::<asset-name>` and `value.repr` is the
// Clarity token id.
const holdingsFixture = {
  limit: 200,
  offset: 0,
  total: 1,
  results: [
    {
      asset_identifier:
        'SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.the-explorer-guild::The-Explorer-Guild',
      value: { hex: '0x0100000000000000000000000000000d55', repr: 'u3413' },
    },
  ],
};

// Sanitized Hiro token metadata (`/metadata/v1/nft/<contract>/<id>`).
const hiroMetadataFixture = {
  token_uri: 'ipfs://QmTokenUri/3413.json',
  metadata: {
    name: 'Explorer #3413 (Hiro)',
    description: 'Description from Hiro',
    image: 'ipfs://QmHiroImage/3413.png',
    attributes: [
      { trait_type: 'Background', value: 'Blue' },
      { trait_type: 'Level', value: 7 },
    ],
  },
};

// Representative Gamma collectible (`/get-stacks-nft?id=<contract>_<id>`).
const gammaMetadataFixture = {
  name: 'The Explorer Guild #3413',
  description: 'Description from Gamma',
  content_url: 'ipfs://QmGammaImage/3413.png',
  content_type: 'image/png',
  collection: { name: 'The Explorer Guild', floor_price: 125500000, total_count: 10000 },
  rarity_rank: 42,
};

interface Routes {
  holdings: unknown;
  gamma?: unknown | 'reject';
  hiro?: unknown | 'reject';
}

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
  } as unknown as Response;
}

function errorResponse(): Response {
  return {
    ok: false,
    status: 500,
    statusText: 'Server Error',
    json: async () => ({}),
  } as unknown as Response;
}

function makeFetch(routes: Routes): typeof fetch {
  return (async (input: string) => {
    const url = String(input);
    if (url.includes('/nft/holdings')) return jsonResponse(routes.holdings);
    if (url.includes('gamma.io')) {
      return routes.gamma === 'reject' ? errorResponse() : jsonResponse(routes.gamma);
    }
    if (url.includes('/metadata/v1/nft/')) {
      return routes.hiro === 'reject' ? errorResponse() : jsonResponse(routes.hiro);
    }
    return errorResponse();
  }) as unknown as typeof fetch;
}

const OWNER = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86BZWVF6JM75H';
const detectType = async (): Promise<string | undefined> => 'image/png';

describe('parseAssetIdentifier', () => {
  it('splits a contract id from its asset name', () => {
    expect(parseAssetIdentifier('SP2X0.contract::AssetName')).toEqual({
      contractId: 'SP2X0.contract',
      assetName: 'AssetName',
    });
  });
});

describe('tokenIdFromRepr', () => {
  it('strips the Clarity uint prefix', () => {
    expect(tokenIdFromRepr('u3413')).toBe('3413');
  });
});

describe('normalizeStxFloor', () => {
  it('treats an integer as micro-STX and converts to STX (decimal-safe)', () => {
    expect(normalizeStxFloor(125500000)).toEqual({ amount: '125.5', symbol: 'STX' });
  });

  it('passes a decimal value through as STX', () => {
    expect(normalizeStxFloor('125.5')).toEqual({ amount: '125.5', symbol: 'STX' });
  });

  it('returns undefined for a zero or empty floor', () => {
    expect(normalizeStxFloor(0)).toBeUndefined();
    expect(normalizeStxFloor('')).toBeUndefined();
  });
});

describe('mergeTokenMetadata', () => {
  it('prefers Gamma and fills gaps from Hiro', () => {
    const merged = mergeTokenMetadata(
      { name: 'Gamma name', contentType: 'image/png' },
      { name: 'Hiro name', description: 'Hiro desc', mediaUrl: 'ipfs://hiro' },
    );
    expect(merged.name).toBe('Gamma name');
    expect(merged.description).toBe('Hiro desc');
    expect(merged.contentType).toBe('image/png');
    expect(merged.mediaUrl).toBe('ipfs://hiro');
  });
});

describe('fetchStacksNfts', () => {
  it('merges Gamma (preferred) over Hiro into a normalized asset', async () => {
    const assets = await fetchStacksNfts(OWNER, {
      fetchImpl: makeFetch({
        holdings: holdingsFixture,
        gamma: gammaMetadataFixture,
        hiro: hiroMetadataFixture,
      }),
      detectType,
    });

    expect(assets).toHaveLength(1);
    const asset = assets[0];
    expect(asset.chain).toBe('stx');
    expect(asset.protocol).toBe('sip9');
    expect(asset.contractId).toBe('SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.the-explorer-guild');
    expect(asset.tokenId).toBe('3413');
    // Gamma wins name, description, media and content type.
    expect(asset.name).toBe('The Explorer Guild #3413');
    expect(asset.description).toBe('Description from Gamma');
    expect(asset.media.url).toBe('https://ipfs.io/ipfs/QmGammaImage/3413.png');
    expect(asset.media.contentType).toBe('image/png');
    // Floor converted from micro-STX, decimal-safe.
    expect(asset.collection?.floorPrice).toEqual({ amount: '125.5', symbol: 'STX' });
    expect(asset.collection?.name).toBe('The Explorer Guild');
    expect(asset.rarityRank).toBe(42);
    // Attributes only Hiro carried still survive the merge.
    expect(asset.attributes).toEqual([
      { trait: 'Background', value: 'Blue' },
      { trait: 'Level', value: '7' },
    ]);
    expect(asset.owner).toBe(OWNER);
  });

  it('falls back to Hiro when Gamma is unavailable', async () => {
    const assets = await fetchStacksNfts(OWNER, {
      fetchImpl: makeFetch({
        holdings: holdingsFixture,
        gamma: 'reject',
        hiro: hiroMetadataFixture,
      }),
      detectType,
    });

    expect(assets).toHaveLength(1);
    const asset = assets[0];
    expect(asset.name).toBe('Explorer #3413 (Hiro)');
    expect(asset.description).toBe('Description from Hiro');
    expect(asset.media.url).toBe('https://ipfs.io/ipfs/QmHiroImage/3413.png');
    // Hiro carries no content type, so it is detected from the resolved URL.
    expect(asset.media.contentType).toBe('image/png');
    // Hiro has no floor source.
    expect(asset.collection?.floorPrice).toBeUndefined();
  });

  it('returns an empty list for an address holding no NFTs', async () => {
    const assets = await fetchStacksNfts(OWNER, {
      fetchImpl: makeFetch({ holdings: { limit: 200, offset: 0, total: 0, results: [] } }),
      detectType,
    });
    expect(assets).toEqual([]);
  });

  it('drops a token when both metadata sources fail (one bad token never fails the address)', async () => {
    const assets = await fetchStacksNfts(OWNER, {
      fetchImpl: makeFetch({ holdings: holdingsFixture, gamma: 'reject', hiro: 'reject' }),
      detectType,
    });
    expect(assets).toEqual([]);
  });
});
