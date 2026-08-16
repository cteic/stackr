import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AnnouncedAddress, LinkTransport, WalletLinkSession } from '@stackr/wallet-link';
import type { LinkSignBridge } from './link-sign-bridge';

/**
 * Pairing state machine for the wallet side of Stackr Link. All effects are
 * injected (transport factory, the session `join`, the sign bridge) so the
 * transitions are fully unit-testable with the in-memory hub.
 */

export type LinkStatus =
  | { status: 'unavailable' }
  | { status: 'idle' }
  | { status: 'pairing' }
  | { status: 'paired'; channel: string }
  | { status: 'error'; message: string };

export interface LinkSessionState {
  link: LinkStatus;
  pair(qrPayloadRaw: string, addresses: AnnouncedAddress[]): Promise<void>;
  disconnect(): Promise<void>;
}

export interface LinkSessionDeps {
  /** Null when the relay env vars are absent — pairing shows as unavailable. */
  createTransport: () => Promise<LinkTransport> | LinkTransport | null;
  join: (transport: LinkTransport, qrPayloadRaw: string) => Promise<WalletLinkSession>;
  bridge: LinkSignBridge;
}

export function createLinkSessionStore(deps: LinkSessionDeps): StoreApi<LinkSessionState> {
  let session: WalletLinkSession | null = null;

  return createStore<LinkSessionState>((set, get) => ({
    link: { status: 'idle' },

    async pair(qrPayloadRaw: string, addresses: AnnouncedAddress[]): Promise<void> {
      const current = get().link.status;
      if (current === 'pairing' || current === 'paired') return;

      const transportOrNull = deps.createTransport();
      if (transportOrNull === null) {
        set({ link: { status: 'unavailable' } });
        return;
      }

      set({ link: { status: 'pairing' } });
      try {
        const transport = await transportOrNull;
        const joined = await deps.join(transport, qrPayloadRaw);
        joined.onSignRequest = request => deps.bridge.handleSessionRequest(request, joined.channel);
        joined.onPeerDisconnect = () => {
          deps.bridge.failPending('portfolio disconnected');
          session = null;
          set({ link: { status: 'idle' } });
        };
        await joined.announceAddresses(addresses);
        session = joined;
        set({ link: { status: 'paired', channel: joined.channel } });
      } catch (error) {
        session = null;
        const message = error instanceof Error ? error.message : 'pairing failed';
        set({ link: { status: 'error', message } });
      }
    },

    async disconnect(): Promise<void> {
      const active = session;
      session = null;
      deps.bridge.failPending('wallet disconnected');
      if (active !== null) {
        await active.disconnect().catch(() => undefined);
      }
      set({ link: { status: 'idle' } });
    },
  }));
}
