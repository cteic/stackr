import { useQuery } from '@tanstack/react-query';
import { fetchGoldPrice, type GoldPrice } from '@stackr/services';
import type { Currency } from '@stackr/models';

export type { GoldPrice };

/** Spot gold in the display currency; polled at the slow stock-quote cadence. */
export function useGoldPrice(currency: Currency, enabled = true) {
  return useQuery({
    queryKey: ['gold', 'price', currency],
    queryFn: () => fetchGoldPrice(currency),
    enabled,
    staleTime: 300_000,
    refetchInterval: 900_000,
  });
}
