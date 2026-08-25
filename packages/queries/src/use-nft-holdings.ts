import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { Chain, NftAsset } from '@stackr/models';
import { nftAdapters } from '@stackr/services';
import { queryKeys } from './keys.js';

/** Watched/connected addresses grouped by the chain they live on. */
export type NftAddressesByChain = Partial<Record<Chain, string[]>>;

/** One adapter paired with one address it should read. */
export interface NftQueryPair {
  adapter: (typeof nftAdapters)[number];
  address: string;
}

/**
 * NFT holdings are refreshed **on demand**, never background-polled: the per-
 * token Hiro + Gamma metadata fans are the expensive part, and collectible
 * media doesn't move on the cadence prices do. So: a generous stale time plus
 * an explicit refresh action, and no `refetchInterval`.
 */
const NFT_STALE_TIME = 10 * 60 * 1000;

export interface UseNftHoldingsResult {
  /** Every owned asset across every adapter × address. */
  assets: NftAsset[];
  /** True while any holding query is loading for the first time. */
  isLoading: boolean;
  /** True while any holding query is (re)fetching, e.g. after a manual refresh. */
  isFetching: boolean;
  /** True if any adapter read failed. */
  isError: boolean;
  /** Explicit on-demand refresh — invalidates every NFT query. */
  refresh: () => void;
}

/**
 * Pairs each adapter only with addresses on its own chain — Stacks SIP-9 with
 * STX accounts — so an adapter never reads an address it can't serve. Pure, so
 * the fan-out is unit-testable without React Query. The shape generalizes: when
 * the EVM / ordinals / Solana adapters register, their chains' addresses pair
 * up here with no change to the hook.
 */
export function nftQueryPairs(addressesByChain: NftAddressesByChain): NftQueryPair[] {
  return nftAdapters.flatMap(adapter =>
    (addressesByChain[adapter.chain] ?? []).map(address => ({ adapter, address })),
  );
}

/** Flatten the per-query asset lists into one, dropping the misses. */
export function mergeNftAssets(results: Array<NftAsset[] | undefined>): NftAsset[] {
  return results.flatMap(assets => assets ?? []);
}

/**
 * Fans the NFT adapters out across the given addresses (grouped by chain), one
 * query per adapter × matching address, and concatenates the results. Each pair
 * is its own query, so one adapter (or one chain) erroring leaves the others'
 * assets intact — per-adapter isolation. Ships the Stacks SIP-9 adapter; later
 * phases register EVM, Bitcoin ordinals/runes/stamps and Solana.
 */
export function useNftHoldings(addressesByChain: NftAddressesByChain): UseNftHoldingsResult {
  const queryClient = useQueryClient();

  const pairs = nftQueryPairs(addressesByChain);

  const queries = useQueries({
    queries: pairs.map(({ adapter, address }) => ({
      queryKey: queryKeys.nftHoldings(adapter.protocol, address),
      queryFn: () => adapter.fetchNfts(address),
      staleTime: NFT_STALE_TIME,
      refetchOnWindowFocus: false,
      // Deliberately no refetchInterval — NFTs are never background-polled.
    })),
  });

  return {
    assets: mergeNftAssets(queries.map(query => query.data)),
    isLoading: queries.some(query => query.isLoading),
    isFetching: queries.some(query => query.isFetching),
    isError: queries.some(query => query.isError),
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.nfts() });
    },
  };
}
