import type { SecureStorage } from './contracts/signer';
import type { EnsureSeedResult } from './local-seed';

/**
 * Deferred-backup state (ADR 0020 onboarding: the seed is created silently,
 * so the nudge machinery here is what eventually gets it backed up). Both
 * flags are device-local by design — backup posture never leaves the device,
 * and Supabase never learns whether a user wrote their phrase down.
 */
export const BACKUP_VERIFIED_KEY = 'stackr.backup.verified.v1';
export const INTERSTITIAL_SHOWN_KEY = 'stackr.backup.interstitial-shown.v1';

const FLAG_VALUE = 'true';

async function readFlag(storage: SecureStorage, key: string): Promise<boolean> {
  return (await storage.get(key)) === FLAG_VALUE;
}

export async function readBackupVerified(storage: SecureStorage): Promise<boolean> {
  return readFlag(storage, BACKUP_VERIFIED_KEY);
}

/** Set once the confirm-two-words quiz passes; never unset by the app. */
export async function markBackupVerified(storage: SecureStorage): Promise<void> {
  await storage.set(BACKUP_VERIFIED_KEY, FLAG_VALUE);
}

export async function readInterstitialShown(storage: SecureStorage): Promise<boolean> {
  return readFlag(storage, INTERSTITIAL_SHOWN_KEY);
}

export async function markInterstitialShown(storage: SecureStorage): Promise<void> {
  await storage.set(INTERSTITIAL_SHOWN_KEY, FLAG_VALUE);
}

export type BackupBanner = 'hidden' | 'neutral' | 'urgent';

/**
 * Balance-screen banner state. Escalation rule: once any tracked balance is
 * non-zero the banner turns urgent and stops being dismissable — pre-backup,
 * the BTC/STX/SUI keys exist only on this device, so real funds mean real
 * exposure. Dismissal is session-scoped on purpose: the nudge recurs on the
 * next launch until the quiz passes.
 */
export function deriveBackupBanner(input: {
  verified: boolean;
  dismissedThisSession: boolean;
  hasFunds: boolean;
}): BackupBanner {
  if (input.verified) return 'hidden';
  if (input.hasFunds) return 'urgent';
  return input.dismissedThisSession ? 'hidden' : 'neutral';
}

/**
 * The one-time post-onboarding interstitial: only right after this device
 * silently created the seed, and only if it has never been shown. Returning
 * users (seed already existed) are never blocked.
 */
export function shouldShowInterstitial(input: {
  seedResult: EnsureSeedResult | null;
  alreadyShown: boolean;
}): boolean {
  return input.seedResult === 'created' && !input.alreadyShown;
}
