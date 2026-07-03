import { validateAddress, type Chain } from '@stackr/models';
import {
  EnvelopeSchema,
  LinkMessageSchema,
  QrPayloadSchema,
  AnnouncedAddressSchema,
  LINK_PROTOCOL_VERSION,
  type AnnouncedAddress,
  type Envelope,
  type LinkMessage,
  type LinkRole,
  type QrPayload,
  type SignResult,
} from './messages.js';
import {
  deriveSessionKey,
  generateChannelId,
  generateKeyPair,
  open,
  seal,
  wipe,
} from './crypto.js';
import type { LinkTransport } from './transport.js';

/**
 * Session state machines for the two ends of a Stackr Link pairing.
 *
 * - `WebLinkSession` (the host): generates the channel + ephemeral key, renders
 *   the QR payload, and waits for a wallet to join. Receives address
 *   announcements; can relay sign requests. Never holds signing keys.
 * - `WalletLinkSession` (the joiner): scans the QR payload, derives the session
 *   key immediately, and announces its addresses. Answers sign requests
 *   on-device.
 *
 * Security properties enforced here: only the first `hello` is honoured (the
 * QR's visual device-to-device transfer is the trust anchor), every box is
 * AEAD-authenticated with channel/role/sequence bound as AAD, sequence numbers
 * are strictly monotonic per sender (replay protection), and off-schema or
 * undecryptable traffic is silently dropped.
 */

function boxAad(channel: string, from: LinkRole, seq: number): string {
  return `stackr-link/${LINK_PROTOCOL_VERSION}/${channel}/${from}/${seq}`;
}

const PAIRING_TIMEOUT_MS = 30_000;
const SIGN_TIMEOUT_MS = 120_000;

abstract class LinkSession {
  protected key: Uint8Array | null = null;
  protected closed = false;
  private mySeq = 0;
  private peerSeq = -1;
  private unsubscribe: (() => void) | null = null;

  protected constructor(
    private readonly transport: LinkTransport,
    readonly channel: string,
    private readonly role: LinkRole,
  ) {}

  /** Whether the encrypted session is established. */
  get paired(): boolean {
    return this.key !== null && !this.closed;
  }

  protected listen(): void {
    this.unsubscribe = this.transport.subscribe(this.channel, data => {
      this.handleRaw(data);
    });
  }

  protected publishEnvelope(envelope: Envelope): Promise<void> {
    return this.transport.publish(this.channel, JSON.stringify(envelope));
  }

  protected async sendMessage(message: LinkMessage): Promise<void> {
    if (this.key === null || this.closed) {
      throw new Error('link session is not paired');
    }
    const seq = this.mySeq;
    this.mySeq += 1;
    const sealed = seal(this.key, boxAad(this.channel, this.role, seq), JSON.stringify(message));
    await this.publishEnvelope({
      v: LINK_PROTOCOL_VERSION,
      kind: 'box',
      from: this.role,
      seq,
      nonce: sealed.nonceHex,
      box: sealed.boxHex,
    });
  }

  private handleRaw(data: string): void {
    if (this.closed) return;

    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const envelope = EnvelopeSchema.safeParse(json);
    if (!envelope.success) return;

    if (envelope.data.kind === 'hello') {
      this.handleHello(envelope.data.pubKey);
      return;
    }

    const { from, seq, nonce, box } = envelope.data;
    // Our own echo, or a peer impersonating our role — either way, not for us.
    if (from === this.role) return;
    if (this.key === null) return;
    // Strictly monotonic per sender: a replayed or reordered box is dropped.
    if (seq <= this.peerSeq) return;

    let plaintext: string;
    try {
      plaintext = open(this.key, boxAad(this.channel, from, seq), nonce, box);
    } catch {
      return; // tampered ciphertext or AAD mismatch
    }

    let messageJson: unknown;
    try {
      messageJson = JSON.parse(plaintext);
    } catch {
      return;
    }
    const message = LinkMessageSchema.safeParse(messageJson);
    if (!message.success) return;

    this.peerSeq = seq;
    this.handleMessage(message.data);
  }

  protected abstract handleHello(pubKeyHex: string): void;
  protected abstract handleMessage(message: LinkMessage): void;

  /** Tear down the subscription and wipe the session key. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.key !== null) {
      wipe(this.key);
      this.key = null;
    }
  }
}

export interface SignRequestInput {
  chain: Chain;
  kind: 'transaction' | 'message';
  /** Opaque chain-specific encoding; the wallet decodes and renders it. */
  payload: string;
}

