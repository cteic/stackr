import { ServiceException } from './service-error.js';

/**
 * Options for `safeFetch`.
 */
export interface SafeFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

/**
 * `Retry-After` is either a delay in seconds or an HTTP date (RFC 9110). Both
 * are read here and expressed as seconds from now, because a caller wants "how
 * long until I may retry" and should not care which form the responder chose.
 * A malformed or already-elapsed value resolves to `undefined` rather than a
 * misleading zero.
 */
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds > 0 ? seconds : undefined;

  const retryAt = Date.parse(header);
  if (Number.isNaN(retryAt)) return undefined;
  const delay = Math.ceil((retryAt - Date.now()) / 1000);
  return delay > 0 ? delay : undefined;
}

/**
 * Thin wrapper around `fetch` with a uniform error contract.
 *
 * - Network failures (thrown by `fetch` itself) map to `kind: 'network'`.
 * - HTTP 429 maps to `kind: 'rate-limited'`, carrying `Retry-After` when the
 *   responder sent one. It is split out of `upstream` because it is the only
 *   status a caller should retry on a timer rather than surface as a fault.
 * - Other non-2xx HTTP responses map to `kind: 'upstream'` with the status
 *   code. The upstream response body is intentionally discarded — echoing it
 *   could leak keyed URLs or internal details.
 * - Callers are responsible for parse-error mapping (`kind: 'parse'`) and
 *   address validation (`kind: 'invalid-address'`); this layer only covers the
 *   transport.
 *
 * The URL is accepted as a pre-built string. Callers that interpolate address
 * segments into URLs must wrap those segments in `encodeURIComponent` before
 * passing them in.
 */
export async function safeFetch(url: string, options?: SafeFetchOptions): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options?.method ?? 'GET',
      headers: options?.headers,
      body: options?.body,
    });
  } catch (cause) {
    throw new ServiceException({
      kind: 'network',
      message: cause instanceof Error ? cause.message : 'fetch failed',
    });
  }

  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    throw new ServiceException({
      kind: 'rate-limited',
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      message: 'rate limit exceeded',
    });
  }

  if (!response.ok) {
    throw new ServiceException({
      kind: 'upstream',
      status: response.status,
      message: `upstream returned ${response.status}`,
    });
  }

  return response;
}
