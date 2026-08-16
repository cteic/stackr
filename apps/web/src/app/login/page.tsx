'use client';

import { useState } from 'react';
import { Button, Callout, Card, Input } from '@stackr/ui';
import { Header } from '@/components/header';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type LoginState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'sent' }
  | { phase: 'error'; message: string };

/**
 * Email magic-link sign-in. Accounts are optional — they exist only to power
 * liquidation alerts (and later sync); the portfolio itself stays local.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<LoginState>({ phase: 'idle' });
  const supabase = getSupabaseBrowserClient();

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supabase === null) {
      return;
    }
    setState({ phase: 'sending' });
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setState(error ? { phase: 'error', message: error.message } : { phase: 'sent' });
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">Sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">
          An account powers liquidation alerts — your portfolio itself stays on this device, no
          account needed.
        </p>

        {supabase === null ? (
          <Callout variant="warning">
            Sign-in isn&apos;t set up for this deployment yet — it only unlocks liquidation alerts.
            Your portfolio itself never needed an account.
          </Callout>
        ) : state.phase === 'sent' ? (
          <Callout variant="info">
            Check your email — we sent a sign-in link to {email}. Open it on this device.
          </Callout>
        ) : (
          <Card className="p-4">
            <form onSubmit={sendMagicLink} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              {state.phase === 'error' ? <Callout variant="error">{state.message}</Callout> : null}
              <Button type="submit" disabled={state.phase === 'sending' || email.length === 0}>
                {state.phase === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
              </Button>
            </form>
          </Card>
        )}
      </main>
    </>
  );
}
