import { describe as feature, it as scenario, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { bdd } from '../lib/bdd';
import { MobileNav } from './mobile-nav';

const { given, when, then } = bdd;

afterEach(cleanup);

feature('mobile nav', () => {
  scenario('opening the menu exposes every primary route', async () => {
    given('the rendered mobile nav trigger', () => render(<MobileNav />));
    when('the menu is opened', () =>
      fireEvent.keyDown(screen.getByLabelText('Open menu'), { key: 'Enter' }),
    );
    await then('all page links are shown', async () => {
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Holdings' })).toBeTruthy());
      expect(screen.getByRole('menuitem', { name: 'Add Wallet' })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: 'Markets' })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: 'Collectibles' })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeTruthy();
    });
  });
});
