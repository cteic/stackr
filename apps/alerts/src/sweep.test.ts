import { describe, expect, it, vi } from 'vitest';
import type { HealthPosition } from '@stackr/models';
import type { PushSubscriptionRow, SweepSubscription } from './supabase.js';
import { buildPayload, runSweep, type SweepDeps } from './sweep.js';

const NOW = new Date('2026-07-03T12:00:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111';
const SUB = '22222222-2222-4222-8222-222222222222';
const PUSH = '33333333-3333-4333-8333-333333333333';

function subscription(overrides: Partial<SweepSubscription> = {}): SweepSubscription {
  return {
    id: SUB,
    user_id: USER,
    protocol: 'zest',
    warn_threshold: 0.8,
    critical_threshold: 0.95,
    cooldown_seconds: 21600,
    last_band: 'ok',
    last_alerted_at: null,
    watched_wallets: {
      chain: 'stx',
      address: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3RC31MW1NF',
      label: 'Main stack',
    },
    ...overrides,
  };
}

function pushRow(): PushSubscriptionRow {
  return {
    id: PUSH,
    user_id: USER,
    endpoint: 'https://push.example.net/send/abc',
    p256dh: 'client-key',
    auth_key: 'auth-secret',
  };
}

function position(liquidationRisk: number): HealthPosition {
  return {
    chain: 'stx',
    protocol: 'zest',
    address: 'SP2VCQJGH7PHP2DJK7Z0V48AGBHQAW3RC31MW1NF',
    collateralValueUsd: 10_000,
    debtValueUsd: 5_000,
    liquidationRisk,
    native: {},
    oracle: 'pyth',
    updatedAt: NOW.toISOString(),
  };
}

function makeDeps(overrides: Partial<SweepDeps> = {}): SweepDeps {
  return {
    listSubscriptions: async () => [subscription()],
    listPushSubscriptions: async () => [pushRow()],
    readPosition: async () => position(0.9),
    sendPush: vi.fn(async () => ({ ok: true, gone: false })),
    saveState: vi.fn(async () => undefined),
    logEvents: vi.fn(async () => undefined),
    removePushSubscription: vi.fn(async () => undefined),
    now: () => NOW,
    ...overrides,
  };
}

describe('runSweep', () => {
  it('escalation: sends the push, saves state, and logs a delivered event', async () => {
    const deps = makeDeps();
    const summary = await runSweep(deps);

    expect(summary).toEqual({
      subscriptions: 1,
      positionsRead: 1,
      notified: 1,
      deliveries: 1,
      failures: 0,
      skipped: 0,
    });
    expect(deps.sendPush).toHaveBeenCalledTimes(1);
    expect(deps.saveState).toHaveBeenCalledWith(SUB, {
      band: 'warn',
      alertedAt: NOW.toISOString(),
    });
    expect(deps.logEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: USER,
        subscription_id: SUB,
        protocol: 'zest',
        band: 'warn',
        reason: 'escalated',
        delivered: true,
      }),
    ]);
  });

  it('stays silent (no push, no state write) inside the cooldown window', async () => {
    const alertedAt = new Date(NOW.getTime() - 1000).toISOString();
    const deps = makeDeps({
      listSubscriptions: async () => [
        subscription({ last_band: 'warn', last_alerted_at: alertedAt }),
      ],
    });

    const summary = await runSweep(deps);

    expect(summary.notified).toBe(0);
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(deps.saveState).not.toHaveBeenCalled();
    expect(deps.logEvents).toHaveBeenCalledWith([]);
  });

  it('a repaid position (adapter returns null) becomes a one-time recovery notice', async () => {
    const deps = makeDeps({
      listSubscriptions: async () => [
        subscription({ last_band: 'critical', last_alerted_at: NOW.toISOString() }),
      ],
      readPosition: async () => null,
    });

    const summary = await runSweep(deps);

    expect(summary.notified).toBe(1);
    expect(deps.saveState).toHaveBeenCalledWith(SUB, { band: 'ok', alertedAt: null });
    expect(deps.logEvents).toHaveBeenCalledWith([
      expect.objectContaining({ reason: 'recovered', band: 'ok' }),
    ]);
  });

  it('drops a push subscription the push service reports gone', async () => {
    const deps = makeDeps({
      sendPush: vi.fn(async () => ({ ok: false, gone: true })),
    });

    const summary = await runSweep(deps);

    expect(deps.removePushSubscription).toHaveBeenCalledWith(PUSH);
    expect(summary.deliveries).toBe(0);
    expect(deps.logEvents).toHaveBeenCalledWith([expect.objectContaining({ delivered: false })]);
  });

  it('an upstream read failure skips the subscription without touching state', async () => {
    const deps = makeDeps({
      readPosition: async () => {
        throw new Error('Hiro API error: 503');
      },
    });

    const summary = await runSweep(deps);

    expect(summary.failures).toBe(1);
    expect(deps.sendPush).not.toHaveBeenCalled();
    expect(deps.saveState).not.toHaveBeenCalled();
  });

  it('fetches push subscriptions once per sweep across users', async () => {
    const listPushSubscriptions = vi.fn(async () => [pushRow()]);
    const deps = makeDeps({
      listSubscriptions: async () => [subscription(), subscription({ protocol: 'granite' })],
      listPushSubscriptions,
    });

    await runSweep(deps);

    expect(listPushSubscriptions).toHaveBeenCalledTimes(1);
    expect(listPushSubscriptions).toHaveBeenCalledWith([USER]);
  });

  // #141 H2 — bound subrequests: dedup identical reads, cap reads per run.
  const SUB2 = '44444444-4444-4444-8444-444444444444';

  it('deduplicates identical positions — one read serves every subscription on it', async () => {
    const readPosition = vi.fn(async () => position(0.9));
    const deps = makeDeps({
      listSubscriptions: async () => [subscription({ id: SUB }), subscription({ id: SUB2 })],
      readPosition,
    });

    const summary = await runSweep(deps);

    expect(readPosition).toHaveBeenCalledTimes(1); // shared position read once
    expect(summary.positionsRead).toBe(1);
    expect(summary.notified).toBe(2); // both subscriptions still evaluated
  });

  it('defers subscriptions past the per-invocation read budget without touching their state', async () => {
    const readPosition = vi.fn(async () => position(0.9));
    const saveState = vi.fn(async () => undefined);
    const deps = makeDeps({
      listSubscriptions: async () => [
        subscription({ id: SUB, protocol: 'zest' }),
        subscription({ id: SUB2, protocol: 'granite' }), // distinct position key
      ],
      readPosition,
      saveState,
    });

    const summary = await runSweep(deps, { maxPositionReads: 1 });

    expect(readPosition).toHaveBeenCalledTimes(1);
    expect(summary.positionsRead).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.notified).toBe(1);
    // Only the processed subscription's dedupe state advances.
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(saveState).toHaveBeenCalledWith(SUB, expect.anything());
  });

  it('a shared read failure defers every subscription on that position, no state written', async () => {
    const readPosition = vi.fn(async () => {
      throw new Error('Hiro API error: 503');
    });
    const deps = makeDeps({
      listSubscriptions: async () => [subscription({ id: SUB }), subscription({ id: SUB2 })],
      readPosition,
    });

    const summary = await runSweep(deps);

    expect(readPosition).toHaveBeenCalledTimes(1); // deduped read, one call
    expect(summary.failures).toBe(2); // both subscriptions on it couldn't evaluate
    expect(deps.saveState).not.toHaveBeenCalled();
    expect(deps.sendPush).not.toHaveBeenCalled();
  });

  it('reads within the concurrency bound never exceed the configured limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const readPosition = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight--;
      return position(0.1);
    });
    const subs = Array.from({ length: 6 }, (_, i) =>
      subscription({
        id: `5${i}000000-0000-4000-8000-000000000000`,
        protocol: i % 2 === 0 ? 'zest' : 'granite',
        watched_wallets: {
          chain: 'stx',
          address: `SP${i}00000000000000000000000000000000000`,
          label: null,
        },
      }),
    );
    const deps = makeDeps({ listSubscriptions: async () => subs, readPosition });

    await runSweep(deps, { readConcurrency: 2 });

    expect(readPosition).toHaveBeenCalledTimes(6);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('buildPayload', () => {
  it('labels the notification with band, reason, wallet, and risk percent', () => {
    const payload = buildPayload(subscription(), 0.87, 'warn', 'escalated');
    expect(payload.title).toBe('⚠️ Liquidation risk increased');
    expect(payload.body).toBe('Main stack · zest on stx — at 87% of the liquidation threshold.');
    expect(payload.tag).toBe(`liquidation-${SUB}`);
  });

  it('falls back to a shortened address when the wallet has no label', () => {
    const noLabel = subscription();
    noLabel.watched_wallets.label = null;
    const payload = buildPayload(noLabel, 1.02, 'critical', 'escalated');
    expect(payload.title).toBe('🚨 Liquidation risk increased');
    expect(payload.body).toContain('SP2VCQ…W1NF');
    expect(payload.body).toContain('102%');
  });
});
