import type { Chain } from '@stackr/models';
import { validateAddress } from '@stackr/models';
import { ServiceException } from './service-error.js';

/**
 * Defense-in-depth address gate for the services layer.
 *
 * The UI already validates at its trust boundary (the add-wallet form and the
 * deep-link wallet view), but every services entry point re-checks here so a
 * caller that reaches the package by any other path — a new route, a test, a
 * direct import — can never splice an unvalidated address into an upstream URL.
 * Per-chain shape rules live in `@stackr/models`' `validateAddress`, so this
 * stays a single source of truth.
 *
 * Throws a structured `ServiceException({ kind: 'invalid-address' })` rather
 * than a raw `Error`, so callers branch on `kind` instead of parsing text.
 */
export function assertValidAddress(chain: Chain, address: string): void {
  const result = validateAddress(chain, address);
  if (!result.valid) {
    throw new ServiceException({ kind: 'invalid-address', address });
  }
}
