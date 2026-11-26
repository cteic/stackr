import { describe, expect, it, vi } from 'vitest';
import type { WalletSignRequest } from '@stackr/wallet-link';
import type { Signer } from './contracts/signer';
import { assessMessagePayload, executeSign, renderSignDisplay } from './link-signing';

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

describe('assessMessagePayload', () => {
  it('passes plain text, including emoji, with no warning and a UTF-8 byte count', () => {
    // h(1) é(2) l(1) l(1) o(1) space(1) emoji(4) = 11 bytes.
    expect(assessMessagePayload('héllo \u{1F600}')).toEqual({ byteLength: 11 });
  });

  it('does not flag a short hex-looking word', () => {
    expect(assessMessagePayload('deadbeef').warning).toBeUndefined();
  });

  it('warns on raw hex, with or without 0x', () => {
    expect(assessMessagePayload(`0x${'00'.repeat(20)}`).warning).toMatch(
      /raw hex data \(42 bytes\)/,
    );
    expect(assessMessagePayload('ab'.repeat(16)).warning).toMatch(/raw hex/);
  });

  it('warns on structured JSON data', () => {
    const payload = JSON.stringify({ action: 'transfer', amount: '1000', to: 'SP000' });
    expect(assessMessagePayload(payload).warning).toMatch(/structured data/);
  });

  it('treats text that only starts with a brace as prose', () => {
    expect(assessMessagePayload('{not json} just a note').warning).toBeUndefined();
  });

  it('warns on control characters and bidirectional overrides', () => {
    expect(assessMessagePayload('pay\u0000me').warning).toMatch(/hidden or unreadable/);
    expect(assessMessagePayload('send to \u202Egnp.exe').warning).toMatch(/hidden or unreadable/);
  });

  it('keeps tabs and newlines as ordinary text', () => {
    expect(assessMessagePayload('line one\n\tline two\r\n').warning).toBeUndefined();
  });

  it('warns when the message is too long to show in full', () => {
    expect(assessMessagePayload('x'.repeat(2_001)).warning).toMatch(/too long to show in full/);
  });
});
