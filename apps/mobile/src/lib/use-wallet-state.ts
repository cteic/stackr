import { useMemo } from 'react';
import * as Crypto from 'expo-crypto';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { buildAccountsView, type AccountsView } from './accounts';
import { deriveOnboarding, type OnboardingView } from './onboarding';
import { readPrivyConfig } from './privy-config';

/**
 * The single seam between Privy's SDK surface and the app's pure logic layer
 * (`deriveOnboarding`, `buildAccountsView`). Screens consume this hook and the
 * pure functions stay SDK-free and unit-tested.
 */
export interface WalletState {
  onboarding: OnboardingView;
  accountsView: AccountsView;
  createEthereumWallet: () => Promise<void>;
  createSolanaWallet: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useWalletState(): WalletState {
  const { user, isReady, logout } = usePrivy();
  const ethereum = useEmbeddedEthereumWallet();
  const solana = useEmbeddedSolanaWallet();

  const ethereumAddress = ethereum.wallets[0]?.address ?? null;
  const solanaAddress = solana.wallets?.[0]?.address ?? null;

  const onboarding = deriveOnboarding({
    configured: readPrivyConfig() !== null,
    privyReady: isReady,
    authenticated: user !== null,
    hasEthereumWallet: ethereumAddress !== null,
    hasSolanaWallet: solanaAddress !== null,
  });

  const accountsView = useMemo(
    () =>
      buildAccountsView({ ethereumAddress, solanaAddress }, () => ({
        id: Crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      })),
    [ethereumAddress, solanaAddress],
  );

  return {
    onboarding,
    accountsView,
    createEthereumWallet: async () => {
      await ethereum.create();
    },
    createSolanaWallet: async () => {
      await solana.create?.();
    },
    logout: async () => {
      await logout();
    },
  };
}
