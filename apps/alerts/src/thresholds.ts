import type { AlertState, RiskBand, Thresholds } from './types.js';

/**
 * Pure alert-decision logic: given a position's normalized liquidation risk
 * (0..1, where 1.0 sits at the liquidation threshold — see the HealthPosition
 * model) and what we last told the user, decide whether to message them now.
 * Kept free of I/O so every band transition and cooldown edge is unit-testable.
 */

const BAND_RANK: Record<RiskBand, number> = { ok: 0, warn: 1, critical: 2 };

export function riskBand(liquidationRisk: number, thresholds: Thresholds): RiskBand {
  if (liquidationRisk >= thresholds.critical) {
    return 'critical';
  }
  if (liquidationRisk >= thresholds.warn) {
    return 'warn';
  }
  return 'ok';
}

/** Why a notification fires; `null` means stay silent. */
export type NotifyReason = 'escalated' | 'eased' | 'recovered' | 'still-at-risk' | null;

export interface NotifyDecision {
  reason: NotifyReason;
  /** The state to persist after this sweep, whether or not we messaged. */
  state: AlertState;
}

/**
 * The dedupe rules:
 *  - band worsened → alert ('escalated');
 *  - band improved but still at risk → alert ('eased');
 *  - band back to ok after we had alerted → alert once ('recovered');
 *  - band unchanged and at risk → re-alert only after `cooldownMs`
 *    ('still-at-risk'), so a hovering position can't spam every sweep;
 *  - band unchanged at ok → never message.
 */
export function decideNotification(
  previous: AlertState | null,
  liquidationRisk: number,
  thresholds: Thresholds,
  cooldownMs: number,
  now: Date,
): NotifyDecision {
  const band = riskBand(liquidationRisk, thresholds);
  const previousBand: RiskBand = previous?.band ?? 'ok';
  const nowIso = now.toISOString();

  if (BAND_RANK[band] > BAND_RANK[previousBand]) {
    return { reason: 'escalated', state: { band, alertedAt: nowIso } };
  }

  if (BAND_RANK[band] < BAND_RANK[previousBand]) {
    if (band === 'ok') {
      // Only announce a recovery the user heard the bad news about.
      return previous?.alertedAt != null
        ? { reason: 'recovered', state: { band, alertedAt: null } }
        : { reason: null, state: { band, alertedAt: null } };
    }
    return { reason: 'eased', state: { band, alertedAt: nowIso } };
  }

  if (band === 'ok') {
    return { reason: null, state: { band, alertedAt: null } };
  }

  const lastAlertMs = previous?.alertedAt != null ? Date.parse(previous.alertedAt) : null;
  const cooledDown = lastAlertMs === null || now.getTime() - lastAlertMs >= cooldownMs;

  return cooledDown
    ? { reason: 'still-at-risk', state: { band, alertedAt: nowIso } }
    : { reason: null, state: { band, alertedAt: previous?.alertedAt ?? null } };
}
