import { describe, expect, it, vi } from 'vitest';
import { createSupabaseLinkTransport } from './supabase-transport.js';
import type { LinkRealtimeChannel, LinkRealtimeClient } from './supabase-transport.js';

interface FakeChannel extends LinkRealtimeChannel {
  emit(payload: unknown): void;
  sent: string[];
  removed: boolean;
}

function fakeRealtime() {
  const channels = new Map<string, FakeChannel>();
  const client: LinkRealtimeClient = {
    channel(topic) {
      const listeners: Array<(payload: unknown) => void> = [];
      const channel: FakeChannel = {
        sent: [],
        removed: false,
        onBroadcast(_event, callback) {
          listeners.push(callback);
        },
        subscribed: () => Promise.resolve(),
        sendBroadcast(_event, data) {
          channel.sent.push(data);
          return Promise.resolve();
        },
        remove() {
          channel.removed = true;
          return Promise.resolve();
        },
        emit(payload) {
          for (const listener of listeners) listener(payload);
        },
      };
      channels.set(topic, channel);
      return channel;
    },
  };
  return { client, channels };
}

function transportWith(client: LinkRealtimeClient) {
  return createSupabaseLinkTransport({
    url: 'https://example.supabase.co',
    anonKey: 'anon',
    loadRealtime: () => Promise.resolve(client),
  });
}

describe('createSupabaseLinkTransport', () => {
  it('publishes through a joined broadcast channel with the topic prefix', async () => {
    const { client, channels } = fakeRealtime();
    const transport = transportWith(client);

    await transport.publish('abc123', 'envelope-data');

    const channel = channels.get('wallet-link:abc123');
    expect(channel).toBeDefined();
    expect(channel?.sent).toEqual(['envelope-data']);
  });

  it('delivers the published string from either realtime payload shape', async () => {
    const { client, channels } = fakeRealtime();
    const transport = transportWith(client);
    const seen: string[] = [];
    transport.subscribe('abc123', data => seen.push(data));
    await vi.waitFor(() => expect(channels.get('wallet-link:abc123')).toBeDefined());

    const channel = channels.get('wallet-link:abc123');
    channel?.emit({ type: 'broadcast', event: 'msg', payload: { data: 'wrapped' } });
    channel?.emit({ data: 'flat' });
    channel?.emit({ payload: { data: 42 } }); // non-string data — ignored
    channel?.emit('junk'); // not even an object — ignored

    expect(seen).toEqual(['wrapped', 'flat']);
  });

  it('reuses one joined channel across publish and subscribe', async () => {
    const { client, channels } = fakeRealtime();
    const transport = transportWith(client);

    transport.subscribe('abc123', () => undefined);
    await transport.publish('abc123', 'first');
    await transport.publish('abc123', 'second');

    expect(channels.size).toBe(1);
  });

  it('removes the channel when the last subscriber unsubscribes', async () => {
    const { client, channels } = fakeRealtime();
    const transport = transportWith(client);

    const unsubscribe = transport.subscribe('abc123', () => undefined);
    await vi.waitFor(() => expect(channels.get('wallet-link:abc123')).toBeDefined());
    unsubscribe();

    await vi.waitFor(() => expect(channels.get('wallet-link:abc123')?.removed).toBe(true));
  });
});
