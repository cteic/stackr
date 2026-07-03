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
import { chainMeta, ChainSchema } from '@stackr/models';
import { useWalletConnections, type WalletId } from '@/lib/use-wallet-connections';
import { useStackrLinkConnection } from '@/lib/stackr-link';
import { StackrLinkPane } from '@/components/stackr-link-pane';

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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {(stackrLink.connected ? stackrLink.chains : ChainSchema.options).map(chain => (
                      <ChainAvatar key={chain} chain={chain} size="sm" />
                    ))}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Stackr Wallet</div>
                    <div className="text-xs text-muted-foreground">
                      {stackrLink.connected
                        ? stackrLink.chains.map(c => chainMeta[c].symbol).join(' · ')
                        : 'Pair the mobile signer by QR'}
                    </div>
                  </div>
                </div>

                {stackrLink.connected ? (
                  <Button size="sm" variant="ghost" onClick={stackrLink.disconnect}>
                    Disconnect
                  </Button>
                ) : stackrLink.available ? (
                  <Button size="sm" onClick={() => setView('link')} disabled={pending !== null}>
                    Pair
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {wallet.chains.map(chain => (
                        <ChainAvatar key={chain} chain={chain} size="sm" />
                      ))}
                    </div>
                    <div>
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
                      onClick={() => run(wallet.id, wallet.disconnect)}
                      disabled={pending === wallet.id}
                    >
                      Disconnect
                    </Button>
                  ) : wallet.installed ? (
                    <Button
                      size="sm"
                      onClick={() => run(wallet.id, wallet.connect)}
                      disabled={pending !== null}
                    >
                      {pending === wallet.id ? 'Connecting…' : 'Connect'}
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
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
