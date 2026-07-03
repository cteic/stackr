import type { LinkTransport } from './transport.js';

/**
 * Supabase Realtime implementation of the link transport, using ephemeral
 * broadcast channels only — no tables, no rows, nothing stored server-side.
 * Envelopes are end-to-end encrypted by the session layer before they reach
 * this module, so the relay never sees plaintext addresses or sign payloads.
 *
 * `@supabase/supabase-js` is imported lazily on first use, keeping it out of
 * any bundle that renders the UI but never starts a pairing.
 */

/** The narrow slice of realtime behaviour the transport needs. */
export interface LinkRealtimeChannel {
  /** Register the broadcast handler; must be called before `subscribed`. */
  onBroadcast(event: string, callback: (payload: unknown) => void): void;
  /** Resolves once the channel is joined and can send/receive. */
  subscribed(): Promise<void>;
  sendBroadcast(event: string, data: string): Promise<void>;
  remove(): Promise<void>;
}

export interface LinkRealtimeClient {
  channel(topic: string): LinkRealtimeChannel;
}

export interface SupabaseLinkTransportOptions {
  url: string;
  anonKey: string;
  /** Test seam — swap the lazily-loaded realtime client. */
  loadRealtime?: (url: string, anonKey: string) => Promise<LinkRealtimeClient>;
}

const BROADCAST_EVENT = 'msg';
const TOPIC_PREFIX = 'wallet-link:';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Dig the published string out of whatever shape the realtime client hands over. */
function extractData(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const inner = isRecord(payload['payload']) ? payload['payload'] : payload;
  const data = inner['data'];
  return typeof data === 'string' ? data : null;
}

async function loadSupabaseRealtime(url: string, anonKey: string): Promise<LinkRealtimeClient> {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, anonKey, { auth: { persistSession: false } });

  return {
    channel(topic) {
      const channel = client.channel(topic, {
        config: { broadcast: { self: false, ack: true } },
      });
      return {
        onBroadcast(event, callback) {
          channel.on('broadcast', { event }, message => {
            callback(message);
          });
        },
        subscribed() {
          return new Promise<void>((resolve, reject) => {
            channel.subscribe(status => {
              if (status === 'SUBSCRIBED') resolve();
              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                reject(new Error(`realtime channel failed: ${status}`));
              }
            });
          });
        },
        async sendBroadcast(event, data) {
          await channel.send({ type: 'broadcast', event, payload: { data } });
        },
        async remove() {
          await client.removeChannel(channel);
        },
      };
    },
  };
}

interface JoinedChannel {
  channel: LinkRealtimeChannel;
  ready: Promise<void>;
  listeners: Set<(data: string) => void>;
}

export function createSupabaseLinkTransport(options: SupabaseLinkTransportOptions): LinkTransport {
  const loadRealtime = options.loadRealtime ?? loadSupabaseRealtime;
  let clientPromise: Promise<LinkRealtimeClient> | null = null;
  const joined = new Map<string, JoinedChannel>();

  function client(): Promise<LinkRealtimeClient> {
    clientPromise ??= loadRealtime(options.url, options.anonKey);
    return clientPromise;
  }

  async function join(channelId: string): Promise<JoinedChannel> {
    const existing = joined.get(channelId);
    if (existing) return existing;

    const channel = (await client()).channel(`${TOPIC_PREFIX}${channelId}`);
    const listeners = new Set<(data: string) => void>();
    channel.onBroadcast(BROADCAST_EVENT, payload => {
      const data = extractData(payload);
      if (data === null) return;
      for (const listener of listeners) listener(data);
    });
    const entry: JoinedChannel = { channel, ready: channel.subscribed(), listeners };
    // Re-check: a concurrent join for the same channel may have won the race.
    const raced = joined.get(channelId);
    if (raced) {
      await entry.channel.remove().catch(() => undefined);
      return raced;
    }
    joined.set(channelId, entry);
    return entry;
  }

  return {
    async publish(channelId, data) {
      const entry = await join(channelId);
      await entry.ready;
      await entry.channel.sendBroadcast(BROADCAST_EVENT, data);
    },
    subscribe(channelId, onMessage) {
      let active = true;
      const attached = join(channelId).then(entry => {
        if (active) entry.listeners.add(onMessage);
        return entry;
      });
      return () => {
        active = false;
        void attached.then(entry => {
          entry.listeners.delete(onMessage);
          if (entry.listeners.size === 0) {
            joined.delete(channelId);
            void entry.channel.remove().catch(() => undefined);
          }
        });
      };
    },
  };
}
