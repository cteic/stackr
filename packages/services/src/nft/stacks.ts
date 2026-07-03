import { z } from 'zod';
import type { Money, NftAsset, NftAttribute } from '@stackr/models';
import { NftAssetSchema, chainMeta } from '@stackr/models';
import type { NftAdapter } from '../ports.js';
import { parseOrThrow } from '../validate.js';
import { formatBaseUnits } from '../base-units.js';
import { getExplorerUrl } from '../explorers.js';
import { toIpfsGatewayUrl, DEFAULT_IPFS_GATEWAY } from './ipfs-url.js';
import { detectContentType } from './content-type.js';
import { resolveHiroBase } from '../hiro-config.js';

/**
 * Stacks SIP-9 NFT adapter — a fresh build of the technique in Leather's
 * `nft/stacks` pipeline (MIT). Holdings come from Hiro; per-token metadata is
 * merged from two sources with **Gamma preferred, Hiro as fallback**, fetched
 * concurrently with `Promise.allSettled` so one source being down never blanks
 * a token. Gamma carries the richer collectible data (media content type, floor
 * price, rarity); Hiro is the dependable base (name, description, image,
 * attributes). Everything is mapped onto the normalized `NftAsset` and validated
 * on egress — neither vendor's payload shape leaks past this module.
 *
 * NOTE: the Hiro/Gamma response shapes below are modelled from their published
 * schemas; the live endpoints could not be reached from the build sandbox
 * (egress allowlist), so the ingress schemas are deliberately permissive
 * (`safeParse`, optional fields) and tolerate extra/renamed keys rather than
 * throwing. See the PR's Verification notes.
 */

const GAMMA_API = 'https://gamma.io/api';

/** Hiro caps holdings at 200 per page; phase 1 reads the first page only. */
const HOLDINGS_LIMIT = 200;

/** Injectable seams so the merge + mapping are unit-testable without a network. */
export interface StacksNftDeps {
  fetchImpl?: typeof fetch;
  /** IPFS gateway base every media URL is routed through. */
  gateway?: string;
  /** Content-type resolver, injected so tests don't hit the network. */
  detectType?: (url: string) => Promise<string | undefined>;
  /** Hiro API base, overridable for tests / alternate hosts. */
  stacksApiUrl?: string;
}

/**
 * Hiro NFT holdings: `GET /extended/v1/tokens/nft/holdings`. `asset_identifier`
 * is `<contract-id>::<asset-name>`; `value.repr` is the Clarity token id, e.g.
 * `u3413`.
 */
const HiroHoldingsSchema = z.object({
  results: z.array(
    z.object({
      asset_identifier: z.string(),
      value: z.object({ repr: z.string() }),
    }),
  ),
});

const HiroAttributeSchema = z.object({
  trait_type: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
});

/** Hiro token metadata: `GET /metadata/v1/nft/<contract-id>/<token-id>`. */
const HiroMetadataSchema = z.object({
  token_uri: z.string().optional(),
  metadata: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      image: z.string().optional(),
      cached_image: z.string().optional(),
      attributes: z.array(HiroAttributeSchema).optional(),
    })
    .optional(),
});

const GammaAmountSchema = z.union([z.number(), z.string()]).optional();

/** Gamma collectible: `GET /get-stacks-nft?id=<contract-id>_<token-id>`. */
const GammaMetadataSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  content_url: z.string().optional(),
  image_url: z.string().optional(),
  image: z.string().optional(),
  content_type: z.string().optional(),
  mime_type: z.string().optional(),
  collection_name: z.string().optional(),
  collection: z
    .object({
      name: z.string().optional(),
      floor_price: GammaAmountSchema,
      floor: GammaAmountSchema,
      total_count: z.number().optional(),
    })
    .optional(),
  floor_price: GammaAmountSchema,
  rarity_rank: z.number().optional(),
  rank: z.number().optional(),
});

/** The shape both vendors are mapped into before the merge. */
interface TokenMetadata {
  name?: string;
  description?: string;
  mediaUrl?: string;
  contentType?: string;
  collectionName?: string;
  floorPrice?: Money;
  totalItems?: number;
  attributes?: NftAttribute[];
  rarityRank?: number;
}

