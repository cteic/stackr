import { ed25519 } from '@noble/curves/ed25519';
import { schnorr } from '@noble/curves/secp256k1';
import { blake2b } from '@noble/hashes/blake2b';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { base58, base64, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import {
  deserializeTransaction,
  makeUnsignedSTXTokenTransfer,
  publicKeyFromSignatureRsv,
  serializeTransaction,
} from '@stacks/transactions';
import { verifyMessage } from 'viem';
import { describe, expect, it } from 'vitest';
import { stxMessageHash } from './chains/stx.js';
import { isSignerError } from './errors.js';
import { createSigner, MNEMONIC_STORAGE_KEY, type SecureStorage } from './signer.js';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function isHex(value: string): value is `0x${string}` {
  return value.startsWith('0x');
}

function memoryStorage(): SecureStorage & { dump(): Map<string, string> } {
  const store = new Map<string, string>();
  return {
    get: key => Promise.resolve(store.get(key) ?? null),
    set: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: key => {
      store.delete(key);
      return Promise.resolve();
    },
    dump: () => store,
  };
}

async function initializedSigner() {
  const storage = memoryStorage();
  const signer = createSigner(storage);
  await signer.initialize(TEST_MNEMONIC);
  return { signer, storage };
}

describe('createSigner — revealMnemonic', () => {
  it('fails closed before initialization', async () => {
    const signer = createSigner(memoryStorage());
    await expect(signer.revealMnemonic()).rejects.toMatchObject({ code: 'not_initialized' });
  });

  it('returns the stored phrase verbatim after initialization', async () => {
    const { signer } = await initializedSigner();
    expect(await signer.revealMnemonic()).toBe(TEST_MNEMONIC);
  });

  it('reads through storage on every call — never caches', async () => {
    const { signer, storage } = await initializedSigner();
    expect(await signer.revealMnemonic()).toBe(TEST_MNEMONIC);
    // Simulate an external wipe (e.g. another session): the next reveal must
    // fail closed instead of serving a cached copy.
    storage.dump().clear();
    await expect(signer.revealMnemonic()).rejects.toMatchObject({ code: 'not_initialized' });
  });
});

describe('createSigner — lifecycle', () => {
  it('fails closed before initialization', async () => {
    const signer = createSigner(memoryStorage());
    expect(await signer.isInitialized()).toBe(false);
    await expect(signer.getAccount('eth', 0)).rejects.toMatchObject({
      code: 'not_initialized',
    });
    await expect(signer.signMessage('sol', 0, 'hello')).rejects.toMatchObject({
      code: 'not_initialized',
    });
  });

  it('initializes once and refuses silent replacement', async () => {
    const { signer } = await initializedSigner();
    expect(await signer.isInitialized()).toBe(true);
    await expect(signer.initialize(TEST_MNEMONIC)).rejects.toMatchObject({
      code: 'already_initialized',
    });
  });

  it('rejects an invalid mnemonic without touching storage', async () => {
    const storage = memoryStorage();
    const signer = createSigner(storage);
    await expect(signer.initialize('one two three')).rejects.toMatchObject({
      code: 'invalid_mnemonic',
    });
    expect(storage.dump().size).toBe(0);
  });

  it('stores the mnemonic only under the well-known key, and wipe() removes it', async () => {
    const { signer, storage } = await initializedSigner();
    expect([...storage.dump().keys()]).toEqual([MNEMONIC_STORAGE_KEY]);
    await signer.wipe();
    expect(await signer.isInitialized()).toBe(false);
    await expect(signer.getAccount('eth', 0)).rejects.toMatchObject({ code: 'not_initialized' });
  });

  it('getAccount matches the pure derivation contract', async () => {
    const { signer } = await initializedSigner();
    const account = await signer.getAccount('eth', 0);
    expect(account.address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });

  it('rejects unknown chains and bad indexes', async () => {
    const { signer } = await initializedSigner();
    await expect(signer.getAccount('doge' as never, 0)).rejects.toMatchObject({
      code: 'unsupported_chain',
    });
    await expect(signer.getAccount('eth', -1)).rejects.toMatchObject({
      code: 'invalid_account_index',
    });
  });
});

describe('signMessage — verifiable round-trips', () => {
  it('eth: EIP-191 signature verifies against the account address', async () => {
    const { signer } = await initializedSigner();
    const account = await signer.getAccount('eth', 0);
    const { signature } = await signer.signMessage('eth', 0, 'stackr test message');
    if (!isHex(account.address) || !isHex(signature)) {
      throw new Error('expected 0x-prefixed address and signature');
    }
    const valid = await verifyMessage({
      address: account.address,
      message: 'stackr test message',
      signature,
    });
    expect(valid).toBe(true);
  });

  it('btc: BIP-340 schnorr signature verifies against the x-only key', async () => {
    const { signer } = await initializedSigner();
    const { signature, publicKey } = await signer.signMessage('btc', 0, 'stackr test message');
    const digest = sha256(utf8ToBytes('stackr test message'));
    expect(schnorr.verify(hexToBytes(signature), digest, hexToBytes(publicKey))).toBe(true);
  });

  it('sol: ed25519 signature verifies against the account public key', async () => {
    const { signer } = await initializedSigner();
    const { signature, publicKey } = await signer.signMessage('sol', 0, 'stackr test message');
    expect(
      ed25519.verify(
        base58.decode(signature),
        utf8ToBytes('stackr test message'),
        hexToBytes(publicKey),
      ),
    ).toBe(true);
  });

  it('stx: RSV signature recovers the account public key (SIP-018 prefix hash)', async () => {
    const { signer } = await initializedSigner();
    const { signature, publicKey } = await signer.signMessage('stx', 0, 'stackr test message');
    const recovered = publicKeyFromSignatureRsv(
      bytesToHex(stxMessageHash('stackr test message')),
      signature,
    );
    expect(recovered).toBe(publicKey);
  });

  it('sui: wallet-format signature verifies over the personal-message intent', async () => {
    const { signer } = await initializedSigner();
    const message = 'stackr test message';
    const { signature, publicKey } = await signer.signMessage('sui', 0, message);
    const decoded = base64.decode(signature);
    expect(decoded).toHaveLength(1 + 64 + 32);
    expect(decoded[0]).toBe(0);
    expect(bytesToHex(decoded.slice(65))).toBe(publicKey);
    const messageBytes = utf8ToBytes(message);
    const intentPayload = concatBytes(
      new Uint8Array([3, 0, 0]),
      new Uint8Array([messageBytes.length]),
      messageBytes,
    );
    const digest = blake2b(intentPayload, { dkLen: 32 });
    expect(ed25519.verify(decoded.slice(1, 65), digest, decoded.slice(65))).toBe(true);
  });

  it('rejects an empty message', async () => {
    const { signer } = await initializedSigner();
    await expect(signer.signMessage('eth', 0, '')).rejects.toMatchObject({
      code: 'invalid_message',
    });
  });
});

describe('signTransaction — per chain', () => {
  it('eth: signs an EIP-1559 transfer into broadcastable raw hex', async () => {
    const { signer } = await initializedSigner();
    const result = await signer.signTransaction('eth', 0, {
      chainId: 1,
      nonce: 0,
      to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      valueWei: '1000000000000000',
      gas: '21000',
      maxFeePerGasWei: '30000000000',
      maxPriorityFeePerGasWei: '1000000000',
    });
    expect(result.kind).toBe('transaction');
    if (result.kind === 'transaction') {
      expect(result.encoding).toBe('hex');
      expect(result.signedTransaction.startsWith('0x02')).toBe(true);
    }
  });

  it('btc: signs and finalizes a single-key P2TR spend PSBT', async () => {
    const { signer } = await initializedSigner();
    const account = await signer.getAccount('btc', 0);
    const payment = btc.p2tr(hexToBytes(account.publicKey));
    const unsigned = new btc.Transaction();
    unsigned.addInput({
      txid: '75ddabb27b8845f5247975c8a5ba7c6f336c4570708ebe230caf6db5217ae858',
      index: 0,
      witnessUtxo: { script: payment.script, amount: 10_000n },
      tapInternalKey: hexToBytes(account.publicKey),
    });
    unsigned.addOutputAddress(account.address, 9_000n);
    const result = await signer.signTransaction('btc', 0, {
      psbtBase64: base64.encode(unsigned.toPSBT()),
    });
    expect(result.kind).toBe('transaction');
    if (result.kind === 'transaction') {
      expect(result.encoding).toBe('hex');
      const finalized = btc.Transaction.fromRaw(hex.decode(result.signedTransaction));
      expect(finalized.isFinal).toBe(true);
    }
  });

  it('btc: refuses a PSBT this account cannot sign', async () => {
    const { signer } = await initializedSigner();
    const foreign = await signer.getAccount('btc', 7);
    const payment = btc.p2tr(hexToBytes(foreign.publicKey));
    const unsigned = new btc.Transaction();
    unsigned.addInput({
      txid: '75ddabb27b8845f5247975c8a5ba7c6f336c4570708ebe230caf6db5217ae858',
      index: 0,
      witnessUtxo: { script: payment.script, amount: 10_000n },
      tapInternalKey: hexToBytes(foreign.publicKey),
    });
    unsigned.addOutputAddress(foreign.address, 9_000n);
    await expect(
      signer.signTransaction('btc', 0, { psbtBase64: base64.encode(unsigned.toPSBT()) }),
    ).rejects.toMatchObject({ code: 'signing_failed' });
  });

  it('sol: returns a detached signature that verifies over the message bytes', async () => {
    const { signer } = await initializedSigner();
    const messageBytes = utf8ToBytes('fake serialized solana message');
    const result = await signer.signTransaction('sol', 0, {
      messageBase64: base64.encode(messageBytes),
    });
    expect(result.kind).toBe('signature');
    if (result.kind === 'signature') {
      expect(
        ed25519.verify(base58.decode(result.signature), messageBytes, hexToBytes(result.publicKey)),
      ).toBe(true);
    }
  });

  it('stx: signs an unsigned token transfer into a broadcastable transaction', async () => {
    const { signer } = await initializedSigner();
    const account = await signer.getAccount('stx', 0);
    const unsigned = await makeUnsignedSTXTokenTransfer({
      recipient: 'SP3FGQ8Z7JY9BWYZ5WM53E0M9NK7WHJF0691NZ159',
      amount: 12_345n,
      fee: 200n,
      nonce: 0n,
      publicKey: account.publicKey,
      network: 'mainnet',
    });
    const result = await signer.signTransaction('stx', 0, {
      transactionHex: serializeTransaction(unsigned),
    });
    expect(result.kind).toBe('transaction');
    if (result.kind === 'transaction') {
      const parsed = deserializeTransaction(result.signedTransaction);
      // A real (non-empty, non-zero) origin signature must now be present.
      const condition = parsed.auth.spendingCondition;
      if ('signature' in condition) {
        expect(condition.signature.data).toMatch(/[1-9a-f]/);
      } else {
        throw new Error('expected a single-sig spending condition');
      }
    }
  });

  it('sui: returns a wallet-format signature over the TransactionData intent', async () => {
    const { signer } = await initializedSigner();
    const txBytes = utf8ToBytes('fake bcs transaction data');
    const result = await signer.signTransaction('sui', 0, {
      txBytesBase64: base64.encode(txBytes),
    });
    expect(result.kind).toBe('signature');
    if (result.kind === 'signature') {
      const decoded = base64.decode(result.signature);
      const digest = blake2b(concatBytes(new Uint8Array([0, 0, 0]), txBytes), { dkLen: 32 });
      expect(ed25519.verify(decoded.slice(1, 65), digest, decoded.slice(65))).toBe(true);
    }
  });

  it('rejects malformed payloads without leaking their contents', async () => {
    const { signer } = await initializedSigner();
    const secretish = 'super-secret-payload-value';
    try {
      await signer.signTransaction('eth', 0, { chainId: 1, nonce: 0, gas: secretish });
      expect.unreachable('payload should have been rejected');
    } catch (error) {
      expect(isSignerError(error) && error.code === 'invalid_payload').toBe(true);
      expect(error instanceof Error && error.message.includes(secretish)).toBe(false);
    }
  });
});
