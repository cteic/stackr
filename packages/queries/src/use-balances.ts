import { useQueries } from '@tanstack/react-query';
import type { Wallet } from '@stackr/models';
import { fetchBalance } from '@stackr/services';
import { queryKeys } from './keys.js';
import { retryRemoteRead } from './retry.js';

/**
 * One balance read per wallet, sharing the cache entries `useBalance` writes:
 * the key factory is the same, so a wallet already loaded on a detail page is
 * served from cache here rather than refetched.
 */
export function useBalances(wallets: Wallet[]) {
  return useQueries({
    queries: wallets.map(wallet => ({
      queryKey: queryKeys.balance(wallet.chain, wallet.address),
      queryFn: () => fetchBalance(wallet.chain, wallet.address),
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      retry: retryRemoteRead,
    })),
  });
}
