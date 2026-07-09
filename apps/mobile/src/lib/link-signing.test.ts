import { describe, expect, it, vi } from 'vitest';
import type { WalletSignRequest } from '@stackr/wallet-link';
import type { Signer } from './contracts/signer';
import { executeSign, renderSignDisplay } from './link-signing';

function request(overrides: Partial<WalletSignRequest>): WalletSignRequest {
  return { id: 'req-1', chain: 'stx', kind: 'message', payload: 'Sign in to Stackr', ...overrides };
}

function fakeSigner(overrides: Partial<Signer> = {}): Signer {
  function unused(): Promise<never> {
    return Promise.reject(new Error('not under test'));
  }
  const base: Signer = {
    initialize: unused,
    isInitialized: () => Promise.resolve(true),
    revealMnemonic: unused,
    getAccount: unused,
    signMessage: vi.fn(() => Promise.resolve({ signature: 'deadbeef', publicKey: '02aa' })),
    signTransaction: unused,
    wipe: unused,
  };
  return { ...base, ...overrides };
}

describe('executeSign', () => {
  it('signs a message on a locally-derived chain via the on-device signer', async () => {
    const signer = fakeSigner();
    const result = await executeSign(signer, request({ chain: 'btc', payload: 'hello' }));

    expect(signer.signMessage).toHaveBeenCalledWith('btc', 0, 'hello');
    expect(result).toEqual({ status: 'approved', signature: 'deadbeef' });
  });

  it('rejects Privy-held chains with an explicit reason', async () => {
    const result = await executeSign(fakeSigner(), request({ chain: 'eth' }));
    expect(result).toEqual({
      status: 'rejected',
      reason: 'eth signing over Stackr Link is not supported yet',
    });
  });

  it('rejects transaction payloads with an explicit reason', async () => {
    const result = await executeSign(fakeSigner(), request({ kind: 'transaction' }));
    expect(result).toEqual({
      status: 'rejected',
      reason: 'transaction signing over Stackr Link is not supported yet',
    });
  });

  it('maps a signer failure to a generic rejection (no internals leak)', async () => {
    const signer = fakeSigner({
      signMessage: () => Promise.reject(new Error('keystore: secret unreadable at /var/1')),
    });
    const result = await executeSign(signer, request({}));
    expect(result).toEqual({ status: 'rejected', reason: 'signer error' });
  });
});

describe('renderSignDisplay', () => {
  it('shows the message body directly', () => {
    expect(renderSignDisplay(request({ payload: 'Sign in\nnonce: 1' }))).toBe('Sign in\nnonce: 1');
  });

  it('truncates oversized payloads', () => {
    const display = renderSignDisplay(request({ payload: 'x'.repeat(5_000) }));
    expect(display.length).toBeLessThan(2_100);
    expect(display.endsWith('…')).toBe(true);
  });
});
