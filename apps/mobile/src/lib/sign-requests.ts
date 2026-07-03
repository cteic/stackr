import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Chain } from '@stackr/models';

/**
 * The signer-facing request queue. Requests arrive over a transport (the
 * wallet-link workstream supplies the real one: an end-to-end-encrypted
 * channel paired with the web app); the sheet UI approves or rejects the head
 * of the queue and the decision flows back through the same transport.
 */
export interface SignRequest {
  id: string;
  chain: Chain;
  /** Where the request came from, e.g. `stackr.ie` or a dapp origin. */
  origin: string;
  kind: 'message' | 'transaction';
  /** Human-readable rendering of what is being signed. */
  display: string;
  /** Raw payload, passed to the signer untouched on approval. */
  payload: unknown;
  receivedAt: string;
}

export interface SignDecision {
  id: string;
  approved: boolean;
}

/**
 * Transport contract for delivering requests and returning decisions.
 * `createStubTransport` below is the in-repo placeholder: it delivers nothing
 * on its own and records decisions, so the queue and sheet are fully
 * exercisable in tests (and demo-able by enqueueing directly).
 */
export interface SignRequestTransport {
  start(onRequest: (request: SignRequest) => void): () => void;
  respond(decision: SignDecision): Promise<void>;
}

export interface SignRequestQueueState {
  queue: SignRequest[];
  enqueue(request: SignRequest): void;
  /** Resolve the request with the given id and drop it from the queue. */
  resolve(decision: SignDecision): Promise<void>;
}

export function createSignRequestQueue(
  transport: SignRequestTransport,
): StoreApi<SignRequestQueueState> {
  const store = createStore<SignRequestQueueState>((set, get) => ({
    queue: [],
    enqueue(request: SignRequest): void {
      // Duplicate delivery (transport retry) must not double-prompt.
      if (get().queue.some(queued => queued.id === request.id)) return;
      set(state => ({ queue: [...state.queue, request] }));
    },
    async resolve(decision: SignDecision): Promise<void> {
      if (!get().queue.some(queued => queued.id === decision.id)) return;
      await transport.respond(decision);
      set(state => ({ queue: state.queue.filter(queued => queued.id !== decision.id) }));
    },
  }));

  transport.start(request => store.getState().enqueue(request));
  return store;
}

export function createStubTransport(): SignRequestTransport & { decisions: SignDecision[] } {
  const decisions: SignDecision[] = [];
  return {
    decisions,
    start(): () => void {
      return () => undefined;
    },
    async respond(decision: SignDecision): Promise<void> {
      decisions.push(decision);
    },
  };
}
