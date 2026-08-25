import { useSyncExternalStore } from 'react';
import { WalletLinkSession, type LinkTransport } from '@stackr/wallet-link';
import { getSigner } from './local-wallet-singleton';
import { createLinkSignBridge, type LinkSignBridge } from './link-sign-bridge';
import { createLinkSessionStore, type LinkSessionState } from './link-session-store';
import { executeSign } from './link-signing';
import { readLinkConfig } from './link-config';

/**
 * Composition root for Stackr Link on the wallet. One bridge feeds the one
 * sign queue (see `sign-queue-singleton`), one session store owns the pairing
 * lifecycle, and the Supabase transport is loaded lazily so the relay SDK
 * stays out of the startup path.
 */

const bridge: LinkSignBridge = createLinkSignBridge(request => executeSign(getSigner(), request));

export function getLinkSignBridge(): LinkSignBridge {
  return bridge;
}

async function createTransport(): Promise<LinkTransport> {
  const config = readLinkConfig();
  if (config === null) {
    throw new Error('link relay is not configured');
  }
  const { createSupabaseLinkTransport } = await import('@stackr/wallet-link/supabase');
  return createSupabaseLinkTransport({
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
  });
}

const store = createLinkSessionStore({
  createTransport: () => (readLinkConfig() === null ? null : createTransport()),
  join: (transport, qrPayloadRaw) => WalletLinkSession.join(transport, qrPayloadRaw),
  bridge,
});

export function useLinkSession(): LinkSessionState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function isLinkAvailable(): boolean {
  return readLinkConfig() !== null;
}
