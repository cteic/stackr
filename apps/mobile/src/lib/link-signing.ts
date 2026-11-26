import type { SignResult, WalletSignRequest } from '@stackr/wallet-link';
import type { Signer } from './contracts/signer';

/**
 * Executes an approved Stackr Link sign request against the on-device signer.
 *
 * Scope in this slice (mirrors what the link relays today): `message` signing
 * for the locally-derived chains. Ethereum/Solana keys live in Privy's
 * embedded wallets whose Expo SDK signing surface is wired separately, and
 * `transaction` payloads need per-chain decoding before they can be rendered
 * truthfully — both come back as explicit typed rejections rather than
 * silent failures, so the web side always learns why.
 */

const LOCAL_CHAINS = ['btc', 'stx', 'sui'] as const;

/**
 * An honest, session-derived label for the paired peer.
 *
 * The Stackr Link handshake carries no authenticated origin — the web side is
 * an anonymous ephemeral X25519 key, so the wallet has no proof the peer is
 * stackr.ie or anyone else. Asserting a domain here would manufacture trust a
 * phishing site could borrow. Instead we surface the channel id (the only thing
 * that actually identifies the session) and mark it unverified; the sheet warns
 * the user to only approve a pairing they started on their own screen.
 */
export function peerLabel(channel: string): string {
  return `Paired device · ${channel.slice(0, 8)}`;
}

function isLocalChain(chain: string): chain is (typeof LOCAL_CHAINS)[number] {
  return (LOCAL_CHAINS as readonly string[]).includes(chain);
}

export async function executeSign(signer: Signer, request: WalletSignRequest): Promise<SignResult> {
  if (!isLocalChain(request.chain)) {
    return {
      status: 'rejected',
      reason: `${request.chain} signing over Stackr Link is not supported yet`,
    };
  }
  if (request.kind !== 'message') {
    return {
      status: 'rejected',
      reason: 'transaction signing over Stackr Link is not supported yet',
    };
  }
  try {
    const signed = await signer.signMessage(request.chain, 0, request.payload);
    return { status: 'approved', signature: signed.signature };
  } catch {
    // Never leak signer internals into the channel.
    return { status: 'rejected', reason: 'signer error' };
  }
}

const DISPLAY_LIMIT = 2_000;

/** Long hex runs read as opaque bytes, not as a message a person wrote. */
const HEX_PAYLOAD = /^(0x)?[0-9a-fA-F]{16,}$/;
/** Control characters other than tab, newline and carriage return. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
/** Bidirectional overrides can make the shown text differ from the signed bytes. */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/;

export interface MessageAssessment {
  byteLength: number;
  /** Set when the payload is not plain readable text; the sheet then asks twice. */
  warning?: string;
}

function isJsonStructure(payload: string): boolean {
  const trimmed = payload.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide whether a message payload can be shown as prose.
 *
 * A crafted "message" can be a meaningful off-chain authorisation: hex bytes,
 * structured data, or text hiding characters the sheet cannot show. Those get
 * a warning with the byte length, and the sheet asks for a second approval.
 */
export function assessMessagePayload(payload: string): MessageAssessment {
  const byteLength = new TextEncoder().encode(payload).length;
  const size = `${byteLength.toLocaleString('en')} bytes`;

  if (HEX_PAYLOAD.test(payload.trim())) {
    return {
      byteLength,
      warning: `This message is raw hex data (${size}), not readable text. Signing it could authorise something you cannot see.`,
    };
  }
  if (isJsonStructure(payload)) {
    return {
      byteLength,
      warning: `This message is structured data (${size}). Apps can use signed data like this as an authorisation. Check every field.`,
    };
  }
  if (CONTROL_CHARS.test(payload) || BIDI_CONTROLS.test(payload) || payload.includes('�')) {
    return {
      byteLength,
      warning: `This message contains hidden or unreadable characters (${size}). What you see may not be what you sign.`,
    };
  }
  if (payload.length > DISPLAY_LIMIT) {
    return {
      byteLength,
      warning: `This message is too long to show in full (${size}). Only the start is displayed.`,
    };
  }
  return { byteLength };
}

/** Human-readable rendering for the sign sheet. */
export function renderSignDisplay(request: WalletSignRequest): string {
  const body =
    request.payload.length > DISPLAY_LIMIT
      ? `${request.payload.slice(0, DISPLAY_LIMIT)}…`
      : request.payload;
  return request.kind === 'message' ? body : `Transaction payload:\n${body}`;
}
