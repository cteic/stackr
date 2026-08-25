import type { NftAsset, NftAttribute } from '@stackr/models';
import { maskFiat } from '@stackr/services';

/**
 * Which renderer a collectible's media maps to. This is the platform-agnostic
 * half of the MIME-dispatch the UI paints: `@stackr/features` makes the
 * *decision* (content type → kind) here as data, and each platform's
 * `<NftMedia>` switches on the kind to reach for `<img>` / `<video>` /
 * `<audio>` / a model-viewer. Ported from Leather's `sip9-media` dispatch (MIT).
 */
export type NftMediaKind = 'image' | 'video' | 'audio' | 'model' | 'unsupported';

/** Grid cards render thumbnails; a detail view renders the full player. */
export type NftMediaMode = 'thumbnail' | 'full';

export interface NftCardSettings {
  /** When true, the floor estimate is masked rather than shown. */
  hideBalance: boolean;
}

export interface NftCardMedia {
  kind: NftMediaKind;
  /** Already gateway-resolved by the adapter; the renderer uses it verbatim. */
  url: string;
  contentType: string | null;
}

/**
 * The playback flags a media element should carry in a given mode. Thumbnails
 * autoplay muted, looped video and never show controls; the full player shows
 * controls and does not autoplay. Audio thumbnails fall back to an icon in the
 * renderer, so their flags are inert. Kept here so every platform derives the
 * same behaviour from the same decision.
 */
export interface NftMediaPlayback {
  controls: boolean;
  autoPlay: boolean;
  loop: boolean;
  muted: boolean;
  playsInline: boolean;
}

/**
 * Render-ready shape for a single collectible card. Every field is a primitive
 * the UI paints directly — no formatting or branching left in the view.
 */
export interface NftCardView {
  /** Stable key, `contractId:tokenId`. */
  key: string;
  name: string;
  /** Collection name, or null when the asset has no collection. */
  collectionName: string | null;
  media: NftCardMedia;
  /** Label for the floor estimate, e.g. "Floor (est.)". Null when no floor. */
  floorLabel: string | null;
  /** Floor value, masked when balances are hidden, e.g. "125.5 STX" or "••••". */
  floorText: string | null;
  /** Link to the collection on a block explorer, when known. */
  explorerUrl: string | null;
  /** Rarity, e.g. "Rank #42". Null when unknown. */
  rarityText: string | null;
  /** Traits, passed through for the detail view. */
  attributes: NftAttribute[];
}

/** Map a media content type onto the renderer kind. Pure. */
export function classifyNftMediaKind(contentType: string | null | undefined): NftMediaKind {
  if (!contentType) return 'unsupported';
  const type = contentType.toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('model/')) return 'model';
  return 'unsupported';
}

/** The playback flags for a media kind in a given render mode. Pure. */
export function nftMediaPlayback(kind: NftMediaKind, mode: NftMediaMode): NftMediaPlayback {
  const thumbnail = mode === 'thumbnail';
  return {
    controls: !thumbnail,
    autoPlay: thumbnail && kind === 'video',
    loop: thumbnail && kind === 'video',
    muted: thumbnail,
    playsInline: true,
  };
}

/**
 * Transforms a normalized `NftAsset` into a platform-independent card view
 * model. Pure: same input always yields the same output, no DOM or platform
 * access. The media-type dispatch decision is resolved here (`classifyNftMediaKind`)
 * so each platform's renderer only switches on the resulting `media.kind`.
 */
export function createNftCardView(asset: NftAsset, settings: NftCardSettings): NftCardView {
  const floor = asset.collection?.floorPrice;
  const floorText = floor
    ? maskFiat(`${floor.amount} ${floor.symbol}`, settings.hideBalance)
    : null;

  return {
    key: `${asset.contractId}:${asset.tokenId}`,
    name: asset.name,
    collectionName: asset.collection?.name ?? null,
    media: {
      kind: classifyNftMediaKind(asset.media.contentType),
      url: asset.media.url,
      contentType: asset.media.contentType ?? null,
    },
    floorLabel: floor ? 'Floor (est.)' : null,
    floorText,
    explorerUrl: asset.collection?.explorerUrl ?? null,
    rarityText: asset.rarityRank != null ? `Rank #${asset.rarityRank}` : null,
    attributes: asset.attributes ?? [],
  };
}
