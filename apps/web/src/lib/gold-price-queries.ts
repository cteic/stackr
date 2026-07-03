import { useQuery } from '@tanstack/react-query';
import type { Currency } from '@stackr/models';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

/**
 * CoinGecko id for PAX Gold. One PAXG token is one troy ounce of vaulted LBMA
 * gold, so its price doubles as a free, keyless spot-gold feed in any display
 * currency — no metals API key needed. Candidate for a `@stackr/services`
 * price adapter once a second consumer appears.
 */
const PAXG_ID = 'pax-gold';

/** The dynamic-keys shape of CoinGecko `simple/price`: id → currency → number. */
type PaxgSimplePrice = Record<string, Record<string, number>>;

/**
 * Runtime guard for the CoinGecko map — the app layer keeps zod behind the
 * workspace packages, so the untrusted payload is checked by hand here.
 */
function isPaxgSimplePrice(data: unknown): data is PaxgSimplePrice {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  return Object.values(data).every(
    entry =>
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      Object.values(entry).every(value => typeof value === 'number'),
  );
}

export interface GoldPrice {
  /** Spot price of one troy ounce in the requested display currency. */
  fiatPerOunce: number;
  change24h: number;
  currency: Currency;
}

/**
 * Pure normalization from the CoinGecko map to the domain shape. Missing
 * entries degrade to zeros, mirroring the services price adapter, so a feed
 * hiccup never throws a holdings page render.
 */
export function normalizePaxgPrice(data: PaxgSimplePrice, currency: Currency): GoldPrice {
  const entry = data[PAXG_ID];

  return {
    fiatPerOunce: entry?.[currency] ?? entry?.usd ?? 0,
    change24h: entry?.usd_24h_change ?? 0,
    currency,
  };
}

async function fetchGoldPrice(currency: Currency): Promise<GoldPrice> {
  const url = `${COINGECKO_BASE}/simple/price?ids=${PAXG_ID}&vs_currencies=${currency},usd&include_24hr_change=true`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status}`);
  }

  const data: unknown = await res.json();

  if (!isPaxgSimplePrice(data)) {
    throw new Error('gold.fetchGoldPrice(ingress): unexpected CoinGecko payload');
  }

  return normalizePaxgPrice(data, currency);
}

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
