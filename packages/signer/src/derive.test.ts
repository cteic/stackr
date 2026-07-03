import { ed25519 } from '@noble/curves/ed25519';
import { hexToBytes } from '@noble/hashes/utils';
import { base58 } from '@scure/base';
import { mnemonicToSeedSync } from '@scure/bip39';
import { generateWallet, getStxAddress } from '@stacks/wallet-sdk';
import { derivePath } from 'ed25519-hd-key';
import { mnemonicToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { deriveAccount } from './derive.js';
import { generateMnemonic, validateMnemonic } from './mnemonic.js';
import { slip10DerivePath } from './slip10.js';

/**
 * Derivation is proven three ways:
 * 1. published, authoritative vectors (BIP-86 spec for btc; the Sui TS SDK's
 *    ed25519-keypair unit-test vectors for sui; the canonical BIP-44 ETH
 *    vector used across MetaMask-compatible tooling)
 * 2. independent-implementation oracles run in-test (viem for eth,
 *    ed25519-hd-key — the implementation Phantom-compatible tooling uses —
 *    for sol, @stacks/wallet-sdk for stx)
 * 3. the SLIP-0010 spec vectors in slip10.test.ts for the ed25519 layer
 */

/** BIP-39 spec test mnemonic (all-zero entropy). */
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('mnemonic', () => {
  it('generates valid 12- and 24-word mnemonics', () => {
    const twelve = generateMnemonic();
    const twentyFour = generateMnemonic(24);
    expect(twelve.split(' ')).toHaveLength(12);
    expect(twentyFour.split(' ')).toHaveLength(24);
    expect(validateMnemonic(twelve)).toBe(true);
    expect(validateMnemonic(twentyFour)).toBe(true);
  });

  it('rejects a mnemonic with a bad checksum', () => {
    expect(validateMnemonic(TEST_MNEMONIC.replace(/about$/, 'abandon'))).toBe(false);
    expect(validateMnemonic('not a mnemonic at all')).toBe(false);
  });
});

describe('deriveAccount — eth', () => {
  it('matches the canonical BIP-44 vector at index 0', () => {
    const account = deriveAccount(TEST_MNEMONIC, 'eth', 0);
    expect(account.path).toBe("m/44'/60'/0'/0/0");
    // The canonical first account for the BIP-39 test mnemonic, as produced
    // by MetaMask-compatible BIP-44 tooling.
    expect(account.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it.each([0, 1, 5])('agrees with the viem HD oracle at index %i', index => {
    const account = deriveAccount(TEST_MNEMONIC, 'eth', index);
    const oracle = mnemonicToAccount(TEST_MNEMONIC, { addressIndex: index });
    expect(account.address).toBe(oracle.address);
  });
});

describe('deriveAccount — btc', () => {
  it('matches the official BIP-86 spec vectors', () => {
    // BIP-86 "Test vectors" — first and second receiving addresses.
    expect(deriveAccount(TEST_MNEMONIC, 'btc', 0)).toMatchObject({
      path: "m/86'/0'/0'/0/0",
      address: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
      publicKey: 'cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115',
    });
    expect(deriveAccount(TEST_MNEMONIC, 'btc', 1).address).toBe(
      'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh',
    );
  });
});

describe('deriveAccount — sol', () => {
  it.each([0, 1, 3])('agrees with the ed25519-hd-key oracle (Phantom path) at index %i', index => {
    const path = `m/44'/501'/${index}'/0'`;
    const seed = mnemonicToSeedSync(TEST_MNEMONIC);
    // Independent implementation: the SLIP-0010 helper used across
    // Phantom-compatible tooling, fed the same BIP-39 seed.
    const oracle = derivePath(path, Buffer.from(seed).toString('hex'));
    const node = slip10DerivePath(seed, path);
    expect(Buffer.from(node.privateKey).toString('hex')).toBe(
      Buffer.from(oracle.key).toString('hex'),
    );

    const account = deriveAccount(TEST_MNEMONIC, 'sol', index);
    expect(account.path).toBe(path);
    expect(hexToBytes(account.publicKey)).toHaveLength(32);
    // The Solana address IS the base58 public key of that same private key.
    expect(account.address).toBe(base58.encode(ed25519.getPublicKey(node.privateKey)));
  });
});

describe('deriveAccount — stx', () => {
  it('agrees with the @stacks/wallet-sdk oracle at index 0', async () => {
    const wallet = await generateWallet({ secretKey: TEST_MNEMONIC, password: '' });
    const [oracleAccount] = wallet.accounts;
    if (oracleAccount === undefined) {
      throw new Error('oracle wallet has no accounts');
    }
    const oracleAddress = getStxAddress({ account: oracleAccount, network: 'mainnet' });
    const account = deriveAccount(TEST_MNEMONIC, 'stx', 0);
    expect(account.path).toBe("m/44'/5757'/0'/0/0");
    expect(account.address).toBe(oracleAddress);
    expect(account.address.startsWith('SP')).toBe(true);
  });
});

describe('deriveAccount — sui', () => {
  // Sui TypeScript SDK ed25519-keypair unit-test vectors (24-word mnemonics,
  // default path m/44'/784'/0'/0'/0'). The address is blake2b-256 of the
  // scheme flag + public key, so an address match pins the whole pipeline:
  // seed → SLIP-0010 → ed25519 public key → flagged blake2b address.
  it.each([
    [
      'film crazy soon outside stand loop subway crumble thrive popular green nuclear struggle pistol arm wife phrase warfare march wheat nephew ask sunny firm',
      '0xa2d14fad60c56049ecf75246a481934691214ce413e6a8ae2fe6834c173a6133',
    ],
    [
      'require decline left thought grid priority false tiny gasp angle royal system attack beef setup reward aunt skill wasp tray vital bounce inflict level',
      '0x1ada6e6f3f3e4055096f606c746690f1108fcc2ca479055cc434a3e1d3f758aa',
    ],
    [
      'organ crash swim stick traffic remember army arctic mesh slice swear summer police vast chaos cradle squirrel hood useless evidence pet hub soap lake',
      '0xe69e896ca10f5a77732769803cc2b5707f0ab9d4407afb5e4b4464b89769af14',
    ],
  ])('matches the Sui SDK vector set', (mnemonic, expectedAddress) => {
    const account = deriveAccount(mnemonic, 'sui', 0);
    expect(account.path).toBe("m/44'/784'/0'/0'/0'");
    expect(account.address).toBe(expectedAddress);
    expect(hexToBytes(account.publicKey)).toHaveLength(32);
  });
});

describe('deriveAccount — input validation', () => {
  it('rejects an invalid mnemonic', () => {
    expect(() => deriveAccount('definitely not valid', 'eth', 0)).toThrow(/BIP-39/);
  });

  it('rejects negative and non-integer indexes', () => {
    expect(() => deriveAccount(TEST_MNEMONIC, 'eth', -1)).toThrow(/index/);
    expect(() => deriveAccount(TEST_MNEMONIC, 'sol', 1.5)).toThrow(/index/);
  });

  it('derives distinct addresses per index and per chain', () => {
    const chains = ['btc', 'eth', 'sol', 'stx', 'sui'] as const;
    const addresses = chains.flatMap(chain => [
      deriveAccount(TEST_MNEMONIC, chain, 0).address,
      deriveAccount(TEST_MNEMONIC, chain, 1).address,
    ]);
    expect(new Set(addresses).size).toBe(addresses.length);
  });
});
