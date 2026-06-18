import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertValidAddress } from './address-guard';
import { isServiceException } from './service-error';
import { fetchBalance } from './index';
import { fetchTransactions } from './transactions';

const VALID = {
  btc: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  eth: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  stx: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86BZWVF6JM75H',
  sol: 'So11111111111111111111111111111111111111112',
  sui: `0x${'b'.repeat(64)}`,
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('assertValidAddress — defense-in-depth gate', () => {
  it('throws a structured invalid-address error on a path-traversal-ish string', () => {
    let caught: unknown;
    try {
      assertValidAddress('btc', '../../etc/passwd');
    } catch (e) {
      caught = e;
    }

    if (!isServiceException(caught)) throw new Error('expected a ServiceException');
    expect(caught.serviceError).toEqual({ kind: 'invalid-address', address: '../../etc/passwd' });
  });

  it('rejects a well-formed address from the wrong chain', () => {
    // A valid BTC address must not pass as an ETH address.
    expect(() => assertValidAddress('eth', VALID.btc)).toThrow();
  });

  it('accepts a valid address for each chain', () => {
    expect(() => assertValidAddress('btc', VALID.btc)).not.toThrow();
    expect(() => assertValidAddress('eth', VALID.eth)).not.toThrow();
    expect(() => assertValidAddress('stx', VALID.stx)).not.toThrow();
    expect(() => assertValidAddress('sol', VALID.sol)).not.toThrow();
    expect(() => assertValidAddress('sui', VALID.sui)).not.toThrow();
  });
});

describe('fetchBalance / fetchTransactions — reject before any fetch', () => {
  it('rejects an invalid address without issuing a network request (balance)', async () => {
    const fn = vi.fn();
    vi.stubGlobal('fetch', fn);

    const error: unknown = await fetchBalance('btc', 'not%2Fan%2Faddress/../../').catch(e => e);

    if (!isServiceException(error)) throw new Error('expected a ServiceException');
    expect(error.serviceError.kind).toBe('invalid-address');
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects a wrong-chain address without issuing a network request (transactions)', async () => {
    const fn = vi.fn();
    vi.stubGlobal('fetch', fn);

    // A SOL address must not be accepted on the STX path.
    const error: unknown = await fetchTransactions('stx', VALID.sol).catch(e => e);

    if (!isServiceException(error)) throw new Error('expected a ServiceException');
    expect(error.serviceError.kind).toBe('invalid-address');
    expect(fn).not.toHaveBeenCalled();
  });
});
