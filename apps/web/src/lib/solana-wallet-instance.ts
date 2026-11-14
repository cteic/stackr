import type { Adapter, WalletName } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, PhantomWalletName } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter, SolflareWalletName } from '@solana/wallet-adapter-solflare';

/**
 * One adapter instance per supported Solana wallet, shared by the Solana
 * `WalletProvider` and by the Solana wallet source adapters. Both must wrap the
 * *same* instances so each adapter's `connect`/`disconnect` events — whoever
 * triggers them — reach the WalletConnectionController. Built lazily on first
 * use, which keeps the constructors off the module-evaluation path.
 *
 * Phantom re-emits `connect` with the new key when the user switches accounts
 * in the extension, and `disconnect` when the key goes away, so account changes
 * arrive through the same two events the source adapter already listens to.
 */

/** The Solana wallets the app offers. Adding one is a single entry here. */
export type SolanaWalletId = 'phantom' | 'solflare';

export interface SolanaWalletEntry {
  /** Stable app-side id — also the `WalletSourceAdapter` source id suffix. */
  readonly id: SolanaWalletId;
  /** The wallet-adapter's own name, used to `select()` it in the provider. */
  readonly name: WalletName;
  /** Display name for the connect modal row. */
  readonly label: string;
  /** The live adapter instance the provider and the controller both wrap. */
  readonly adapter: Adapter;
}

let entries: SolanaWalletEntry[] | null = null;

/**
 * The lazily-built Solana wallet registry. One instance per wallet, created on
 * first call and reused for the process lifetime, so the `WalletProvider` and
 * the WalletConnectionController's Solana sources observe the same objects.
 */
export function getSolanaWallets(): SolanaWalletEntry[] {
  entries ??= [
    {
      id: 'phantom',
      name: PhantomWalletName,
      label: 'Phantom',
      adapter: new PhantomWalletAdapter(),
    },
    {
      id: 'solflare',
      name: SolflareWalletName,
      label: 'Solflare',
      adapter: new SolflareWalletAdapter(),
    },
  ];
  return entries;
}

/** Just the adapter instances, in the order `WalletProvider` should list them. */
export function getSolanaWalletAdapters(): Adapter[] {
  return getSolanaWallets().map(entry => entry.adapter);
}
