/**
 * Transport port for Stackr Link. The protocol never imports a vendor SDK —
 * anything that can publish strings to a topic and hand them to subscribers
 * can carry a link session (Supabase Realtime in production, the in-memory
 * hub in tests, and whatever the mobile app prefers later).
 */
export interface LinkTransport {
  publish(channel: string, data: string): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribe(channel: string, onMessage: (data: string) => void): () => void;
}

interface HubSubscriber {
  transport: object;
  onMessage: (data: string) => void;
}

/**
 * In-memory pub/sub hub for tests. Mirrors broadcast semantics with
 * `self: false`: a message is delivered to every subscriber on the channel
 * except those registered through the publishing transport, asynchronously
 * (microtask) like a real network hop.
 */
export class InMemoryLinkHub {
  private readonly subscribers = new Map<string, Set<HubSubscriber>>();

  /** Every peer calls `connect()` once and keeps its own transport. */
  connect(): LinkTransport {
    const identity = {};
    return {
      publish: (channel, data) => {
        const subs = this.subscribers.get(channel);
        if (subs) {
          for (const sub of subs) {
            if (sub.transport !== identity) {
              queueMicrotask(() => sub.onMessage(data));
            }
          }
        }
        return Promise.resolve();
      },
      subscribe: (channel, onMessage) => {
        const sub: HubSubscriber = { transport: identity, onMessage };
        const existing = this.subscribers.get(channel) ?? new Set<HubSubscriber>();
        existing.add(sub);
        this.subscribers.set(channel, existing);
        return () => {
          existing.delete(sub);
        };
      },
    };
  }
}
