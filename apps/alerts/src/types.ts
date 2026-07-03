import { z } from 'zod';

/**
 * Core alert-domain shapes shared across the sweep. Ingress validation for
 * Supabase rows lives in `supabase.ts`; these are the primitives.
 */

export const RiskBandSchema = z.enum(['ok', 'warn', 'critical']);

export type RiskBand = z.infer<typeof RiskBandSchema>;

export interface Thresholds {
  /** Normalized liquidation risk (0..1) at which we first warn. */
  warn: number;
  /** Risk at which alerts escalate to critical; sits at or above `warn`. */
  critical: number;
}

/**
 * Per-subscription dedupe state (the `last_band` / `last_alerted_at` columns),
 * so a position hovering around a threshold doesn't notify on every sweep.
 * `alertedAt` is null before any alert has fired or once a recovery has been
 * announced.
 */
export interface AlertState {
  band: RiskBand;
  alertedAt: string | null;
}

/** What the service worker receives; keep in sync with `apps/web/public/sw.js`. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}
