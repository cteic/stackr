import type { Chain, Currency, Protocol } from '@stackr/models';

/**
 * Every remote read's cache key, built here and nowhere else.
 *
 * The convention is documented in `docs/DATA-FETCHING.md`. In short: keys are
 * hierarchical and read left to right from broadest to narrowest, so a prefix
 * is always a valid invalidation target — `queryKeys.balances()` invalidates
 * every chain's balance, `queryKeys.balance('sol', addr)` invalidates one.
 */
export const queryKeys = {
  all: ['stackr'] as const,
  health: () => [...queryKeys.all, 'health'] as const,
  healthPosition: (protocol: Protocol, address: string) =>
    [...queryKeys.health(), protocol, address] as const,
  balances: () => [...queryKeys.all, 'balance'] as const,
  balance: (chain: Chain, address: string) => [...queryKeys.balances(), chain, address] as const,
  tokenPositionsAll: () => [...queryKeys.all, 'token-positions'] as const,
  tokenPositions: (chain: Chain, address: string) =>
    [...queryKeys.tokenPositionsAll(), chain, address] as const,
  transactionsAll: () => [...queryKeys.all, 'transactions'] as const,
  transactions: (chain: Chain, address: string) =>
    [...queryKeys.transactionsAll(), chain, address] as const,
  prices: () => [...queryKeys.all, 'prices'] as const,
  pricesByChains: (chains: Chain[], currency: Currency = 'usd') =>
    [...queryKeys.prices(), currency, ...chains] as const,
  priceHistory: (chain: Chain, days: number, currency: Currency = 'usd') =>
    [...queryKeys.all, 'price-history', chain, days, currency] as const,
  nfts: () => [...queryKeys.all, 'nfts'] as const,
  nftHoldings: (protocol: string, address: string) =>
    [...queryKeys.nfts(), protocol, address] as const,
  stockSearch: (query: string) => [...queryKeys.all, 'stock-search', query] as const,
  stockQuotes: (symbols: string[]) => [...queryKeys.all, 'stock-quotes', ...symbols] as const,
  stockPriceHistory: (symbol: string, days: number) =>
    [...queryKeys.all, 'stock-price-history', symbol, days] as const,
};
