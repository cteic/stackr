import type { Chain, HealthPosition, Protocol } from '@stackr/models';
import { healthAdapters } from '@stackr/services';

/**
 * Read one (protocol, address) position through the same adapter registry the
 * dashboard uses — the sweep must never disagree with what the app shows.
 * Returns null both when the adapter reports no position and when no adapter
 * serves the pair (a subscription for a protocol the registry dropped).
 */
export async function readPosition(
  protocol: Protocol,
  chain: Chain,
  address: string,
  adapters = healthAdapters,
): Promise<HealthPosition | null> {
  const adapter = adapters.find(
    candidate => candidate.protocol === protocol && candidate.chain === chain,
  );
  if (adapter === undefined) {
    return null;
  }
  return adapter.fetchPosition(address);
}
