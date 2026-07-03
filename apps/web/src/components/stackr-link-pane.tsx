'use client';

import { useEffect, useState } from 'react';
import { Button } from '@stackr/ui';
import type { AnnouncedAddress } from '@stackr/wallet-link/messages';
import { useStackrLinkPairing } from '@/lib/stackr-link';

interface StackrLinkPaneProps {
  onAddresses: (addresses: AnnouncedAddress[]) => void;
  onBack: () => void;
}

/**
 * The QR pairing view inside the connect modal. The QR encoder loads lazily —
 * it is only needed for the seconds the code is on screen.
 */
export function StackrLinkPane({ onAddresses, onBack }: StackrLinkPaneProps) {
  const { status, qrText, start, cancel } = useStackrLinkPairing(onAddresses);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    start();
  }, [start]);

  useEffect(() => {
    if (qrText === null) {
      setQrSvg(null);
      return;
    }
    let cancelled = false;
    void import('qr').then(({ default: encodeQR }) => {
      if (!cancelled) setQrSvg(encodeQR(qrText, 'svg'));
    });
    return () => {
      cancelled = true;
    };
  }, [qrText]);

  function leave() {
    cancel();
    onBack();
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      {status === 'paired' ? (
        <>
          <p className="text-sm font-semibold text-foreground">Stackr Wallet linked</p>
          <p className="text-center text-xs text-muted-foreground">
            Your wallet&apos;s addresses were added to the portfolio.
          </p>
          <Button size="sm" onClick={onBack}>
            Done
          </Button>
        </>
      ) : status === 'error' ? (
        <>
          <p role="alert" className="text-center text-xs text-destructive">
            Pairing could not start — check your connection and try again.
          </p>
          <Button size="sm" variant="outline" onClick={leave}>
            Back
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-foreground">Scan with Stackr Wallet</p>
          {status === 'waiting' && qrSvg !== null ? (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
              alt="Stackr Link pairing QR code"
              className="h-48 w-48 rounded-lg bg-white p-2"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-48 w-48 animate-pulse items-center justify-center rounded-lg border text-xs text-muted-foreground"
            >
              Preparing…
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Open Stackr Wallet on your phone and scan. Addresses arrive over an end-to-end encrypted
            channel — keys never leave your phone, and Stackr never asks to sign.
          </p>
          <Button size="sm" variant="ghost" onClick={leave}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
