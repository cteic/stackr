import { describe, expect, it } from 'vitest';
import { normalizePaxgPrice } from './gold-price-queries';

describe('normalizePaxgPrice', () => {
  it('reads the display-currency price and the usd 24h change', () => {
    const price = normalizePaxgPrice(
      { 'pax-gold': { eur: 3100.5, usd: 3350.25, usd_24h_change: 0.42 } },
      'eur',
    );

    expect(price).toEqual({ fiatPerOunce: 3100.5, change24h: 0.42, currency: 'eur' });
  });

  it('falls back to the usd price when the display currency is missing', () => {
    const price = normalizePaxgPrice({ 'pax-gold': { usd: 3350.25 } }, 'jpy');

    expect(price.fiatPerOunce).toBe(3350.25);
    expect(price.change24h).toBe(0);
  });

  it('degrades to zeros when CoinGecko omits the id entirely', () => {
    expect(normalizePaxgPrice({}, 'usd')).toEqual({
      fiatPerOunce: 0,
      change24h: 0,
      currency: 'usd',
    });
  });

  it('never exposes a negative-zero or NaN through the fallback chain', () => {
    const price = normalizePaxgPrice({ 'pax-gold': {} }, 'eur');
    expect(price.fiatPerOunce).toBe(0);
    expect(Number.isNaN(price.change24h)).toBe(false);
  });
});
