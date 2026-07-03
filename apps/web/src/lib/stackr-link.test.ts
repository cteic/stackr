import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  groupAddressesByChain,
  readStoredLinkAddresses,
  useStackrLinkConnection,
} from './stackr-link';
import { useWalletStore } from '@/lib/wallet-store';

const STORAGE_KEY = 'stackr-link-addresses';
const STX_ADDRESS = 'SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7';
const ETH_ADDRESS = `0x${'ab'.repeat(20)}`;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  const { clearConnectedAddresses } = useWalletStore.getState();
  for (const chain of ['btc', 'eth', 'sol', 'stx', 'sui'] as const) {
    clearConnectedAddresses(chain);
  }
});

describe('readStoredLinkAddresses', () => {
  it('returns [] when nothing is stored', () => {
    expect(readStoredLinkAddresses()).toEqual([]);
  });

  it('returns [] for junk JSON and off-schema shapes', () => {
    localStorage.setItem(STORAGE_KEY, 'not json');
    expect(readStoredLinkAddresses()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(readStoredLinkAddresses()).toEqual([]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ chain: 'doge', address: 'x' }]));
    expect(readStoredLinkAddresses()).toEqual([]);
  });

  it('drops entries whose address fails per-chain validation', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { chain: 'stx', address: STX_ADDRESS },
        { chain: 'eth', address: 'tampered' },
      ]),
    );
    expect(readStoredLinkAddresses()).toEqual([{ chain: 'stx', address: STX_ADDRESS }]);
  });
});

describe('groupAddressesByChain', () => {
  it('groups by chain and dedupes repeated addresses', () => {
    expect(
      groupAddressesByChain([
        { chain: 'eth', address: ETH_ADDRESS },
        { chain: 'eth', address: ETH_ADDRESS },
        { chain: 'stx', address: STX_ADDRESS },
      ]),
    ).toEqual({ eth: [ETH_ADDRESS], stx: [STX_ADDRESS] });
  });
});

describe('useStackrLinkConnection', () => {
  it('starts disconnected with no remembered link', () => {
    const { result } = renderHook(() => useStackrLinkConnection());
    expect(result.current.connected).toBe(false);
    expect(result.current.chains).toEqual([]);
  });

  it('applies an announcement to the wallet store and remembers it', () => {
    const { result } = renderHook(() => useStackrLinkConnection());

    act(() => {
      result.current.applyAnnouncedAddresses([
        { chain: 'stx', address: STX_ADDRESS, label: 'Stackr Wallet' },
        { chain: 'eth', address: ETH_ADDRESS },
      ]);
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.chains).toEqual(['stx', 'eth']);
    expect(useWalletStore.getState().connectedAddresses.stx).toEqual([STX_ADDRESS]);
    expect(useWalletStore.getState().connectedAddresses.eth).toEqual([ETH_ADDRESS]);
    expect(readStoredLinkAddresses()).toHaveLength(2);
  });

  it('restores a remembered link into the store on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ chain: 'stx', address: STX_ADDRESS }]));

    const { result } = renderHook(() => useStackrLinkConnection());

    expect(result.current.connected).toBe(true);
    expect(result.current.chains).toEqual(['stx']);
    expect(useWalletStore.getState().connectedAddresses.stx).toEqual([STX_ADDRESS]);
  });

  it('disconnect clears the store, the memory, and the connected state', () => {
    const { result } = renderHook(() => useStackrLinkConnection());
    act(() => {
      result.current.applyAnnouncedAddresses([{ chain: 'stx', address: STX_ADDRESS }]);
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);
    expect(useWalletStore.getState().connectedAddresses.stx).toBeUndefined();
    expect(readStoredLinkAddresses()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
