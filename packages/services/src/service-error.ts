/**
 * Typed error union for service-layer failures. Every fetch in the services
 * package should map its errors to one of these variants so callers can branch
 * on `kind` without inspecting raw `Error` messages.
 */
export type ServiceError =
  | { kind: 'network'; message: string }
  | { kind: 'invalid-address'; address: string }
  | { kind: 'upstream'; status: number; message: string }
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
