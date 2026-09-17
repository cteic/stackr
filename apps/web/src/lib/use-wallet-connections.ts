'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnect, useDisconnect } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletName } from '@solana/wallet-adapter-base';
import type { Chain } from '@stackr/models';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  clearConnectedAddressesAtom,
  connectedAddressesAtom,
  setConnectedAddressesAtom,
} from '@/lib/wallet-store';
import {
  connectStacksWallet,
  disconnectStacksWallet,
  isStacksWalletConnected,
  readStacksAddresses,
} from '@/lib/stacks-connect';
import {
  connectSuiWallet,
  disconnectSuiWallet,
  isSuiWalletAvailable,
  isSuiWalletRemembered,
  restoreSuiWallet,
  subscribeSuiWalletAvailability,
} from '@/lib/sui-connect';

import { getSolanaWallets } from '@/lib/solana-wallet-instance';

import { detectInstalledWallets, INSTALL_URLS, type WalletId } from './wallet-detect';

export type { WalletId } from './wallet-detect';

export interface WalletConnection {
  id: WalletId;
  name: string;
  /** Chains this wallet contributes to the portfolio. */
  chains: Chain[];
  connected: boolean;
  /** Whether the wallet's browser extension has injected a provider. */
  installed: boolean;
  /** Where to install the extension when it is missing. */
  installUrl: string;
  connect: () => void | Promise<void>;
  disconnect: () => void | Promise<void>;
}

/**
 * Single source of truth for connecting/disconnecting every supported wallet
 * and reading its connected state. The unified connect modal and the header
 * status indicators both consume this — there is no per-wallet button.
 *
 * Connected state is read from `wallet-store.connectedAddresses`, which the
 * ETH/SOL sync components keep in step with wagmi and the Solana adapter.
 * Leather and Slush have no adapter-level provider, so this hook owns both
 * writing their addresses into the store and restoring them after a refresh.
 */
export function useWalletConnections(): WalletConnection[] {
  const { connectors, connectAsync } = useConnect();
  const { disconnect: disconnectEvm } = useDisconnect();
  const solana = useWallet();
  const setConnectedAddresses = useSetAtom(setConnectedAddressesAtom);
  const clearConnectedAddresses = useSetAtom(clearConnectedAddressesAtom);
  const connectedAddresses = useAtomValue(connectedAddressesAtom);

  // --- Detect installed extensions (client-only) ---
  const [installed, setInstalled] = useState<Record<WalletId, boolean>>({
    metamask: false,
    phantom: false,
    solflare: false,
    leather: false,
    slush: false,
  });
  useEffect(() => {
    // Slush isn't window-detectable: it announces itself through the Wallet
    // Standard registry, possibly after mount, so keep listening for it.
    setInstalled({ ...detectInstalledWallets(window), slush: isSuiWalletAvailable() });
    return subscribeSuiWalletAvailability(available =>
      setInstalled(prev => ({ ...prev, slush: available })),
    );
  }, []);

  // --- Leather: restore a persisted session on mount ---
  useEffect(() => {
    if (!isStacksWalletConnected()) return;
    const addrs = readStacksAddresses();
    if (!addrs) return;
    setConnectedAddresses('stx', [addrs.stx]);
    setConnectedAddresses('btc', [addrs.btc]);
  }, [setConnectedAddresses]);

  // --- Slush: restore a remembered session once the wallet has registered ---
  const slushInstalled = installed.slush;
  useEffect(() => {
    if (!slushInstalled || !isSuiWalletRemembered()) return;
    let cancelled = false;
    void restoreSuiWallet().then(addrs => {
      if (cancelled || !addrs) return;
      setConnectedAddresses('sui', addrs);
    });
    return () => {
      cancelled = true;
    };
  }, [slushInstalled, setConnectedAddresses]);

  // --- Solana: connect after the provider has selected the wallet ---
  // `select()` only swaps the active adapter; the connect has to wait for that
  // swap to land, so the intent is parked in a ref and acted on by the effect.
  const wantSolanaRef = useRef<WalletName | null>(null);
  const { select, connect: solConnect, wallet: solWallet, connected: solConnected } = solana;
  useEffect(() => {
    const wanted = wantSolanaRef.current;
    if (wanted !== null && solWallet?.adapter.name === wanted && !solConnected) {
      wantSolanaRef.current = null;
      void solConnect().catch(() => undefined);
    }
  }, [solWallet, solConnected, solConnect]);

  const connectMetaMask = useCallback(async () => {
    const connector = connectors.find(c => c.name === 'MetaMask') ?? connectors[0];
    if (!connector) return;
    await connectAsync({ connector });
  }, [connectors, connectAsync]);

  const connectSolana = useCallback(
    (name: WalletName) => {
      if (solWallet?.adapter.name === name) {
        void solConnect().catch(() => undefined);
      } else {
        wantSolanaRef.current = name;
        select(name);
      }
    },
    [solWallet, solConnect, select],
  );

  const connectLeather = useCallback(async () => {
    const addrs = await connectStacksWallet();
    if (!addrs) return;
    setConnectedAddresses('stx', [addrs.stx]);
    setConnectedAddresses('btc', [addrs.btc]);
  }, [setConnectedAddresses]);

  const disconnectLeather = useCallback(() => {
    disconnectStacksWallet();
    clearConnectedAddresses('stx');
    clearConnectedAddresses('btc');
  }, [clearConnectedAddresses]);

  const connectSlush = useCallback(async () => {
    const addrs = await connectSuiWallet();
    if (!addrs) return;
    setConnectedAddresses('sui', addrs);
  }, [setConnectedAddresses]);

  const disconnectSlush = useCallback(() => {
    disconnectSuiWallet();
    clearConnectedAddresses('sui');
  }, [clearConnectedAddresses]);

  const has = (chain: Chain) => (connectedAddresses[chain]?.length ?? 0) > 0;

  return [
    {
      id: 'metamask',
      name: 'MetaMask',
      chains: ['eth'],
      connected: has('eth'),
      installed: installed.metamask,
      installUrl: INSTALL_URLS.metamask,
      connect: connectMetaMask,
      disconnect: () => disconnectEvm(),
    },
    // One row per Solana wallet. `connected` is read from the active adapter
    // rather than from `has('sol')`, so only the wallet actually holding the
    // session offers Disconnect — two rows cannot both claim the connection.
    ...getSolanaWallets().map<WalletConnection>(entry => ({
      id: entry.id,
      name: entry.label,
      chains: ['sol'],
      connected: solConnected && solWallet?.adapter.name === entry.name && has('sol'),
      installed: installed[entry.id],
      installUrl: INSTALL_URLS[entry.id],
      connect: () => connectSolana(entry.name),
      disconnect: () => solana.disconnect(),
    })),
    {
      id: 'leather',
      name: 'Leather',
      chains: ['stx', 'btc'],
      connected: has('stx'),
      installed: installed.leather,
      installUrl: INSTALL_URLS.leather,
      connect: connectLeather,
      disconnect: disconnectLeather,
    },
    {
      id: 'slush',
      name: 'Slush',
      chains: ['sui'],
      connected: has('sui'),
      installed: installed.slush,
      installUrl: INSTALL_URLS.slush,
      connect: connectSlush,
      disconnect: disconnectSlush,
    },
  ];
}
