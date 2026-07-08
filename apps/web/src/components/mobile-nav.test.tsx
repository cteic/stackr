import { describe as feature, it as scenario, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { bdd } from '../lib/bdd';
import { MobileNav } from './mobile-nav';

const { given, when, then } = bdd;

vi.mock('next/navigation', () => ({
  usePathname: () => '/holdings',
}));

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

  scenario('marks the current route so a visitor can tell where they are', async () => {
    given('the rendered mobile nav trigger', () => render(<MobileNav />));
    when('the menu is opened', () =>
      fireEvent.keyDown(screen.getByLabelText('Open menu'), { key: 'Enter' }),
    );
    await then('the matching link is marked current and its siblings are not', async () => {
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Holdings' })).toBeTruthy());
      expect(screen.getByRole('menuitem', { name: 'Holdings' }).getAttribute('aria-current')).toBe(
        'page',
      );
      expect(
        screen.getByRole('menuitem', { name: 'Markets' }).getAttribute('aria-current'),
      ).toBeNull();
    });
  });
});
