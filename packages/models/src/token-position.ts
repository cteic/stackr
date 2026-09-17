import { z } from 'zod';
import { ChainSchema } from './chain.js';

/**
 * A fungible token position held by an address — an SPL token on Solana today,
 * an ERC-20 on Ethereum when that adapter lands.
 *
 * The shape is deliberately chain-neutral. `tokenId` is whatever identifies the
 * token on its chain (a mint address on Solana, a contract address on an EVM
 * chain), so one component renders a position from either chain without knowing
 * which produced it.
 *
 * `rawAmount` is the exact integer base-unit amount as a **string**: SPL
 * amounts are u64 and routinely exceed `Number.MAX_SAFE_INTEGER`, so the exact
 * value never passes through a JS number. `amount` is the same value already
 * scaled by `decimals` for display.
 */
export const TokenPositionSchema = z.object({
  chain: ChainSchema,
  /** The address that holds the position. */
  owner: z.string(),
  /** Chain-native token identifier: an SPL mint, or an EVM contract address. */
  tokenId: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(255),
  /** Exact base-unit amount, as an integer string. */
  rawAmount: z.string().regex(/^\d+$/, 'rawAmount must be a non-negative integer string'),
  /** `rawAmount` scaled by `decimals`, for display. */
  amount: z.string(),
  updatedAt: z.string().datetime(),
});

export type TokenPosition = z.infer<typeof TokenPositionSchema>;
