import { describe as feature, it as scenario, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
  });
});