interface PendingSignRequest {
  resolve: (result: SignResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** The web (portfolio) end: hosts the channel and renders the QR. */
export class WebLinkSession extends LinkSession {
  private readonly keyPair = generateKeyPair();
  private readonly pending = new Map<string, PendingSignRequest>();

  /** Fired once, when the wallet joins and the encrypted session is live. */
  onPaired: (() => void) | null = null;
  /** Fired with schema-valid, chain-validated addresses from the wallet. */
  onAddresses: ((addresses: AnnouncedAddress[]) => void) | null = null;
  /** Fired when the wallet ends the session. */
  onPeerDisconnect: (() => void) | null = null;

  static create(transport: LinkTransport): WebLinkSession {
    const session = new WebLinkSession(transport, generateChannelId());
    session.listen();
    return session;
  }

  private constructor(transport: LinkTransport, channel: string) {
    super(transport, channel, 'web');
  }

  /** The JSON string to render as a QR code for the wallet to scan. */
  qrPayload(): string {
    const payload: QrPayload = {
      v: LINK_PROTOCOL_VERSION,
      channel: this.channel,
      webPubKey: this.keyPair.publicKeyHex,
    };
    return JSON.stringify(payload);
  }

  protected handleHello(pubKeyHex: string): void {
    // Only the first wallet to scan the QR gets the session.
    if (this.key !== null) return;
    this.key = deriveSessionKey(this.keyPair.secretKey, pubKeyHex, this.channel);
    wipe(this.keyPair.secretKey);
    void this.sendMessage({ type: 'hello_ack' }).then(() => {
      this.onPaired?.();
    });
  }

  protected handleMessage(message: LinkMessage): void {
    switch (message.type) {
      case 'announce_addresses': {
        // Defense in depth: the schema shaped it; now every address must also
        // pass the per-chain format validation before the app sees it.
        const valid = message.addresses.filter(a => validateAddress(a.chain, a.address).valid);
        if (valid.length > 0) this.onAddresses?.(valid);
        return;
      }
      case 'sign_response': {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        pending.resolve(message.result);
        return;
      }
      case 'disconnect': {
        this.failAllPending(new Error('wallet disconnected'));
        this.onPeerDisconnect?.();
        this.close();
        return;
      }
      case 'hello_ack':
      case 'sign_request':
        return; // wallet-bound messages; ignore on this side
    }
  }

  /** Relay a sign request to the wallet and await its verdict. */
  async requestSignature(
    input: SignRequestInput,
    timeoutMs: number = SIGN_TIMEOUT_MS,
  ): Promise<SignResult> {
    const id = crypto.randomUUID();
    const result = new Promise<SignResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('sign request timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    await this.sendMessage({ type: 'sign_request', id, ...input });
    return result;
  }

  /** End the session, telling the wallet first (best-effort). */
  async disconnect(): Promise<void> {
    if (this.paired) {
      await this.sendMessage({ type: 'disconnect' }).catch(() => undefined);
    }
    this.failAllPending(new Error('link session closed'));
    this.close();
  }

  private failAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export interface WalletSignRequest {
  id: string;
  chain: Chain;
  kind: 'transaction' | 'message';
  payload: string;
}

/** The wallet (signer) end: joins from a scanned QR payload. */
export class WalletLinkSession extends LinkSession {
  /**
   * Answers relayed sign requests. Signing happens entirely on the wallet
   * side; when no handler is installed every request is rejected.
   */
  onSignRequest: ((request: WalletSignRequest) => Promise<SignResult>) | null = null;
  /** Fired when the web side ends the session. */
  onPeerDisconnect: (() => void) | null = null;

  private ackReceived: (() => void) | null = null;

  static async join(
    transport: LinkTransport,
    qrPayloadRaw: string,
    timeoutMs: number = PAIRING_TIMEOUT_MS,
  ): Promise<WalletLinkSession> {
    let json: unknown;
    try {
      json = JSON.parse(qrPayloadRaw);
    } catch {
      throw new Error('invalid link QR payload');
    }
    const payload = QrPayloadSchema.safeParse(json);
    if (!payload.success) {
      throw new Error('invalid link QR payload');
    }

    const session = new WalletLinkSession(transport, payload.data.channel);
    const keyPair = generateKeyPair();
    session.key = deriveSessionKey(keyPair.secretKey, payload.data.webPubKey, payload.data.channel);
    wipe(keyPair.secretKey);
    session.listen();

    const acked = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.close();
        reject(new Error('pairing timed out'));
      }, timeoutMs);
      session.ackReceived = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    await session.publishEnvelope({
      v: LINK_PROTOCOL_VERSION,
      kind: 'hello',
      pubKey: keyPair.publicKeyHex,
    });
    await acked;
    return session;
  }

  private constructor(transport: LinkTransport, channel: string) {
    super(transport, channel, 'wallet');
  }

  protected handleHello(): void {
    // The wallet is the one who says hello; an incoming hello is not for us.
  }

  protected handleMessage(message: LinkMessage): void {
    switch (message.type) {
      case 'hello_ack': {
        this.ackReceived?.();
        this.ackReceived = null;
        return;
      }
      case 'sign_request': {
        const { id, chain, kind, payload } = message;
        const handler = this.onSignRequest;
        const verdict: Promise<SignResult> = handler
          ? handler({ id, chain, kind, payload })
          : Promise.resolve({ status: 'rejected', reason: 'no signer available' });
        void verdict
          .catch((): SignResult => ({ status: 'rejected', reason: 'signer error' }))
          .then(result => this.sendMessage({ type: 'sign_response', id, result }))
          .catch(() => undefined);
        return;
      }
      case 'disconnect': {
        this.onPeerDisconnect?.();
        this.close();
        return;
      }
      case 'announce_addresses':
      case 'sign_response':
        return; // web-bound messages; ignore on this side
    }
  }

  /** Send the wallet's addresses to the portfolio. Throws on invalid input. */
  async announceAddresses(addresses: AnnouncedAddress[]): Promise<void> {
    const shaped = addresses.map(a => AnnouncedAddressSchema.parse(a));
    for (const { chain, address } of shaped) {
      const check = validateAddress(chain, address);
      if (!check.valid) {
        throw new Error(`invalid ${chain} address: ${check.error ?? 'format check failed'}`);
      }
    }
    await this.sendMessage({ type: 'announce_addresses', addresses: shaped });
  }

  /** End the session, telling the web side first (best-effort). */
  async disconnect(): Promise<void> {
    if (this.paired) {
      await this.sendMessage({ type: 'disconnect' }).catch(() => undefined);
    }
    this.close();
  }
}