/** `SP….contract::AssetName` → `{ contractId, assetName }`. */
export function parseAssetIdentifier(assetId: string): { contractId: string; assetName: string } {
  const [contractId, assetName] = assetId.split('::');
  return { contractId: contractId ?? assetId, assetName: assetName ?? '' };
}

/** Clarity `uint` repr (`u3413`) → the bare token id (`3413`). */
export function tokenIdFromRepr(repr: string): string {
  const match = repr.match(/\d+/);
  return match ? match[0] : repr;
}

/**
 * Normalize a Gamma/Hiro floor figure to STX. Gamma reports the floor as an
 * integer in micro-STX (base units); a value already carrying a decimal point
 * is treated as STX. Conversion is decimal-safe (BigInt via `formatBaseUnits`),
 * never a float divide.
 */
export function normalizeStxFloor(value: string | number): Money | undefined {
  const str = (typeof value === 'number' ? String(value) : value).trim();
  if (str === '' || Number(str) === 0 || Number.isNaN(Number(str))) return undefined;
  if (/^\d+$/.test(str)) {
    // `formatBaseUnits` pads to the full 6 decimals; trim the trailing zeros so
    // a floor estimate reads "125.5 STX", not "125.500000 STX".
    return { amount: trimDecimal(formatBaseUnits(str, chainMeta.stx.decimals)), symbol: 'STX' };
  }
  return { amount: str, symbol: 'STX' };
}

/** Drop trailing fractional zeros (and a dangling decimal point) from a decimal string. */
function trimDecimal(amount: string): string {
  return amount.includes('.') ? amount.replace(/0+$/, '').replace(/\.$/, '') : amount;
}

/** Map Hiro's validated metadata onto the merge shape. */
export function parseHiroMetadata(raw: unknown): TokenMetadata | null {
  const parsed = HiroMetadataSchema.safeParse(raw);
  if (!parsed.success) return null;
  const meta = parsed.data.metadata;
  const attributes = meta?.attributes
    ?.filter((attr): attr is { trait_type: string; value: string | number } => attr.value != null)
    .map(attr => ({ trait: attr.trait_type ?? '', value: String(attr.value) }));
  return {
    name: meta?.name,
    description: meta?.description,
    mediaUrl: meta?.image ?? meta?.cached_image ?? parsed.data.token_uri,
    attributes: attributes && attributes.length > 0 ? attributes : undefined,
  };
}

/** Map Gamma's validated metadata onto the merge shape. */
export function parseGammaMetadata(raw: unknown): TokenMetadata | null {
  const parsed = GammaMetadataSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  const rawFloor = data.collection?.floor_price ?? data.collection?.floor ?? data.floor_price;
  return {
    name: data.name ?? data.title,
    description: data.description,
    mediaUrl: data.content_url ?? data.image_url ?? data.image,
    contentType: data.content_type ?? data.mime_type,
    collectionName: data.collection?.name ?? data.collection_name,
    floorPrice: rawFloor != null ? normalizeStxFloor(rawFloor) : undefined,
    totalItems: data.collection?.total_count,
    rarityRank: data.rarity_rank ?? data.rank,
  };
}

/**
 * Merge the two sources, **Gamma preferred** field-by-field, Hiro filling any
 * gap. A field is taken from Hiro only when Gamma did not supply it.
 */
