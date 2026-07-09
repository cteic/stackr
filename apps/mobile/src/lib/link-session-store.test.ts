import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryLinkHub,
  WalletLinkSession,
  WebLinkSession,
  type AnnouncedAddress,
} from '@stackr/wallet-link';
import { createLinkSignBridge } from './link-sign-bridge';
import { createLinkSessionStore } from './link-session-store';
import { createSignRequestQueue } from './sign-requests';

/**
 * End-to-end over the in-memory hub: a real WebLinkSession peer on one side,
 * the store + bridge + queue (exactly as composed in the app) on the other.
 */

const ADDRESSES: AnnouncedAddress[] = [
  { chain: 'stx', address: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7', label: 'Stacks' },
];

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function harness(executorSignature = 'cafebabe') {
  const hub = new InMemoryLinkHub();
  const web = WebLinkSession.create(hub.connect());

  const bridge = createLinkSignBridge(request =>
    request.payload === 'boom'
      ? Promise.resolve({ status: 'rejected', reason: 'signer error' })
      : Promise.resolve({ status: 'approved', signature: executorSignature }),
  );
  const queue = createSignRequestQueue(bridge.transport);
  const store = createLinkSessionStore({
    createTransport: () => hub.connect(),
    join: (transport, qr) => WalletLinkSession.join(transport, qr),
    bridge,
  });

  return { web, bridge, queue, store };
}

describe('link session store + bridge + queue', () => {
  it('pairs from the QR payload and announces addresses to the web peer', async () => {
    const { web, store } = harness();
    const onAddresses = vi.fn();
    web.onAddresses = onAddresses;

    await store.getState().pair(web.qrPayload(), ADDRESSES);
    await flush();

    expect(store.getState().link).toEqual({ status: 'paired', channel: web.channel });
    expect(onAddresses).toHaveBeenCalledWith(ADDRESSES);
  });

  it('relays a sign request into the queue and returns the approval signature', async () => {
    const { web, store, queue } = harness('feedface');
    await store.getState().pair(web.qrPayload(), ADDRESSES);
    await flush();

    const verdict = web.requestSignature({ chain: 'stx', kind: 'message', payload: 'Sign in' });
    await flush();

    const head = queue.getState().queue[0];
    expect(head).toMatchObject({ chain: 'stx', kind: 'message', display: 'Sign in' });

    await queue.getState().resolve({ id: head.id, approved: true });
    await expect(verdict).resolves.toEqual({ status: 'approved', signature: 'feedface' });
    expect(queue.getState().queue).toHaveLength(0);
  });

  it('returns a typed rejection when the user declines', async () => {
    const { web, store, queue } = harness();
    await store.getState().pair(web.qrPayload(), ADDRESSES);
    await flush();

    const verdict = web.requestSignature({ chain: 'btc', kind: 'message', payload: 'x' });
    await flush();

    const head = queue.getState().queue[0];
    await queue.getState().resolve({ id: head.id, approved: false });
    await expect(verdict).resolves.toEqual({ status: 'rejected', reason: 'user rejected' });
  });

  it('moves to error (not paired) on a junk QR payload', async () => {
    const { store } = harness();
    await store.getState().pair('not-json', ADDRESSES);
    expect(store.getState().link).toEqual({
      status: 'error',
      message: 'invalid link QR payload',
    });
  });

  it('fails pending requests and returns to idle when the web side disconnects', async () => {
    const { web, store, queue, bridge } = harness();
    await store.getState().pair(web.qrPayload(), ADDRESSES);
    await flush();

    const verdict = web
      .requestSignature({ chain: 'sui', kind: 'message', payload: 'y' })
      .catch((error: unknown) => (error instanceof Error ? error.message : 'unknown'));
    await flush();
    expect(bridge.pendingCount()).toBe(1);

    await web.disconnect();
    await flush();

    expect(store.getState().link).toEqual({ status: 'idle' });
    expect(bridge.pendingCount()).toBe(0);
    // The web side fails its own in-flight request when it initiates the close.
    await expect(verdict).resolves.toBe('link session closed');
    // The stranded queue entry can still be resolved without a crash.
    const head = queue.getState().queue[0];
    if (head !== undefined) {
      await queue.getState().resolve({ id: head.id, approved: false });
    }
  });

  it('reports unavailable when the relay is not configured', async () => {
    const bridge = createLinkSignBridge(() =>
      Promise.resolve({ status: 'rejected', reason: 'unused' }),
    );
    createSignRequestQueue(bridge.transport);
    const store = createLinkSessionStore({
      createTransport: () => null,
      join: () => Promise.reject(new Error('unreachable')),
      bridge,
    });

    await store.getState().pair('{}', ADDRESSES);
    expect(store.getState().link).toEqual({ status: 'unavailable' });
  });
});
