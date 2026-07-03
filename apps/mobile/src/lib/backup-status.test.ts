import { describe, expect, it } from 'vitest';
import type { SecureStorage } from './contracts/signer';
import {
  deriveBackupBanner,
  markBackupVerified,
  markInterstitialShown,
  readBackupVerified,
  readInterstitialShown,
  shouldShowInterstitial,
} from './backup-status';

function memoryStorage(): SecureStorage {
  const store = new Map<string, string>();
  return {
    get: key => Promise.resolve(store.get(key) ?? null),
    set: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: key => {
      store.delete(key);
      return Promise.resolve();
    },
  };
}

describe('deriveBackupBanner', () => {
  it('hides once the backup is verified, regardless of funds', () => {
    expect(
      deriveBackupBanner({ verified: true, dismissedThisSession: false, hasFunds: true }),
    ).toBe('hidden');
  });

  it('shows the neutral nudge for an unverified, unfunded wallet', () => {
    expect(
      deriveBackupBanner({ verified: false, dismissedThisSession: false, hasFunds: false }),
    ).toBe('neutral');
  });

  it('respects a session dismissal while unfunded', () => {
    expect(
      deriveBackupBanner({ verified: false, dismissedThisSession: true, hasFunds: false }),
    ).toBe('hidden');
  });

  it('escalates to urgent when funds arrive — and dismissal stops working', () => {
    expect(
      deriveBackupBanner({ verified: false, dismissedThisSession: true, hasFunds: true }),
    ).toBe('urgent');
  });
});

describe('shouldShowInterstitial — shown-once semantics', () => {
  it('shows exactly when this login created the seed and it was never shown', () => {
    expect(shouldShowInterstitial({ seedResult: 'created', alreadyShown: false })).toBe(true);
  });

  it('never shows again once marked', () => {
    expect(shouldShowInterstitial({ seedResult: 'created', alreadyShown: true })).toBe(false);
  });

  it('never blocks returning users whose seed already existed', () => {
    expect(shouldShowInterstitial({ seedResult: 'existing', alreadyShown: false })).toBe(false);
    expect(shouldShowInterstitial({ seedResult: null, alreadyShown: false })).toBe(false);
  });
});

describe('backup flags persistence', () => {
  it('round-trips the verified flag', async () => {
    const storage = memoryStorage();
    expect(await readBackupVerified(storage)).toBe(false);
    await markBackupVerified(storage);
    expect(await readBackupVerified(storage)).toBe(true);
  });

  it('round-trips the interstitial flag — the shown-once guard', async () => {
    const storage = memoryStorage();
    expect(await readInterstitialShown(storage)).toBe(false);
    await markInterstitialShown(storage);
    expect(await readInterstitialShown(storage)).toBe(true);
    // Second mark stays idempotent.
    await markInterstitialShown(storage);
    expect(await readInterstitialShown(storage)).toBe(true);
  });
});
