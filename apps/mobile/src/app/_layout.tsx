// Polyfills the auth stack expects — order matters, keep these first.
import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';
import { Buffer } from 'buffer';

import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { PrivyProvider } from '@privy-io/expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TamaguiProvider } from 'tamagui';
import { config } from '@/tamagui.config';
import { readPrivyConfig } from '@/lib/privy-config';

global.Buffer = Buffer;

function AppShell() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0b0d10' },
      }}
    />
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 2 },
        },
      }),
  );
  const privyConfig = readPrivyConfig();

  return (
    <TamaguiProvider config={config} defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        {privyConfig === null ? (
          // Unconfigured builds still render (index shows the setup notice) —
          // the PrivyProvider requires real ids, so it mounts only with them.
          <AppShell />
        ) : (
          <PrivyProvider appId={privyConfig.appId} clientId={privyConfig.clientId}>
            <AppShell />
          </PrivyProvider>
        )}
      </QueryClientProvider>
    </TamaguiProvider>
  );
}
