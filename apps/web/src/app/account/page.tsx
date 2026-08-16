'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  Badge,
  Button,
  Callout,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@stackr/ui';
import { Header } from '@/components/header';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { vapidPublicKey } from '@/lib/supabase/config';
import {
  createAlertSubscriptions,
  deleteAlertSubscription,
  deletePushSubscription,
  listAlertSubscriptions,
  savePushSubscription,
} from '@/lib/alerts/api';
import { subscribeToPush, unsubscribeFromPush } from '@/lib/alerts/push';
import { protocolsForChain } from '@/lib/alerts/protocols';
import { FREE_SUBSCRIPTION_LIMIT, type AlertSubscriptionRow } from '@/lib/alerts/types';
import { useWalletStore } from '@/lib/wallet-store';

type PushStatus = 'unsupported' | 'off' | 'on';

/**
 * Account surface: session, web-push opt-in, and liquidation-alert
 * subscriptions. Fully client-side (see /auth/callback for why) and entirely
 * optional — nothing else in the app depends on being signed in.
 */
export default function AccountPage() {
  const supabase = getSupabaseBrowserClient();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">Account</h1>
        {supabase === null ? (
          <Callout variant="warning">
            Sign-in and liquidation alerts aren&apos;t available in this environment yet.
          </Callout>
        ) : (
          <AccountBody supabase={supabase} />
        )}
      </main>
    </>
  );
}

interface AccountBodyProps {
  supabase: SupabaseClient;
}

function AccountBody({ supabase }: AccountBodyProps) {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUser(data.user);
        setChecked(true);
      })
      .catch(() => setChecked(true));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  if (!checked) {
    return <p className="text-sm text-muted-foreground">Loading session…</p>;
  }

  if (user === null) {
    return (
      <Card className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Sign in to get liquidation alerts for your watched wallets — even when Stackr is closed.
        </p>
        <Button asChild>
          <a href="/login">Sign in</a>
        </Button>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{user.email ?? 'Signed in'}</p>
          <p className="text-xs text-muted-foreground">Signed in via magic link</p>
        </div>
        <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </Button>
      </Card>
      <PushSection supabase={supabase} userId={user.id} />
      <SubscriptionsSection supabase={supabase} userId={user.id} />
    </>
  );
}

interface SectionProps {
  supabase: SupabaseClient;
  userId: string;
}

function PushSection({ supabase, userId }: SectionProps) {
  const [status, setStatus] = useState<PushStatus>('off');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicKey = vapidPublicKey();

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    navigator.serviceWorker.ready
      .then(registration => registration.pushManager.getSubscription())
      .then(subscription => setStatus(subscription === null ? 'off' : 'on'))
      .catch(() => setStatus('off'));
  }, []);

  async function enable() {
    if (publicKey === null) {
      setError('Push isn’t configured (missing NEXT_PUBLIC_VAPID_PUBLIC_KEY).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const keys = await subscribeToPush(publicKey);
      await savePushSubscription(supabase, {
        userId,
        endpoint: keys.endpoint,
        p256dh: keys.p256dh,
        authKey: keys.authKey,
      });
      setStatus('on');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enabling notifications failed.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint !== null) {
        await deletePushSubscription(supabase, endpoint);
      }
      setStatus('off');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Disabling notifications failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Notifications on this device</h2>
          <p className="text-xs text-muted-foreground">
            Liquidation alerts arrive as push notifications, tab open or not.
          </p>
        </div>
        {status === 'unsupported' ? (
          <Badge variant="default">Not supported</Badge>
        ) : (
          <Button
            variant={status === 'on' ? 'outline' : 'primary'}
            disabled={busy}
            onClick={() => void (status === 'on' ? disable() : enable())}
          >
            {busy ? 'Working…' : status === 'on' ? 'Disable' : 'Enable'}
          </Button>
        )}
      </div>
      {error !== null ? <Callout variant="error">{error}</Callout> : null}
    </Card>
  );
}

function SubscriptionsSection({ supabase, userId }: SectionProps) {
  const wallets = useWalletStore(s => s.wallets);
  const [subscriptions, setSubscriptions] = useState<AlertSubscriptionRow[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listAlertSubscriptions(supabase)
      .then(setSubscriptions)
      .catch(cause =>
        setError(cause instanceof Error ? cause.message : 'Loading subscriptions failed.'),
      );
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const alertableWallets = wallets.filter(wallet => protocolsForChain(wallet.chain).length > 0);
  const atLimit = subscriptions.length >= FREE_SUBSCRIPTION_LIMIT;

  async function watchSelected() {
    const wallet = alertableWallets.find(candidate => candidate.id === selectedWalletId);
    if (wallet === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAlertSubscriptions(supabase, {
        userId,
        chain: wallet.chain,
        address: wallet.address,
        label: wallet.label,
        protocols: protocolsForChain(wallet.chain),
      });
      setSelectedWalletId('');
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Saving the subscription failed.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(subscriptionId: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteAlertSubscription(supabase, subscriptionId);
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Removing the subscription failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Liquidation alerts</h2>
        <p className="text-xs text-muted-foreground">
          We re-check subscribed positions every few minutes and alert when risk crosses 80%
          (warning) or 95% (critical) of the liquidation threshold.
        </p>
      </div>

      {subscriptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alert subscriptions yet.</p>
      ) : (
        <ul className="space-y-2">
          {subscriptions.map(subscription => (
            <li
              key={subscription.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {subscription.watched_wallets.label ?? subscription.watched_wallets.address}
                </p>
                <p className="text-xs text-muted-foreground">
                  {subscription.protocol} · {subscription.watched_wallets.chain} · warn{' '}
                  {Math.round(subscription.warn_threshold * 100)}% · critical{' '}
                  {Math.round(subscription.critical_threshold * 100)}%
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void remove(subscription.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {atLimit ? (
        <p className="text-xs text-muted-foreground">
          Free accounts watch {FREE_SUBSCRIPTION_LIMIT} wallet for now.
        </p>
      ) : alertableWallets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add an ETH, SOL, or STX wallet on the dashboard first — those are the chains with
          monitorable lending protocols today.
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="alert-wallet" className="text-sm font-medium text-muted-foreground">
              Watch a wallet
            </label>
            <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
              <SelectTrigger id="alert-wallet">
                <SelectValue placeholder="Choose a wallet…" />
              </SelectTrigger>
              <SelectContent>
                {alertableWallets.map(wallet => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.label} ({wallet.chain})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={busy || selectedWalletId === ''} onClick={() => void watchSelected()}>
            Watch
          </Button>
        </div>
      )}

      {error !== null ? <Callout variant="error">{error}</Callout> : null}
    </Card>
  );
}
