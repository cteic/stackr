'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { TooltipProvider } from '@stackr/ui';
import { ThemeProvider } from '@/components/theme-provider';
import { WalletConnectionBridge } from '@/components/wallet-connection-bridge';
import { ActivityControllerProvider } from '@/lib/controllers/activity-controller-provider';
import { PostHogProvider, PostHogPageview } from '@/lib/posthog-provider';
import { wagmiConfig } from '@/lib/wagmi-config';
import { solanaEndpoint } from '@/lib/solana-config';
import { getSolanaWalletAdapters } from '@/lib/solana-wallet-instance';
import { useMemo, useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  // Share the same adapter instances with the WalletConnectionController's
  // Solana sources, so their connect/disconnect events reach the controller.
  const solanaWallets = useMemo(() => getSolanaWalletAdapters(), []);

  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <ConnectionProvider endpoint={solanaEndpoint}>
              <WalletProvider wallets={solanaWallets} autoConnect>
                <TooltipProvider delayDuration={300}>
                  <WalletConnectionBridge />
                  <PostHogProvider>
                    <PostHogPageview />
                    <ActivityControllerProvider>{children}</ActivityControllerProvider>
                  </PostHogProvider>
                </TooltipProvider>
              </WalletProvider>
            </ConnectionProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
