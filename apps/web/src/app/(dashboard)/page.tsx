'use client';

import Link from 'next/link';
import { Button, Card } from '@stackr/ui';
import { useWalletStore } from '@/lib/wallet-store';
import { useSettingsStore } from '@/lib/settings-store';
import { useHoldingsStore } from '@/lib/holdings-store';
import { useBalances, usePrices, usePriceHistory, useStockQuotes } from '@stackr/queries';
import { formatFiat } from '@stackr/services';
import { maskFiat } from '@/lib/mask-fiat';
import type { Chain, Wallet } from '@stackr/models';
import { Header } from '@/components/header';
import { aggregateCryptoPositions, type CryptoPosition } from '@/lib/portfolio-aggregation';
import { WalletCard } from '@/components/wallet-card';
import { PortfolioSummary } from '@/components/portfolio-summary';
import { PortfolioBreakdown } from '@/components/portfolio-breakdown';
import { RecentActivity } from '@/components/recent-activity';
import { LiquidationHealth } from '@/components/liquidation-health';
import { Collectibles } from '@/components/collectibles';
import { WidgetErrorBoundary } from '@/components/widget-error-boundary';

export default function DashboardPage() {
  const wallets = useWalletStore(s => s.wallets);
  const connectedAddresses = useWalletStore(s => s.connectedAddresses);
  const currency = useSettingsStore(s => s.currency);
  const hideBalance = useSettingsStore(s => s.hideBalance);
  const holdings = useHoldingsStore(s => s.holdings);

  // Build virtual wallet objects for connected ETH addresses not already watch-listed
  const watchedEthAddresses = new Set(
    wallets.filter(w => w.chain === 'eth').map(w => w.address.toLowerCase()),
  );
  const connectedWallets: Wallet[] = (connectedAddresses.eth ?? [])
    .filter(addr => !watchedEthAddresses.has(addr.toLowerCase()))
    .map(addr => ({
      id: `connected:${addr}`,
      label: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
      chain: 'eth' as Chain,
      address: addr,
      createdAt: new Date().toISOString(),
    }));

  const allWallets = [...wallets, ...connectedWallets];
  const connectedAddressSet = new Set((connectedAddresses.eth ?? []).map(a => a.toLowerCase()));

  // Addresses (watched + connected) feed the liquidation-health adapters,
  // grouped by chain: EVM → Aave, Solana → Kamino, Stacks → Zest + Granite.
  const evmAddresses = [...new Set(allWallets.filter(w => w.chain === 'eth').map(w => w.address))];
  const solAddresses = [...new Set(allWallets.filter(w => w.chain === 'sol').map(w => w.address))];

  // STX addresses feed the SIP-9 NFT adapter (Collectibles section). More
  // chains plug in here as their NFT adapters land (#93).
  const stxAddresses = [...new Set(allWallets.filter(w => w.chain === 'stx').map(w => w.address))];

  const balanceQueries = useBalances(allWallets);

  // Manual crypto positions are priced through the same feed as wallet balances,
  // so they need their chains in the price query too.
  const cryptoHoldings = holdings.filter(
    (h): h is Extract<typeof h, { type: 'crypto' }> => h.type === 'crypto',
  );

  const uniqueChains = [
    ...new Set([...allWallets.map(w => w.chain), ...cryptoHoldings.map(h => h.chain)]),
  ] as Chain[];
  const { data: prices } = usePrices(uniqueChains, currency);

  const primaryChain = uniqueChains[0];
  const { data: priceHistory } = usePriceHistory(primaryChain ?? 'btc', 7, currency);

  const priceMap = new Map(prices?.map(p => [p.chain, p]) ?? []);

  // Wallet balances and manual holdings collapse to the same priced shape, so
  // a manual position is indistinguishable from a watched balance downstream.
  const walletPositions = allWallets.flatMap<CryptoPosition>((wallet, i) => {
    const balance = balanceQueries[i]?.data;
    return balance ? [{ chain: wallet.chain, quantity: parseFloat(balance.balance) }] : [];
  });
  const manualPositions = cryptoHoldings.map<CryptoPosition>(h => ({
    chain: h.chain,
    quantity: h.quantity,
  }));

  const { cryptoTotal, perChain, weightedChange } = aggregateCryptoPositions(
    [...walletPositions, ...manualPositions],
    prices ?? [],
  );

  // Cash total
  const cashHoldings = holdings.filter(h => h.type === 'cash');
  const cashTotal = cashHoldings.reduce((sum, h) => (h.type === 'cash' ? sum + h.amount : sum), 0);

  // Stock total
  const stockHoldings = holdings.filter(
    (h): h is Extract<typeof h, { type: 'stock' }> => h.type === 'stock',
  );
  const stockSymbols = stockHoldings.map(h => h.symbol);
  const { data: stockQuotes } = useStockQuotes(stockSymbols);
  const quoteMap = new Map(stockQuotes?.map(q => [q.symbol, q]) ?? []);
  const stockTotal = stockHoldings.reduce((sum, h) => {
    const quote = quoteMap.get(h.symbol);
    return sum + (quote ? quote.price * h.shares : 0);
  }, 0);

  const totalFiat = cryptoTotal + cashTotal + stockTotal;

  const allLoaded = balanceQueries.every(q => !q.isLoading);

  const allocations = perChain.map(({ chain, fiatValue }) => ({
    chain,
    fiatValue,
    percentage: totalFiat > 0 ? (fiatValue / totalFiat) * 100 : 0,
  }));

  const sparklineValues = priceHistory?.map(p => p.price);
  const hasAnything = allWallets.length > 0 || holdings.length > 0;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-7">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/holdings/add">+ Holding</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/wallet/add">+ Wallet</Link>
            </Button>
          </div>
        </div>

        {!hasAnything ? (
          <div className="rounded-lg border border-dashed py-12 px-6 text-center text-muted-foreground">
            <p className="text-base mb-2">No assets yet</p>
            <p className="text-sm">
              Add wallets, cash savings, or stock positions to track your portfolio.
            </p>
          </div>
        ) : (
          <>
            <PortfolioSummary
              totalFiat={totalFiat}
              currency={currency}
              change24h={allLoaded ? weightedChange : undefined}
              sparklineData={sparklineValues}
              isLoading={!allLoaded}
              hideBalance={hideBalance}
            />

            {allLoaded && allocations.length > 0 && (
              <PortfolioBreakdown allocations={allocations} currency={currency} />
            )}

            {/* Holdings summary cards */}
            {(cashTotal > 0 || stockTotal > 0) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {cashTotal > 0 && (
                  <Link href="/holdings">
                    <Card className="p-3 hover:border-ring transition-colors">
                      <div className="text-xs text-muted-foreground">Cash</div>
                      <div className="font-mono font-medium text-sm mt-1">
                        {maskFiat(formatFiat(cashTotal, currency), hideBalance)}
                      </div>
                    </Card>
                  </Link>
                )}
                {stockTotal > 0 && (
                  <Link href="/holdings">
                    <Card className="p-3 hover:border-ring transition-colors">
                      <div className="text-xs text-muted-foreground">Stocks</div>
                      <div className="font-mono font-medium text-sm mt-1">
                        {maskFiat(formatFiat(stockTotal, currency), hideBalance)}
                      </div>
                    </Card>
                  </Link>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {allWallets.map((wallet, i) => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  balance={balanceQueries[i]?.data}
                  isLoading={balanceQueries[i]?.isLoading}
                  price={priceMap.get(wallet.chain)}
                  currency={currency}
                  connected={connectedAddressSet.has(wallet.address.toLowerCase())}
                  hideBalance={hideBalance}
                />
              ))}
            </div>

            {(evmAddresses.length > 0 || solAddresses.length > 0 || stxAddresses.length > 0) && (
              <WidgetErrorBoundary title="liquidation health">
                <LiquidationHealth
                  addressesByChain={{ eth: evmAddresses, sol: solAddresses, stx: stxAddresses }}
                  hideBalance={hideBalance}
                />
              </WidgetErrorBoundary>
            )}

            {stxAddresses.length > 0 && (
              <Collectibles addressesByChain={{ stx: stxAddresses }} hideBalance={hideBalance} />
            )}

            <WidgetErrorBoundary title="recent activity">
              <RecentActivity wallets={allWallets} />
            </WidgetErrorBoundary>
          </>
        )}
      </main>
    </>
  );
}
