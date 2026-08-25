import { useQuery } from '@tanstack/react-query';
import { searchStocks } from '@stackr/services';
import { queryKeys } from './keys.js';

export function useStockSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.stockSearch(query),
    queryFn: () => searchStocks(query),
    enabled: query.length >= 1,
    staleTime: 5 * 60_000,
  });
}
