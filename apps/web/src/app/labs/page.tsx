'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Callout, Card } from '@stackr/ui';
import { chainMeta, currencyMeta, type Chain, type Currency } from '@stackr/models';
import { formatFiat, getExplorerUrl } from '@stackr/services';
import {
  selectWeightedChange24h,
  type ActivityStatus,
  type WalletRef,
  type PortfolioStatus,
  type WalletSourceStatus,
} from '@stackr/controllers';
import { Header } from '@/components/header';
import { useAtomValue } from 'jotai';
import { walletsAtom } from '@/lib/wallet-store';
import {
  ControllerProvider,
  useController,
  useControllers,
} from '@/lib/controllers/controller-provider';

const CURRENCIES = Object.keys(currencyMeta) as Currency[];
const CHAINS = Object.keys(chainMeta) as Chain[];

const STATUS_VARIANT: Record<
  PortfolioStatus | ActivityStatus,
  'default' | 'info' | 'success' | 'error'
> = {
  idle: 'default',
  loading: 'info',
  ready: 'success',
  error: 'error',
};

const SOURCE_STATUS_VARIANT: Record<WalletSourceStatus, 'default' | 'info' | 'success' | 'error'> =
  {
    disconnected: 'default',
    connecting: 'info',
    connected: 'success',
    error: 'error',
  };

const SOURCE_LABEL: Record<string, string> = {
  evm: 'EVM (wagmi)',
  solana: 'Solana (wallet-adapter)',
  stacks: 'Stacks (stacks-connect)',
};

function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/**
 * /labs — a labelled demonstration surface for the controller/messenger spike.
 * The controllers own the state; this page only mirrors it via `useController`
 * and drives it through the controllers' actions. It is deliberately NOT wired
 * into the rest of the app (which still uses Jotai + React Query).
 */
export default function LabsPage() {
  return (
    <ControllerProvider>
      <LabsContent />
    </ControllerProvider>
  );
}

