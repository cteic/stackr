import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  decodeStacksAddress,
  deserializeClarityHex,
  expectOk,
  serializeClarityArg,
  tupleUint,
  unwrapOptional,
} from './clarity.js';

describe('deserializeClarityHex', () => {
  it('decodes a uint to an exact bigint', () => {
    // 0x01 (uint) + 16-byte big-endian 5
    const value = deserializeClarityHex('0x0100000000000000000000000000000005');
    expect(value).toEqual({ kind: 'uint', value: 5n });
  });

  it('decodes a 128-bit uint without precision loss', () => {
    // 2^80, far beyond Number.MAX_SAFE_INTEGER
    const value = deserializeClarityHex('0x0100000000000100000000000000000000');
    expect(value).toEqual({ kind: 'uint', value: 2n ** 80n });
  });

  it('decodes booleans and (none)', () => {
    expect(deserializeClarityHex('0x03')).toEqual({ kind: 'bool', value: true });
    expect(deserializeClarityHex('0x04')).toEqual({ kind: 'bool', value: false });
    expect(deserializeClarityHex('0x09')).toEqual({ kind: 'optional', value: null });
  });

  it('decodes a hand-built (tuple (a u1)) fixture', () => {
    // 0x0c + count(00000001) + namelen(01) + "a"(61) + uint 1
    const value = deserializeClarityHex('0x0c000000010161' + '0100000000000000000000000000000001');
    expect(value).toEqual({ kind: 'tuple', data: { a: { kind: 'uint', value: 1n } } });
  });

  it('unwraps (ok ...) and (some ...) wrappers', () => {
    const ok = deserializeClarityHex('0x070100000000000000000000000000000007');
    expect(expectOk(ok)).toEqual({ kind: 'uint', value: 7n });

    const some = deserializeClarityHex('0x0a0100000000000000000000000000000009');
    expect(unwrapOptional(some)).toEqual({ kind: 'uint', value: 9n });
  });

  it('throws on (err ...) via expectOk and on trailing bytes', () => {
    const err = deserializeClarityHex('0x080100000000000000000000000000000001');
    expect(() => expectOk(err)).toThrow(/err/);
    // a valid uint followed by a stray byte must not silently decode
    expect(() => deserializeClarityHex('0x010000000000000000000000000000000599')).toThrow(
      /trailing/,
    );
  });

  it('throws on an unsupported type prefix', () => {
    expect(() => deserializeClarityHex('0xff')).toThrow(/unsupported/);
  });
});

describe('tupleUint', () => {
  it('reads a named uint field as a bigint', () => {
    const tuple = deserializeClarityHex('0x0c000000010161' + '0100000000000000000000000000000064');
    expect(tupleUint(tuple, 'a')).toBe(100n);
  });

  it('throws when the field is absent', () => {
    const tuple = deserializeClarityHex('0x0c000000010161' + '0100000000000000000000000000000001');
    expect(() => tupleUint(tuple, 'missing')).toThrow(/missing field/);
  });
});

describe('decodeStacksAddress', () => {
  // Ground-truth vector from the reference c32check docs:
  // SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7 -> version 22, hash160 a46f…d39d
  it('decodes the canonical address vector to its version + hash160', () => {
    const { version, hash160 } = decodeStacksAddress('SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7');
    expect(version).toBe(22);
    expect(bytesToHex(hash160)).toBe('a46ff88886c2ef9762d970b4d2c63678835bd39d');
  });

  it('rejects a non-Stacks address', () => {
    expect(() => decodeStacksAddress('0xdeadbeef')).toThrow(/invalid Stacks address/);
  });
});

describe('serializeClarityArg', () => {
  it('encodes a standard principal (0x05 + version + hash160)', () => {
    const hex = serializeClarityArg({
      kind: 'standard-principal',
      address: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7',
    });
    expect(hex).toBe('0x0516a46ff88886c2ef9762d970b4d2c63678835bd39d');
  });

  it('encodes a contract principal (0x06 + … + name)', () => {
    const hex = serializeClarityArg({
      kind: 'contract-principal',
      contractId: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7.foo',
    });
    // 06 + version(16) + hash160 + namelen(03) + "foo"(666f6f)
    expect(hex).toBe('0x0616a46ff88886c2ef9762d970b4d2c63678835bd39d03666f6f');
  });

  it('encodes a uint that round-trips through the decoder', () => {
    const hex = serializeClarityArg({ kind: 'uint', value: 123_456_789n });
    expect(deserializeClarityHex(hex)).toEqual({ kind: 'uint', value: 123_456_789n });
  });

  it('encodes a string-ascii (0x0d + length + bytes) and round-trips it', () => {
    const hex = serializeClarityArg({ kind: 'string-ascii', value: 'STX' });
    // 0d + len(00000003) + "STX"(535458) — the shape the Arkadiko oracle takes.
    expect(hex).toBe('0x0d00000003535458');
    expect(deserializeClarityHex(hex)).toEqual({ kind: 'string', value: 'STX' });
  });

  it('refuses a non-ASCII string-ascii payload', () => {
    expect(() => serializeClarityArg({ kind: 'string-ascii', value: 'stäckr' })).toThrow(
      'not ASCII',
    );
  });

  it('round-trips a list of tuples through encode → decode', () => {
    const hex = serializeClarityArg({
      kind: 'list',
      values: [
        {
          kind: 'tuple',
          data: { asset: { kind: 'uint', value: 1n }, oracle: { kind: 'uint', value: 2n } },
        },
      ],
    });
    const decoded = deserializeClarityHex(hex);
    expect(decoded).toEqual({
      kind: 'list',
      values: [
        {
          kind: 'tuple',
          data: { asset: { kind: 'uint', value: 1n }, oracle: { kind: 'uint', value: 2n } },
        },
      ],
    });
  });
});
