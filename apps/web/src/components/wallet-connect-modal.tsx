'use client';

import { useState } from 'react';
import {
  Button,
  ChainAvatar,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@stackr/ui';
import { chainMeta, ChainSchema, type Chain } from '@stackr/models';
import { useWalletConnections, type WalletId } from '@/lib/use-wallet-connections';
import { useStackrLinkConnection } from '@/lib/stackr-link';
import { StackrLinkPane } from '@/components/stackr-link-pane';

// Overlapping icons beyond this crowd the row and push the wallet name onto
// a second line in the dialog's narrow width — most visibly for the Stackr
// Wallet entry, which lists every supported chain until it's paired.
const MAX_VISIBLE_CHAIN_ICONS = 2;

function ChainIconStack({ chains }: { chains: readonly Chain[] }) {
  const visible = chains.slice(0, MAX_VISIBLE_CHAIN_ICONS);
  const overflow = chains.length - visible.length;

  return (
    <div className="flex shrink-0 items-center -space-x-2">
      {visible.map(chain => (
        <ChainAvatar key={chain} chain={chain} size="sm" />
      ))}
      {overflow > 0 && (
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}

export function WalletConnectModal() {
  const wallets = useWalletConnections();
  const stackrLink = useStackrLinkConnection();
  const [view, setView] = useState<'list' | 'link'>('list');
  const [pending, setPending] = useState<WalletId | null>(null);
  const [error, setError] = useState<{ id: WalletId; message: string } | null>(null);
  const anyConnected = wallets.some(w => w.connected) || stackrLink.connected;

  async function run(id: WalletId, action: () => void | Promise<void>) {
    setPending(id);
    setError(null);
    try {
      await action();
    } catch {
      setError({ id, message: 'Connection failed or was rejected — try again.' });
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant={anyConnected ? 'outline' : 'primary'}>
          {anyConnected ? 'Wallets' : 'Connect'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogTitle>Connect a wallet</DialogTitle>
        <DialogDescription>
          Read-only. Stackr never asks to sign or move funds — wallets are used only to read your
          addresses.
        </DialogDescription>

        {view === 'link' ? (
          <StackrLinkPane
            onAddresses={stackrLink.applyAnnouncedAddresses}
            onBack={() => setView('list')}
          />
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            <li className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ChainIconStack
                    chains={stackrLink.connected ? stackrLink.chains : ChainSchema.options}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">Stackr Wallet</div>
                    <div className="text-xs text-muted-foreground">
                      {stackrLink.connected
                        ? stackrLink.chains.map(c => chainMeta[c].symbol).join(' · ')
                        : 'Pair the mobile signer by QR'}
                    </div>
                  </div>
                </div>

                {stackrLink.connected ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={stackrLink.disconnect}
                  >
                    Disconnect
                  </Button>
                ) : stackrLink.available ? (
                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={() => setView('link')}
                    disabled={pending !== null}
                  >
                    Pair
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="shrink-0" disabled>
                    Unavailable
                  </Button>
                )}
              </div>
              {!stackrLink.available && !stackrLink.connected && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Pairing needs the sync service configured for this deployment.
                </p>
              )}
            </li>
            {wallets.map(wallet => (
              <li key={wallet.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ChainIconStack chains={wallet.chains} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{wallet.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {wallet.chains.map(c => chainMeta[c].symbol).join(' · ')}
                      </div>
                    </div>
                  </div>

                  {wallet.connected ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => run(wallet.id, wallet.disconnect)}
                      disabled={pending === wallet.id}
                    >
                      Disconnect
                    </Button>
                  ) : wallet.installed ? (
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() => run(wallet.id, wallet.connect)}
                      disabled={pending !== null}
                    >
                      {pending === wallet.id ? 'Connecting…' : 'Connect'}
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <a href={wallet.installUrl} target="_blank" rel="noopener noreferrer">
                        Install
                      </a>
                    </Button>
                  )}
                </div>

                {error?.id === wallet.id ? (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    {error.message}
                  </p>
                ) : (
                  !wallet.installed &&
                  !wallet.connected && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Not detected in this browser.
                    </p>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
