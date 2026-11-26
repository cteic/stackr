'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@stackr/ui';
import { ThemeProvider } from '@/components/theme-provider';
import { LazyWalletLayer } from '@/components/wallet-layer-loader';
import { ActivityControllerProvider } from '@/lib/controllers/activity-controller-provider';
import { PostHogProvider, PostHogPageview } from '@/lib/posthog-provider';
import { useState, type ReactNode } from 'react';

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

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <PostHogProvider>
            <PostHogPageview />
            <ActivityControllerProvider>{children}</ActivityControllerProvider>
          </PostHogProvider>
          <LazyWalletLayer />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
