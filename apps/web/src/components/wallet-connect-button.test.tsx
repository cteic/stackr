import { describe as feature, it as scenario, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { getDefaultStore } from 'jotai';
import { bdd } from '../lib/bdd';
import { connectedAddressesAtom, setConnectedAddressesAtom } from '../lib/wallet-store';
import { hasConnectedAddress, walletModalOpenAtom } from '../lib/wallet-modal-store';

const loadWalletLayer = vi.fn();
vi.mock('@/components/wallet-layer-loader', () => ({ loadWalletLayer }));

const { WalletConnectButton } = await import('./wallet-connect-button');

const store = getDefaultStore();
const { given, when, then } = bdd;

beforeEach(() => {
  store.set(connectedAddressesAtom, {});
  store.set(walletModalOpenAtom, false);
  loadWalletLayer.mockClear();
});
afterEach(cleanup);

feature('header connect button', () => {
  scenario('offers to connect when no wallet is connected', () => {
    when('the header renders', () => render(<WalletConnectButton />));
    then('the button reads Connect', () => {
      expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
    });
  });

  scenario('shows Wallets once any source has written an address', () => {
    given('a Stacks address from a restored Leather session', () =>
      store.set(setConnectedAddressesAtom, 'stx', ['SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7']),
    );
    when('the header renders', () => render(<WalletConnectButton />));
    then('the button reads Wallets', () => {
      expect(screen.getByRole('button', { name: 'Wallets' })).toBeTruthy();
    });
  });

  scenario('clicking opens the dialog the wallet layer renders', () => {
    given('the header is rendered', () => render(<WalletConnectButton />));
    when('the user clicks Connect', () =>
      fireEvent.click(screen.getByRole('button', { name: 'Connect' })),
    );
    then('the shared open flag is set', () => {
      expect(store.get(walletModalOpenAtom)).toBe(true);
    });
  });

  scenario('hover starts loading the wallet layer before the click', () => {
    given('the header is rendered', () => render(<WalletConnectButton />));
    when('the pointer enters the button', () =>
      fireEvent.pointerEnter(screen.getByRole('button', { name: 'Connect' })),
    );
    then('the wallet layer chunk is requested', () => {
      expect(loadWalletLayer).toHaveBeenCalledTimes(1);
    });
  });
});

feature('hasConnectedAddress', () => {
  scenario('ignores chains whose address list is empty', () => {
    then('an emptied chain does not count as connected', () => {
      expect(hasConnectedAddress({ eth: [] })).toBe(false);
      expect(hasConnectedAddress({})).toBe(false);
      expect(hasConnectedAddress({ eth: [], sol: ['So1ana'] })).toBe(true);
    });
  });
});
