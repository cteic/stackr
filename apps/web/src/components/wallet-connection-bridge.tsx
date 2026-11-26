'use client';

import { useEffect } from 'react';
import {
  Messenger,
  WalletConnectionController,
  selectAccountsByChain,
  type WalletConnectionControllerActions,
  type WalletConnectionControllerEvents,
  type WalletConnectionControllerMessenger,
  type WalletConnectionControllerState,
} from '@stackr/controllers';
import type { Chain } from '@stackr/models';
import { useSetAtom } from 'jotai';
import { clearConnectedAddressesAtom, setConnectedAddressesAtom } from '@/lib/wallet-store';
import { wagmiConfig } from '@/lib/wagmi-config';
import { getSolanaWallets } from '@/lib/solana-wallet-instance';
import { createEvmWalletAdapter } from '@/lib/wallet-adapters/evm-wallet-adapter';
import { createSolanaWalletAdapter } from '@/lib/wallet-adapters/solana-wallet-adapter';

/**
 * Collapses `connected-address-sync.tsx` + `connected-solana-address-sync.tsx`
 * into a single controller-backed bridge. A WalletConnectionController owns the
 * EVM and Solana connection state (the two chains those components mirrored),
 * and this bridge mirrors that state into `wallet-store.connectedAddresses` so
 * every existing consumer keeps working unchanged — purely additive.
 *
 * Stacks/Leather is intentionally NOT bridged here: it already has its own
 * session-restore-and-mirror path in `use-wallet-connections.ts`, and routing it
 * through the controller too would double-write its addresses. The Stacks
 * adapter still exists and is exercised in /labs; folding the Leather path into
 * the controller is left as follow-up (ADR 0015).
 *
 * The controller is built inside the effect (client-only), so wagmi's
 * `watchAccount` and the Solana adapter's listeners are never registered during
 * a server render, and both are torn down on unmount.
 */
const BRIDGED_CHAINS: Chain[] = ['eth', 'sol'];

export function WalletConnectionBridge() {
  const setConnectedAddresses = useSetAtom(setConnectedAddressesAtom);
  const clearConnectedAddresses = useSetAtom(clearConnectedAddressesAtom);

  useEffect(() => {
    const messenger = new Messenger<
      WalletConnectionControllerActions,
      WalletConnectionControllerEvents
    >();
    const controller = new WalletConnectionController({
      messenger: messenger.getRestricted<WalletConnectionControllerMessenger>(),
      adapters: [
        createEvmWalletAdapter(wagmiConfig),
        // One source per Solana wallet brand: the controller keys state by
        // source id, so Phantom and Solflare stay independently observable.
        ...getSolanaWallets().map(entry =>
          createSolanaWalletAdapter(entry.adapter, `solana:${entry.id}`),
        ),
      ],
    });

    function mirror(state: WalletConnectionControllerState) {
      for (const chain of BRIDGED_CHAINS) {
        const addresses = selectAccountsByChain(state, chain).map(account => account.address);
        if (addresses.length > 0) {
          setConnectedAddresses(chain, addresses);
        } else {
          clearConnectedAddresses(chain);
        }
      }
    }

    const unsubscribe = messenger.subscribe('WalletConnectionController:stateChange', mirror);
    // Capture connections that were already live before mount (wagmi reconnect,
    // Solana autoConnect) — the equivalent of the old sync components' effect.
    controller.syncFromAdapters();

    return () => {
      unsubscribe();
      controller.destroy();
    };
  }, [setConnectedAddresses, clearConnectedAddresses]);

  return null;
}
