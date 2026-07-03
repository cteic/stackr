import { z } from 'zod';
import { ChainSchema } from '@stackr/models';

/**
 * Stackr Link wire protocol, version 1.
 *
 * Everything that crosses the transport is validated here at the ingress
 * boundary: envelopes (the outer wire shape), the QR pairing payload, and the
 * decrypted application messages. A peer that sends anything off-schema is
 * ignored, never crashed on.
 */
export const LINK_PROTOCOL_VERSION = 1;

const hex = (bytes: number) => z.string().regex(new RegExp(`^[0-9a-f]{${bytes * 2}}$`));

/**
 * The payload rendered as a QR code on the web and scanned by the wallet.
 * The visual device-to-device transfer is the pairing trust anchor: whoever
 * can read the QR can join the channel, so it must only ever be shown on the
 * user's own screen.
 */
export const QrPayloadSchema = z.object({
  v: z.literal(LINK_PROTOCOL_VERSION),
  /** Random channel id — namespaces the transport topic. */
  channel: hex(16),
  /** The web side's ephemeral X25519 public key. */
  webPubKey: hex(32),
});
export type QrPayload = z.infer<typeof QrPayloadSchema>;

/** One address the wallet contributes to the portfolio. */
export const AnnouncedAddressSchema = z.object({
  chain: ChainSchema,
  address: z.string().min(1).max(128),
  label: z.string().min(1).max(64).optional(),
});
export type AnnouncedAddress = z.infer<typeof AnnouncedAddressSchema>;

/** The wallet's verdict on a relayed sign request. */
export const SignResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('approved'), signature: z.string().min(1).max(65_536) }),
  z.object({ status: z.literal('rejected'), reason: z.string().max(200).optional() }),
]);
export type SignResult = z.infer<typeof SignResultSchema>;

/**
 * Application messages — always transported encrypted inside a `box`
 * envelope, never in plaintext.
 */
export const LinkMessageSchema = z.discriminatedUnion('type', [
  /** Web → wallet: confirms the web side derived the session key. */
  z.object({ type: z.literal('hello_ack') }),
  /** Wallet → web: the addresses to add to the portfolio watch list. */
  z.object({
    type: z.literal('announce_addresses'),
    addresses: z.array(AnnouncedAddressSchema).min(1).max(20),
  }),
  /**
   * Web → wallet: relay of a signing request. The payload is an opaque
   * chain-specific encoding (hex/base64) — the wallet decodes, renders it for
   * approval, and signs on-device. The web side never holds key material.
   */
  z.object({
    type: z.literal('sign_request'),
    id: z.string().uuid(),
    chain: ChainSchema,
    kind: z.enum(['transaction', 'message']),
    payload: z.string().min(1).max(262_144),
  }),
  /** Wallet → web: the outcome for a previously relayed `sign_request`. */
  z.object({
    type: z.literal('sign_response'),
    id: z.string().uuid(),
    result: SignResultSchema,
  }),
  /** Either direction: the peer is going away; drop the session. */
  z.object({ type: z.literal('disconnect') }),
]);
export type LinkMessage = z.infer<typeof LinkMessageSchema>;

/**
 * Wire envelopes. `hello` is the only plaintext message — it carries the
 * wallet's ephemeral public key, which is public by definition. Everything
 * else rides in `box`: XChaCha20-Poly1305 ciphertext with the channel, sender
 * role, and sequence number bound in as AAD, so a tampered or replayed
 * envelope fails authentication or the monotonic-sequence check.
 */
export const EnvelopeSchema = z.discriminatedUnion('kind', [
  z.object({
    v: z.literal(LINK_PROTOCOL_VERSION),
    kind: z.literal('hello'),
    pubKey: hex(32),
  }),
  z.object({
    v: z.literal(LINK_PROTOCOL_VERSION),
    kind: z.literal('box'),
    from: z.enum(['web', 'wallet']),
    seq: z.number().int().nonnegative(),
    nonce: hex(24),
    box: z
      .string()
      .regex(/^[0-9a-f]+$/)
      .max(600_000),
  }),
]);
export type Envelope = z.infer<typeof EnvelopeSchema>;
export type LinkRole = 'web' | 'wallet';
