import { concatBytes, utf8Bytes } from '../base64url.js';

/**
 * Web-push payload encryption per RFC 8291 (aes128gcm content coding,
 * RFC 8188), on WebCrypto only — no Node crypto, so it runs in a Worker.
 * Correctness is pinned by a unit test against the full example in
 * RFC 8291 Appendix A.
 */

const RECORD_SIZE = 4096;
const KEY_INFO_PREFIX = 'WebPush: info\0';
const CEK_INFO = 'Content-Encoding: aes128gcm\0';
const NONCE_INFO = 'Content-Encoding: nonce\0';

/** One HKDF-SHA-256 extract+expand via WebCrypto. */
async function hkdf(
  ikm: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  lengthBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    lengthBytes * 8,
  );
  return new Uint8Array(bits);
}

export interface EncryptOptions {
  /** Application-server (sender) key pair; generated fresh per message when omitted. */
  asKeyPair?: CryptoKeyPair;
  /** 16-byte salt; random when omitted. Injectable for the RFC test vector. */
  salt?: Uint8Array<ArrayBuffer>;
}

/**
 * Encrypt `plaintext` for a push subscription. `uaPublic` is the subscription's
 * `p256dh` (65-byte uncompressed P-256 point) and `authSecret` its 16-byte
 * `auth` secret. Returns the complete aes128gcm body: header block + ciphertext.
 */
export async function encryptPushPayload(
  plaintext: Uint8Array<ArrayBuffer>,
  uaPublic: Uint8Array<ArrayBuffer>,
  authSecret: Uint8Array<ArrayBuffer>,
  options: EncryptOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (uaPublic.length !== 65) {
    throw new Error('webpush: p256dh must be a 65-byte uncompressed P-256 point');
  }
  if (authSecret.length !== 16) {
    throw new Error('webpush: auth secret must be 16 bytes');
  }

  const asKeyPair =
    options.asKeyPair ??
    (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));

  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeyPair.privateKey, 256),
  );

  // RFC 8291 §3.3–3.4: combine the ECDH secret with the auth secret, bound to
  // both public keys, then derive the content key and nonce under the salt.
  const keyInfo = concatBytes(utf8Bytes(KEY_INFO_PREFIX), uaPublic, asPublic);
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);
  const contentEncryptionKey = await hkdf(ikm, salt, utf8Bytes(CEK_INFO), 16);
  const nonce = await hkdf(ikm, salt, utf8Bytes(NONCE_INFO), 12);

  // RFC 8188 §2: a single record, terminated by the 0x02 last-record delimiter.
  const record = concatBytes(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', contentEncryptionKey, 'AES-GCM', false, [
    'encrypt',
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record),
  );

  // RFC 8188 §2.1 header: salt(16) | record size(4, BE) | key id length(1) | key id.
  const header = new Uint8Array(new ArrayBuffer(16 + 4 + 1 + asPublic.length));
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concatBytes(header, ciphertext);
}
