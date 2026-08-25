import type { Chain, Protocol } from '@stackr/models';
import { healthAdapters } from '@stackr/services';

/**
 * Which lending protocols Stackr can monitor on a chain, derived from the
 * registered health adapters so the alerts UI can never offer a protocol the
 * sweep can't actually read.
 */
export function protocolsForChain(chain: Chain): Protocol[] {
  return healthAdapters.filter(adapter => adapter.chain === chain).map(adapter => adapter.protocol);
}

/** Chains with at least one monitorable protocol (eth, sol, stx today). */
export function alertableChains(): Chain[] {
  const chains: Chain[] = [];
  for (const adapter of healthAdapters) {
    if (!chains.includes(adapter.chain)) {
      chains.push(adapter.chain);
    }
  }
  return chains;
}
