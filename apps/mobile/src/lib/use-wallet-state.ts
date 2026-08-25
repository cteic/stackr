import { useEffect, useMemo } from 'react';
import * as Crypto from 'expo-crypto';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { buildAccountsView, type AccountsView } from './accounts';
import { bootstrapLocalWallet, useLocalWallet } from './local-wallet-singleton';
import type { LocalWalletState } from './local-wallet-store';
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
  localWallet: LocalWalletState;
  createEthereumWallet: () => Promise<void>;
  createSolanaWallet: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useWalletState(): WalletState {
  const { user, isReady, logout } = usePrivy();
  const ethereum = useEmbeddedEthereumWallet();
  const solana = useEmbeddedSolanaWallet();
  const localWallet = useLocalWallet();

  const ethereumAddress = ethereum.wallets[0]?.address ?? null;
  const solanaAddress = solana.wallets?.[0]?.address ?? null;
  const authenticated = user !== null;

  // Silent-seed bootstrap (ADR 0020): right after auth, the BTC/STX/SUI seed
  // is generated into the keystore with no ceremony. Idempotent across the
  // screens that share this hook — the store dedupes concurrent calls.
  useEffect(() => {
    if (authenticated) void bootstrapLocalWallet();
  }, [authenticated]);

  const onboarding = deriveOnboarding({
    configured: readPrivyConfig() !== null,
    privyReady: isReady,
    authenticated,
    hasEthereumWallet: ethereumAddress !== null,
    hasSolanaWallet: solanaAddress !== null,
  });

  const accountsView = useMemo(
    () =>
      buildAccountsView(
        { ethereumAddress, solanaAddress, localAddresses: localWallet.addresses },
        () => ({
          id: Crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }),
      ),
    [ethereumAddress, solanaAddress, localWallet.addresses],
  );

  return {
    onboarding,
    accountsView,
    localWallet,
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
