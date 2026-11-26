import { atom } from 'jotai';
import type { Chain } from '@stackr/models';
import { connectedAddressesAtom } from '@/lib/wallet-store';

/**
 * Whether the connect-wallet dialog is open.
 *
 * The header's trigger lives in the main bundle and the dialog lives in the
 * lazily loaded wallet layer, so the two share this atom instead of a
 * component tree.
 */
export const walletModalOpenAtom = atom(false);

/** True when any source (browser wallet or Stackr Link) has written an address. */
export function hasConnectedAddress(addresses: Partial<Record<Chain, string[]>>): boolean {
  return Object.values(addresses).some(list => list !== undefined && list.length > 0);
}

export const anyWalletConnectedAtom = atom(get => hasConnectedAddress(get(connectedAddressesAtom)));
