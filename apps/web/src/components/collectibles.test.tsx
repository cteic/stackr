import { describe as feature, it as scenario, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { bdd } from '../lib/bdd';
import type { NftAsset } from '@stackr/models';

const { given, when, then } = bdd;

const useNftHoldingsMock = vi.fn();

vi.mock('@stackr/queries', () => ({
  useNftHoldings: (...args: unknown[]) => useNftHoldingsMock(...args),
}));

import { Collectibles } from './collectibles';

afterEach(() => {
  cleanup();
  useNftHoldingsMock.mockReset();
});

const ASSET: NftAsset = {
  chain: 'stx',
  protocol: 'sip9',
  contractId: 'SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173.the-explorer-guild',
  tokenId: '42',
  name: 'Explorer Guild #42',
  media: { url: 'https://example.com/42.png', contentType: 'image/png' },
  owner: 'SP2X0TZ59D5SZ8ACQ6YMCHHNR2ZN51Z32E2CJ173',
};

feature('collectibles', () => {
  scenario('a failed read with no assets shows an error, not a false "no collectibles"', () => {
    given('every chain read failed and none returned an asset', () => {
      useNftHoldingsMock.mockReturnValue({
        assets: [],
        isLoading: false,
        isFetching: false,
        isError: true,
        refresh: vi.fn(),
      });
    });
    when('the card renders', () => render(<Collectibles addressesByChain={{}} />));
    then('it surfaces the failure instead of "No collectibles found"', () => {
      expect(screen.getByRole('alert').textContent).toMatch(/couldn't load collectibles/i);
      expect(screen.queryByText('No collectibles found')).toBeNull();
    });
  });

  scenario('a partial failure shows assets alongside an incompleteness warning', () => {
    given('one chain failed but another returned an asset', () => {
      useNftHoldingsMock.mockReturnValue({
        assets: [ASSET],
        isLoading: false,
        isFetching: false,
        isError: true,
        refresh: vi.fn(),
      });
    });
    when('the card renders', () => render(<Collectibles addressesByChain={{}} />));
    then('the asset is shown next to a warning that results may be incomplete', () => {
      expect(screen.getByRole('alert').textContent).toMatch(/may be incomplete/i);
      expect(screen.getByText('Explorer Guild #42')).toBeTruthy();
    });
  });

  scenario('no error and no assets still reads as genuinely empty', () => {
    given('every chain read succeeded and found nothing', () => {
      useNftHoldingsMock.mockReturnValue({
        assets: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        refresh: vi.fn(),
      });
    });
    when('the card renders', () => render(<Collectibles addressesByChain={{}} />));
    then('it shows the plain empty state with no error callout', () => {
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText('No collectibles found')).toBeTruthy();
    });
  });
});
