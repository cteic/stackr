import { describe, expect, it, vi } from 'vitest';
import { InMemoryLinkHub } from './transport.js';
import { WalletLinkSession, WebLinkSession } from './session.js';
import type { AnnouncedAddress } from './messages.js';

const STX_ADDRESS = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7';
const ETH_ADDRESS = `0x${'ab'.repeat(20)}`;
const SUI_ADDRESS = `0x${'cd'.repeat(32)}`;

/** Let queued microtasks and zero-delay timers run. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function pairSessions() {
  const hub = new InMemoryLinkHub();
  const web = WebLinkSession.create(hub.connect());
  const wallet = await WalletLinkSession.join(hub.connect(), web.qrPayload());
  return { hub, web, wallet };
}

describe('pairing handshake', () => {
  it('pairs both ends over the QR payload + hello/hello_ack exchange', async () => {
    const hub = new InMemoryLinkHub();
    const web = WebLinkSession.create(hub.connect());
    const paired = vi.fn();
    web.onPaired = paired;

    const wallet = await WalletLinkSession.join(hub.connect(), web.qrPayload());
    await flush();

    expect(wallet.paired).toBe(true);
    expect(web.paired).toBe(true);
    expect(paired).toHaveBeenCalledTimes(1);
  });

  it('rejects joining with a junk QR payload', async () => {
    const hub = new InMemoryLinkHub();
    await expect(WalletLinkSession.join(hub.connect(), 'not json')).rejects.toThrow(
      'invalid link QR payload',
    );
    await expect(
      WalletLinkSession.join(hub.connect(), JSON.stringify({ v: 9, nope: true })),
    ).rejects.toThrow('invalid link QR payload');
  });

  it('times out when nobody answers the hello', async () => {
    const hub = new InMemoryLinkHub();
    // No web session listening on this channel at all.
    const orphanPayload = JSON.stringify({
      v: 1,
      channel: 'a'.repeat(32),
      webPubKey: 'b'.repeat(64),
    });
    await expect(WalletLinkSession.join(hub.connect(), orphanPayload, 20)).rejects.toThrow(
      'pairing timed out',
    );
  });

  it('honours only the first hello — a second joiner cannot hijack the session', async () => {
    const { hub, web, wallet } = await pairSessions();
    const received: AnnouncedAddress[][] = [];
    web.onAddresses = addresses => received.push(addresses);

    // An attacker who saw the QR later publishes their own hello.
    await hub
      .connect()
      .publish(web.channel, JSON.stringify({ v: 1, kind: 'hello', pubKey: 'e'.repeat(64) }));
    await flush();

    // The original wallet's messages still decrypt — the key never rotated.
    await wallet.announceAddresses([{ chain: 'stx', address: STX_ADDRESS }]);
    await flush();
    expect(received).toHaveLength(1);
  });
});

describe('address announcement', () => {
  it('delivers schema-valid, chain-validated addresses to the web side', async () => {
    const { web, wallet } = await pairSessions();
    const received: AnnouncedAddress[][] = [];
    web.onAddresses = addresses => received.push(addresses);

    await wallet.announceAddresses([
      { chain: 'stx', address: STX_ADDRESS, label: 'Stackr Wallet' },
      { chain: 'eth', address: ETH_ADDRESS },
      { chain: 'sui', address: SUI_ADDRESS },
    ]);
    await flush();

    expect(received).toEqual([
      [
        { chain: 'stx', address: STX_ADDRESS, label: 'Stackr Wallet' },
        { chain: 'eth', address: ETH_ADDRESS },
        { chain: 'sui', address: SUI_ADDRESS },
      ],
    ]);
  });

  it('refuses to announce a malformed address (wallet-side guard)', async () => {
    const { wallet } = await pairSessions();
    await expect(
      wallet.announceAddresses([{ chain: 'eth', address: 'not-an-address' }]),
    ).rejects.toThrow('invalid eth address');
  });
});

describe('sign request relay', () => {
  it('resolves with the wallet approval', async () => {
    const { web, wallet } = await pairSessions();
    wallet.onSignRequest = request => {
      expect(request.chain).toBe('eth');
      expect(request.kind).toBe('transaction');
      expect(request.payload).toBe('0xfeed');
      return Promise.resolve({ status: 'approved', signature: '0xcafe' });
    };

    const result = await web.requestSignature({
      chain: 'eth',
      kind: 'transaction',
      payload: '0xfeed',
    });
    expect(result).toEqual({ status: 'approved', signature: '0xcafe' });
  });

  it('resolves with a rejection when the wallet declines', async () => {
    const { web, wallet } = await pairSessions();
    wallet.onSignRequest = () => Promise.resolve({ status: 'rejected', reason: 'user declined' });

    const result = await web.requestSignature({ chain: 'sol', kind: 'message', payload: 'aGk=' });
    expect(result).toEqual({ status: 'rejected', reason: 'user declined' });
  });

  it('auto-rejects when the wallet has no signer handler', async () => {
    const { web } = await pairSessions();
    const result = await web.requestSignature({ chain: 'btc', kind: 'message', payload: 'aGk=' });
    expect(result).toEqual({ status: 'rejected', reason: 'no signer available' });
  });

  it('times out when the wallet never answers', async () => {
    const { web, wallet } = await pairSessions();
    wallet.onSignRequest = () => new Promise(() => undefined);

    await expect(
      web.requestSignature({ chain: 'eth', kind: 'message', payload: 'aGk=' }, 20),
    ).rejects.toThrow('sign request timed out');
  });
});

describe('hostile traffic', () => {
  it('ignores junk, replays, and tampered boxes', async () => {
    const { hub, web, wallet } = await pairSessions();
    const received: AnnouncedAddress[][] = [];
    web.onAddresses = addresses => received.push(addresses);

    // Wiretap the channel to capture the raw announce envelope.
    const wire = hub.connect();
    const captured: string[] = [];
    wire.subscribe(web.channel, data => captured.push(data));

    await wallet.announceAddresses([{ chain: 'stx', address: STX_ADDRESS }]);
    await flush();
    expect(received).toHaveLength(1);

    const announceRaw = captured.find(data => data.includes('"box"'));
    expect(announceRaw).toBeDefined();
    if (announceRaw === undefined) return;

    // Replay the exact envelope — the monotonic sequence check drops it.
    await wire.publish(web.channel, announceRaw);
    // Tamper with the ciphertext under a fresh sequence — AEAD drops it.
    const envelope: unknown = JSON.parse(announceRaw);
    if (
      typeof envelope === 'object' &&
      envelope !== null &&
      'box' in envelope &&
      'seq' in envelope
    ) {
      const forged = {
        ...envelope,
        seq: 99,
        box: 'deadbeef'.repeat(8),
      };
      await wire.publish(web.channel, JSON.stringify(forged));
    }
    // Outright junk.
    await wire.publish(web.channel, 'garbage');
    await wire.publish(web.channel, JSON.stringify({ v: 1, kind: 'box', nope: true }));
    await flush();

    expect(received).toHaveLength(1);
  });
});

describe('disconnect', () => {
  it('propagates wallet disconnect to the web side and closes both ends', async () => {
    const { web, wallet } = await pairSessions();
    const gone = vi.fn();
    web.onPeerDisconnect = gone;

    await wallet.disconnect();
    await flush();

    expect(gone).toHaveBeenCalledTimes(1);
    expect(web.paired).toBe(false);
    expect(wallet.paired).toBe(false);
  });

  it('fails an in-flight sign request when the wallet disconnects', async () => {
    const { web, wallet } = await pairSessions();
    wallet.onSignRequest = () => new Promise(() => undefined);

    const pending = web.requestSignature({ chain: 'eth', kind: 'message', payload: 'aGk=' });
    const failed = pending.catch((error: Error) => error.message);
    await flush();
    await wallet.disconnect();
    await flush();

    expect(await failed).toBe('wallet disconnected');
  });
});
