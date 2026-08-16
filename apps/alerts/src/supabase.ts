import { z } from 'zod';
import { ChainSchema, ProtocolSchema } from '@stackr/models';
import type { AlertState, RiskBand } from './types.js';
import { RiskBandSchema } from './types.js';

/**
 * Service-role access to the Supabase REST interface. The service-role key
 * bypasses RLS, so this module is deliberately tiny and explicit: four reads/
 * writes the sweep needs, every response schema-validated, every row id
 * checked as a UUID before it is interpolated into a filter.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WalletJoinSchema = z.object({
  chain: ChainSchema,
  address: z.string().min(1),
  label: z.string().nullable(),
});

export const SweepSubscriptionSchema = z.object({
  id: z.string().regex(UUID_RE),
  user_id: z.string().regex(UUID_RE),
  protocol: ProtocolSchema,
  warn_threshold: z.coerce.number(),
  critical_threshold: z.coerce.number(),
  cooldown_seconds: z.number().int(),
  last_band: RiskBandSchema,
  last_alerted_at: z.string().nullable(),
  watched_wallets: WalletJoinSchema,
});

export type SweepSubscription = z.infer<typeof SweepSubscriptionSchema>;

export const PushSubscriptionRowSchema = z.object({
  id: z.string().regex(UUID_RE),
  user_id: z.string().regex(UUID_RE),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth_key: z.string().min(1),
});

export type PushSubscriptionRow = z.infer<typeof PushSubscriptionRowSchema>;

export interface AlertEventInsert {
  user_id: string;
  subscription_id: string;
  chain: string;
  protocol: string;
  address: string;
  band: RiskBand;
  reason: string;
  liquidation_risk: number;
  delivered: boolean;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SupabaseServiceConfig {
  url: string;
  serviceRoleKey: string;
  fetchImpl?: FetchLike;
}

function headers(config: SupabaseServiceConfig): Record<string, string> {
  return {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    'content-type': 'application/json',
  };
}

async function request(
  config: SupabaseServiceConfig,
  method: string,
  path: string,
  body?: unknown,
  prefer?: string,
): Promise<unknown> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(`${config.url}/rest/v1/${path}`, {
    method,
    headers: prefer === undefined ? headers(config) : { ...headers(config), prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Status only — never echo a response body that could carry row data into logs.
  if (!response.ok) {
    throw new Error(`alerts: supabase ${method} ${path.split('?')[0]} failed (${response.status})`);
  }
  if (response.status === 204 || prefer === 'return=minimal') {
    return null;
  }
  return response.json();
}

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`alerts: ${label} is not a UUID`);
  }
}

const SUBSCRIPTION_SELECT =
  'id,user_id,protocol,warn_threshold,critical_threshold,cooldown_seconds,last_band,last_alerted_at,watched_wallets(chain,address,label)';

export async function fetchSweepSubscriptions(
  config: SupabaseServiceConfig,
): Promise<SweepSubscription[]> {
  // Least-recently-alerted first (never-alerted rows lead): when a sweep is
  // capped by the per-invocation read budget, the deferred tail rotates to the
  // front next tick, so no subscription starves.
  const data = await request(
    config,
    'GET',
    `alert_subscriptions?select=${SUBSCRIPTION_SELECT}&order=last_alerted_at.asc.nullsfirst`,
  );
  return z.array(SweepSubscriptionSchema).parse(data);
}

export async function fetchPushSubscriptions(
  config: SupabaseServiceConfig,
  userIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) {
    return [];
  }
  userIds.forEach(id => assertUuid(id, 'user id'));
  const filter = `user_id=in.(${userIds.join(',')})`;
  const data = await request(
    config,
    'GET',
    `push_subscriptions?select=id,user_id,endpoint,p256dh,auth_key&platform=eq.web&${filter}`,
  );
  return z.array(PushSubscriptionRowSchema).parse(data);
}

export async function saveSubscriptionState(
  config: SupabaseServiceConfig,
  subscriptionId: string,
  state: AlertState,
): Promise<void> {
  assertUuid(subscriptionId, 'subscription id');
  await request(
    config,
    'PATCH',
    `alert_subscriptions?id=eq.${subscriptionId}`,
    { last_band: state.band, last_alerted_at: state.alertedAt },
    'return=minimal',
  );
}

export async function insertAlertEvents(
  config: SupabaseServiceConfig,
  events: AlertEventInsert[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }
  await request(config, 'POST', 'alert_events', events, 'return=minimal');
}

export async function deletePushSubscription(
  config: SupabaseServiceConfig,
  pushSubscriptionId: string,
): Promise<void> {
  assertUuid(pushSubscriptionId, 'push subscription id');
  await request(
    config,
    'DELETE',
    `push_subscriptions?id=eq.${pushSubscriptionId}`,
    undefined,
    'return=minimal',
  );
}
