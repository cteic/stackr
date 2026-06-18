import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeFetch } from './fetch-wrapper';
import { isServiceException } from './service-error';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeFetch — uniform error contract', () => {
  it('maps a transport failure to a structured network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const error: unknown = await safeFetch('https://example.test/x').catch(e => e);

    if (!isServiceException(error)) throw new Error('expected a ServiceException');
    expect(error.serviceError).toEqual({ kind: 'network', message: 'Failed to fetch' });
  });

  it('maps a non-2xx response to a structured upstream error and discards the body', async () => {
    const json = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, statusText: 'Service Unavailable', json })),
    );

    const error: unknown = await safeFetch('https://example.test/x').catch(e => e);

    if (!isServiceException(error)) throw new Error('expected a ServiceException');
    expect(error.serviceError).toMatchObject({ kind: 'upstream', status: 503 });
    // The upstream body is never read — echoing it could leak keyed URLs.
    expect(json).not.toHaveBeenCalled();
  });

  it('returns the response untouched on a 2xx', async () => {
    const response = { ok: true, status: 200, json: async () => ({ ok: 1 }) };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(safeFetch('https://example.test/x')).resolves.toBe(response);
  });

  it('forwards method, headers and body for POST callers', async () => {
    const fn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fn);

    await safeFetch('https://example.test/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"jsonrpc":"2.0"}',
    });

    expect(fn).toHaveBeenCalledWith('https://example.test/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"jsonrpc":"2.0"}',
    });
  });
});
