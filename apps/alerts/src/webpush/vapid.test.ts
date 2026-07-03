import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode, utf8Bytes } from '../base64url.js';
import { vapidAuthorizationHeader } from './vapid.js';

async function generateVapidPair(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ]);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  if (typeof jwk.d !== 'string') {
    throw new Error('test: exported JWK missing private scalar');
  }
  return { publicKey: base64UrlEncode(publicRaw), privateKey: jwk.d };
}

function decodeJwtPart(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
}

describe('vapidAuthorizationHeader', () => {
  it('emits a verifiable ES256 JWT bound to the endpoint origin', async () => {
    const keys = await generateVapidPair();
    const now = new Date('2026-07-03T12:00:00Z');

    const header = await vapidAuthorizationHeader(
      'https://push.example.net/send/abc123',
      { ...keys, subject: 'mailto:ops@stackr.ie' },
      now,
    );

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    if (match === null) {
      return;
    }
    expect(match[2]).toBe(keys.publicKey);

    const [headerPart, claimsPart, signaturePart] = match[1].split('.');
    expect(decodeJwtPart(headerPart)).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(decodeJwtPart(claimsPart)).toEqual({
      aud: 'https://push.example.net',
      exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
      sub: 'mailto:ops@stackr.ie',
    });

    // The signature must verify under the advertised public key.
    const publicBytes = base64UrlDecode(keys.publicKey);
    const verifyKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: base64UrlEncode(publicBytes.slice(1, 33)),
        y: base64UrlEncode(publicBytes.slice(33, 65)),
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      base64UrlDecode(signaturePart),
      utf8Bytes(`${headerPart}.${claimsPart}`),
    );
    expect(valid).toBe(true);
  });

  it('rejects keys of the wrong shape', async () => {
    const keys = await generateVapidPair();
    await expect(
      vapidAuthorizationHeader(
        'https://push.example.net/send/abc123',
        { publicKey: 'AAAA', privateKey: keys.privateKey, subject: 'mailto:ops@stackr.ie' },
        new Date(),
      ),
    ).rejects.toThrow('public key must be a 65-byte uncompressed P-256 point');
  });
});
