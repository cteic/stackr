import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { Chain, HealthPosition } from '@stackr/models';
import { healthAdapters } from '@stackr/services';
import { queryKeys } from './keys.js';

/** Watched/connected addresses grouped by the chain they live on. */
export type HealthAddressesByChain = Partial<Record<Chain, string[]>>;

/** One adapter paired with one address it should read. */
export interface HealthQueryPair {
  adapter: (typeof healthAdapters)[number];
  address: string;
}

/**
 * Liquidation-health is refreshed **on demand**, never background-polled: the
 * per-account reads are the expensive ones, and a generous stale time plus an
 * explicit refresh action (and refetch-on-focus) is the free-tier-honest model
 * from ADR 0016. So: long `staleTime`, no `refetchInterval`.
 */
const HEALTH_STALE_TIME = 5 * 60 * 1000;

export interface UseHealthPositionsResult {
  /** Merged, non-empty positions across every adapter × address, riskiest first. */
  positions: HealthPosition[];
  /** True while any position is loading for the first time. */
  isLoading: boolean;
  /** True while any position is (re)fetching, e.g. after a manual refresh. */
  isFetching: boolean;
  /** True if any adapter read failed. */
  isError: boolean;
  /** Explicit on-demand refresh — invalidates every health query. */
  refresh: () => void;
}

/**
 * Collapse the per-query results into the list the UI renders: drop the misses
 * (an adapter returns `null` for an address with no position on that protocol,
 * `undefined` while still loading) and sort riskiest-first so the position
 * closest to liquidation leads. Pure, so the merge is unit-testable without
 * standing up React Query.
 */
export function mergeHealthPositions(
  results: Array<HealthPosition | null | undefined>,
): HealthPosition[] {
  return results
    .filter((position): position is HealthPosition => position != null)
    .sort((a, b) => b.liquidationRisk - a.liquidationRisk);
}

/**
 * Pairs each adapter only with addresses on its own chain — Aave with EVM
 * accounts, Kamino with Solana accounts, Zest + Granite with Stacks accounts —
 * so an adapter never reads an address it can't serve, and a Stacks address
 * fans out to both Stacks protocols. Pure, so the fan-out is unit-testable
 * without React Query.
 */
export function healthQueryPairs(addressesByChain: HealthAddressesByChain): HealthQueryPair[] {
  return healthAdapters.flatMap(adapter =>
    (addressesByChain[adapter.chain] ?? []).map(address => ({ adapter, address })),
  );
}

/**
 * Fans the health adapters out across the given addresses (grouped by chain),
 * one query per adapter × matching address, and merges the results. Ships the
 * Aave v3 (EVM), Kamino (SOL), Zest (STX) and Granite (STX) adapters. Each pair
 * is its own query, so one adapter erroring leaves the others' results intact
 * (per-adapter isolation).
 */
export function useHealthPositions(
  addressesByChain: HealthAddressesByChain,
): UseHealthPositionsResult {
  const queryClient = useQueryClient();

  const pairs = healthQueryPairs(addressesByChain);

  const queries = useQueries({
    queries: pairs.map(({ adapter, address }) => ({
      queryKey: queryKeys.healthPosition(adapter.protocol, address),
      queryFn: () => adapter.fetchPosition(address),
      staleTime: HEALTH_STALE_TIME,
      refetchOnWindowFocus: true,
      // Deliberately no refetchInterval — health is never background-polled.
    })),
  });

  return {
    positions: mergeHealthPositions(queries.map(query => query.data)),
    isLoading: queries.some(query => query.isLoading),
    isFetching: queries.some(query => query.isFetching),
    isError: queries.some(query => query.isError),
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.health() });
    },
  };
}
