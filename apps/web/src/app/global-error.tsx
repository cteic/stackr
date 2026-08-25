'use client';

import { useEffect } from 'react';
import { Button } from '@stackr/ui';
import './globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary. Unlike `error.tsx`, this fires when the root layout
 * itself throws, so it replaces the entire document — it must render its own
 * `<html>`/`<body>` and cannot rely on the theme provider or `next/font` being
 * mounted. We pin the `dark` class so the design tokens resolve and pull in
 * `globals.css` directly for the utility classes; the mono font falls back to
 * the system stack defined in the token set.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body>
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
              <p className="text-muted-foreground">
                Something went wrong and the app couldn&apos;t recover.
              </p>
            </div>

            <Button variant="primary" size="sm" onClick={reset}>
              Reload Stackr
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
