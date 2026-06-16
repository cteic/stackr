import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchStocks, fetchStockQuote } from './stocks';

function mockFetchOnce(body: unknown, ok = true) {
  const fn = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchStocks', () => {
  it("maps Alpha Vantage's numbered keys onto the domain StockSearchResult", async () => {
    mockFetchOnce({
      bestMatches: [
        {
          '1. symbol': 'AAPL',
          '2. name': 'Apple Inc.',
          '3. type': 'Equity',
          '4. region': 'United States',
          '8. currency': 'USD',
        },
      ],
    });

    expect(await searchStocks('apple')).toEqual([
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'Equity',
        region: 'United States',
        currency: 'USD',
      },
    ]);
  });

  it('returns an empty list when bestMatches is absent', async () => {
    mockFetchOnce({});
    expect(await searchStocks('zzz')).toEqual([]);
  });
});

describe('fetchStockQuote', () => {
  it('parses numeric fields and strips the percent sign from changePercent', async () => {
    mockFetchOnce({
      'Global Quote': {
        '01. symbol': 'AAPL',
        '05. price': '191.50',
        '09. change': '1.25',
        '10. change percent': '0.66%',
      },
    });

    expect(await fetchStockQuote('AAPL')).toEqual({
      symbol: 'AAPL',
      price: 191.5,
      change: 1.25,
      changePercent: 0.66,
    });
  });
});
