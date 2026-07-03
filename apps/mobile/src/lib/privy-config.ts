/**
 * Privy app credentials. Both ids are public identifiers (they ship in the
 * bundle by design); the trust boundary is Privy's dashboard configuration,
 * not secrecy of these values. `EXPO_PUBLIC_*` vars are inlined at build time.
 */
export interface PrivyConfig {
  appId: string;
  clientId: string;
}

export function readPrivyConfig(
  env: Record<string, string | undefined> = {
    EXPO_PUBLIC_PRIVY_APP_ID: process.env.EXPO_PUBLIC_PRIVY_APP_ID,
    EXPO_PUBLIC_PRIVY_CLIENT_ID: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID,
  },
): PrivyConfig | null {
  const appId = env.EXPO_PUBLIC_PRIVY_APP_ID;
  const clientId = env.EXPO_PUBLIC_PRIVY_CLIENT_ID;
  if (typeof appId !== 'string' || appId.length === 0) return null;
  if (typeof clientId !== 'string' || clientId.length === 0) return null;
  return { appId, clientId };
}
