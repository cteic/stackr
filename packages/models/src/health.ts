import { z } from 'zod';
import { ChainSchema } from './chain.js';

/**
 * Lending protocols Stackr computes liquidation health for. Each is backed by
 * one adapter in `@stackr/services` that maps the protocol's native reads onto
 * the single normalized `HealthPosition` shape below.
 *
 * This is deliberately its own union, separate from `Chain`: a protocol is not
 * a chain (several can live on one chain), and the set grows on a different
 * cadence — the first slice ships `aave-v3`; later stages add `kamino` (SOL),
 * then `zest`, `granite` and `arkadiko` (STX).
 */
export const ProtocolSchema = z.enum(['aave-v3', 'kamino', 'zest', 'granite', 'arkadiko']);

export type Protocol = z.infer<typeof ProtocolSchema>;

/**
 * Native, protocol-specific health numbers preserved verbatim for the detail
 * view and for audit — so a normalization bug in `liquidationRisk` is always
 * checkable against the source figure. Every field is optional because each
 * protocol exposes a different subset (Aave has a health factor, a CDP has a
 * collateral ratio, …).
 */
export const HealthPositionNativeSchema = z.object({
  /** Aave `1e18`-scaled health factor, or Zest's 1..100 scale. */
  healthFactor: z.number().optional(),
  /** Current loan-to-value, as a fraction (0..1). */
  ltv: z.number().optional(),
  /** Liquidation-threshold LTV, as a fraction (0..1). */
  liquidationLtv: z.number().optional(),
  /** CDP collateral ratio, as a fraction (Arkadiko: 1.4 = 140%). */
  collateralRatio: z.number().optional(),
  /** CDP liquidation ratio the position is measured against, as a fraction. */
  liquidationRatio: z.number().optional(),
});

export type HealthPositionNative = z.infer<typeof HealthPositionNativeSchema>;

/**
 * The one normalized lending-position shape every protocol adapter emits and
 * the only thing the card layer ever sees. `liquidationRisk` is the single
 * scalar the UI sorts and colour-codes on; `native` keeps each protocol's own
 * number so cards can show the raw figure and a normalization bug stays
 * auditable. Validated on egress, like every other adapter output (see ADR
 * 0012 / 0016).
 */
export const HealthPositionSchema = z.object({
  chain: ChainSchema,
  protocol: ProtocolSchema,
  /** The watched / connected account this position belongs to. */
  address: z.string(),
  collateralValueUsd: z.number(),
  debtValueUsd: z.number(),
  /**
   * Normalized liquidation risk, 0..1, where 1.0 sits at the liquidation
   * threshold and `>= 1` means liquidatable. Derived per protocol so cards
   * compare like-for-like (Aave: `1 / healthFactor`).
   */
  liquidationRisk: z.number().min(0),
  native: HealthPositionNativeSchema,
  /** Which oracle the protocol liquidates against. */
  oracle: z.string(),
  /** ISO timestamp of when the position was read. */
  updatedAt: z.string().datetime(),
});

export type HealthPosition = z.infer<typeof HealthPositionSchema>;
