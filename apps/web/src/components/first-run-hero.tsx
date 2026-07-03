'use client';

import Link from 'next/link';
import { Button, ChainAvatar } from '@stackr/ui';
import type { Chain, CreateWallet } from '@stackr/models';
import { useWalletStore } from '@/lib/wallet-store';

/**
 * Well-known public addresses that boot the dashboard in one click: enough to
 * light up balances, prices, and activity without asking a first-time visitor
 * to dig out an address of their own. Both are watch-only like every other
 * wallet, prefixed "Demo ·" so they read as samples, and removable from their
 * wallet cards like any other entry.
 */
export const DEMO_WALLETS: CreateWallet[] = [
  {
    label: 'Demo · vitalik.eth',
    chain: 'eth',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  },
  {
    label: 'Demo · Satoshi',
    chain: 'btc',
    address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  },
];

const CHAINS: { chain: Chain; name: string }[] = [
  { chain: 'btc', name: 'Bitcoin' },
  { chain: 'eth', name: 'Ethereum' },
  { chain: 'sol', name: 'Solana' },
  { chain: 'stx', name: 'Stacks' },
  { chain: 'sui', name: 'Sui' },
];

/**
 * First-run state for the dashboard: shown instead of the portfolio when the
 * user has no wallets and no holdings. Says what Stackr is, why it's
 * different, and offers three ways in — add a wallet, add a holding, or load
 * the demo portfolio.
 */
export function FirstRunHero() {
  const wallets = useWalletStore(s => s.wallets);
  const addWallet = useWalletStore(s => s.addWallet);

  function loadDemoPortfolio() {
    const existing = new Set(wallets.map(w => w.address.toLowerCase()));
    DEMO_WALLETS.filter(w => !existing.has(w.address.toLowerCase())).forEach(addWallet);
  }

  return (
    <section aria-label="Get started" className="flex flex-col gap-3">
      <div className="border bg-card rounded-lg px-6 py-10 md:px-10 md:py-12">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Watch-only · Self-custody
        </p>
        <h2 className="mt-4 max-w-2xl text-3xl md:text-4xl font-bold tracking-tight text-balance">
          Everything you stack, on one screen.
        </h2>
        <p className="mt-4 max-w-xl text-sm md:text-base text-muted-foreground leading-relaxed">
          Paste an address to watch it — balances, activity, and collectibles across five chains,
          next to your cash and stock positions. No account, no custody: your list lives in this
          browser and never leaves it.
        </p>

        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2" aria-label="Supported chains">
          {CHAINS.map(({ chain, name }) => (
            <li key={chain} className="flex items-center gap-2">
              <ChainAvatar chain={chain} size="sm" aria-hidden="true" />
              <span className="font-mono text-xs text-muted-foreground">{name}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/wallet/add">Add a wallet</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/holdings/add">Add a holding</Link>
          </Button>
          <Button variant="ghost" onClick={loadDemoPortfolio}>
            Load demo portfolio
          </Button>
        </div>
      </div>

      <div className="border bg-card rounded-lg px-6 py-5 md:px-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-warning">
          Liquidation health
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
          Borrowing on Aave, Kamino, Zest, or Granite? Stackr reads your positions on-chain and
          shows how close each one sits to liquidation — including on Stacks, which no other tracker
          covers.
        </p>
      </div>
    </section>
  );
}
