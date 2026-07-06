import type { Chain } from '@stackr/models';
import { validateAddress } from '@stackr/models';
import { ServiceException } from './service-error.js';

/**
 * Defense-in-depth below the proxy allow-lists: every adapter validates its
 * address before any fetch, so a malformed or attacker-shaped value can never
 * become path or query material for an upstream call — regardless of which
 * route (proxy or direct) the adapter takes.
 */
export function assertValidAddress(chain: Chain, address: string): void {
  const result = validateAddress(chain, address);

  if (!result.valid) {
    throw new ServiceException({ kind: 'invalid-address', address });
  }
}
