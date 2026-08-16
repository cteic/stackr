import { describe as feature, it as scenario, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { bdd } from '../lib/bdd';
import { MobileNav } from './mobile-nav';

const { given, when, then } = bdd;

const usePathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

afterEach(() => {
  cleanup();
  usePathnameMock.mockReset();
});

feature('mobile nav', () => {
  scenario('opening the menu exposes every primary route', async () => {
    usePathnameMock.mockReturnValue('/');
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
    usePathnameMock.mockReturnValue('/holdings');
    given('the mobile nav is open on the Holdings route', async () => {
      render(<MobileNav />);
      fireEvent.keyDown(screen.getByLabelText('Open menu'), { key: 'Enter' });
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Holdings' })).toBeTruthy());
    });
    then('the Holdings item is marked as the current page', () => {
      expect(screen.getByRole('menuitem', { name: 'Holdings' }).getAttribute('aria-current')).toBe(
        'page',
      );
    });
    then('an unrelated item is not marked current', () => {
      expect(
        screen.getByRole('menuitem', { name: 'Markets' }).getAttribute('aria-current'),
      ).toBeNull();
    });
  });
});
