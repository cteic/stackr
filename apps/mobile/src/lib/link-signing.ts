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

/** Human-readable rendering for the sign sheet. */
export function renderSignDisplay(request: WalletSignRequest): string {
  const body =
    request.payload.length > DISPLAY_LIMIT
      ? `${request.payload.slice(0, DISPLAY_LIMIT)}…`
      : request.payload;
  return request.kind === 'message' ? body : `Transaction payload:\n${body}`;
}
