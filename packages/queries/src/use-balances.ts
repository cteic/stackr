import { useQueries } from '@tanstack/react-query';
import type { Wallet } from '@stackr/models';
import { fetchBalance } from '@stackr/services';
import { queryKeys } from './keys.js';

export function useBalances(wallets: Wallet[]) {
  return useQueries({
    queries: wallets.map(wallet => ({
      queryKey: queryKeys.balance(wallet.chain, wallet.address),
      queryFn: () => fetchBalance(wallet.chain, wallet.address),
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    })),
  });
}
