/**
 * A tiny, self-contained Clarity value codec — just the value shapes the Stacks
 * liquidation-health reads (Zest, Granite) send and receive over Hiro's
 * read-only call endpoint.
 *
 * Why hand-rolled rather than `@stacks/transactions`: that package is not in
 * this workspace's dependency tree (it would only arrive transitively via
 * `@stacks/connect`, which lives in `apps/web`, not `@stackr/services`), and
 * pulling a large transaction-building/signing library into the services layer
 * just to (de)serialize a handful of read-only value shapes is far more than we
 * need. The build plan for ADR 0016 explicitly sanctions "a tiny local decoder
 * for the value shapes you need". This is that decoder, plus the matching
 * encoder for the arguments we pass.
 *
 * Wire format is Clarity's SIP-005 value serialization: a 1-byte type prefix
 * followed by a type-specific body. We implement only the prefixes our reads
 * use; an unrecognised prefix throws so a wrong shape fails loud at the adapter
 * boundary (the anti-corruption rule — see `validate.ts`) rather than silently
 * mis-decoding into a bad position.
 */

/** SIP-005 Clarity value type prefixes (only the ones our reads use). */
const TYPE_INT = 0x00;
const TYPE_UINT = 0x01;
const TYPE_BUFFER = 0x02;
const TYPE_BOOL_TRUE = 0x03;
const TYPE_BOOL_FALSE = 0x04;
const TYPE_PRINCIPAL_STANDARD = 0x05;
const TYPE_PRINCIPAL_CONTRACT = 0x06;
const TYPE_RESPONSE_OK = 0x07;
const TYPE_RESPONSE_ERR = 0x08;
const TYPE_OPTIONAL_NONE = 0x09;
const TYPE_OPTIONAL_SOME = 0x0a;
const TYPE_LIST = 0x0b;
const TYPE_TUPLE = 0x0c;
const TYPE_STRING_ASCII = 0x0d;
const TYPE_STRING_UTF8 = 0x0e;

/**
 * Decoded Clarity value. A tagged union over the shapes our reads return;
 * `uint`/`int` carry a `bigint` so the 128-bit on-chain values stay exact, and
 * a `principal` keeps the raw serialized bytes (type prefix included) so it can
 * be re-emitted verbatim as the argument to a follow-up read without a lossy
 * round-trip through a string.
 */
export type ClarityValue =
  | { kind: 'uint'; value: bigint }
  | { kind: 'int'; value: bigint }
  | { kind: 'bool'; value: boolean }
  | { kind: 'optional'; value: ClarityValue | null }
  | { kind: 'response'; ok: boolean; value: ClarityValue }
  | { kind: 'tuple'; data: Record<string, ClarityValue> }
  | { kind: 'list'; values: ClarityValue[] }
  | { kind: 'principal'; serialized: Uint8Array }
  | { kind: 'buffer'; bytes: Uint8Array }
  | { kind: 'string'; value: string };

const HEX = '0123456789abcdef';

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`clarity: odd-length hex string (${clean.length})`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`clarity: invalid hex at byte ${i}`);
    }
    bytes[i] = byte;
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return out;
}

/** A forward cursor over the serialized buffer, threaded through the decoder. */
interface Cursor {
  readonly bytes: Uint8Array;
  offset: number;
}

function readByte(cursor: Cursor): number {
  if (cursor.offset >= cursor.bytes.length) {
    throw new Error('clarity: unexpected end of input');
  }
  const byte = cursor.bytes[cursor.offset];
  cursor.offset += 1;
  return byte;
}

