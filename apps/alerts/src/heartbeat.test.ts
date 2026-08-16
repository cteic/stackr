import { describe, expect, it, vi } from 'vitest';
import { assessHealth, reportHeartbeat } from './heartbeat.js';
import type { SweepSummary } from './sweep.js';

const NOW = new Date('2026-07-08T12:00:00.000Z');

function summary(overrides: Partial<SweepSummary> = {}): SweepSummary {
  return {
    subscriptions: 3,
    positionsRead: 3,
    notified: 1,
    deliveries: 1,
    failures: 0,
    skipped: 0,
    ...overrides,
  };
}

describe('assessHealth', () => {
  it('is healthy on a clean run', () => {
    expect(assessHealth(summary())).toEqual({ healthy: true, reasons: [] });
  });

  it('flags failures', () => {
    const { healthy, reasons } = assessHealth(summary({ failures: 2 }));
    expect(healthy).toBe(false);
    expect(reasons).toContain('2 failures');
  });

  it('flags a run that notified but delivered nothing (broken push pipeline)', () => {
    const { healthy, reasons } = assessHealth(summary({ notified: 2, deliveries: 0 }));
    expect(healthy).toBe(false);
    expect(reasons).toContain('notified but delivered nothing');
  });

  it('flags deferred work past the read budget', () => {
    const { healthy, reasons } = assessHealth(summary({ skipped: 5 }));
    expect(healthy).toBe(false);
    expect(reasons[0]).toContain('deferred');
  });
});

describe('reportHeartbeat', () => {
  it('logs a structured healthy line and does not POST when no url is set', async () => {
    const log = vi.fn();
    const errorLog = vi.fn();
    const fetchImpl = vi.fn();

    await reportHeartbeat(summary(), { log, errorLog, fetchImpl, now: () => NOW });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    const record = JSON.parse(log.mock.calls[0][0]);
    expect(record).toMatchObject({ event: 'alerts.sweep', healthy: true, at: NOW.toISOString() });
  });

  it('POSTs the record to the heartbeat url', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    });

    await reportHeartbeat(summary(), {
      url: 'https://hc.example.com/ping/abc',
      fetchImpl,
      log: vi.fn(),
      now: () => NOW,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls[0].url).toBe('https://hc.example.com/ping/abc');
    expect(JSON.parse(String(calls[0].init?.body)).healthy).toBe(true);
  });

  it('routes an unhealthy run to errorLog with the UNHEALTHY prefix', async () => {
    const log = vi.fn();
    const errorLog = vi.fn();

    await reportHeartbeat(summary({ failures: 1 }), { log, errorLog, now: () => NOW });

    expect(log).not.toHaveBeenCalled();
    expect(errorLog.mock.calls[0][0]).toContain('alerts: UNHEALTHY');
  });

  it('never throws when the heartbeat POST fails — the sweep result stands', async () => {
    const errorLog = vi.fn();
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(
      reportHeartbeat(summary(), {
        url: 'https://hc.example.com/ping/abc',
        fetchImpl,
        log: vi.fn(),
        errorLog,
        now: () => NOW,
      }),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith('alerts: heartbeat post failed');
  });
});
