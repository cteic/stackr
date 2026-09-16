import { describe as feature, it as scenario, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { bdd } from '../lib/bdd';
import { Footer } from './footer';

const { when, then } = bdd;

afterEach(cleanup);

feature('footer', () => {
  scenario('grounds every page with the brand mark and a source link', () => {
    when('the footer renders', () => render(<Footer />));
    then('the wordmark and tagline are shown', () => {
      expect(screen.getByText('STACKR')).toBeTruthy();
      expect(screen.getByText('Watch-only · self-custody · runs in your browser')).toBeTruthy();
    });
    then('it links out to the source repository', () => {
      const link = screen.getByRole('link', { name: /source/i });
      expect(link.getAttribute('href')).toBe('https://github.com/pete-watters/stackr');
    });
    then(
      'the source link has a focus-visible ring so keyboard users can see where they are',
      () => {
        const link = screen.getByRole('link', { name: /source/i });
        expect(link.className).toContain('focus-visible:ring-2');
        expect(link.className).toContain('focus-visible:ring-ring');
      },
    );
  });

  scenario('links every page to the privacy policy, terms and support', () => {
    when('the footer renders', () => render(<Footer />));
    then('the legal nav exposes the three public routes', () => {
      const nav = screen.getByRole('navigation', { name: 'Legal and support' });
      expect(within(nav).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe(
        '/privacy',
      );
      expect(within(nav).getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms');
      expect(within(nav).getByRole('link', { name: 'Support' }).getAttribute('href')).toBe(
        '/support',
      );
    });
    then('each legal link carries the same focus-visible ring as the source link', () => {
      ['Privacy', 'Terms', 'Support'].forEach(name => {
        expect(screen.getByRole('link', { name }).className).toContain('focus-visible:ring-2');
      });
    });
  });
});
