import { describe, expect, it, vi, afterEach } from 'vitest';
import { assertValidAddress } from './address-guard.js';
import { isServiceException } from './service-error.js';
import { fetchBtcBalance } from './btc.js';
import { fetchTransactions } from './transactions.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('assertValidAddress', () => {
  it('passes a well-formed address through silently', () => {
    expect(() =>
      assertValidAddress('eth', '0x00000000219ab540356cBB839Cbe05303d7705Fa'),
    ).not.toThrow();
  });

  it('throws a typed invalid-address ServiceException', () => {
    try {
      assertValidAddress('eth', 'not-an-address');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isServiceException(error)).toBe(true);
      if (isServiceException(error)) {
        expect(error.serviceError).toEqual({ kind: 'invalid-address', address: 'not-an-address' });
      }
    }
  });
});

describe('adapters behind the guard', () => {
  it('never lets an invalid address reach a fetch (balance)', async () => {
    const fn = vi.fn();
    vi.stubGlobal('fetch', fn);

    await expect(fetchBtcBalance('"><script>')).rejects.toThrow('Invalid address');
    expect(fn).not.toHaveBeenCalled();
  });

  it('never lets an invalid address reach a fetch (transactions)', async () => {
    const fn = vi.fn();
    vi.stubGlobal('fetch', fn);

    await expect(fetchTransactions('sol', '../../etc/passwd')).rejects.toThrow('Invalid address');
    expect(fn).not.toHaveBeenCalled();
  });
});
