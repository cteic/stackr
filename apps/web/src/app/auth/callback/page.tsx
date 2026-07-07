'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Callout, Spinner } from '@stackr/ui';
import { Header } from '@/components/header';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Lands the magic link. The PKCE code exchange runs client-side (this page,
 * not a route handler) so the page needs no server runtime — the
 * mobile target has no server to run middleware or dynamic routes on.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (supabase === null) {
      setError('Accounts are not configured in this environment.');
      return;
    }

    const code = new URLSearchParams(window.location.search).get('code');
    if (code === null) {
      setError('This sign-in link is missing its code — request a fresh one.');
      return;
    }

    let cancelled = false;
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (cancelled) {
          return;
        }
        if (exchangeError) {
          setError(exchangeError.message);
        } else {
          router.replace('/account');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Sign-in failed — request a fresh link.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-6">
        {error === null ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Spinner /> Signing you in…
          </div>
        ) : (
          <Callout variant="error">{error}</Callout>
        )}
      </main>
    </>
  );
}
