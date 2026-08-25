import type {
  Balance,
  Chain,
  Currency,
  HealthPosition,
  NftAsset,
  NftProtocol,
  OrderBook,
  Price,
  PriceHistoryPoint,
  Protocol,
  StockQuote,
  StockSearchResult,
  Transaction,
} from '@stackr/models';

/**
 * Provider "ports" — the explicit contracts the app depends on.
 *
 * These interfaces are the inward-facing boundary of the anti-corruption
 * layer. The app (queries, pages) is written against THESE shapes, never
 * against a vendor's API. Each concrete adapter (btc.ts, eth.ts, prices.ts,
 * …) is the outward-facing half: it talks to one specific vendor, maps that
 * vendor's payload onto the domain types from `@stackr/models`, and validates
 * the result before returning. Swapping a vendor (Blockstream → mempool.space,
 * Etherscan → Alchemy) is then a change to a single adapter, with the port —
 * and therefore every call site — untouched.
 *
 * The interfaces deliberately speak only in `@stackr/models` domain types.
 * No vendor response interface appears here; that is the whole point.
 */

/** A single-chain balance source (one adapter per chain). */
export interface BalanceAdapter {
  /** The chain this adapter serves; used to build the dispatch registry. */
  readonly chain: Chain;
  fetchBalance(address: string): Promise<Balance>;
}

/** Spot prices and historical price series for the supported chains. */
export interface PriceAdapter {
  fetchPrices(chains: Chain[], currency?: Currency): Promise<Price[]>;
  fetchPriceHistory(chain: Chain, days?: number, currency?: Currency): Promise<PriceHistoryPoint[]>;
}

/** Recent on-chain transaction history for an address. */
export interface TransactionAdapter {
  fetchTransactions(chain: Chain, address: string): Promise<Transaction[]>;
}

/**
 * Equities data (symbol search, quotes, daily history). The Alpha Vantage key
 * is app-owned and applied server-side by the `/api/stocks` proxy, so the port
 * no longer threads a caller-supplied key.
 */
export interface StockAdapter {
  search(query: string): Promise<StockSearchResult[]>;
  fetchQuote(symbol: string): Promise<StockQuote>;
  fetchQuotes(symbols: string[]): Promise<StockQuote[]>;
  fetchPriceHistory(symbol: string, days: number): Promise<PriceHistoryPoint[]>;
}

/**
 * A single lending protocol's liquidation-health source (one adapter per
 * protocol). The adapter does one read-only call per account and maps the
 * protocol's native numbers onto the normalized `HealthPosition` shape,
 * validated on egress — the moat (the normalization) stays on data we read and
 * math we control, never an aggregator (see ADR 0016).
 *
 * `fetchPosition` resolves to `null` when the account has no position on this
 * protocol (no collateral and no debt), so the hook can fan out across every
 * watched address and simply drop the misses.
 */
export interface HealthAdapter {
  /** The protocol this adapter serves; used to build the dispatch registry. */
  readonly protocol: Protocol;
  /** The chain this protocol lives on. */
  readonly chain: Chain;
  fetchPosition(address: string): Promise<HealthPosition | null>;
}

/**
 * A single NFT source (one adapter per chain × protocol). The adapter reads an
 * address's holdings from its vendor (Hiro + Gamma for Stacks SIP-9, Alchemy
 * for EVM, …), maps each token onto the normalized `NftAsset` shape, resolves
 * its media to a gateway URL, and validates on egress — so a vendor payload
 * never leaks past the adapter (same anti-corruption rule as balances and
 * health; see #93 / ADR 0012).
 *
 * `fetchNfts` resolves to `[]` for an address that holds nothing on this
 * source, so the hook can fan out across every watched address and concat the
 * results. One source failing must never blank the others (the hook isolates
 * each adapter × address as its own query).
 */
export interface NftAdapter {
  /** The chain this adapter serves; used to build the dispatch registry. */
  readonly chain: Chain;
  /** The NFT standard this adapter reads. */
  readonly protocol: NftProtocol;
  fetchNfts(address: string): Promise<NftAsset[]>;
}

/**
 * Normalizes raw `[price, amount]` ladders (REST snapshot or live Kraken WS
 * frames) into a sorted, cumulative `OrderBook`. Pure transform — no network —
 * but it still sits behind a port so the validated `OrderBook` shape is the
 * only thing the charts layer ever sees.
 */
export interface OrderBookAdapter {
  serialize(
    rawBids: Array<[number, number]>,
    rawAsks: Array<[number, number]>,
    pair: string,
  ): OrderBook;
}
