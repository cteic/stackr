import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWalletStore } from '@/lib/wallet-store';
import { useWalletConnections, type WalletConnection } from './use-wallet-connections';

/**
 * The wagmi / Solana-adapter halves of the hook need their provider trees, so
 * they are stubbed to "nothing connected" — this suite covers the hook-owned
 * Slush path: registry entry, connect-into-store, restore, disconnect.
 */
vi.mock('wagmi', () => ({
  useConnect: () => ({ connectors: [], connectAsync: vi.fn() }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
}));
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    select: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    wallet: null,
    connected: false,
  }),
}));
vi.mock('@/lib/stacks-connect', () => ({
  connectStacksWallet: vi.fn(async () => null),
  disconnectStacksWallet: vi.fn(),
  isStacksWalletConnected: () => false,
  readStacksAddresses: () => null,
}));

const mocks = vi.hoisted(() => {
  const address = `0x${'a'.repeat(64)}`;
  return {
    address,
    connectSuiWallet: vi.fn<() => Promise<string[] | null>>(),
    disconnectSuiWallet: vi.fn(),
    isSuiWalletAvailable: vi.fn<() => boolean>(),
    isSuiWalletRemembered: vi.fn<() => boolean>(),
    restoreSuiWallet: vi.fn<() => Promise<string[] | null>>(),
    subscribeSuiWalletAvailability: vi.fn<() => () => void>(),
  };
});
vi.mock('@/lib/sui-connect', () => ({
  connectSuiWallet: mocks.connectSuiWallet,
  disconnectSuiWallet: mocks.disconnectSuiWallet,
  isSuiWalletAvailable: mocks.isSuiWalletAvailable,
  isSuiWalletRemembered: mocks.isSuiWalletRemembered,
  restoreSuiWallet: mocks.restoreSuiWallet,
  subscribeSuiWalletAvailability: mocks.subscribeSuiWalletAvailability,
}));

function slushEntry(connections: WalletConnection[]): WalletConnection {
  const entry = connections.find(connection => connection.id === 'slush');
  if (!entry) throw new Error('expected a slush entry in the wallet registry');
  return entry;
}

describe('useWalletConnections — Slush (sui)', () => {
  beforeEach(() => {
    mocks.connectSuiWallet.mockResolvedValue([mocks.address]);
    mocks.isSuiWalletAvailable.mockReturnValue(true);
    mocks.isSuiWalletRemembered.mockReturnValue(false);
    mocks.restoreSuiWallet.mockResolvedValue(null);
    mocks.subscribeSuiWalletAvailability.mockReturnValue(() => undefined);
  });

  afterEach(() => {
    cleanup();
    useWalletStore.getState().clearConnectedAddresses('sui');
    vi.clearAllMocks();
  });

  it('exposes a Slush entry contributing the sui chain', () => {
    const { result } = renderHook(() => useWalletConnections());

    const entry = slushEntry(result.current);
    expect(entry.name).toBe('Slush');
    expect(entry.chains).toEqual(['sui']);
    expect(entry.installed).toBe(true);
    expect(entry.connected).toBe(false);
  });

  it('connect() writes the discovered address into the wallet store', async () => {
    const { result } = renderHook(() => useWalletConnections());

    await act(async () => {
      await slushEntry(result.current).connect();
    });

    expect(useWalletStore.getState().connectedAddresses.sui).toEqual([mocks.address]);
    expect(slushEntry(result.current).connected).toBe(true);
  });

  it('leaves the store untouched when the user cancels the connect', async () => {
    mocks.connectSuiWallet.mockResolvedValue(null);
    const { result } = renderHook(() => useWalletConnections());

    await act(async () => {
      await slushEntry(result.current).connect();
    });

    expect(useWalletStore.getState().connectedAddresses.sui).toBeUndefined();
  });

  it('disconnect() clears the sui addresses and forgets the wallet session', async () => {
    const { result } = renderHook(() => useWalletConnections());
    await act(async () => {
      await slushEntry(result.current).connect();
    });

    await act(async () => {
      await slushEntry(result.current).disconnect();
    });

    expect(useWalletStore.getState().connectedAddresses.sui).toBeUndefined();
    expect(mocks.disconnectSuiWallet).toHaveBeenCalledOnce();
    expect(slushEntry(result.current).connected).toBe(false);
  });

  it('restores a remembered session on mount once the wallet is available', async () => {
    mocks.isSuiWalletRemembered.mockReturnValue(true);
    mocks.restoreSuiWallet.mockResolvedValue([mocks.address]);

    const { result } = renderHook(() => useWalletConnections());

    await waitFor(() =>
      expect(useWalletStore.getState().connectedAddresses.sui).toEqual([mocks.address]),
    );
    expect(slushEntry(result.current).connected).toBe(true);
  });
});
