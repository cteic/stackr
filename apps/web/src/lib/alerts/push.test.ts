import { describe, expect, it } from 'vitest';
import { extractSubscriptionKeys, urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url (with url-safe chars, no padding) to the raw bytes', () => {
    // 'aGVsbG8_LX4' is base64url for the bytes of 'hello?-~'.
    const bytes = urlBase64ToUint8Array('aGVsbG8_LX4');
    expect(new TextDecoder().decode(bytes)).toBe('hello?-~');
  });

  it('round-trips a realistic 65-byte uncompressed P-256 public key', () => {
    const key = new Uint8Array(65).map((_, i) => (i * 7) % 256);
    let binary = '';
    for (const byte of key) {
      binary += String.fromCharCode(byte);
    }
    const base64Url = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

    expect([...urlBase64ToUint8Array(base64Url)]).toEqual([...key]);
  });
});

describe('extractSubscriptionKeys', () => {
  it('pulls endpoint and keys from a PushSubscription JSON shape', () => {
    const keys = extractSubscriptionKeys({
      endpoint: 'https://push.example.com/send/abc',
      expirationTime: null,
      keys: { p256dh: 'client-public-key', auth: 'auth-secret' },
    });

    expect(keys).toEqual({
      endpoint: 'https://push.example.com/send/abc',
      p256dh: 'client-public-key',
      authKey: 'auth-secret',
    });
  });

  it('rejects a subscription with missing keys instead of storing junk', () => {
    expect(() =>
      extractSubscriptionKeys({ endpoint: 'https://push.example.com/send/abc', keys: {} }),
    ).toThrow('push subscription missing endpoint or keys');
  });

  it('rejects a non-object payload', () => {
    expect(() => extractSubscriptionKeys(null)).toThrow(
      'push subscription missing endpoint or keys',
    );
  });
});
