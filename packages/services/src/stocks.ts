import { z } from 'zod';
import type { PriceHistoryPoint, StockQuote, StockSearchResult } from '@stackr/models';
import { StockQuoteSchema, StockSearchResultSchema } from '@stackr/models';
import type { StockAdapter } from './ports.js';
import { parseOrThrow } from './validate.js';
import { resolveStocksBase } from './stocks-config.js';

// Re-export the domain types from their canonical home (`@stackr/models`) so
// existing `import { StockQuote } from '@stackr/services'` call sites keep
// working unchanged.
export type { StockSearchResult, StockQuote } from '@stackr/models';

/**
 * Ingress schema for Alpha Vantage `SYMBOL_SEARCH`. The vendor returns numbered
 * string keys (`"1. symbol"`, `"2. name"`, …) which must not leak past this
 * adapter — normalization below maps them to the domain `StockSearchResult`.
 */
const AlphaVantageSearchSchema = z.object({
  bestMatches: z.array(z.record(z.string(), z.string())).optional(),
});

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  // Browser → same-origin proxy (appends the server-only key); else → public base.
  const url = `${resolveStocksBase()}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Alpha Vantage API error: ${res.status}`);
  }

  const data = parseOrThrow(AlphaVantageSearchSchema, await res.json(), 'stocks.search(ingress)');
  const matches = data.bestMatches ?? [];

  const normalized = matches.map(m => ({
    symbol: m['1. symbol'] ?? '',
    name: m['2. name'] ?? '',
    type: m['3. type'] ?? '',
    region: m['4. region'] ?? '',
    currency: m['8. currency'] ?? 'USD',
  }));

  return parseOrThrow(z.array(StockSearchResultSchema), normalized, 'stocks.search(egress)');
}

/** Ingress schema for Alpha Vantage `GLOBAL_QUOTE`. */
const AlphaVantageQuoteSchema = z.object({
  'Global Quote': z.record(z.string(), z.string()).optional(),
});

export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  const url = `${resolveStocksBase()}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Alpha Vantage API error: ${res.status}`);
  }

  const data = parseOrThrow(
    AlphaVantageQuoteSchema,
    await res.json(),
    'stocks.fetchQuote(ingress)',
  );
  const quote = data['Global Quote'] ?? {};

  const normalized = {
    symbol: quote['01. symbol'] ?? symbol,
    price: parseFloat(quote['05. price'] ?? '0'),
    change: parseFloat(quote['09. change'] ?? '0'),
    changePercent: parseFloat((quote['10. change percent'] ?? '0').replace('%', '')),
  };

  return parseOrThrow(StockQuoteSchema, normalized, 'stocks.fetchQuote(egress)');
}

export async function fetchStockQuotes(symbols: string[]): Promise<StockQuote[]> {
  const results = await Promise.allSettled(symbols.map(s => fetchStockQuote(s)));

  return results
    .filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === 'fulfilled')
    .map(r => r.value);
}

/** One day of the Alpha Vantage TIME_SERIES_DAILY payload: `{ "4. close": "1.23", ... }`. */
type AlphaVantageDailySeries = Record<string, Record<string, string>>;

/**
 * Turn an Alpha Vantage daily series into ascending close-price points, keeping
 * only the most recent `days`. Pure (no network) so it is unit-testable.
 */
export function parseDailyCloses(
  series: AlphaVantageDailySeries | undefined,
  days: number,
): PriceHistoryPoint[] {
  if (!series) return [];

  const points = Object.entries(series)
    .map(([date, ohlc]) => ({
      timestamp: new Date(date).getTime(),
      price: parseFloat(ohlc['4. close'] ?? '0'),
    }))
    .filter(point => Number.isFinite(point.timestamp) && point.price > 0)
    .sort((a, b) => a.timestamp - b.timestamp);

  return points.slice(Math.max(0, points.length - days));
}

/**
 * Daily close-price history for a stock symbol (Alpha Vantage free tier is
 * daily-only). `days` selects how many recent points to keep — `compact`
 * (~100 days) covers up to ~3 months, `full` is needed beyond that.
 */
export async function fetchStockPriceHistory(
  symbol: string,
  days: number,
): Promise<PriceHistoryPoint[]> {
  const outputsize = days > 100 ? 'full' : 'compact';
  const url = `${resolveStocksBase()}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=${outputsize}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Alpha Vantage API error: ${res.status}`);
  }

  const data = await res.json();
  const series = data['Time Series (Daily)'];

  if (!series) {
    // Rate-limit / error responses carry one of these instead of a series.
    const reason = data['Note'] ?? data['Information'] ?? data['Error Message'] ?? 'no daily data';
    throw new Error(`Alpha Vantage: ${reason}`);
  }

  return parseDailyCloses(series, days);
}

/** Alpha Vantage-backed implementation of the stock port. */
export const alphaVantageStockAdapter: StockAdapter = {
  search: searchStocks,
  fetchQuote: fetchStockQuote,
  fetchQuotes: fetchStockQuotes,
  fetchPriceHistory: fetchStockPriceHistory,
};
