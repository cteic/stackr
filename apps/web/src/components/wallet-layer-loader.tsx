'use client';

import dynamic from 'next/dynamic';

/**
 * Loads wagmi, RainbowKit, the Solana wallet adapters and the connect dialog
 * as one chunk, after the page has rendered. None of it is needed to paint a
 * page: the app reads connected addresses from Jotai, and this layer writes
 * them there once it mounts.
 */
export function loadWalletLayer(): void {
  void import('@/components/wallet-layer');
}

export const LazyWalletLayer = dynamic(
  () => import('@/components/wallet-layer').then(module => module.WalletLayer),
  { ssr: false },
);
