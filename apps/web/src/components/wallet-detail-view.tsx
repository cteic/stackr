'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChainSchema, chainMeta } from '@stackr/models';
import type { Chain } from '@stackr/models';
import { useBalance, usePrices } from '@stackr/queries';
import { selectActivityByWallet } from '@stackr/controllers';
import { track } from '@stackr/analytics';
import { formatFiat } from '@stackr/services';
import {
  Button,
  Input,
  Card,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  AddressDisplayer,
  CopyButton,
  Skeleton,
} from '@stackr/ui';
import { validateAddress } from '@stackr/models';
import { useWalletStore } from '@/lib/wallet-store';
import { useSettingsStore } from '@/lib/settings-store';
import { Header } from '@/components/header';
import { TransactionList } from '@/components/transaction-list';
import { useActivityState, useTrackWallet } from '@/lib/controllers/activity-controller-provider';

// Shared wallet-detail UI, rendered both by the server route
// `/wallet/[chain]/[address]` (web) and the static query-param route
// Chain/address arrive as plain strings from
// whichever resolution the active build target uses.
export function WalletDetailView({
  chain: chainParam,
  address,
}: {
  chain: string;
  address: string;
}) {
  const router = useRouter();
  const chainResult = ChainSchema.safeParse(chainParam);
  const chain: Chain = chainResult.success ? chainResult.data : 'btc';
  const addressResult = chainResult.success ? validateAddress(chain, address) : null;
  const meta = chainMeta[chain];

  // Coarse, PII-free event: only the chain slug is recorded, never the
  // address being viewed.
  useEffect(() => {
    if (chainResult.success) track('chain_viewed', { chain });
  }, [chainResult.success, chain]);

  const wallet = useWalletStore(s =>
    s.wallets.find(w => w.chain === chain && w.address === address),
  );
  const removeWallet = useWalletStore(s => s.removeWallet);
  const updateLabel = useWalletStore(s => s.updateLabel);
  const currency = useSettingsStore(s => s.currency);
  const { data: balance, isLoading, error } = useBalance(chain, address);
  const { data: prices } = usePrices([chain], currency);
  const price = prices?.[0];
  const fiatValue = balance && price ? parseFloat(balance.balance) * price.fiatPrice : undefined;

  // The transaction list is a thin mirror of the ActivityController's feed,
  // sliced to this wallet. Pin the address so the feed fetches it even when the
  // wallet was reached by direct URL and is not in the store.
  const trackWallet = useTrackWallet();
  useEffect(() => {
    trackWallet({ chain, address });
  }, [trackWallet, chain, address]);

  const activityState = useActivityState();
  const transactions = selectActivityByWallet(activityState, address).filter(
    activity => activity.source === chain,
  );
  const txLoading =
    (activityState.status === 'loading' || activityState.status === 'idle') &&
    transactions.length === 0;

  const [editLabel, setEditLabel] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!chainResult.success) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-6 text-center">
          <p className="text-destructive">Invalid chain: {chainParam}</p>
        </main>
      </>
    );
  }

  if (addressResult && !addressResult.valid) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-4 py-6 text-center">
          <p className="text-destructive">Invalid address: {addressResult.error}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/" className="text-sm font-semibold text-primary">
          &larr; Back to Portfolio
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">{wallet?.label ?? 'Wallet'}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{meta.name}</span>
              <AddressDisplayer address={address} className="text-xs text-muted-foreground" />
              <CopyButton text={address} />
            </div>
          </div>
          {wallet && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setEditLabel(wallet.label)}>
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Edit Wallet Label</DialogTitle>
                <DialogDescription className="mt-2">
                  Change the display name for this wallet.
                </DialogDescription>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    if (editLabel.trim()) {
                      updateLabel(wallet.id, editLabel.trim());
                      setDialogOpen(false);
                    }
                  }}
                  className="mt-4 flex flex-col gap-3"
                >
                  <Input
                    label="Label"
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    required
                  />
                  <div className="flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="ghost" type="button">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="submit">Save</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card className="mt-6 p-6">
          <div className="text-sm text-muted-foreground mb-2">Balance</div>
          {isLoading ? (
            <Skeleton width={160} height="2rem" />
          ) : error ? (
            <div className="text-base text-destructive">Failed to load balance</div>
          ) : balance ? (
            <>
              <div className="text-2xl font-mono font-bold">
                {balance.balance} {meta.symbol}
              </div>
              {fiatValue !== undefined && (
                <div className="text-sm text-muted-foreground mt-1">
                  {formatFiat(fiatValue, currency)}
                </div>
              )}
            </>
          ) : null}
        </Card>

        <Card className="mt-6 overflow-hidden">
          <div className="text-sm text-muted-foreground p-4 border-b">Recent Transactions</div>
          <div className="p-2">
            <TransactionList transactions={transactions} chain={chain} isLoading={txLoading} />
          </div>
        </Card>

        {wallet && (
          <Button
            variant="danger"
            onClick={() => {
              removeWallet(wallet.id);
              router.push('/');
            }}
            className="mt-8"
          >
            Remove Wallet
          </Button>
        )}
      </main>
    </>
  );
}
