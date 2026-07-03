import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { validateAddress } from '@stackr/models';
import { useWalletStore } from '@/lib/wallet-store';
import { DEMO_WALLETS, FirstRunHero } from './first-run-hero';

/**
 * The hero's one job is getting a first-time visitor from an empty dashboard
 * to a populated one, so the tests pin the three ways in: the two navigation
 * CTAs and the demo-portfolio action (which must add valid watch-only wallets
 * exactly once, however often it's clicked).
 */
describe('FirstRunHero', () => {
  afterEach(() => {
    cleanup();
    const { wallets, removeWallet } = useWalletStore.getState();
    wallets.forEach(w => removeWallet(w.id));
  });

  it('links the primary CTAs to the add-wallet and add-holding flows', () => {
    render(<FirstRunHero />);

    expect(screen.getByRole('link', { name: 'Add a wallet' }).getAttribute('href')).toBe(
      '/wallet/add',
    );
    expect(screen.getByRole('link', { name: 'Add a holding' }).getAttribute('href')).toBe(
      '/holdings/add',
    );
  });

  it('loads the demo portfolio as clearly-labelled watch-only wallets', () => {
    render(<FirstRunHero />);

    fireEvent.click(screen.getByRole('button', { name: 'Load demo portfolio' }));

    const { wallets } = useWalletStore.getState();
    expect(wallets).toHaveLength(DEMO_WALLETS.length);
    wallets.forEach(w => expect(w.label).toMatch(/^Demo · /));
  });

  it('does not duplicate demo wallets on a second click', () => {
    render(<FirstRunHero />);

    const button = screen.getByRole('button', { name: 'Load demo portfolio' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(useWalletStore.getState().wallets).toHaveLength(DEMO_WALLETS.length);
  });

  it('ships demo addresses that pass the same validation as user input', () => {
    DEMO_WALLETS.forEach(w => {
      expect(validateAddress(w.chain, w.address).valid).toBe(true);
    });
  });
});
