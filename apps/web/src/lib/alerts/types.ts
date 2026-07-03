import { z } from 'zod';
import { ChainSchema, ProtocolSchema } from '@stackr/models';

/**
 * Ingress schemas for the Supabase rows the alerts UI reads. Supabase's REST
 * responses are untyped here (no generated Database types yet), so every read
 * crosses this boundary before any field is touched — the same stance the
 * chain adapters take (ADR 0012).
 */

export const WatchedWalletRowSchema = z.object({
  id: z.string().uuid(),
  chain: ChainSchema,
  address: z.string(),
  label: z.string().nullable(),
});

export type WatchedWalletRow = z.infer<typeof WatchedWalletRowSchema>;

export const AlertSubscriptionRowSchema = z.object({
  id: z.string().uuid(),
  protocol: ProtocolSchema,
  warn_threshold: z.coerce.number(),
  critical_threshold: z.coerce.number(),
  cooldown_seconds: z.number().int(),
  created_at: z.string(),
  watched_wallets: WatchedWalletRowSchema,
});

export type AlertSubscriptionRow = z.infer<typeof AlertSubscriptionRowSchema>;

export const AlertSubscriptionListSchema = z.array(AlertSubscriptionRowSchema);

/** How many alert subscriptions the free tier allows (premium lifts this). */
export const FREE_SUBSCRIPTION_LIMIT = 1;
