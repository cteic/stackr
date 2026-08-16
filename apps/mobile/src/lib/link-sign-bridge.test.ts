import { describe, expect, it } from 'vitest';
import type { SignResult, WalletSignRequest } from '@stackr/wallet-link';
import { createLinkSignBridge } from './link-sign-bridge';
import { peerLabel } from './link-signing';
import type { SignRequest } from './sign-requests';

/**
 * H1 regression (staff review round 2, #141): the sign sheet must never label a
 * relayed request with a hardcoded "stackr.ie" — the handshake proves no origin,
 * so a phishing site's QR would otherwise borrow that trust. The delivered
 * request must carry a session-derived, explicitly-unverified origin.
 */

function walletRequest(overrides: Partial<WalletSignRequest> = {}): WalletSignRequest {
  return { id: 'req-1', chain: 'stx', kind: 'message', payload: 'Sign in', ...overrides };
}

const CHANNEL_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CHANNEL_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/** Wire the bridge to a transport that records what the sheet would render. */
function capture(): {
  bridge: ReturnType<typeof createLinkSignBridge>;
  delivered: SignRequest[];
} {
  const executor = (): Promise<SignResult> =>
    Promise.resolve({ status: 'approved', signature: 'deadbeef' });
  const bridge = createLinkSignBridge(executor);
  const delivered: SignRequest[] = [];
  bridge.transport.start(request => delivered.push(request));
  return { bridge, delivered };
}

describe('createLinkSignBridge origin binding', () => {
  it('never renders a hardcoded domain; the origin is derived from the session channel', () => {
    const { bridge, delivered } = capture();

    void bridge.handleSessionRequest(walletRequest(), CHANNEL_A);

    expect(delivered).toHaveLength(1);
    const [request] = delivered;
    expect(request.origin).not.toBe('stackr.ie');
    expect(request.origin).not.toMatch(/\.(ie|com|xyz|app)/);
    expect(request.origin).toBe(peerLabel(CHANNEL_A));
    expect(request.originVerified).toBe(false);
  });

  it('reflects the actual channel — a different session yields a different label', () => {
    const { bridge, delivered } = capture();

    void bridge.handleSessionRequest(walletRequest({ id: 'a' }), CHANNEL_A);
    void bridge.handleSessionRequest(walletRequest({ id: 'b' }), CHANNEL_B);

    expect(delivered.map(request => request.origin)).toEqual([
      peerLabel(CHANNEL_A),
      peerLabel(CHANNEL_B),
    ]);
    expect(delivered[0].origin).not.toBe(delivered[1].origin);
  });
});