export function mergeTokenMetadata(
  gamma: TokenMetadata | null,
  hiro: TokenMetadata | null,
): TokenMetadata {
  return {
    name: gamma?.name ?? hiro?.name,
    description: gamma?.description ?? hiro?.description,
    mediaUrl: gamma?.mediaUrl ?? hiro?.mediaUrl,
    contentType: gamma?.contentType ?? hiro?.contentType,
    collectionName: gamma?.collectionName ?? hiro?.collectionName,
    floorPrice: gamma?.floorPrice ?? hiro?.floorPrice,
    totalItems: gamma?.totalItems ?? hiro?.totalItems,
    attributes: gamma?.attributes ?? hiro?.attributes,
    rarityRank: gamma?.rarityRank ?? hiro?.rarityRank,
  };
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Build one normalized `NftAsset` from a holding + its merged metadata. Pure
 * apart from the injected content-type resolver. Returns `null` when no media
 * URL can be resolved (this is a media-first feature; a holding with no media
 * is dropped rather than rendered blank). Validated on egress.
 */
export async function buildStacksNftAsset(
  args: {
    contractId: string;
    tokenId: string;
    assetName: string;
    owner: string;
    metadata: TokenMetadata;
  },
  deps: { gateway: string; detectType: (url: string) => Promise<string | undefined> },
): Promise<NftAsset | null> {
  const { contractId, tokenId, assetName, owner, metadata } = args;
  if (!metadata.mediaUrl) return null;

  const url = toIpfsGatewayUrl(metadata.mediaUrl, deps.gateway);
  const contentType = metadata.contentType ?? (await deps.detectType(url));

  const collectionName = metadata.collectionName ?? assetName;
  const collection =
    collectionName || metadata.floorPrice || metadata.totalItems
      ? {
          name: collectionName || contractId,
          explorerUrl: getExplorerUrl('stx', 'tx', contractId),
          totalItems: metadata.totalItems,
          floorPrice: metadata.floorPrice,
        }
      : undefined;

  return parseOrThrow(
    NftAssetSchema,
    {
      chain: 'stx',
      protocol: 'sip9',
      contractId,
      tokenId,
      name: metadata.name ?? `${assetName || 'Token'} #${tokenId}`,
      description: metadata.description,
      media: { url, contentType },
      collection,
      attributes: metadata.attributes,
      rarityRank: metadata.rarityRank,
      owner,
    },
    'stacks.fetchNfts(egress)',
  );
}

/**
 * Read and normalize an address's SIP-9 holdings. For each held token, Gamma
 * and Hiro metadata are fetched concurrently (`Promise.allSettled`) and merged;
 * a token whose metadata both fail or that resolves no media is dropped, so one
 * bad token never fails the whole address.
 */
export async function fetchStacksNfts(
  address: string,
  deps: StacksNftDeps = {},
): Promise<NftAsset[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const gateway = deps.gateway ?? DEFAULT_IPFS_GATEWAY;
  const stacksApiUrl = deps.stacksApiUrl ?? resolveHiroBase();
  const detectType = deps.detectType ?? ((url: string) => detectContentType(url, fetchImpl));

  const holdingsUrl = `${stacksApiUrl}/extended/v1/tokens/nft/holdings?principal=${encodeURIComponent(address)}&limit=${HOLDINGS_LIMIT}`;
  const holdings = parseOrThrow(
    HiroHoldingsSchema,
    await fetchJson(holdingsUrl, fetchImpl),
    'stacks.fetchNfts(holdings ingress)',
  );

  const assets = await Promise.all(
    holdings.results.map(async holding => {
      const { contractId, assetName } = parseAssetIdentifier(holding.asset_identifier);
      const tokenId = tokenIdFromRepr(holding.value.repr);

      const gammaUrl = `${GAMMA_API}/get-stacks-nft?id=${encodeURIComponent(`${contractId}_${tokenId}`)}`;
      const hiroUrl = `${stacksApiUrl}/metadata/v1/nft/${contractId}/${tokenId}`;

      const [gammaResult, hiroResult] = await Promise.allSettled([
        fetchJson(gammaUrl, fetchImpl),
        fetchJson(hiroUrl, fetchImpl),
      ]);

      const gamma =
        gammaResult.status === 'fulfilled' ? parseGammaMetadata(gammaResult.value) : null;
      const hiro = hiroResult.status === 'fulfilled' ? parseHiroMetadata(hiroResult.value) : null;
      const metadata = mergeTokenMetadata(gamma, hiro);

      return buildStacksNftAsset(
        { contractId, tokenId, assetName, owner: address, metadata },
        { gateway, detectType },
      );
    }),
  );

  return assets.filter((asset): asset is NftAsset => asset !== null);
}

/** Hiro + Gamma implementation of the `NftAdapter` port. */
export const stacksNftAdapter: NftAdapter = {
  chain: 'stx',
  protocol: 'sip9',
  fetchNfts: (address: string) => fetchStacksNfts(address),
};
