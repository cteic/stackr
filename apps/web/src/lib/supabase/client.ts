'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

/**
 * The browser Supabase client, or null when the project isn't configured.
 *
 * Deliberately browser-only: keeping auth client-side means the app stays a static
 * export, which rules out middleware and dynamic route handlers, so auth runs
 * entirely client-side (PKCE magic-link, exchanged on /auth/callback). Server
 * components never read the session — the account surface is a client island.
 */
let cached: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) {
    return cached;
  }
  const config = supabaseConfig();
  cached = config === null ? null : createBrowserClient(config.url, config.anonKey);
  return cached;
}
