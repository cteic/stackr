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
 * Thin wrapper around `fetch` with a uniform error contract.
 *
 * - Network failures (thrown by `fetch` itself) map to `kind: 'network'`.
 * - Non-2xx HTTP responses map to `kind: 'upstream'` with the status code.
 *   The upstream response body is intentionally discarded — echoing it could
 *   leak keyed URLs or internal details.
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

  if (!response.ok) {
    throw new ServiceException({
      kind: 'upstream',
      status: response.status,
      message: `upstream returned ${response.status}`,
    });
  }

  return response;
}
