import { describe, expect, it } from 'vitest';
import { decideNotification, riskBand } from './thresholds.js';
import type { Thresholds } from './types.js';

const THRESHOLDS: Thresholds = { warn: 0.8, critical: 0.95 };
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const NOW = new Date('2026-07-03T12:00:00.000Z');

describe('riskBand', () => {
  it('maps risk to ok / warn / critical at the configured cut-offs', () => {
    expect(riskBand(0, THRESHOLDS)).toBe('ok');
    expect(riskBand(0.79, THRESHOLDS)).toBe('ok');
    expect(riskBand(0.8, THRESHOLDS)).toBe('warn');
    expect(riskBand(0.94, THRESHOLDS)).toBe('warn');
    expect(riskBand(0.95, THRESHOLDS)).toBe('critical');
    expect(riskBand(1.2, THRESHOLDS)).toBe('critical');
  });
});

describe('decideNotification', () => {
  it('alerts on first escalation into warn and stamps the alert time', () => {
    const decision = decideNotification(null, 0.85, THRESHOLDS, COOLDOWN_MS, NOW);
    expect(decision.reason).toBe('escalated');
    expect(decision.state).toEqual({ band: 'warn', alertedAt: NOW.toISOString() });
  });

  it('alerts again when warn worsens to critical', () => {
    const previous = { band: 'warn', alertedAt: NOW.toISOString() } as const;
    const decision = decideNotification(previous, 0.97, THRESHOLDS, COOLDOWN_MS, NOW);
    expect(decision.reason).toBe('escalated');
    expect(decision.state.band).toBe('critical');
  });

  it('stays silent while the band is unchanged inside the cooldown window', () => {
    const alertedAt = new Date(NOW.getTime() - COOLDOWN_MS / 2).toISOString();
    const decision = decideNotification(
      { band: 'warn', alertedAt },
      0.85,
      THRESHOLDS,
      COOLDOWN_MS,
      NOW,
    );
    expect(decision.reason).toBeNull();
    expect(decision.state).toEqual({ band: 'warn', alertedAt });
  });

  it('re-alerts a still-at-risk position once the cooldown has passed', () => {
    const alertedAt = new Date(NOW.getTime() - COOLDOWN_MS - 1).toISOString();
    const decision = decideNotification(
      { band: 'critical', alertedAt },
      0.96,
      THRESHOLDS,
      COOLDOWN_MS,
      NOW,
    );
    expect(decision.reason).toBe('still-at-risk');
    expect(decision.state.alertedAt).toBe(NOW.toISOString());
  });

  it('notifies easing (critical → warn) as an update, not silence', () => {
    const previous = { band: 'critical', alertedAt: NOW.toISOString() } as const;
    const decision = decideNotification(previous, 0.85, THRESHOLDS, COOLDOWN_MS, NOW);
    expect(decision.reason).toBe('eased');
    expect(decision.state.band).toBe('warn');
  });

  it('announces recovery exactly once, then goes quiet', () => {
    const alerted = { band: 'warn', alertedAt: NOW.toISOString() } as const;
    const recovery = decideNotification(alerted, 0.1, THRESHOLDS, COOLDOWN_MS, NOW);
    expect(recovery.reason).toBe('recovered');
    expect(recovery.state).toEqual({ band: 'ok', alertedAt: null });

    const after = decideNotification(recovery.state, 0.1, THRESHOLDS, COOLDOWN_MS, NOW);
    expect(after.reason).toBeNull();
  });

  it('never announces a recovery the user was not warned about', () => {
    const decision = decideNotification(
      { band: 'warn', alertedAt: null },
      0.1,
      THRESHOLDS,
      COOLDOWN_MS,
      NOW,
    );
    expect(decision.reason).toBeNull();
    expect(decision.state.band).toBe('ok');
  });

  it('stays silent for an ok position with no history', () => {
    const decision = decideNotification(null, 0.2, THRESHOLDS, COOLDOWN_MS, NOW);
    expect(decision.reason).toBeNull();
    expect(decision.state).toEqual({ band: 'ok', alertedAt: null });
  });
});
