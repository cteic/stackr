import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode } from '../base64url.js';
import { encryptPushPayload } from './encrypt.js';

/**
 * RFC 8291 Appendix A — the complete published example. The sender key pair
 * and salt are injected so the output must match the spec byte-for-byte; any
 * drift in the HKDF info strings, key derivation, or record framing fails here
 * before it can fail against a real browser.
 */
const VECTOR = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function vectorSenderKeyPair(): Promise<CryptoKeyPair> {
  const publicBytes = base64UrlDecode(VECTOR.asPublic);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicBytes.slice(1, 33)),
    y: base64UrlEncode(publicBytes.slice(33, 65)),
  };
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { ...jwk, d: VECTOR.asPrivate },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  return { publicKey, privateKey };
}

describe('encryptPushPayload', () => {
  it('reproduces the RFC 8291 Appendix A message byte-for-byte', async () => {
    const body = await encryptPushPayload(
      base64UrlDecode(VECTOR.plaintext),
      base64UrlDecode(VECTOR.uaPublic),
      base64UrlDecode(VECTOR.authSecret),
      { asKeyPair: await vectorSenderKeyPair(), salt: base64UrlDecode(VECTOR.salt) },
    );

    expect(base64UrlEncode(body)).toBe(VECTOR.body);
  });

  it('produces a distinct message with fresh ephemeral keys and salt', async () => {
    const plaintext = base64UrlDecode(VECTOR.plaintext);
    const uaPublic = base64UrlDecode(VECTOR.uaPublic);
    const authSecret = base64UrlDecode(VECTOR.authSecret);

    const first = await encryptPushPayload(plaintext, uaPublic, authSecret);
    const second = await encryptPushPayload(plaintext, uaPublic, authSecret);

    expect(base64UrlEncode(first)).not.toBe(base64UrlEncode(second));
    // Header framing stays constant: salt(16) + rs(4) + idlen(1) + key(65).
    expect(first.length).toBe(second.length);
    expect(first[20]).toBe(65);
  });

  it('rejects a malformed p256dh key instead of deriving garbage', async () => {
    await expect(
      encryptPushPayload(
        base64UrlDecode(VECTOR.plaintext),
        base64UrlDecode(VECTOR.authSecret), // 16 bytes, not a 65-byte point
        base64UrlDecode(VECTOR.authSecret),
      ),
    ).rejects.toThrow('p256dh must be a 65-byte uncompressed P-256 point');
  });

  it('rejects a malformed auth secret', async () => {
    await expect(
      encryptPushPayload(
        base64UrlDecode(VECTOR.plaintext),
        base64UrlDecode(VECTOR.uaPublic),
        base64UrlDecode(VECTOR.salt).slice(0, 8),
      ),
    ).rejects.toThrow('auth secret must be 16 bytes');
  });
});
