/**
 * Stackr Link relay configuration. Same public-by-design pair the web app
 * ships: the anon key only grants what row-level security allows, and link
 * traffic is end-to-end encrypted before it reaches the relay. Absent config
 * renders the pairing entry as unavailable instead of failing at runtime.
 */
export interface LinkConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function parseLinkConfig(env: {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
}): LinkConfig | null {
  const supabaseUrl = env.supabaseUrl?.trim() ?? '';
  const supabaseAnonKey = env.supabaseAnonKey?.trim() ?? '';
  if (supabaseUrl === '' || supabaseAnonKey === '') return null;
  if (!supabaseUrl.startsWith('https://')) return null;
  return { supabaseUrl, supabaseAnonKey };
}

export function readLinkConfig(): LinkConfig | null {
  return parseLinkConfig({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
}
