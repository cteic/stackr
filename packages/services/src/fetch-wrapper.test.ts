import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeFetch } from './fetch-wrapper.js';
import { isServiceException } from './service-error.js';

const URL = 'https://example.test/rpc';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function caught(response: Response): Promise<unknown> {
  vi.stubGlobal('fetch', async () => response);
  return safeFetch(URL).catch((error: unknown) => error);
}

describe('safeFetch error contract', () => {
  it('maps a transport failure to a network error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connection reset');
    });

    const error: unknown = await safeFetch(URL).catch((e: unknown) => e);
    expect(isServiceException(error) && error.serviceError.kind).toBe('network');
  });

  it('maps a non-2xx response to an upstream error carrying the status', async () => {
    const error = await caught(new Response('{}', { status: 503 }));
    expect(isServiceException(error) && error.serviceError).toMatchObject({
      kind: 'upstream',
      status: 503,
    });
  });

  it('maps 429 to a rate limit rather than a generic upstream failure', async () => {
    const error = await caught(new Response('{}', { status: 429 }));
    expect(isServiceException(error) && error.serviceError.kind).toBe('rate-limited');
  });

  it('does not leak the upstream body, which can echo a keyed URL', async () => {
    const error = await caught(
      new Response('https://provider.test/?api-key=secret', { status: 500 }),
    );
    expect(isServiceException(error) && error.message).not.toContain('api-key');
  });
});

describe('safeFetch Retry-After', () => {
  it('reads a delay given in seconds', async () => {
    const error = await caught(
      new Response('{}', { status: 429, headers: { 'retry-after': '30' } }),
    );
    expect(isServiceException(error) && error.serviceError).toMatchObject({
      kind: 'rate-limited',
      retryAfterSeconds: 30,
    });
  });

  it('reads a delay given as an HTTP date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const error = await caught(
      new Response('{}', {
        status: 429,
        headers: { 'retry-after': 'Thu, 01 Jan 2026 00:01:00 GMT' },
      }),
    );

    expect(isServiceException(error) && error.serviceError).toMatchObject({
      retryAfterSeconds: 60,
    });
  });

  it('omits the delay when the header is absent', async () => {
    const error = await caught(new Response('{}', { status: 429 }));
    expect(isServiceException(error) && 'retryAfterSeconds' in error.serviceError).toBe(false);
  });

  it('omits the delay when the header is unparseable', async () => {
    const error = await caught(
      new Response('{}', { status: 429, headers: { 'retry-after': 'soon-ish' } }),
    );
    expect(isServiceException(error) && 'retryAfterSeconds' in error.serviceError).toBe(false);
  });

  it('omits a date that has already passed rather than reporting zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));

    const error = await caught(
      new Response('{}', {
        status: 429,
        headers: { 'retry-after': 'Thu, 01 Jan 2026 00:01:00 GMT' },
      }),
    );

    expect(isServiceException(error) && 'retryAfterSeconds' in error.serviceError).toBe(false);
  });
});
