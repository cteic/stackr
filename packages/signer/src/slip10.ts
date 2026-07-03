import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { wipe } from './bytes.js';
import { SignerError, signerErrorCodes } from './errors.js';

/**
 * SLIP-0010 hierarchical derivation for ed25519 (Solana, Sui). Implemented
 * in-package on top of the audited @noble hmac/sha512 primitives rather than
 * pulling an unaudited helper dependency; correctness is pinned by the
 * official SLIP-0010 ed25519 test vectors in slip10.test.ts.
 *
 * ed25519 supports hardened derivation only — SLIP-0010 defines no normal
 * (non-hardened) child keys for this curve, so any path segment without a
 * hardening marker is rejected.
 */

const CURVE_SEED = utf8ToBytes('ed25519 seed');
const HARDENED_OFFSET = 0x80000000;

export interface Slip10Node {
  privateKey: Uint8Array;
  chainCode: Uint8Array;
}

export function slip10MasterFromSeed(seed: Uint8Array): Slip10Node {
  const digest = hmac(sha512, CURVE_SEED, seed);
  const node = { privateKey: digest.slice(0, 32), chainCode: digest.slice(32) };
  wipe(digest);
  return node;
}

export function slip10DeriveHardenedChild(parent: Slip10Node, index: number): Slip10Node {
  if (!Number.isInteger(index) || index < 0 || index >= HARDENED_OFFSET) {
    throw new SignerError(signerErrorCodes.derivationFailed, 'SLIP-0010 child index out of range');
  }
  const hardenedIndex = index + HARDENED_OFFSET;
  const indexBytes = new Uint8Array(4);
  new DataView(indexBytes.buffer).setUint32(0, hardenedIndex, false);
  const data = concatBytes(new Uint8Array([0]), parent.privateKey, indexBytes);
  const digest = hmac(sha512, parent.chainCode, data);
  const node = { privateKey: digest.slice(0, 32), chainCode: digest.slice(32) };
  wipe(digest, data);
  return node;
}

const PATH_SEGMENT = /^(\d+)'$/;

/**
 * Derive the node at an all-hardened SLIP-0010 path like `m/44'/501'/0'/0'`.
 * The caller owns the returned buffers and must wipe them after use.
 */
export function slip10DerivePath(seed: Uint8Array, path: string): Slip10Node {
  const segments = path.split('/');
  const head = segments.shift();
  if (head !== 'm' || segments.length === 0) {
    throw new SignerError(signerErrorCodes.derivationFailed, 'Malformed SLIP-0010 path');
  }
  let node = slip10MasterFromSeed(seed);
  for (const segment of segments) {
    const match = PATH_SEGMENT.exec(segment);
    if (match === null) {
      throw new SignerError(
        signerErrorCodes.derivationFailed,
        'SLIP-0010 ed25519 requires fully hardened paths',
      );
    }
    const child = slip10DeriveHardenedChild(node, Number(match[1]));
    wipe(node.privateKey, node.chainCode);
    node = child;
  }
  return node;
}
