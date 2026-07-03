import type { SupabaseClient } from '@supabase/supabase-js';
import type { Chain, Protocol } from '@stackr/models';
import {
  AlertSubscriptionListSchema,
  type AlertSubscriptionRow,
  WatchedWalletRowSchema,
} from './types';

/**
 * Thin data layer over the user-scoped Supabase client. RLS fences every query
 * to the signed-in user's rows, so none of these filter by user id explicitly —
 * the database does. Every response is schema-validated before use.
 */

const SUBSCRIPTION_SELECT =
  'id, protocol, warn_threshold, critical_threshold, cooldown_seconds, created_at, watched_wallets ( id, chain, address, label )';

export async function listAlertSubscriptions(
  supabase: SupabaseClient,
): Promise<AlertSubscriptionRow[]> {
  const { data, error } = await supabase
    .from('alert_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`alerts: failed to load subscriptions — ${error.message}`);
  }

  const parsed = AlertSubscriptionListSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('alerts: subscription rows failed validation');
  }
  return parsed.data;
}

export interface CreateAlertSubscriptionInput {
  userId: string;
  chain: Chain;
  address: string;
  label: string | null;
  protocols: Protocol[];
}

/**
 * Watch a wallet: upsert the wallet row, then one subscription per protocol
 * with the default thresholds (the columns' own defaults).
 */
export async function createAlertSubscriptions(
  supabase: SupabaseClient,
  input: CreateAlertSubscriptionInput,
): Promise<void> {
  const { data, error } = await supabase
    .from('watched_wallets')
    .upsert(
      {
        user_id: input.userId,
        chain: input.chain,
        address: input.address,
        label: input.label,
      },
      { onConflict: 'user_id,chain,address' },
    )
    .select('id, chain, address, label')
    .single();

  if (error) {
    throw new Error(`alerts: failed to save wallet — ${error.message}`);
  }

  const wallet = WatchedWalletRowSchema.safeParse(data);
  if (!wallet.success) {
    throw new Error('alerts: wallet row failed validation');
  }

  const rows = input.protocols.map(protocol => ({
    user_id: input.userId,
    wallet_id: wallet.data.id,
    protocol,
  }));

  const inserted = await supabase
    .from('alert_subscriptions')
    .upsert(rows, { onConflict: 'user_id,wallet_id,protocol' });

  if (inserted.error) {
    throw new Error(`alerts: failed to save subscription — ${inserted.error.message}`);
  }
}

export async function deleteAlertSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<void> {
  const { error } = await supabase.from('alert_subscriptions').delete().eq('id', subscriptionId);
  if (error) {
    throw new Error(`alerts: failed to remove subscription — ${error.message}`);
  }
}

export interface PushSubscriptionInsert {
  userId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
}

export async function savePushSubscription(
  supabase: SupabaseClient,
  input: PushSubscriptionInsert,
): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: input.userId,
      platform: 'web',
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth_key: input.authKey,
    },
    { onConflict: 'user_id,endpoint' },
  );
  if (error) {
    throw new Error(`alerts: failed to save push subscription — ${error.message}`);
  }
}

export async function deletePushSubscription(
  supabase: SupabaseClient,
  endpoint: string,
): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) {
    throw new Error(`alerts: failed to remove push subscription — ${error.message}`);
  }
}
