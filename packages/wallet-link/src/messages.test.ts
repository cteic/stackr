import { describe, expect, it } from 'vitest';
import { EnvelopeSchema, LinkMessageSchema, QrPayloadSchema } from './messages.js';

describe('QrPayloadSchema', () => {
  const valid = { v: 1, channel: 'a'.repeat(32), webPubKey: 'b'.repeat(64) };

  it('accepts a well-formed payload', () => {
    expect(QrPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['wrong version', { ...valid, v: 2 }],
    ['short channel', { ...valid, channel: 'abc' }],
    ['non-hex key', { ...valid, webPubKey: 'z'.repeat(64) }],
    ['missing key', { v: 1, channel: valid.channel }],
    ['junk', 'not even an object'],
  ])('rejects %s', (_name, payload) => {
    expect(QrPayloadSchema.safeParse(payload).success).toBe(false);
  });
});

describe('LinkMessageSchema', () => {
  it('accepts an address announcement', () => {
    const result = LinkMessageSchema.safeParse({
      type: 'announce_addresses',
      addresses: [{ chain: 'stx', address: 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an announcement with an unknown chain', () => {
    const result = LinkMessageSchema.safeParse({
      type: 'announce_addresses',
      addresses: [{ chain: 'doge', address: 'D6address' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty announcement', () => {
    const result = LinkMessageSchema.safeParse({ type: 'announce_addresses', addresses: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a sign_request without a uuid id', () => {
    const result = LinkMessageSchema.safeParse({
      type: 'sign_request',
      id: 'not-a-uuid',
      chain: 'eth',
      kind: 'transaction',
      payload: '0xdead',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown message types', () => {
    expect(LinkMessageSchema.safeParse({ type: 'steal_keys' }).success).toBe(false);
  });
});

describe('EnvelopeSchema', () => {
  it('accepts a hello and a box', () => {
    expect(EnvelopeSchema.safeParse({ v: 1, kind: 'hello', pubKey: 'a'.repeat(64) }).success).toBe(
      true,
    );
    expect(
      EnvelopeSchema.safeParse({
        v: 1,
        kind: 'box',
        from: 'wallet',
        seq: 0,
        nonce: 'c'.repeat(48),
        box: 'deadbeef',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['negative seq', { v: 1, kind: 'box', from: 'web', seq: -1, nonce: 'c'.repeat(48), box: 'aa' }],
    ['bad role', { v: 1, kind: 'box', from: 'mitm', seq: 0, nonce: 'c'.repeat(48), box: 'aa' }],
    ['bad nonce', { v: 1, kind: 'box', from: 'web', seq: 0, nonce: 'zz', box: 'aa' }],
    ['unknown kind', { v: 1, kind: 'stream' }],
  ])('rejects %s', (_name, envelope) => {
    expect(EnvelopeSchema.safeParse(envelope).success).toBe(false);
  });
});
