/**
 * Onboarding is a pure derivation over Privy's session state — no stored
 * machine, so it can never disagree with the SDK. The screens switch on the
 * returned phase; `nextAction` tells the effect layer which embedded wallet
 * still needs creating after login (Privy creates them lazily).
 */
export type OnboardingPhase =
  | 'unconfigured'
  | 'booting'
  | 'signed-out'
  | 'preparing-wallets'
  | 'ready';

export type WalletCreateAction = 'create-ethereum' | 'create-solana' | 'none';

export interface OnboardingInput {
  /** Privy app + client ids are present in the build. */
  configured: boolean;
  /** `usePrivy().isReady` — SDK finished restoring any session. */
  privyReady: boolean;
  /** A user session exists. */
  authenticated: boolean;
  hasEthereumWallet: boolean;
  hasSolanaWallet: boolean;
}

export interface OnboardingView {
  phase: OnboardingPhase;
  nextAction: WalletCreateAction;
}

export function deriveOnboarding(input: OnboardingInput): OnboardingView {
  if (!input.configured) return { phase: 'unconfigured', nextAction: 'none' };
  if (!input.privyReady) return { phase: 'booting', nextAction: 'none' };
  if (!input.authenticated) return { phase: 'signed-out', nextAction: 'none' };
  if (!input.hasEthereumWallet)
    return { phase: 'preparing-wallets', nextAction: 'create-ethereum' };
  if (!input.hasSolanaWallet) return { phase: 'preparing-wallets', nextAction: 'create-solana' };
  return { phase: 'ready', nextAction: 'none' };
}
