'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnect, useDisconnect } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { PhantomWalletName } from '@solana/wallet-adapter-phantom';
import type { Chain } from '@stackr/models';
import { useWalletStore } from '@/lib/wallet-store';
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
 * Single source of truth for connecting/disconnecting the four supported
 * wallets and reading their connected state. The unified connect modal and the
 * header status indicators both consume this — there is no per-wallet button.
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
  const setConnectedAddresses = useWalletStore(s => s.setConnectedAddresses);
  const clearConnectedAddresses = useWalletStore(s => s.clearConnectedAddresses);
  const connectedAddresses = useWalletStore(s => s.connectedAddresses);

  // --- Detect installed extensions (client-only) ---
  const [installed, setInstalled] = useState<Record<WalletId, boolean>>({
    metamask: false,
    phantom: false,
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

  // --- Phantom: connect after the adapter has selected the wallet ---
  const wantPhantomRef = useRef(false);
  const { select, connect: solConnect, wallet: solWallet, connected: solConnected } = solana;
  useEffect(() => {
    if (wantPhantomRef.current && solWallet?.adapter.name === PhantomWalletName && !solConnected) {
      wantPhantomRef.current = false;
      void solConnect().catch(() => undefined);
    }
  }, [solWallet, solConnected, solConnect]);

  const connectMetaMask = useCallback(async () => {
    const connector = connectors.find(c => c.name === 'MetaMask') ?? connectors[0];
    if (!connector) return;
    await connectAsync({ connector });
  }, [connectors, connectAsync]);

  const connectPhantom = useCallback(() => {
    if (solWallet?.adapter.name === PhantomWalletName) {
      void solConnect().catch(() => undefined);
    } else {
      wantPhantomRef.current = true;
      select(PhantomWalletName);
    }
  }, [solWallet, solConnect, select]);

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
    {
      id: 'phantom',
      name: 'Phantom',
      chains: ['sol'],
      connected: has('sol'),
      installed: installed.phantom,
      installUrl: INSTALL_URLS.phantom,
      connect: connectPhantom,
      disconnect: () => solana.disconnect(),
    },
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
