'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DepthChart, PriceChart } from '@stackr/charts/react';
import type { DataPoint } from '@stackr/charts';
import { useLiveTicks, useOrderbook, usePriceHistory, useStockPriceHistory } from '@stackr/queries';
import { formatChange, formatFiat } from '@stackr/services';
import type { Chain, Currency } from '@stackr/models';
import { Card, Skeleton } from '@stackr/ui';
import { Header } from '@/components/header';
import { Orderbook } from '@/components/orderbook';
import { useWalletStore } from '@/lib/wallet-store';
import { useHoldingsStore } from '@/lib/holdings-store';
import { useSettingsStore } from '@/lib/settings-store';
import { useLiveOrderbookFallback } from '@/lib/use-live-orderbook-fallback';
import {
  CHART_RANGES,
  appendLiveTicks,
  assetId,
  buildAssetOptions,
  cryptoPair,
  findAsset,
  formatAxisTime,
  isRangeAllowed,
  toDataPoints,
} from '@/lib/chart-assets';

interface ChartBodyProps {
  isLoading: boolean;
  points: DataPoint[];
  currency: Currency;
  rangeDays: number;
}

function ChartBody({ isLoading, points, currency, rangeDays }: ChartBodyProps) {
  if (isLoading) {
    return <Skeleton width="100%" height={360} />;
  }
  if (points.length < 2) {
    return (
      <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
        No price data available.
      </div>
    );
  }
  return (
    <div data-testid="price-chart">
      <PriceChart
        data={points}
        height={360}
        formatValue={value => formatFiat(value, currency)}
        formatTime={ms => formatAxisTime(ms, rangeDays)}
      />
    </div>
  );
}

export default function MarketsPage() {
  const wallets = useWalletStore(s => s.wallets);
  const connectedAddresses = useWalletStore(s => s.connectedAddresses);
  const holdings = useHoldingsStore(s => s.holdings);
  const currency = useSettingsStore(s => s.currency);

  const options = useMemo(() => {
    const walletChains = wallets.map(w => w.chain);
    const connectedChains = Object.keys(connectedAddresses) as Chain[];
    const stockSymbols = holdings
      .filter((h): h is Extract<typeof h, { type: 'stock' }> => h.type === 'stock')
      .map(h => h.symbol);
    return buildAssetOptions({ walletChains, connectedChains, stockSymbols });
  }, [wallets, connectedAddresses, holdings]);

  const [selectedId, setSelectedId] = useState('');
  const [rangeDays, setRangeDays] = useState(7);
  const [mode, setMode] = useState<'mock' | 'live'>('live');

  const selected = findAsset(options, selectedId) ?? options[0];
  const range = CHART_RANGES.find(r => r.days === rangeDays) ?? CHART_RANGES[1];

  // Stocks are daily-only — fall back off 24H whenever a stock becomes active.
  useEffect(() => {
    if (selected && !isRangeAllowed(selected, range)) {
      setRangeDays(7);
    }
  }, [selected, range]);

  const cryptoChain = selected?.kind === 'crypto' ? selected.chain : undefined;
  const stockSymbol = selected?.kind === 'stock' ? selected.symbol : undefined;
  const isStock = stockSymbol !== undefined;
  const isCrypto = cryptoChain !== undefined;

  // Kraken only quotes the crypto pairs; stocks keep the chart but get no book
  // and no live tail. The book pair falls back to BTC for stocks so the hooks
  // stay unconditional, but it is forced to mock and never rendered for them.
  const { pair, midPrice } = cryptoPair(cryptoChain ?? 'btc');
  const bookMode = isCrypto ? mode : 'mock';
  const liveEnabled = isCrypto && mode === 'live';

  const { orderbook } = useOrderbook({ pair, mode: bookMode, midPrice });
  const ticks = useLiveTicks(pair, liveEnabled);

  // Live by default, but never a dead screen: an empty live book past the
  // fallback delay drops the page to mock (the toggle stays for retrying).
  const fallBackToMock = useCallback(() => setMode('mock'), []);
  useLiveOrderbookFallback(liveEnabled, orderbook !== null, fallBackToMock);

  const cryptoQuery = usePriceHistory(cryptoChain ?? 'btc', rangeDays, currency, {
    enabled: isCrypto,
  });
  const stockQuery = useStockPriceHistory(stockSymbol ?? '', rangeDays);

  const activeQuery = isStock ? stockQuery : cryptoQuery;
  const polledPoints = useMemo(
    () => (activeQuery.data ? toDataPoints(activeQuery.data) : []),
    [activeQuery.data],
  );
  // CoinGecko owns the history; Kraken supplies the live tail appended here.
  const points = useMemo(() => appendLiveTicks(polledPoints, ticks), [polledPoints, ticks]);

  const last = points[points.length - 1]?.y;
  const first = points[0]?.y;
  const changePct = first && last ? ((last - first) / first) * 100 : undefined;

  const cryptoOptions = options.filter(option => option.kind === 'crypto');
  const stockOptions = options.filter(option => option.kind === 'stock');

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Markets</h1>
          <div className="flex items-center gap-2">
            <select
              value={selected ? assetId(selected) : ''}
              onChange={e => setSelectedId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
            >
              <optgroup label="Crypto">
                {cryptoOptions.map(option => (
                  <option key={assetId(option)} value={assetId(option)}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
              {stockOptions.length > 0 && (
                <optgroup label="Stocks">
                  {stockOptions.map(option => (
                    <option key={assetId(option)} value={assetId(option)}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {isCrypto && (
              <button
                onClick={() => setMode(m => (m === 'mock' ? 'live' : 'mock'))}
                className={`cursor-pointer rounded-md border px-3 py-2 text-xs transition-colors ${
                  mode === 'live'
                    ? 'border-success/30 bg-success/15 text-success'
                    : 'border-input bg-secondary text-muted-foreground'
                }`}
              >
                {mode === 'live' ? 'Live' : 'Mock'}
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          {CHART_RANGES.map(r => {
            const allowed = selected ? isRangeAllowed(selected, r) : true;
            const active = r.days === rangeDays;
            return (
              <button
                key={r.label}
                onClick={() => setRangeDays(r.days)}
                disabled={!allowed}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? 'border-primary/30 bg-primary/15 text-primary'
                    : 'border-input bg-secondary text-muted-foreground hover:text-foreground'
                } ${allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className={`p-4 ${isCrypto ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-sm font-semibold">{selected?.label ?? '—'}</div>
              {last !== undefined && (
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-lg font-semibold">
                    {formatFiat(last, currency)}
                  </span>
                  {changePct !== undefined && (
                    <span
                      className={`font-mono text-xs ${changePct >= 0 ? 'text-success' : 'text-destructive'}`}
                    >
                      {formatChange(changePct)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <ChartBody
              isLoading={activeQuery.isLoading}
              points={points}
              currency={currency}
              rangeDays={rangeDays}
            />
          </Card>

          {isCrypto && (
            <div className="flex flex-col gap-4">
              {orderbook ? (
                <Orderbook orderbook={orderbook} />
              ) : (
                <Card className="p-4">
                  <div className="mb-3 text-sm font-semibold">Order Book — {pair}</div>
                  <Skeleton width="100%" height={340} />
                </Card>
              )}
              <Card className="p-4">
                <div className="mb-3 text-sm font-semibold">Depth Chart — {selected?.label}</div>
                {orderbook ? (
                  <DepthChart
                    bids={orderbook.bids}
                    asks={orderbook.asks}
                    dimensions={{ height: 300 }}
                  />
                ) : (
                  <Skeleton width="100%" height={300} />
                )}
              </Card>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
