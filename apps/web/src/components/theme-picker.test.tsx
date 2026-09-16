import { describe as feature, it as scenario, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ThemeProvider } from './theme-provider';
import { ThemePicker } from './theme-picker';
import { getDefaultStore } from 'jotai';
import { customThemeAtom } from '../lib/settings-store';

import { defaultCustomTheme } from '../lib/custom-theme';
import { bdd } from '../lib/bdd';

const store = getDefaultStore();

const { given, when, then } = bdd;

beforeEach(() => {
  localStorage.clear();
  store.set(customThemeAtom, defaultCustomTheme());
});
afterEach(cleanup);

function renderPicker() {
  return render(
    <ThemeProvider>
      <ThemePicker />
    </ThemeProvider>,
  );
}

feature('theme picker — custom entry', () => {
  scenario('the menu exposes a Custom option alongside the built-in themes', async () => {
    given('the rendered theme picker', () => renderPicker());
    when('the theme menu is opened', () =>
      fireEvent.keyDown(screen.getByLabelText('Choose theme'), { key: 'Enter' }),
    );
    await then('a Custom entry is shown', async () => {
      await waitFor(() => expect(screen.getByText('Custom')).toBeTruthy());
      expect(screen.getByText('Terminal')).toBeTruthy();
    });
  });

  scenario('choosing Custom opens the editor with colour inputs', async () => {
    given('the rendered theme picker', () => renderPicker());
    when('the menu is opened', () =>
      fireEvent.keyDown(screen.getByLabelText('Choose theme'), { key: 'Enter' }),
    );
    await when('the Custom entry is activated', async () => {
      const custom = await screen.findByText('Custom');
      fireEvent.click(custom);
    });
    await then('the editor surfaces a base selector and colour inputs', async () => {
      await waitFor(() => expect(screen.getByLabelText('Base theme')).toBeTruthy());
      expect(screen.getByLabelText('Background')).toBeTruthy();
    });
  });
});
