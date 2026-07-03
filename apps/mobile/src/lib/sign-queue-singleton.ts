import { useSyncExternalStore } from 'react';
import {
  createSignRequestQueue,
  createStubTransport,
  type SignRequestQueueState,
} from './sign-requests';

/**
 * One queue for the app. The stub transport delivers nothing on its own —
 * the wallet-link workstream swaps in the paired-channel transport here, and
 * only here.
 */
const queue = createSignRequestQueue(createStubTransport());

export function useSignQueue(): SignRequestQueueState {
  return useSyncExternalStore(queue.subscribe, queue.getState, queue.getState);
}
