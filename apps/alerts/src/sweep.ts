import type { Chain, HealthPosition, Protocol } from '@stackr/models';
import type { AlertEventInsert, PushSubscriptionRow, SweepSubscription } from './supabase.js';
import { decideNotification, riskBand, type NotifyReason } from './thresholds.js';
import type { AlertState, PushPayload, RiskBand } from './types.js';

/**
 * One sweep: for every alert subscription, re-read the position, decide via
 * the band/cooldown rules whether to notify, deliver to each of the user's
 * push subscriptions, persist the new dedupe state, and log what happened.
 * All I/O is injected so the whole orchestration is unit-testable.
 */

export interface PushDelivery {
  ok: boolean;
  gone: boolean;
}

export interface SweepDeps {
  listSubscriptions(): Promise<SweepSubscription[]>;
  listPushSubscriptions(userIds: string[]): Promise<PushSubscriptionRow[]>;
  readPosition(protocol: Protocol, chain: Chain, address: string): Promise<HealthPosition | null>;
  sendPush(target: PushSubscriptionRow, payload: PushPayload): Promise<PushDelivery>;
  saveState(subscriptionId: string, state: AlertState): Promise<void>;
  logEvents(events: AlertEventInsert[]): Promise<void>;
  removePushSubscription(pushSubscriptionId: string): Promise<void>;
  now(): Date;
}

export interface SweepSummary {
  subscriptions: number;
  notified: number;
  deliveries: number;
  failures: number;
}

const BAND_TITLE: Record<Exclude<NotifyReason, null>, string> = {
  escalated: 'Liquidation risk increased',
  eased: 'Risk easing, still elevated',
  recovered: 'Position back in the safe zone',
  'still-at-risk': 'Position still at risk',
};

function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** The notification body; kept plain and number-first — it lands on a lock screen. */
export function buildPayload(
  subscription: SweepSubscription,
  liquidationRisk: number,
  band: RiskBand,
  reason: Exclude<NotifyReason, null>,
): PushPayload {
  const wallet = subscription.watched_wallets;
  const riskPercent = Math.round(liquidationRisk * 100);
  const name = wallet.label ?? shortAddress(wallet.address);
  return {
    title: `${band === 'critical' ? '🚨' : band === 'warn' ? '⚠️' : '✅'} ${BAND_TITLE[reason]}`,
    body: `${name} · ${subscription.protocol} on ${wallet.chain} — at ${riskPercent}% of the liquidation threshold.`,
    url: '/',
    tag: `liquidation-${subscription.id}`,
  };
}

export async function runSweep(deps: SweepDeps): Promise<SweepSummary> {
  const subscriptions = await deps.listSubscriptions();
  const summary: SweepSummary = {
    subscriptions: subscriptions.length,
    notified: 0,
    deliveries: 0,
    failures: 0,
  };
  if (subscriptions.length === 0) {
    return summary;
  }

  const userIds = [...new Set(subscriptions.map(subscription => subscription.user_id))];
  const pushSubscriptions = await deps.listPushSubscriptions(userIds);
  const pushByUser = new Map<string, PushSubscriptionRow[]>();
  for (const push of pushSubscriptions) {
    const existing = pushByUser.get(push.user_id);
    if (existing === undefined) {
      pushByUser.set(push.user_id, [push]);
    } else {
      existing.push(push);
    }
  }

  const events: AlertEventInsert[] = [];

  for (const subscription of subscriptions) {
    const wallet = subscription.watched_wallets;

    let position: HealthPosition | null;
    try {
      position = await deps.readPosition(subscription.protocol, wallet.chain, wallet.address);
    } catch (cause) {
      // An upstream read failing must not touch dedupe state or fail the run.
      console.error(
        `alerts: read failed for ${subscription.protocol}/${wallet.chain}: ${cause instanceof Error ? cause.message : 'unknown'}`,
      );
      summary.failures++;
      continue;
    }

    // A repaid/closed position reads as risk 0 — the decision logic turns that
    // into a one-time recovery notice if we had previously alerted.
    const liquidationRisk = position?.liquidationRisk ?? 0;
    const previous: AlertState = {
      band: subscription.last_band,
      alertedAt: subscription.last_alerted_at,
    };
    const thresholds = {
      warn: subscription.warn_threshold,
      critical: subscription.critical_threshold,
    };
    const decision = decideNotification(
      previous,
      liquidationRisk,
      thresholds,
      subscription.cooldown_seconds * 1000,
      deps.now(),
    );

    if (decision.reason !== null) {
      summary.notified++;
      const band = riskBand(liquidationRisk, thresholds);
      const payload = buildPayload(subscription, liquidationRisk, band, decision.reason);
      let delivered = false;

      for (const push of pushByUser.get(subscription.user_id) ?? []) {
        try {
          const result = await deps.sendPush(push, payload);
          if (result.ok) {
            delivered = true;
            summary.deliveries++;
          } else if (result.gone) {
            await deps.removePushSubscription(push.id);
          } else {
            summary.failures++;
          }
        } catch {
          summary.failures++;
        }
      }

      events.push({
        user_id: subscription.user_id,
        subscription_id: subscription.id,
        chain: wallet.chain,
        protocol: subscription.protocol,
        address: wallet.address,
        band,
        reason: decision.reason,
        liquidation_risk: liquidationRisk,
        delivered,
      });
    }

    const stateChanged =
      decision.state.band !== previous.band || decision.state.alertedAt !== previous.alertedAt;
    if (stateChanged) {
      try {
        await deps.saveState(subscription.id, decision.state);
      } catch {
        summary.failures++;
      }
    }
  }

  try {
    await deps.logEvents(events);
  } catch {
    summary.failures++;
  }

  return summary;
}
