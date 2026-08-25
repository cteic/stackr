import { z } from 'zod';
import { ChainSchema } from './chain.js';

/**
 * A decimal amount denominated in some named unit, kept as a string so on-chain
 * values never round-trip through a float. Floor prices arrive from vendors as
 * integer base units (micro-STX, …); the adapter converts them with
 * `formatBaseUnits` and stores the exact decimal here alongside its symbol.
 */
export const MoneySchema = z.object({
  /** Exact decimal amount as a string, e.g. "12.5". */
  amount: z.string(),
  /** Display ticker for the amount, e.g. "STX". */
  symbol: z.string(),
});

export type Money = z.infer<typeof MoneySchema>;

/**
 * The NFT standard a collectible came from. A union that grows one value per
 * source as adapters land — `sip9` (Stacks) ships first; `erc721` / `erc1155`
 * (EVM), `ordinal` / `rune` / `stamp` (Bitcoin) and `spl` (Solana) follow in
 * later phases of #93. Kept separate from `Chain` because a chain can host
 * several protocols (Bitcoin: ordinals + runes + stamps).
 */
export const NftProtocolSchema = z.enum(['sip9']);

export type NftProtocol = z.infer<typeof NftProtocolSchema>;

/**
 * The collectible's media and the content type that drives which renderer the
 * UI reaches for. `contentType` is optional because not every source reports
 * one; when it is absent the renderer falls back to URL-extension sniffing.
 * `url` is already resolved to an HTTP(S) gateway URL by the adapter — IPFS
 * normalization happens on egress so nothing downstream needs gateway config.
 */
export const NftMediaSchema = z.object({
  url: z.string().min(1),
  contentType: z.string().optional(),
});

export type NftMedia = z.infer<typeof NftMediaSchema>;

/** A single trait, normalized from the various `trait_type`/`value` shapes. */
export const NftAttributeSchema = z.object({
  trait: z.string(),
  value: z.string(),
});

export type NftAttribute = z.infer<typeof NftAttributeSchema>;

/**
 * The collection an asset belongs to. `floorPrice` is the collection floor used
 * as a labelled *estimate* of the asset's value — deliberately excluded from
 * the headline portfolio total (floors are illiquid and noisy; see #93).
 */
export const NftCollectionSchema = z.object({
  name: z.string(),
  explorerUrl: z.string().optional(),
  totalItems: z.number().int().nonnegative().optional(),
  floorPrice: MoneySchema.optional(),
});

export type NftCollection = z.infer<typeof NftCollectionSchema>;

/**
 * The one normalized collectible shape every NFT adapter emits and the only
 * thing the view-model and UI layers ever see. Generalizes Leather's
 * `Sip9Asset` (MIT) across every chain: a vendor's payload is mapped onto this
 * and validated on egress, so a Hiro/Gamma/Alchemy response shape never leaks
 * past the adapter (same anti-corruption rule as balances and health — ADR
 * 0012). `media.contentType` is the dispatch key the renderer switches on.
 */
export const NftAssetSchema = z.object({
  chain: ChainSchema,
  protocol: NftProtocolSchema,
  /** Fully-qualified contract id, e.g. "SP2X0…173.the-explorer-guild". */
  contractId: z.string(),
  /** Token id within the contract, as a string (ids can exceed 2^53). */
  tokenId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  media: NftMediaSchema,
  collection: NftCollectionSchema.optional(),
  attributes: z.array(NftAttributeSchema).optional(),
  /** 1-based rarity rank within the collection, where known. */
  rarityRank: z.number().int().positive().optional(),
  /** The watched/connected address that holds this asset. */
  owner: z.string(),
});

export type NftAsset = z.infer<typeof NftAssetSchema>;
