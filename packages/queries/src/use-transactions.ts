import { useQuery } from '@tanstack/react-query';
import type { Chain, Transaction } from '@stackr/models';
import { fetchTransactions } from '@stackr/services';
import { queryKeys } from './keys.js';
import { retryRemoteRead, type RemoteReadError } from './retry.js';

/**
 * Recent transactions for one address, already normalised to the domain
 * `Transaction` shape, so one list component renders any chain's history.
 */
export function useTransactions(chain: Chain, address: string) {
  return useQuery<Transaction[], RemoteReadError>({
    queryKey: queryKeys.transactions(chain, address),
    queryFn: () => fetchTransactions(chain, address),
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: retryRemoteRead,
  });
}
