import { useQuery } from '@tanstack/react-query';
import type { Chain, Currency, Price } from '@stackr/models';
import { fetchPrices } from '@stackr/services';
import { queryKeys } from './keys.js';
import { retryRemoteRead, type RemoteReadError } from './retry.js';

/**
 * Spot prices for a set of chains in one currency. The key carries the currency
 * as well as the chains, so switching currency is a new cache entry rather than
 * a silent overwrite of the previous one.
 */
export function usePrices(chains: Chain[], currency: Currency = 'usd') {
  return useQuery<Price[], RemoteReadError>({
    queryKey: queryKeys.pricesByChains(chains, currency),
    queryFn: () => fetchPrices(chains, currency),
    enabled: chains.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: retryRemoteRead,
  });
}
