import { isServiceException, type ServiceError } from '@stackr/services';

/**
 * The error type every remote read in this package rejects with.
 *
 * `@stackr/services` throws `ServiceException`, which carries a discriminated
 * `serviceError`. Typing the hooks against `Error` would throw that away and
 * leave every call site parsing an error message; typing them against this
 * alias lets a component branch on `kind` instead.
 */
export type RemoteReadError = Error & { readonly serviceError?: ServiceError };

/** How many times a retryable failure is retried before the query gives up. */
const MAX_RETRIES = 2;

/**
 * Shared retry policy for remote reads.
 *
 * Two failures are pointless to retry and are surfaced immediately:
 *
 * - `rate-limited` — the proxy has already refused this client for a window.
 *   Retrying inside that window deepens the hole and delays the honest "come
 *   back shortly" message the UI owes the user.
 * - `invalid-address` — a bad address is bad on every attempt.
 *
 * Everything else (a transport blip, a 5xx, a malformed payload) is retried
 * twice with React Query's default backoff.
 */
export function retryRemoteRead(failureCount: number, error: unknown): boolean {
  if (isServiceException(error)) {
    const { kind } = error.serviceError;
    if (kind === 'rate-limited' || kind === 'invalid-address') return false;
  }
  return failureCount < MAX_RETRIES;
}

/** Whether a query error is a provider rate-limit rather than a fault. */
export function isRateLimitError(error: unknown): boolean {
  return isServiceException(error) && error.serviceError.kind === 'rate-limited';
}
