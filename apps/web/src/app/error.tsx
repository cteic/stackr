'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@stackr/ui';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-segment error boundary. Next renders this (inside the root layout, so
 * the theme + providers stay mounted) when a Server Component or a nested
 * Client Component throws during render. A blank 500 degrades to a themed,
 * recoverable fallback. `global-error.tsx` handles the rarer case of the root
 * layout itself throwing.
 */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Surface for the browser console / PostHog's `capture_exceptions`; the
    // analytics layer is the only sink and it is PII-free by construction.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo mark — four-bar chart mirroring the favicon */}
        <div className="flex items-end gap-1.5">
          <div className="w-3 h-4 rounded-sm bg-chain-eth" />
          <div className="w-3 h-6 rounded-sm bg-chain-btc" />
          <div className="w-3 h-8 rounded-sm bg-chain-stx" />
          <div className="w-3 h-5 rounded-sm bg-chain-sol" />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase select-none">
            error[E0500]
          </p>
          <h1 className="font-mono text-8xl font-bold text-foreground leading-none tracking-tighter">
            500
          </h1>
          <p className="text-muted-foreground">Something went wrong on our end.</p>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground select-none">
              ref: {error.digest}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" size="sm" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/">← Back to portfolio</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
