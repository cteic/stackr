import { useCallback, useEffect, useState } from 'react';
import {
  deriveBackupBanner,
  markBackupVerified,
  markInterstitialShown,
  readBackupVerified,
  readInterstitialShown,
  shouldShowInterstitial,
  type BackupBanner,
} from './backup-status';
import { getSignerStorage, useLocalWallet } from './local-wallet-singleton';

/** Session-scoped dismissal: module state on purpose — resets each launch. */
let dismissedThisSession = false;

export interface BackupStatusView {
  banner: BackupBanner;
  interstitialVisible: boolean;
  verified: boolean;
  dismissBanner(): void;
  dismissInterstitial(): Promise<void>;
  confirmVerified(): Promise<void>;
  /** Re-read the persisted flags (call on screen focus after the quiz). */
  refresh(): Promise<void>;
}

export function useBackupStatus(hasFunds: boolean): BackupStatusView {
  const localWallet = useLocalWallet();
  const [verified, setVerified] = useState(false);
  const [interstitialShown, setInterstitialShown] = useState(true);
  const [dismissed, setDismissed] = useState(dismissedThisSession);

  const refresh = useCallback(async (): Promise<void> => {
    const storage = getSignerStorage();
    const [isVerified, wasShown] = await Promise.all([
      readBackupVerified(storage),
      readInterstitialShown(storage),
    ]);
    setVerified(isVerified);
    setInterstitialShown(wasShown);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    banner: deriveBackupBanner({ verified, dismissedThisSession: dismissed, hasFunds }),
    interstitialVisible: shouldShowInterstitial({
      seedResult: localWallet.seedResult,
      alreadyShown: interstitialShown,
    }),
    verified,
    dismissBanner: () => {
      dismissedThisSession = true;
      setDismissed(true);
    },
    dismissInterstitial: async () => {
      setInterstitialShown(true);
      await markInterstitialShown(getSignerStorage());
    },
    confirmVerified: async () => {
      setVerified(true);
      await markBackupVerified(getSignerStorage());
    },
    refresh,
  };
}