function readBytes(cursor: Cursor, length: number): Uint8Array {
  if (cursor.offset + length > cursor.bytes.length) {
    throw new Error('clarity: unexpected end of input');
  }
  const slice = cursor.bytes.slice(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return slice;
}

/** Big-endian unsigned 32-bit length prefix (lists, tuples, buffers, strings). */
function readUint32BE(cursor: Cursor): number {
  const bytes = readBytes(cursor, 4);
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}

/** Big-endian unsigned 128-bit integer (16 bytes). */
function readBigUintBE(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

/** Big-endian signed 128-bit integer (two's complement, 16 bytes). */
function readBigIntBE(bytes: Uint8Array): bigint {
  const unsigned = readBigUintBE(bytes);
  const bits = BigInt(bytes.length * 8);
  const signBit = 1n << (bits - 1n);
  return unsigned >= signBit ? unsigned - (1n << bits) : unsigned;
}

function decodeValue(cursor: Cursor): ClarityValue {
  const type = readByte(cursor);
  switch (type) {
    case TYPE_INT:
      return { kind: 'int', value: readBigIntBE(readBytes(cursor, 16)) };
    case TYPE_UINT:
      return { kind: 'uint', value: readBigUintBE(readBytes(cursor, 16)) };
    case TYPE_BUFFER:
      return { kind: 'buffer', bytes: readBytes(cursor, readUint32BE(cursor)) };
    case TYPE_BOOL_TRUE:
      return { kind: 'bool', value: true };
    case TYPE_BOOL_FALSE:
      return { kind: 'bool', value: false };
    case TYPE_PRINCIPAL_STANDARD: {
      // 1 version byte + 20-byte hash160.
      const body = readBytes(cursor, 21);
      return { kind: 'principal', serialized: prefixed(type, body) };
    }
    case TYPE_PRINCIPAL_CONTRACT: {
      // version (1) + hash160 (20) + name-length (1) + name.
      const head = readBytes(cursor, 21);
      const nameLength = readByte(cursor);
      const name = readBytes(cursor, nameLength);
      return {
        kind: 'principal',
        serialized: prefixed(type, concatBytes(head, Uint8Array.of(nameLength), name)),
      };
    }
    case TYPE_RESPONSE_OK:
      return { kind: 'response', ok: true, value: decodeValue(cursor) };
    case TYPE_RESPONSE_ERR:
      return { kind: 'response', ok: false, value: decodeValue(cursor) };
    case TYPE_OPTIONAL_NONE:
      return { kind: 'optional', value: null };
    case TYPE_OPTIONAL_SOME:
      return { kind: 'optional', value: decodeValue(cursor) };
    case TYPE_LIST: {
      const length = readUint32BE(cursor);
      const values: ClarityValue[] = [];
      for (let i = 0; i < length; i++) {
        values.push(decodeValue(cursor));
      }
      return { kind: 'list', values };
    }
    case TYPE_TUPLE: {
      const length = readUint32BE(cursor);
      const data: Record<string, ClarityValue> = {};
      for (let i = 0; i < length; i++) {
        const nameLength = readByte(cursor);
        const name = new TextDecoder().decode(readBytes(cursor, nameLength));
        data[name] = decodeValue(cursor);
      }
      return { kind: 'tuple', data };
    }
    case TYPE_STRING_ASCII:
    case TYPE_STRING_UTF8: {
      const bytes = readBytes(cursor, readUint32BE(cursor));
      return { kind: 'string', value: new TextDecoder().decode(bytes) };
    }
    default:
      throw new Error(`clarity: unsupported value type 0x${type.toString(16)}`);
  }
}

function prefixed(type: number, body: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(type), body);
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Deserialize a hex-encoded Clarity value (as Hiro returns in the `result`
 * field of a `call-read` response) into our tagged union. Throws if the buffer
 * does not consume cleanly, so trailing garbage can't masquerade as a valid
 * decode.
 */
export function deserializeClarityHex(hex: string): ClarityValue {
  const cursor: Cursor = { bytes: hexToBytes(hex), offset: 0 };
  const value = decodeValue(cursor);
  if (cursor.offset !== cursor.bytes.length) {
    throw new Error(
      `clarity: ${cursor.bytes.length - cursor.offset} trailing byte(s) after decode`,
    );
  }
  return value;
}

/** Unwrap a `(response ok err)`, throwing the decoded value on `err`. */
export function expectOk(value: ClarityValue): ClarityValue {
  if (value.kind !== 'response') {
    throw new Error(`clarity: expected a response, got ${value.kind}`);
  }
  if (!value.ok) {
    throw new Error('clarity: read returned (err ...)');
  }
  return value.value;
}

/** Unwrap an `(optional ...)` to its inner value or `null` for `none`. */
export function unwrapOptional(value: ClarityValue): ClarityValue | null {
  if (value.kind !== 'optional') {
    throw new Error(`clarity: expected an optional, got ${value.kind}`);
  }
  return value.value;
}

/** Read a named `uint`/`int` field off a decoded tuple as a `bigint`. */
export function tupleUint(value: ClarityValue, field: string): bigint {
  if (value.kind !== 'tuple') {
    throw new Error(`clarity: expected a tuple, got ${value.kind}`);
  }
  const member = value.data[field];
  if (member === undefined) {
    throw new Error(`clarity: tuple is missing field "${field}"`);
  }
  if (member.kind !== 'uint' && member.kind !== 'int') {
    throw new Error(`clarity: tuple field "${field}" is ${member.kind}, expected a number`);
  }
  return member.value;
}

/** Read a required string member off a decoded tuple. */
export function tupleString(value: ClarityValue, field: string): string {
  if (value.kind !== 'tuple') {
    throw new Error(`clarity: expected a tuple, got ${value.kind}`);
  }
  const member = value.data[field];
  if (member === undefined) {
    throw new Error(`clarity: tuple is missing field "${field}"`);
  }
  if (member.kind !== 'string') {
    throw new Error(`clarity: tuple field "${field}" is ${member.kind}, expected a string`);
  }
  return member.value;
}

// --- c32 address decoding (Stacks "SP…" → version + hash160) ----------------

/**
 * Crockford-variant base-32 alphabet Stacks uses (no I, L, O, U). Verbatim from
 * the reference `c32check` implementation.
 */
const C32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Normalize the visually-ambiguous characters before decoding (per c32check). */
function c32normalize(input: string): string {
  return input.toUpperCase().replace(/O/g, '0').replace(/[LI]/g, '1');
}

/**
 * Decode a c32 string (the body after the version char) to a hex string. This
 * is the reference `c32check` `c32decode` algorithm reproduced exactly — the
 * carry/bit handling is fiddly enough that it is copied verbatim rather than
 * re-derived.
 */
function c32decode(c32input: string): string {
  const normalized = c32normalize(c32input);
  if (!new RegExp(`^[${C32}]*$`).test(normalized)) {
    throw new Error('clarity: not a c32-encoded string');
  }

  const zeroPrefix = normalized.match(new RegExp(`^${C32[0]}*`));
  const numLeadingZeroBytes = zeroPrefix ? zeroPrefix[0].length : 0;

  let res: string[] = [];
  let carry = 0;
  let carryBits = 0;
  for (let i = normalized.length - 1; i >= 0; i--) {
    if (carryBits === 4) {
      res.unshift(HEX[carry]);
      carryBits = 0;
      carry = 0;
    }
    const currentCode = C32.indexOf(normalized[i]) << carryBits;
    const currentValue = currentCode + carry;
    const currentHexDigit = HEX[currentValue % 16];
    carryBits += 1;
    carry = currentValue >> 4;
    res.unshift(currentHexDigit);
  }
  res.unshift(HEX[carry]);

  if (res.length % 2 === 1) {
    res.unshift('0');
  }

  let hexLeadingZeros = 0;
  for (let i = 0; i < res.length; i++) {
    if (res[i] !== '0') {
      break;
    }
    hexLeadingZeros++;
  }
  res = res.slice(hexLeadingZeros - (hexLeadingZeros % 2));

  let hexStr = res.join('');
  for (let i = 0; i < numLeadingZeroBytes; i++) {
    hexStr = `00${hexStr}`;
  }
  return hexStr;
}

/**
 * Decode a Stacks address (`SP…` / `ST…`) to its version byte and 20-byte
 * hash160. The trailing 4-byte checksum is dropped without verification: these
 * addresses come from the already-validated wallet list, and verifying the
 * checksum would need a double-SHA-256 (and thus a hashing dependency) for no
 * extra safety at this boundary.
 */
export function decodeStacksAddress(address: string): { version: number; hash160: Uint8Array } {
  if (address.length <= 5 || address[0] !== 'S') {
    throw new Error(`clarity: invalid Stacks address "${address}"`);
  }
  const normalized = c32normalize(address.slice(1));
  const version = C32.indexOf(normalized[0]);
  if (version < 0) {
    throw new Error(`clarity: invalid Stacks address version in "${address}"`);
  }
  // The body decodes to hash160 (20 bytes) + checksum (4 bytes) = 48 hex chars.
  const dataHex = c32decode(normalized.slice(1)).padStart(48, '0');
  return { version, hash160: hexToBytes(dataHex.slice(0, 40)) };
}

// --- Clarity argument encoding (values we pass to call-read) -----------------

/**
 * Clarity argument we serialize for a `call-read` request. `raw` re-emits the
 * already-serialized bytes of a principal we decoded from a previous read, so a
 * collateral principal can be fed straight back into the next call.
 */
export type ClarityArg =
  | { kind: 'uint'; value: bigint }
  | { kind: 'standard-principal'; address: string }
  | { kind: 'contract-principal'; contractId: string }
  | { kind: 'tuple'; data: Record<string, ClarityArg> }
  | { kind: 'list'; values: ClarityArg[] }
  | { kind: 'string-ascii'; value: string }
  | { kind: 'raw'; serialized: Uint8Array };

function uint32BE(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function uint128BE(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error('clarity: cannot encode a negative value as uint');
  }
  const bytes = new Uint8Array(16);
  let remaining = value;
  for (let i = 15; i >= 0; i--) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) {
    throw new Error('clarity: uint exceeds 128 bits');
  }
  return bytes;
}

function encodeContractPrincipalBody(contractId: string): Uint8Array {
  const [stxAddress, contractName] = contractId.split('.');
  if (stxAddress === undefined || contractName === undefined) {
    throw new Error(`clarity: invalid contract id "${contractId}"`);
  }
  const { version, hash160 } = decodeStacksAddress(stxAddress);
  const nameBytes = new TextEncoder().encode(contractName);
  return concatBytes(Uint8Array.of(version), hash160, Uint8Array.of(nameBytes.length), nameBytes);
}

function encodeArg(arg: ClarityArg): Uint8Array {
  switch (arg.kind) {
    case 'uint':
      return prefixed(TYPE_UINT, uint128BE(arg.value));
    case 'standard-principal': {
      const { version, hash160 } = decodeStacksAddress(arg.address);
      return prefixed(TYPE_PRINCIPAL_STANDARD, concatBytes(Uint8Array.of(version), hash160));
    }
    case 'contract-principal':
      return prefixed(TYPE_PRINCIPAL_CONTRACT, encodeContractPrincipalBody(arg.contractId));
    case 'tuple': {
      // Clarity serializes tuple members in lexicographic key order.
      const keys = Object.keys(arg.data).sort();
      const chunks: Uint8Array[] = [uint32BE(keys.length)];
      for (const key of keys) {
        const nameBytes = new TextEncoder().encode(key);
        chunks.push(Uint8Array.of(nameBytes.length), nameBytes, encodeArg(arg.data[key]));
      }
      return prefixed(TYPE_TUPLE, concatBytes(...chunks));
    }
    case 'list': {
      const chunks: Uint8Array[] = [uint32BE(arg.values.length)];
      for (const value of arg.values) {
        chunks.push(encodeArg(value));
      }
      return prefixed(TYPE_LIST, concatBytes(...chunks));
    }
    case 'string-ascii': {
      const bytes = new TextEncoder().encode(arg.value);
      if (bytes.length !== arg.value.length) {
        throw new Error(`clarity: "${arg.value}" is not ASCII`);
      }
      return prefixed(TYPE_STRING_ASCII, concatBytes(uint32BE(bytes.length), bytes));
    }
    case 'raw':
      return arg.serialized;
  }
}

/** Serialize a Clarity argument to the `0x`-prefixed hex `call-read` expects. */
export function serializeClarityArg(arg: ClarityArg): string {
  return `0x${bytesToHex(encodeArg(arg))}`;
}
