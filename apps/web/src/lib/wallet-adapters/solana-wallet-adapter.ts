import type { WalletAccount, WalletSourceAdapter } from '@stackr/controllers';

/**
 * The minimal slice of `@solana/wallet-adapter-base`'s `Adapter` this module
 * needs. Depending on the capability rather than the sprawling vendor union is
 * the ACL boundary in its tightest form (ADR 0012): the real Phantom adapter
 * satisfies it structurally, and a test can satisfy it with a plain object.
 *
 * The listeners are typed zero-arg on purpose — we re-read `publicKey` rather
 * than trust an event payload — which keeps this assignable from the vendor's
 * generic `on`/`off` (whose `connect` listener carries a `PublicKey`).
 */
export interface SolanaWalletSource {
  readonly publicKey: { toBase58(): string } | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  on(event: 'connect' | 'disconnect', listener: () => void): unknown;
  off(event: 'connect' | 'disconnect', listener: () => void): unknown;
}

/**
 * Solana wallet source — wraps a single wallet-adapter instance (the Phantom
 * adapter the app already constructs and hands to `WalletProvider`). The adapter
 * is an `EventEmitter`, so `connect`/`disconnect` events fire whoever triggered
 * them — the app's connect button, autoConnect, or our `connect()` here — which
 * is exactly the behaviour `connected-solana-address-sync.tsx` got from
 * `useWallet()`. Vendor types stay behind {@link SolanaWalletSource} (ADR 0012).
 *
 * `id` distinguishes one wallet brand's source from another's: the app offers
 * Phantom and Solflare as separate sources over separate adapter instances, and
 * the controller keys its state by source id.
 */
export function createSolanaWalletAdapter(
  adapter: SolanaWalletSource,
  id = 'solana',
): WalletSourceAdapter {
  function read(): WalletAccount[] {
    const key = adapter.publicKey;
    return key ? [{ chain: 'sol', address: key.toBase58() }] : [];
  }

  return {
    id,
    chains: ['sol'],
    async connect() {
      await adapter.connect();
    },
    async disconnect() {
      await adapter.disconnect();
    },
    getAccounts: read,
    onAccountsChanged(callback) {
      if (typeof window === 'undefined') {
        return () => {};
      }
      const onConnect = () => callback(read());
      const onDisconnect = () => callback([]);
      adapter.on('connect', onConnect);
      adapter.on('disconnect', onDisconnect);
      return () => {
        adapter.off('connect', onConnect);
        adapter.off('disconnect', onDisconnect);
      };
    },
  };
}
