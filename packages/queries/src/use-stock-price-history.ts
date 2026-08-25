import { useQuery } from '@tanstack/react-query';
import { fetchStockPriceHistory } from '@stackr/services';
import { queryKeys } from './keys.js';

export function useStockPriceHistory(symbol: string, days: number) {
  return useQuery({
    queryKey: queryKeys.stockPriceHistory(symbol, days),
    queryFn: () => fetchStockPriceHistory(symbol, days),
    enabled: symbol.length > 0,
    // Daily data — keep it cached and don't poll into the 5 req/min free tier.
    staleTime: 30 * 60_000,
  });
}
