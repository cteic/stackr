'use client';

import Link from 'next/link';
import type { Chain } from '@stackr/models';
import type { NftAddressesByChain } from '@stackr/queries';
import { Header } from '@/components/header';
import { Collectibles } from '@/components/collectibles';
import { useWalletStore } from '@/lib/wallet-store';
import { useSettingsStore } from '@/lib/settings-store';

// Chains with a registered NFT adapter today. STX ships the SIP-9 adapter; EVM,
// Bitcoin ordinals/runes/stamps and Solana plug in here as their adapters land
// (#93). Kept narrow so the page only reads addresses an adapter can serve.
const NFT_CHAINS: Chain[] = ['stx'];

export default function CollectiblesPage() {
  const wallets = useWalletStore(s => s.wallets);
  const connectedAddresses = useWalletStore(s => s.connectedAddresses);
  const hideBalance = useSettingsStore(s => s.hideBalance);

  // Group every watched + connected address under its chain, deduped, for the
  // chains we have an adapter for. Mirrors the dashboard's assembly so the page
  // and the dashboard section read the same holdings.
  const addressesByChain: NftAddressesByChain = {};
  for (const chain of NFT_CHAINS) {
    const watched = wallets.filter(w => w.chain === chain).map(w => w.address);
    const connected = connectedAddresses[chain] ?? [];
    const unique = [...new Set([...watched, ...connected])];
    if (unique.length > 0) {
      addressesByChain[chain] = unique;
    }
  }

  const hasAddresses = Object.keys(addressesByChain).length > 0;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Collectibles</h1>
        </div>

        {hasAddresses ? (
          <Collectibles addressesByChain={addressesByChain} hideBalance={hideBalance} />
        ) : (
          <div className="rounded-lg border border-dashed px-6 py-12 text-center text-muted-foreground">
            <p className="mb-2 text-base">No collectibles to show</p>
            <p className="text-sm">
              Add or connect a Stacks wallet to see its collectibles here.{' '}
              <Link
                href="/wallet/add"
                className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Add a wallet
              </Link>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
