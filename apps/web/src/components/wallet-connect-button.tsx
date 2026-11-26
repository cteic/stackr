'use client';

import { useAtomValue, useSetAtom } from 'jotai';
import { Button } from '@stackr/ui';
import { loadWalletLayer } from '@/components/wallet-layer-loader';
import { anyWalletConnectedAtom, walletModalOpenAtom } from '@/lib/wallet-modal-store';

/**
 * The header's Connect button. It carries no wallet library: it reads
 * connection state from Jotai and opens the dialog that the lazily loaded
 * wallet layer renders. Hover and focus start fetching that layer early, so
 * the dialog is usually ready by the time the click lands.
 */
export function WalletConnectButton() {
  const anyConnected = useAtomValue(anyWalletConnectedAtom);
  const setOpen = useSetAtom(walletModalOpenAtom);

  return (
    <Button
      size="sm"
      variant={anyConnected ? 'outline' : 'primary'}
      onPointerEnter={loadWalletLayer}
      onFocus={loadWalletLayer}
      onClick={() => setOpen(true)}
    >
      {anyConnected ? 'Wallets' : 'Connect'}
    </Button>
  );
}
