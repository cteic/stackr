import { describe, expect, it } from 'vitest';
import { ServiceException } from '@stackr/services';
import { isRateLimitError, retryRemoteRead } from './retry.js';

function rateLimited(): ServiceException {
  return new ServiceException({ kind: 'rate-limited', message: 'rate limit exceeded' });
}

describe('retryRemoteRead', () => {
  it('does not retry a rate limit — the window has to pass, not be hammered', () => {
    expect(retryRemoteRead(0, rateLimited())).toBe(false);
  });

  it('does not retry an invalid address — it is wrong on every attempt', () => {
    const error = new ServiceException({ kind: 'invalid-address', address: 'nope' });
    expect(retryRemoteRead(0, error)).toBe(false);
  });

  it('retries an upstream failure twice and then gives up', () => {
    const error = new ServiceException({ kind: 'upstream', status: 502, message: 'bad gateway' });
    expect(retryRemoteRead(0, error)).toBe(true);
    expect(retryRemoteRead(1, error)).toBe(true);
    expect(retryRemoteRead(2, error)).toBe(false);
  });

  it('retries a transport failure', () => {
    const error = new ServiceException({ kind: 'network', message: 'connection reset' });
    expect(retryRemoteRead(0, error)).toBe(true);
  });

  it('retries a malformed payload, which is often a transient upstream blip', () => {
    const error = new ServiceException({ kind: 'parse', message: 'unexpected shape' });
    expect(retryRemoteRead(0, error)).toBe(true);
  });

  it('retries an error that did not come from the services layer', () => {
    expect(retryRemoteRead(0, new Error('something else'))).toBe(true);
    expect(retryRemoteRead(2, new Error('something else'))).toBe(false);
  });
});

describe('isRateLimitError', () => {
  it('identifies a rate-limit rejection', () => {
    expect(isRateLimitError(rateLimited())).toBe(true);
  });

  it('does not mistake another upstream failure for a rate limit', () => {
    const error = new ServiceException({ kind: 'upstream', status: 500, message: 'boom' });
    expect(isRateLimitError(error)).toBe(false);
  });

  it('is false for a plain error and for a non-error value', () => {
    expect(isRateLimitError(new Error('nope'))).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});
