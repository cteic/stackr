import type { SignResult, WalletSignRequest } from '@stackr/wallet-link';
import type { SignDecision, SignRequest, SignRequestTransport } from './sign-requests';
import { peerLabel, renderSignDisplay } from './link-signing';

/**
 * The switchboard between a paired `WalletLinkSession` and the app's sign
 * queue. The session hands requests to `handleSessionRequest` and awaits a
 * `SignResult`; the queue's transport (`bridge.transport`) delivers those
 * requests to the sheet UI and routes the user's decision back:
 *
 *   approve → run the injected executor (the on-device signer) → result
 *   reject  → typed rejection, nothing is ever signed
 *
 * Requests whose session has meanwhile disconnected resolve as rejected —
 * a decision can never outlive its channel.
 */

type Executor = (request: WalletSignRequest) => Promise<SignResult>;

interface PendingRequest {
  request: WalletSignRequest;
  resolve: (result: SignResult) => void;
}

export interface LinkSignBridge {
  transport: SignRequestTransport;
  /**
   * Wire as `session.onSignRequest`. `channel` is the paired session's channel
   * id; it becomes the sheet's (unverified) peer label, so the displayed origin
   * always reflects the real session rather than a hardcoded domain.
   */
  handleSessionRequest(request: WalletSignRequest, channel: string): Promise<SignResult>;
  /** Fail everything in flight (peer disconnect / session close). */
  failPending(reason: string): void;
  pendingCount(): number;
}

export function createLinkSignBridge(executor: Executor): LinkSignBridge {
  const pending = new Map<string, PendingRequest>();
  let deliver: ((request: SignRequest) => void) | null = null;

  return {
    transport: {
      start(onRequest: (request: SignRequest) => void): () => void {
        deliver = onRequest;
        return () => {
          deliver = null;
        };
      },
      async respond(decision: SignDecision): Promise<void> {
        const entry = pending.get(decision.id);
        if (!entry) return;
        pending.delete(decision.id);
        if (!decision.approved) {
          entry.resolve({ status: 'rejected', reason: 'user rejected' });
          return;
        }
        entry.resolve(await executor(entry.request));
      },
    },

    handleSessionRequest(request: WalletSignRequest, channel: string): Promise<SignResult> {
      return new Promise<SignResult>(resolve => {
        if (deliver === null) {
          resolve({ status: 'rejected', reason: 'signer unavailable' });
          return;
        }
        pending.set(request.id, { request, resolve });
        deliver({
          id: request.id,
          chain: request.chain,
          // Never claim a domain the handshake can't prove — see peerLabel.
          origin: peerLabel(channel),
          originVerified: false,
          kind: request.kind,
          display: renderSignDisplay(request),
          payload: request.payload,
          receivedAt: new Date().toISOString(),
        });
      });
    },

    failPending(reason: string): void {
      for (const entry of pending.values()) {
        entry.resolve({ status: 'rejected', reason });
      }
      pending.clear();
    },

    pendingCount(): number {
      return pending.size;
    },
  };
}