function LabsContent() {
  const { preferences, portfolio, walletConnection, activity } = useControllers();
  const preferencesState = useController(preferences);
  const portfolioState = useController(portfolio);
  const walletConnectionState = useController(walletConnection);
  const activityState = useController(activity);

  // Additive read of the existing wallet store — the controllers never mutate it.
  const wallets = useAtomValue(walletsAtom);
  const walletRefs: WalletRef[] = wallets.map(w => ({ chain: w.chain, address: w.address }));

  // Feed the watch-only wallet list into the activity controller. Connected
  // accounts already flow in through the WalletConnectionController:stateChange
  // subscription; this is the other trigger — the watch-only bridge. `walletRefs`
  // is derived from `wallets`, so keying the effect on `wallets` is sufficient.
  useEffect(() => {
    activity.setWatchedWallets(wallets.map(w => ({ chain: w.chain, address: w.address })));
  }, [activity, wallets]);

  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const weightedChange = selectWeightedChange24h(portfolioState);

  async function handleSourceAction(sourceId: string, action: 'connect' | 'disconnect') {
    setSourceError(null);
    try {
      await walletConnection[action](sourceId);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : `Could not ${action} ${sourceId}`);
    }
  }

  async function handleRefresh() {
    setRefreshError(null);
    try {
      await portfolio.refresh(walletRefs);
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Refresh failed');
    }
  }

  async function handleActivityRefresh() {
    setActivityError(null);
    try {
      await activity.refresh();
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'Activity refresh failed');
    }
  }

  function toggleChain(chain: Chain) {
    const next = preferencesState.includedChains.includes(chain)
      ? preferencesState.includedChains.filter(c => c !== chain)
      : [...preferencesState.includedChains, chain];
    preferences.setIncludedChains(next);
  }

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-7">
        <div>
          <h1 className="text-2xl font-bold">Controller pattern — Labs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A faithful-minimal mirror of MetaMask&apos;s controller/messenger pattern. Change a
            preference and watch the portfolio re-derive through the messenger.
          </p>
        </div>

        <Callout variant="warning">
          Experimental sandbox. These controllers are self-contained and not connected to the rest
          of Stackr — the dashboard still runs on Jotai + React Query. See ADR 0013.
        </Callout>

        {/* PreferencesController — the source of truth for display preferences */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">PreferencesController</h2>
            <Badge variant="info">PreferencesController:stateChange</Badge>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Display currency
            </div>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map(currency => (
                <Button
                  key={currency}
                  size="sm"
                  variant={preferencesState.displayCurrency === currency ? 'primary' : 'outline'}
                  onClick={() => preferences.setDisplayCurrency(currency)}
                >
                  {currencyMeta[currency].symbol} {currency.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Included chains
            </div>
            <div className="flex flex-wrap gap-2">
              {CHAINS.map(chain => (
                <Button
                  key={chain}
                  size="sm"
                  variant={preferencesState.includedChains.includes(chain) ? 'primary' : 'outline'}
                  onClick={() => toggleChain(chain)}
                >
                  {chainMeta[chain].symbol}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* WalletConnectionController — one interface over the three wallet sources */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">WalletConnectionController</h2>
            <Badge variant="info">WalletConnectionController:stateChange</Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            One {`{ status, accounts, chains }`} entry per source. Connecting a wallet flows in
            through the adapter and re-aggregates the portfolio below — through the messenger, with
            no reference between the two controllers.
          </p>

          {sourceError && <Callout variant="error">{sourceError}</Callout>}

          <div className="flex flex-col gap-2">
            {Object.entries(walletConnectionState.sources).map(([sourceId, source]) => (
              <div key={sourceId} className="flex flex-col gap-2 rounded-md border px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{SOURCE_LABEL[sourceId] ?? sourceId}</span>
                    <Badge variant={SOURCE_STATUS_VARIANT[source.status]}>{source.status}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant={source.status === 'connected' ? 'outline' : 'primary'}
                    onClick={() =>
                      handleSourceAction(
                        sourceId,
                        source.status === 'connected' ? 'disconnect' : 'connect',
                      )
                    }
                  >
                    {source.status === 'connected' ? 'Disconnect' : 'Connect'}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  chains: {source.chains.join(', ')}
                </div>
                {source.accounts.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {source.accounts.map(account => (
                      <div
                        key={`${account.chain}:${account.address}`}
                        className="flex items-center justify-between font-mono text-xs"
                      >
                        <span>{chainMeta[account.chain].symbol}</span>
                        <span>{truncateAddress(account.address)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* PortfolioController — re-derives off the PreferencesController above */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">PortfolioController</h2>
            <Badge variant={STATUS_VARIANT[portfolioState.status]}>{portfolioState.status}</Badge>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Total value
              </div>
              <div className="mt-1 font-mono text-3xl font-bold">
                {formatFiat(portfolioState.totalValue, portfolioState.displayCurrency)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {weightedChange >= 0 ? '+' : ''}
                {weightedChange.toFixed(2)}% weighted 24h
              </div>
            </div>
            <Button onClick={handleRefresh} disabled={portfolioState.status === 'loading'}>
              {portfolioState.status === 'loading' ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          {walletRefs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No watched wallets yet — add some on the dashboard, then refresh here to aggregate
              them.
            </p>
          )}

          {refreshError && <Callout variant="error">{refreshError}</Callout>}

          {portfolioState.holdings.length > 0 && (
            <div className="flex flex-col gap-2">
              {portfolioState.holdings.map(holding => {
                const included = portfolioState.includedChains.includes(holding.chain);
                return (
                  <div
                    key={holding.chain}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    style={{ opacity: included ? 1 : 0.4 }}
                  >
                    <span className="font-medium">{chainMeta[holding.chain].name}</span>
                    <span className="font-mono">
                      {holding.amount} {chainMeta[holding.chain].symbol} ·{' '}
                      {formatFiat(
                        holding.amount * holding.unitPrice,
                        portfolioState.displayCurrency,
                      )}
                      {!included && ' · excluded'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Last updated:{' '}
            {portfolioState.lastUpdated
              ? new Date(portfolioState.lastUpdated).toLocaleTimeString()
              : 'never'}
          </div>
        </Card>

        {/* ActivityController — one merged feed over the per-chain normalizers */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">ActivityController</h2>
            <Badge variant={STATUS_VARIANT[activityState.status]}>{activityState.status}</Badge>
          </div>

          <div className="flex items-end justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              One feed fanned out across every watched/connected wallet, deduped on (chain, hash)
              and merge-sorted by time. Connecting a source above re-runs it through the messenger;
              watch-only wallets are bridged in from the store.
            </p>
            <Button onClick={handleActivityRefresh} disabled={activityState.status === 'loading'}>
              {activityState.status === 'loading' ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          {activityError && <Callout variant="error">{activityError}</Callout>}

          {walletRefs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No watched wallets yet — add some on the dashboard, or connect a source above.
            </p>
          )}

          {activityState.items.length > 0 && (
            <ul className="flex flex-col gap-1">
              {activityState.items.slice(0, 12).map(item => (
                <li key={`${item.source}:${item.hash}`}>
                  <a
                    href={getExplorerUrl(item.source, 'tx', item.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant="default">{chainMeta[item.source].symbol}</Badge>
                      <span
                        className={
                          item.direction === 'incoming' ? 'text-success' : 'text-destructive'
                        }
                      >
                        {item.direction === 'incoming' ? '↓ in' : '↑ out'}
                      </span>
                      {item.category === 'unknown' && (
                        <span className="text-xs text-muted-foreground">(unclassified)</span>
                      )}
                    </span>
                    <span className="flex items-center gap-3 font-mono text-xs">
                      <span>
                        {item.amount} {chainMeta[item.source].symbol}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </>
  );
}
