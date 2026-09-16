import { describe as feature, it as scenario, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';
import { useAtomValue } from 'jotai';
import { bdd } from './bdd';
import { walletsAtom } from './wallet-store';
import { holdingsAtom } from './holdings-store';
import { currencyAtom } from './settings-store';

const { given, when, then } = bdd;

/**
 * The persisted atoms read storage when a component first subscribes, not when
 * the module loads. That ordering is what keeps the first client render equal
 * to the server's HTML, and it is easy to break: a derived atom that never
 * mounts its persisted dependency would silently start every session empty.
 * These scenarios pin the behaviour through a real subscription.
 */

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function seed(key: string, state: unknown, version: number) {
  localStorage.setItem(key, JSON.stringify({ state, version }));
}

feature('persisted state reaches a mounted component', () => {
  scenario('a saved wallet list is restored when a component subscribes', async () => {
    given('a persisted wallet', () =>
      seed(
        'stackr-wallets',
        {
          wallets: [
            {
              id: crypto.randomUUID(),
              label: 'Cold storage',
              chain: 'btc',
              address: 'bc1qtest123',
              createdAt: new Date().toISOString(),
            },
          ],
        },
        1,
      ),
    );

    const { result } = renderHook(() => useAtomValue(walletsAtom));

    when('a component subscribes to the wallet list', async () => {
      await waitFor(() => expect(result.current).toHaveLength(1));
    });

    then('it sees the saved wallet', () => expect(result.current[0].address).toBe('bc1qtest123'));
  });

  scenario('a corrupt record is dropped before it reaches the component', async () => {
    given('a persisted list holding one valid and one corrupt record', () =>
      seed(
        'stackr-wallets',
        {
          wallets: [
            {
              id: crypto.randomUUID(),
              label: 'Cold storage',
              chain: 'btc',
              address: 'bc1qtest123',
              createdAt: new Date().toISOString(),
            },
            { id: 'not-a-uuid', chain: 'doge' },
          ],
        },
        0,
      ),
    );

    const { result } = renderHook(() => useAtomValue(walletsAtom));

    when('a component subscribes', async () => {
      await waitFor(() => expect(result.current).toHaveLength(1));
    });

    then('only the valid wallet is rendered', () => expect(result.current[0].chain).toBe('btc'));
  });

  scenario('a saved currency is restored', async () => {
    given('a persisted currency of eur', () => seed('stackr-settings', { currency: 'eur' }, 2));

    const { result } = renderHook(() => useAtomValue(currencyAtom));

    when('a component subscribes to the currency', async () => {
      await waitFor(() => expect(result.current).toBe('eur'));
    });

    then('it reads eur rather than the usd default', () => expect(result.current).toBe('eur'));
  });

  scenario('an empty holdings key leaves the component on its default', async () => {
    const { result } = renderHook(() => useAtomValue(holdingsAtom));

    when('a component subscribes with nothing persisted', async () => {
      await waitFor(() => expect(result.current).toEqual([]));
    });

    then('the list is empty rather than undefined', () => expect(result.current).toEqual([]));
  });
});
