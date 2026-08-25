import { describe, expect, it } from 'vitest';
import { deriveOnboarding, type OnboardingInput } from './onboarding';

function input(overrides: Partial<OnboardingInput>): OnboardingInput {
  return {
    configured: true,
    privyReady: true,
    authenticated: true,
    hasEthereumWallet: true,
    hasSolanaWallet: true,
    ...overrides,
  };
}

describe('deriveOnboarding', () => {
  it('reports unconfigured before anything else when Privy ids are absent', () => {
    expect(deriveOnboarding(input({ configured: false, privyReady: false }))).toEqual({
      phase: 'unconfigured',
      nextAction: 'none',
    });
  });

  it('boots until the SDK restores the session', () => {
    expect(deriveOnboarding(input({ privyReady: false })).phase).toBe('booting');
  });

  it('is signed-out when no session exists, regardless of wallet flags', () => {
    expect(
      deriveOnboarding(
        input({ authenticated: false, hasEthereumWallet: false, hasSolanaWallet: false }),
      ).phase,
    ).toBe('signed-out');
  });

  it('asks for the Ethereum embedded wallet first after login', () => {
    expect(deriveOnboarding(input({ hasEthereumWallet: false, hasSolanaWallet: false }))).toEqual({
      phase: 'preparing-wallets',
      nextAction: 'create-ethereum',
    });
  });

  it('asks for the Solana embedded wallet once Ethereum exists', () => {
    expect(deriveOnboarding(input({ hasSolanaWallet: false }))).toEqual({
      phase: 'preparing-wallets',
      nextAction: 'create-solana',
    });
  });

  it('is ready when a session and both embedded wallets exist', () => {
    expect(deriveOnboarding(input({}))).toEqual({ phase: 'ready', nextAction: 'none' });
  });
});
