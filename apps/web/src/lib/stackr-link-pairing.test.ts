import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { InMemoryLinkHub, WalletLinkSession, type AnnouncedAddress } from '@stackr/wallet-link';

/**
 * Exercises the web pairing hook against a real `WalletLinkSession` peer — the
 * same class Stackr Wallet composes on-device (see
 * apps/mobile/src/lib/link-session-store.test.ts for the mirror image of this
 * harness). Only the Supabase transport is swapped for the in-memory hub; the
 * QR payload, the hello/hello_ack handshake, and address delivery all run the
 * real protocol.
 */

const state = vi.hoisted(() => ({
  getTransport: (): unknown => {
    throw new Error('transport requested before a test set one up');
  },
}));

vi.mock('@stackr/wallet-link/supabase', () => ({
  createSupabaseLinkTransport: () => state.getTransport(),
}));

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

const { useStackrLinkPairing } = await import('./stackr-link');

afterAll(() => {
  vi.unstubAllEnvs();
});

const STX_ADDRESS = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7';

function requireQrText(qrText: string | null): string {
  if (qrText === null) throw new Error('expected qrText to be set');
  return qrText;
}

describe('useStackrLinkPairing — real WalletLinkSession peer', () => {
  let hub: InMemoryLinkHub;

  beforeEach(() => {
    hub = new InMemoryLinkHub();
    state.getTransport = () => hub.connect();
  });

  afterEach(() => {
    cleanup();
  });

  it('pairs with a wallet scanning the rendered QR and delivers its addresses', async () => {
    const onAddresses = vi.fn<(addresses: AnnouncedAddress[]) => void>();
    const { result } = renderHook(() => useStackrLinkPairing(onAddresses));

    act(() => {
      result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe('waiting'));

    const wallet = await WalletLinkSession.join(
      hub.connect(),
      requireQrText(result.current.qrText),
    );
    await wallet.announceAddresses([
      { chain: 'stx', address: STX_ADDRESS, label: 'Stackr Wallet' },
    ]);

    await waitFor(() => expect(result.current.status).toBe('paired'));
    expect(onAddresses).toHaveBeenCalledWith([
      { chain: 'stx', address: STX_ADDRESS, label: 'Stackr Wallet' },
    ]);
  });

  it('returns to idle when the wallet disconnects before announcing', async () => {
    const onAddresses = vi.fn();
    const { result } = renderHook(() => useStackrLinkPairing(onAddresses));

    act(() => {
      result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe('waiting'));

    const wallet = await WalletLinkSession.join(
      hub.connect(),
      requireQrText(result.current.qrText),
    );
    await wallet.disconnect();

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(onAddresses).not.toHaveBeenCalled();
  });
});
