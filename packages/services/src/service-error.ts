/**
 * Typed error union for service-layer failures. Every fetch in the services
 * package should map its errors to one of these variants so callers can branch
 * on `kind` without inspecting raw `Error` messages.
 */
export type ServiceError =
  | { kind: 'network'; message: string }
  | { kind: 'invalid-address'; address: string }
  | { kind: 'upstream'; status: number; message: string }
  // Split out of `upstream` because it is the one failure a caller should treat
  // as "come back later" rather than "this is broken": the same-origin RPC
  // proxies answer 429 when a client exceeds their per-IP window, and the UI
  // owes the user a different message for that than for a dead provider.
  | { kind: 'rate-limited'; retryAfterSeconds?: number; message: string }
  | { kind: 'parse'; message: string };

export class ServiceException extends Error {
  readonly serviceError: ServiceError;

  constructor(serviceError: ServiceError) {
    const message =
      serviceError.kind === 'invalid-address'
        ? `Invalid address: ${serviceError.address}`
        : serviceError.message;
    super(message);
    this.name = 'ServiceException';
    this.serviceError = serviceError;
  }
}

/**
 * Type-guard that narrows an unknown caught value to `ServiceException`.
 */
export function isServiceException(value: unknown): value is ServiceException {
  return value instanceof ServiceException;
}

/** Whether a caught value is a rate-limit rejection from a provider or proxy. */
export function isRateLimited(value: unknown): boolean {
  return isServiceException(value) && value.serviceError.kind === 'rate-limited';
}
