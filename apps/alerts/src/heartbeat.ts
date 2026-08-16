import type { SweepSummary } from './sweep.js';
import type { FetchLike } from './supabase.js';

/**
 * Observability for the sweep (see #141 H3). The Worker is a headless cron with
 * no dashboard: if deliveries silently stop — VAPID rotation, a Supabase
 * outage, every endpoint returning 410 — nobody learns, which for a
 * liquidation-alert product is the worst possible failure.
 *
 * So every run emits a structured line (parseable by Logpush / a log drain) and,
 * when a heartbeat URL is configured, POSTs the same record to it. Point that
 * URL at a dead-man's-switch (e.g. a healthchecks.io ping): a *missing* heartbeat
 * then alerts on a Worker that stopped running entirely, which self-reporting
 * can never catch. A run is "unhealthy" when it had failures, decided to notify
 * but delivered nothing, or deferred work past the per-invocation budget.
 */

export interface HeartbeatRecord {
  event: 'alerts.sweep';
  healthy: boolean;
  reasons: string[];
  at: string;
  summary: SweepSummary;
}

export interface HeartbeatDeps {
  /** When set, the record is POSTed here (best effort — never fails the run). */
  url?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
  /** Injected for tests; defaults to the console. */
  log?: (line: string) => void;
  errorLog?: (line: string) => void;
}

export function assessHealth(summary: SweepSummary): { healthy: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (summary.failures > 0) {
    reasons.push(`${summary.failures} failures`);
  }
  if (summary.notified > 0 && summary.deliveries === 0) {
    reasons.push('notified but delivered nothing');
  }
  if (summary.skipped > 0) {
    reasons.push(`${summary.skipped} subscriptions deferred past the read budget`);
  }
  return { healthy: reasons.length === 0, reasons };
}

export async function reportHeartbeat(
  summary: SweepSummary,
  deps: HeartbeatDeps = {},
): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((line: string) => console.log(line));
  const errorLog = deps.errorLog ?? ((line: string) => console.error(line));

  const { healthy, reasons } = assessHealth(summary);
  const record: HeartbeatRecord = {
    event: 'alerts.sweep',
    healthy,
    reasons,
    at: now().toISOString(),
    summary,
  };

  const line = JSON.stringify(record);
  if (healthy) {
    log(line);
  } else {
    // A stable prefix a log-based alert can key on when no webhook is wired.
    errorLog(`alerts: UNHEALTHY ${line}`);
  }

  if (deps.url === undefined) {
    return;
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    await fetchImpl(deps.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: line,
    });
  } catch {
    // A heartbeat that can't be delivered must never break the sweep itself.
    errorLog('alerts: heartbeat post failed');
  }
}
