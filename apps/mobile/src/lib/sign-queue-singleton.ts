import { useSyncExternalStore } from 'react';
import { createSignRequestQueue, type SignRequestQueueState } from './sign-requests';
import { getLinkSignBridge } from './link-singleton';

/**
 * One queue for the app, fed by the Stackr Link bridge: requests relayed from
 * a paired portfolio land here, and the sheet's approve/reject flows back
 * through the same bridge to the encrypted channel.
 */
const queue = createSignRequestQueue(getLinkSignBridge().transport);

export function useSignQueue(): SignRequestQueueState {
  return useSyncExternalStore(queue.subscribe, queue.getState, queue.getState);
}
