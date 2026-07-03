import { describe, expect, it } from 'vitest';
import {
  deriveSessionKey,
  generateChannelId,
  generateKeyPair,
  open,
  seal,
  wipe,
} from './crypto.js';

describe('key agreement', () => {
  it('derives the same session key on both sides of the exchange', () => {
    const channel = generateChannelId();
    const web = generateKeyPair();
    const wallet = generateKeyPair();

    const webKey = deriveSessionKey(web.secretKey, wallet.publicKeyHex, channel);
    const walletKey = deriveSessionKey(wallet.secretKey, web.publicKeyHex, channel);

    expect(webKey).toEqual(walletKey);
    expect(webKey).toHaveLength(32);
  });

  it('derives different keys on different channels (channel-salted HKDF)', () => {
    const web = generateKeyPair();
    const wallet = generateKeyPair();

    const keyA = deriveSessionKey(web.secretKey, wallet.publicKeyHex, generateChannelId());
    const keyB = deriveSessionKey(web.secretKey, wallet.publicKeyHex, generateChannelId());

    expect(keyA).not.toEqual(keyB);
  });
});

describe('seal/open', () => {
  const channel = generateChannelId();
  const web = generateKeyPair();
  const wallet = generateKeyPair();
  const key = deriveSessionKey(web.secretKey, wallet.publicKeyHex, channel);

  it('round-trips a message under matching AAD', () => {
    const sealed = seal(key, 'aad-1', '{"type":"hello_ack"}');
    expect(open(key, 'aad-1', sealed.nonceHex, sealed.boxHex)).toBe('{"type":"hello_ack"}');
  });

  it('uses a fresh nonce per call (no nonce reuse)', () => {
    const a = seal(key, 'aad', 'same message');
    const b = seal(key, 'aad', 'same message');
    expect(a.nonceHex).not.toBe(b.nonceHex);
    expect(a.boxHex).not.toBe(b.boxHex);
  });

  it('rejects tampered ciphertext', () => {
    const sealed = seal(key, 'aad', 'secret');
    const flipped = (sealed.boxHex[0] === '0' ? '1' : '0') + sealed.boxHex.slice(1);
    expect(() => open(key, 'aad', sealed.nonceHex, flipped)).toThrow();
  });

  it('rejects an AAD mismatch (message bound to another context)', () => {
    const sealed = seal(key, 'channel-a/web/0', 'secret');
    expect(() => open(key, 'channel-b/web/0', sealed.nonceHex, sealed.boxHex)).toThrow();
  });

  it('rejects the wrong key', () => {
    const other = deriveSessionKey(
      generateKeyPair().secretKey,
      generateKeyPair().publicKeyHex,
      channel,
    );
    const sealed = seal(key, 'aad', 'secret');
    expect(() => open(other, 'aad', sealed.nonceHex, sealed.boxHex)).toThrow();
  });
});

describe('wipe', () => {
  it('zeroes the buffer in place', () => {
    const secret = generateKeyPair().secretKey;
    wipe(secret);
    expect(secret.every(byte => byte === 0)).toBe(true);
  });
});
