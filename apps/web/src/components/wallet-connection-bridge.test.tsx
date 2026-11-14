import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { getDefaultStore } from 'jotai';
import {
  clearConnectedAddressesAtom,
  connectedAddressesAtom,
  setConnectedAddressesAtom,
} from '@/lib/wallet-store';

import { WalletConnectionBridge } from './wallet-connection-bridge';

const store = getDefaultStore();

/**
 * The bridge replaces the two `*-address-sync` components, so its guarantee is
 * the additive one: it keeps `wallet-store.connectedAddresses` in step with the
 * WalletConnectionController. On mount with nothing connected it should clear
 * the chains it owns — the same thing the old components did via `useEffect`.
 */
describe('WalletConnectionBridge', () => {
  afterEach(() => {
    cleanup();
    store.set(clearConnectedAddressesAtom, 'eth');
    store.set(clearConnectedAddressesAtom, 'sol');
  });

  it('clears the bridged chains on mount when nothing is connected', () => {
    store.set(setConnectedAddressesAtom, 'eth', ['0xstale']);
    store.set(setConnectedAddressesAtom, 'sol', ['SoLstale']);

    render(<WalletConnectionBridge />);

    expect(store.get(connectedAddressesAtom).eth).toBeUndefined();
    expect(store.get(connectedAddressesAtom).sol).toBeUndefined();
  });

  it('leaves non-bridged chains (stx/btc) untouched', () => {
    store.set(setConnectedAddressesAtom, 'stx', ['SP123']);

    render(<WalletConnectionBridge />);

    expect(store.get(connectedAddressesAtom).stx).toEqual(['SP123']);
    store.set(clearConnectedAddressesAtom, 'stx');
  });
});
