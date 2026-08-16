'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Chain } from '@stackr/models';
import { currencyMeta, chainMeta, goldUnitMeta, assetCategoryMeta } from '@stackr/models';
import { formatFiat, formatChange, formatCrypto } from '@stackr/services';
import { maskFiat } from '@/lib/mask-fiat';
import { useStockQuotes, usePrices } from '@stackr/queries';
import { Button, Card, Badge, ChainAvatar, Input } from '@stackr/ui';
import { toTroyOunces } from '@/lib/gold';
import { useGoldPrice } from '@/lib/gold-price-queries';
import { useHoldingsStore } from '@/lib/holdings-store';
import { useSettingsStore } from '@/lib/settings-store';
import { Header } from '@/components/header';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm';
const REMOVE_BUTTON_CLASS = `text-xs text-muted-foreground hover:text-destructive transition-colors ${FOCUS_RING}`;
const LINK_BUTTON_CLASS = `text-xs text-muted-foreground hover:text-foreground transition-colors ${FOCUS_RING}`;

export default function HoldingsPage() {
  const holdings = useHoldingsStore(s => s.holdings);
  const removeHolding = useHoldingsStore(s => s.removeHolding);
  const updateHolding = useHoldingsStore(s => s.updateHolding);
  const currency = useSettingsStore(s => s.currency);
  const hideBalance = useSettingsStore(s => s.hideBalance);

  // Inline re-valuation of a self-valued asset (no price feed to do it for us).
  const [revaluingId, setRevaluingId] = useState<string | null>(null);
  const [revaluedInput, setRevaluedInput] = useState('');

  const stockSymbols = holdings
    .filter((h): h is Extract<typeof h, { type: 'stock' }> => h.type === 'stock')
    .map(h => h.symbol);

  const { data: stockQuotes } = useStockQuotes(stockSymbols);
  const quoteMap = new Map(stockQuotes?.map(q => [q.symbol, q]) ?? []);

  const cashHoldings = holdings.filter(
    (h): h is Extract<typeof h, { type: 'cash' }> => h.type === 'cash',
  );
  const stockHoldings = holdings.filter(
    (h): h is Extract<typeof h, { type: 'stock' }> => h.type === 'stock',
  );
  const cryptoHoldings = holdings.filter(
    (h): h is Extract<typeof h, { type: 'crypto' }> => h.type === 'crypto',
  );
  const goldHoldings = holdings.filter(
    (h): h is Extract<typeof h, { type: 'gold' }> => h.type === 'gold',
  );
  const assetHoldings = holdings.filter(
    (h): h is Extract<typeof h, { type: 'asset' }> => h.type === 'asset',
  );

  const { data: goldPrice } = useGoldPrice(currency, goldHoldings.length > 0);

  const cryptoChains = [...new Set(cryptoHoldings.map(h => h.chain))] as Chain[];
  const { data: prices } = usePrices(cryptoChains, currency);
  const priceMap = new Map(prices?.map(p => [p.chain, p]) ?? []);

  const totalCash = cashHoldings.reduce((sum, h) => sum + h.amount, 0);
  const totalStocks = stockHoldings.reduce((sum, h) => {
    const quote = quoteMap.get(h.symbol);
    return sum + (quote ? quote.price * h.shares : 0);
  }, 0);
  const totalCrypto = cryptoHoldings.reduce((sum, h) => {
    const price = priceMap.get(h.chain);
    return sum + (price ? price.fiatPrice * h.quantity : 0);
  }, 0);
  const totalGold = goldHoldings.reduce(
    (sum, h) => sum + (goldPrice ? toTroyOunces(h.quantity, h.unit) * goldPrice.fiatPerOunce : 0),
    0,
  );
  // Like cash, asset values are summed in their own currency (no FX feed yet).
  const totalAssets = assetHoldings.reduce((sum, h) => sum + h.value, 0);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Holdings</h1>
          <Button asChild>
            <Link href="/holdings/add">+ Add Holding</Link>
          </Button>
        </div>

        {holdings.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 px-6 text-center text-muted-foreground">
            <p className="text-base mb-2">No holdings yet</p>
            <p className="text-sm">
              Add cash savings, stock positions, manual crypto balances, gold, or other assets to
              track alongside your wallets.
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Cash</div>
                <div className="text-xl font-mono font-bold">
                  {maskFiat(formatFiat(totalCash, currency), hideBalance)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {cashHoldings.length} account{cashHoldings.length !== 1 ? 's' : ''}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Stocks</div>
                <div className="text-xl font-mono font-bold">
                  {maskFiat(formatFiat(totalStocks, currency), hideBalance)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stockHoldings.length} position{stockHoldings.length !== 1 ? 's' : ''}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground mb-1">Crypto</div>
                <div className="text-xl font-mono font-bold">
                  {maskFiat(formatFiat(totalCrypto, currency), hideBalance)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {cryptoHoldings.length} position{cryptoHoldings.length !== 1 ? 's' : ''}
                </div>
              </Card>
              {goldHoldings.length > 0 && (
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Gold</div>
                  <div className="text-xl font-mono font-bold">
                    {maskFiat(formatFiat(totalGold, currency), hideBalance)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {goldHoldings.length} position{goldHoldings.length !== 1 ? 's' : ''}
                  </div>
                </Card>
              )}
              {assetHoldings.length > 0 && (
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Assets</div>
                  <div className="text-xl font-mono font-bold">
                    {maskFiat(formatFiat(totalAssets, currency), hideBalance)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {assetHoldings.length} asset{assetHoldings.length !== 1 ? 's' : ''}
                  </div>
                </Card>
              )}
            </div>

            {/* Cash holdings */}
            {cashHoldings.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Cash & Savings</h2>
                <div className="flex flex-col gap-2">
                  {cashHoldings.map(h => (
                    <Card key={h.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{h.label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {currencyMeta[h.currency].symbol} {h.currency.toUpperCase()}
                            {h.interestRate > 0 && ` \u00B7 ${h.interestRate}% APY`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="font-mono font-medium">
                              {maskFiat(formatFiat(h.amount, h.currency), hideBalance)}
                            </div>
                          </div>
                          <button
                            onClick={() => removeHolding(h.id)}
                            className={REMOVE_BUTTON_CLASS}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Stock holdings */}
            {stockHoldings.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Stocks</h2>
                <div className="flex flex-col gap-2">
                  {stockHoldings.map(h => {
                    const quote = quoteMap.get(h.symbol);
                    const value = quote ? quote.price * h.shares : undefined;
                    return (
                      <Card key={h.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold">{h.symbol}</span>
                              <span className="text-sm text-muted-foreground">{h.name}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {h.shares} shares
                              {h.avgCostBasis !== undefined &&
                                ` \u00B7 Avg cost: ${maskFiat(formatFiat(h.avgCostBasis, currency), hideBalance)}`}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              {value !== undefined ? (
                                <>
                                  <div className="font-mono font-medium">
                                    {maskFiat(formatFiat(value, currency), hideBalance)}
                                  </div>
                                  {quote && (
                                    <Badge
                                      variant={quote.changePercent >= 0 ? 'success' : 'error'}
                                      className="mt-0.5"
                                    >
                                      {formatChange(quote.changePercent)}
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <span className="text-sm text-muted-foreground">&mdash;</span>
                              )}
                            </div>
                            <button
                              onClick={() => removeHolding(h.id)}
                              className={REMOVE_BUTTON_CLASS}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Crypto holdings */}
            {cryptoHoldings.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Crypto</h2>
                <div className="flex flex-col gap-2">
                  {cryptoHoldings.map(h => {
                    const meta = chainMeta[h.chain];
                    const price = priceMap.get(h.chain);
                    return (
                      <Card key={h.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <ChainAvatar chain={h.chain} />
                            <div>
                              <div className="font-medium">{h.label ?? meta.name}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {formatCrypto(h.quantity, meta.decimals)} {meta.symbol}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              {price ? (
                                <>
                                  <div className="font-mono font-medium">
                                    {maskFiat(
                                      formatFiat(price.fiatPrice * h.quantity, currency),
                                      hideBalance,
                                    )}
                                  </div>
                                  <Badge
                                    variant={price.change24h >= 0 ? 'success' : 'error'}
                                    className="mt-0.5"
                                  >
                                    {formatChange(price.change24h)}
                                  </Badge>
                                </>
                              ) : (
                                <span className="text-sm text-muted-foreground">&mdash;</span>
                              )}
                            </div>
                            <button
                              onClick={() => removeHolding(h.id)}
                              className={REMOVE_BUTTON_CLASS}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Gold holdings */}
            {goldHoldings.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Gold</h2>
                <div className="flex flex-col gap-2">
                  {goldHoldings.map(h => {
                    const value = goldPrice
                      ? toTroyOunces(h.quantity, h.unit) * goldPrice.fiatPerOunce
                      : undefined;
                    return (
                      <Card key={h.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{h.label ?? 'Gold'}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {h.quantity} {goldUnitMeta[h.unit].abbrev} · spot via PAXG
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              {value !== undefined ? (
                                <>
                                  <div className="font-mono font-medium">
                                    {maskFiat(formatFiat(value, currency), hideBalance)}
                                  </div>
                                  {goldPrice && (
                                    <Badge
                                      variant={goldPrice.change24h >= 0 ? 'success' : 'error'}
                                      className="mt-0.5"
                                    >
                                      {formatChange(goldPrice.change24h)}
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <span className="text-sm text-muted-foreground">&mdash;</span>
                              )}
                            </div>
                            <button
                              onClick={() => removeHolding(h.id)}
                              className={REMOVE_BUTTON_CLASS}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manual assets */}
            {assetHoldings.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Assets</h2>
                <div className="flex flex-col gap-2">
                  {assetHoldings.map(h => (
                    <Card key={h.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{h.name}</span>
                            <Badge variant="info">{assetCategoryMeta[h.category].name}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Self-valued
                            {h.notes && ` · ${h.notes}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {revaluingId === h.id ? (
                            <form
                              className="flex items-center gap-2"
                              onSubmit={e => {
                                e.preventDefault();
                                const value = parseFloat(revaluedInput);
                                if (value > 0) {
                                  updateHolding(h.id, { value });
                                  setRevaluingId(null);
                                }
                              }}
                            >
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={revaluedInput}
                                onChange={e => setRevaluedInput(e.target.value)}
                                className="w-32"
                                autoFocus
                              />
                              <Button type="submit" size="sm">
                                Save
                              </Button>
                              <button
                                type="button"
                                onClick={() => setRevaluingId(null)}
                                className={LINK_BUTTON_CLASS}
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <>
                              <div className="text-right">
                                <div className="font-mono font-medium">
                                  {maskFiat(formatFiat(h.value, h.currency), hideBalance)}
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setRevaluingId(h.id);
                                  setRevaluedInput(String(h.value));
                                }}
                                className={LINK_BUTTON_CLASS}
                              >
                                Update value
                              </button>
                              <button
                                onClick={() => removeHolding(h.id)}
                                className={REMOVE_BUTTON_CLASS}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
