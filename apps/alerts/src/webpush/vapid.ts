import { base64UrlDecode, base64UrlEncode, utf8Bytes } from '../base64url.js';

/**
 * VAPID (RFC 8292): a short-lived ES256 JWT proving to the push service that
 * we control the key pair the subscription was created against. Keys are the
 * standard base64url pair (65-byte uncompressed public point, 32-byte private
 * scalar). WebCrypto's raw ECDSA signature (r || s, 64 bytes) is exactly the
 * JWS ES256 form, so no DER conversion is needed.
 */

const TOKEN_TTL_SECONDS = 12 * 60 * 60;

async function importVapidPrivateKey(
  publicKey: Uint8Array<ArrayBuffer>,
  privateKey: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (publicKey.length !== 65 || publicKey[0] !== 4) {
    throw new Error('vapid: public key must be a 65-byte uncompressed P-256 point');
  }
  if (privateKey.length !== 32) {
    throw new Error('vapid: private key must be a 32-byte P-256 scalar');
  }
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(publicKey.slice(1, 33)),
      y: base64UrlEncode(publicKey.slice(33, 65)),
      d: base64UrlEncode(privateKey),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

export interface VapidKeys {
  /** Base64url, 65-byte uncompressed point — the same value the browser subscribed with. */
  publicKey: string;
  /** Base64url, 32-byte scalar. Wrangler secret; never logged. */
  privateKey: string;
  /** Contact for the push service, e.g. `mailto:ops@stackr.ie`. */
  subject: string;
}

/** Build the `Authorization: vapid t=<jwt>, k=<pub>` header for one endpoint. */
export async function vapidAuthorizationHeader(
  endpoint: string,
  keys: VapidKeys,
  now: Date,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = base64UrlEncode(utf8Bytes(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64UrlEncode(
    utf8Bytes(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS,
        sub: keys.subject,
      }),
    ),
  );

  const signingKey = await importVapidPrivateKey(
    base64UrlDecode(keys.publicKey),
    base64UrlDecode(keys.privateKey),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      utf8Bytes(`${header}.${claims}`),
    ),
  );

  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}
