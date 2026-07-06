import { z } from 'zod';
import type { Currency } from '@stackr/models';
import { parseOrThrow } from './validate.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

/**
 * CoinGecko id for PAX Gold. One PAXG token is one troy ounce of vaulted LBMA
 * gold, so its price doubles as a free, keyless spot-gold feed in any display
 * currency — no metals API key needed.
 */
const PAXG_ID = 'pax-gold';

/**
 * Ingress schema for CoinGecko `simple/price`: id → a bag of
 * `{ <currency>: number, <currency>_24h_change: number }` pairs, with dynamic
 * currency keys — same shape the crypto price adapter models.
 */
const PaxgSimplePriceSchema = z.record(z.string(), z.record(z.string(), z.number()));

type PaxgSimplePrice = z.infer<typeof PaxgSimplePriceSchema>;

export interface GoldPrice {
  /** Spot price of one troy ounce in the requested display currency. */
  fiatPerOunce: number;
  change24h: number;
  currency: Currency;
}

/**
 * Pure normalization from the CoinGecko map to the domain shape. Missing
 * entries degrade to zeros, mirroring the crypto price adapter, so a feed
 * hiccup never throws a holdings render.
 */
export function normalizeGoldPrice(data: PaxgSimplePrice, currency: Currency): GoldPrice {
  const entry = data[PAXG_ID];

  return {
    fiatPerOunce: entry?.[currency] ?? entry?.usd ?? 0,
    change24h: entry?.usd_24h_change ?? 0,
    currency,
  };
}

/** Spot gold (via PAXG) in the display currency, keyless from CoinGecko. */
export async function fetchGoldPrice(currency: Currency = 'usd'): Promise<GoldPrice> {
  const url = `${COINGECKO_BASE}/simple/price?ids=${PAXG_ID}&vs_currencies=${currency},usd&include_24hr_change=true`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }

  // Ingress boundary: validate the upstream map before reading any figure.
  const data = parseOrThrow(
    PaxgSimplePriceSchema,
    await res.json(),
    'gold.fetchGoldPrice(ingress)',
  );

  return normalizeGoldPrice(data, currency);
}
