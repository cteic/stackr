import { afterEach, describe, it, expect, vi } from 'vitest';
import { fetchStockQuote, fetchStockQuotes, parseDailyCloses } from './stocks';

const SERIES = {
  '2026-05-21': {
    '1. open': '190.0',
    '2. high': '192.0',
    '3. low': '189.0',
    '4. close': '191.5',
    '5. volume': '100',
  },
  '2026-05-20': {
    '1. open': '188.0',
    '2. high': '189.5',
    '3. low': '187.0',
    '4. close': '189.0',
    '5. volume': '120',
  },
  '2026-05-19': {
    '1. open': '185.0',
    '2. high': '187.0',
    '3. low': '184.0',
    '4. close': '186.5',
    '5. volume': '90',
  },
};

describe('parseDailyCloses', () => {
  it('returns ascending close-price points', () => {
    expect(parseDailyCloses(SERIES, 30)).toEqual([
      { timestamp: new Date('2026-05-19').getTime(), price: 186.5 },
      { timestamp: new Date('2026-05-20').getTime(), price: 189.0 },
      { timestamp: new Date('2026-05-21').getTime(), price: 191.5 },
    ]);
  });

  it('keeps only the most recent `days` points', () => {
    expect(parseDailyCloses(SERIES, 2).map(point => point.price)).toEqual([189.0, 191.5]);
  });

  it('returns an empty array when the series is missing', () => {
    expect(parseDailyCloses(undefined, 30)).toEqual([]);
  });
});

describe('fetchStockQuote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubQuoteResponse(body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(body))),
    );
  }

  it('returns the quoted price', async () => {
    stubQuoteResponse({
      'Global Quote': {
        '01. symbol': 'AAPL',
        '05. price': '191.50',
        '09. change': '1.25',
        '10. change percent': '0.66%',
      },
    });

    await expect(fetchStockQuote('AAPL')).resolves.toEqual({
      symbol: 'AAPL',
      price: 191.5,
      change: 1.25,
      changePercent: 0.66,
    });
  });

  it('rejects a rate-limit reply instead of pricing the stock at 0', async () => {
    stubQuoteResponse({
      Information:
        'Thank you for using Alpha Vantage! Please consider spreading out your requests.',
    });

    await expect(fetchStockQuote('AAPL')).rejects.toThrow('no quote for AAPL');
  });

  it('rejects an empty quote for an unknown symbol', async () => {
    stubQuoteResponse({ 'Global Quote': {} });

    await expect(fetchStockQuote('NOPE')).rejects.toThrow('no quote for NOPE');
  });

  it('leaves a rate-limited symbol out of a batch', async () => {
    stubQuoteResponse({ Note: 'API rate limit reached.' });

    await expect(fetchStockQuotes(['AAPL', 'MSFT'])).resolves.toEqual([]);
  });
});
