import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';

/**
 * Cryptographic core for Stackr Link: ephemeral X25519 agreement, HKDF key
 * derivation, and XChaCha20-Poly1305 AEAD — audited @noble primitives only.
 *
 * Both peers derive the same 32-byte session key; direction separation comes
 * from the AAD (which binds channel, sender role, and sequence number), not
 * from separate keys. Ephemeral secrets are wiped as soon as the session key
 * exists, so a paired session holds no long-term key material at all.
 */

const HKDF_INFO = 'stackr-link/v1';
const NONCE_BYTES = 24;

export interface LinkKeyPair {
  publicKeyHex: string;
  secretKey: Uint8Array;
}

export function generateKeyPair(): LinkKeyPair {
  const secretKey = x25519.utils.randomPrivateKey();
  return { publicKeyHex: bytesToHex(x25519.getPublicKey(secretKey)), secretKey };
}

/** Random 16-byte channel id, hex-encoded — namespaces the transport topic. */
export function generateChannelId(): string {
  return bytesToHex(randomBytes(16));
}

/** ECDH → HKDF-SHA256, salted with the channel id so keys never cross channels. */
export function deriveSessionKey(
  secretKey: Uint8Array,
  peerPublicKeyHex: string,
  channel: string,
): Uint8Array {
  const shared = x25519.getSharedSecret(secretKey, hexToBytes(peerPublicKeyHex));
  const key = hkdf(sha256, shared, utf8ToBytes(channel), utf8ToBytes(HKDF_INFO), 32);
  wipe(shared);
  return key;
}

/** Best-effort zeroization of secret bytes once they are no longer needed. */
export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}

export interface SealedBox {
  nonceHex: string;
  boxHex: string;
}

/** Encrypt `plaintext` under `key`, binding `aad` — a fresh random nonce per call. */
export function seal(key: Uint8Array, aad: string, plaintext: string): SealedBox {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = xchacha20poly1305(key, nonce, utf8ToBytes(aad));
  return {
    nonceHex: bytesToHex(nonce),
    boxHex: bytesToHex(cipher.encrypt(utf8ToBytes(plaintext))),
  };
}

/** Decrypt and authenticate; throws when the ciphertext or AAD was tampered with. */
export function open(key: Uint8Array, aad: string, nonceHex: string, boxHex: string): string {
  const cipher = xchacha20poly1305(key, hexToBytes(nonceHex), utf8ToBytes(aad));
  return new TextDecoder().decode(cipher.decrypt(hexToBytes(boxHex)));
}
