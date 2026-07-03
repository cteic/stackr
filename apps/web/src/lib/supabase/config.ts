/**
 * Supabase project config, read from build-time public env. Both values are
 * public by design — the anon key only grants what row-level security allows —
 * while the service-role key must never appear anywhere in this app.
 *
 * Accounts are optional: when these are unset (local dev, preview builds) the
 * whole auth/alerts surface degrades to a "not configured" notice and the rest
 * of Stackr is untouched.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function supabaseConfig(): SupabaseConfig | null {
  // Static property access so Next can inline the values at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

/** VAPID public key for web-push subscriptions (safe to expose; the private half lives in the alerts Worker). */
export function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}
