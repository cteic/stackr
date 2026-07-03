import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { slip10DerivePath, slip10MasterFromSeed } from './slip10.js';

/**
 * Official SLIP-0010 ed25519 test vectors (SatoshiLabs SLIP-0010 spec,
 * "Test vector 1 for ed25519" and "Test vector 2 for ed25519").
 */
const SEED_1 = '000102030405060708090a0b0c0d0e0f';
const SEED_2 =
  'fffcf9f6f3f0edeae7e4e1dedbd8d5d2cfccc9c6c3c0bdbab7b4b1aeaba8a5a29f9c999693908d8a8784817e7b7875726f6c696663605d5a5754514e4b484542';

describe('slip10 (ed25519)', () => {
  it('derives the vector-1 master node', () => {
    const node = slip10MasterFromSeed(hexToBytes(SEED_1));
    expect(bytesToHex(node.privateKey)).toBe(
      '2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7',
    );
    expect(bytesToHex(node.chainCode)).toBe(
      '90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb',
    );
  });

  it.each([
    [
      "m/0'",
      '68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3',
      '8b59aa11380b624e81507a27fedda59fea6d0b779a778918a2fd3590e16e9c69',
    ],
    [
      "m/0'/1'",
      'b1d0bad404bf35da785a64ca1ac54b2617211d2777696fbffaf208f746ae84f2',
      'a320425f77d1b5c2505a6b1b27382b37368ee640e3557c315416801243552f14',
    ],
    [
      "m/0'/1'/2'",
      '92a5b23c0b8a99e37d07df3fb9966917f5d06e02ddbd909c7e184371463e9fc9',
      '2e69929e00b5ab250f49c3fb1c12f252de4fed2c1db88387094a0f8c4c9ccd6c',
    ],
    [
      "m/0'/1'/2'/2'",
      '30d1dc7e5fc04c31219ab25a27ae00b50f6fd66622f6e9c913253d6511d1e662',
      '8f6d87f93d750e0efccda017d662a1b31a266e4a6f5993b15f5c1f07f74dd5cc',
    ],
    [
      "m/0'/1'/2'/2'/1000000000'",
      '8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793',
      '68789923a0cac2cd5a29172a475fe9e0fb14cd6adb5ad98a3fa70333e7afa230',
    ],
  ])('derives vector-1 path %s', (path, expectedKey, expectedChainCode) => {
    const node = slip10DerivePath(hexToBytes(SEED_1), path);
    expect(bytesToHex(node.privateKey)).toBe(expectedKey);
    expect(bytesToHex(node.chainCode)).toBe(expectedChainCode);
  });

  it('derives the vector-2 master node', () => {
    const node = slip10MasterFromSeed(hexToBytes(SEED_2));
    expect(bytesToHex(node.privateKey)).toBe(
      '171cb88b1b3c1db25add599712e36245d75bc65a1a5c9e18d76f9f2b1eab4012',
    );
    expect(bytesToHex(node.chainCode)).toBe(
      'ef70a74db9c3a5af931b5fe73ed8e1a53464133654fd55e7a66f8570b8e33c3b',
    );
  });

  it('rejects non-hardened segments (ed25519 has no normal derivation)', () => {
    expect(() => slip10DerivePath(hexToBytes(SEED_1), "m/44'/501'/0")).toThrow(/fully hardened/);
  });

  it('rejects malformed paths', () => {
    expect(() => slip10DerivePath(hexToBytes(SEED_1), "44'/501'")).toThrow(/Malformed/);
    expect(() => slip10DerivePath(hexToBytes(SEED_1), 'm')).toThrow(/Malformed/);
  });
});
