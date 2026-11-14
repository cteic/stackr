import { useQuery } from '@tanstack/react-query';
import type { Balance, Chain } from '@stackr/models';
import { fetchBalance } from '@stackr/services';
import { queryKeys } from './keys.js';
import { retryRemoteRead, type RemoteReadError } from './retry.js';

export interface UseBalanceOptions {
  enabled?: boolean;
}

/**
 * The native-asset balance for one address on one chain.
 *
 * Short-lived on purpose: a balance moves whenever a block lands, so it is
 * trusted for 30s and refetched every 60s. Failures are typed as
 * {@link RemoteReadError} so a caller can tell a rate limit from a dead
 * provider without matching on an error message.
 */
export function useBalance(chain: Chain, address: string, options?: UseBalanceOptions) {
  const { enabled = true } = options ?? {};

  return useQuery<Balance, RemoteReadError>({
    queryKey: queryKeys.balance(chain, address),
    queryFn: () => fetchBalance(chain, address),
    enabled: enabled && !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: retryRemoteRead,
  });
}
