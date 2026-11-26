'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { useMemo } from 'react';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletConnectionBridge } from '@/components/wallet-connection-bridge';
import { WalletConnectModal } from '@/components/wallet-connect-modal';
import { wagmiConfig } from '@/lib/wagmi-config';
import { solanaEndpoint } from '@/lib/solana-config';
import { getSolanaWalletAdapters } from '@/lib/solana-wallet-instance';

/**
 * Everything that talks to a browser wallet. It renders no page content, so it
 * sits beside the page rather than around it, and can load after first paint.
 * The bridge mirrors live connections into Jotai and the dialog restores
 * Leather, Slush and Stackr Link sessions on mount, so remembered wallets
 * still reconnect on every page.
 *
 * It must render inside the app's QueryClientProvider: wagmi's hooks use the
 * nearest React Query client.
 */
export function WalletLayer() {
  // Share the same adapter instances with the WalletConnectionController's
  // Solana sources, so their connect/disconnect events reach the controller.
  const solanaWallets = useMemo(() => getSolanaWalletAdapters(), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>
        <ConnectionProvider endpoint={solanaEndpoint}>
          <WalletProvider wallets={solanaWallets} autoConnect>
            <WalletConnectionBridge />
            <WalletConnectModal />
          </WalletProvider>
        </ConnectionProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
