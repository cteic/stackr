import { describe as feature, it as scenario, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { bdd } from '../lib/bdd';
import type { HealthPosition } from '@stackr/models';

const { given, when, then } = bdd;

const useHealthPositionsMock = vi.fn();

vi.mock('@stackr/queries', () => ({
  useHealthPositions: (...args: unknown[]) => useHealthPositionsMock(...args),
}));

import { LiquidationHealth } from './liquidation-health';

afterEach(() => {
  cleanup();
  useHealthPositionsMock.mockReset();
});

const POSITION: HealthPosition = {
  chain: 'eth',
  protocol: 'aave-v3',
  address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  collateralValueUsd: 1000,
  debtValueUsd: 500,
  liquidationRisk: 0.5,
  native: { healthFactor: 2 },
  oracle: 'chainlink',
  updatedAt: '2026-07-05T00:00:00.000Z',
};

feature('liquidation health', () => {
  scenario('a failed read with no positions shows an error, not a false "no positions"', () => {
    given('every adapter read failed and none returned a position', () => {
      useHealthPositionsMock.mockReturnValue({
        positions: [],
        isLoading: false,
        isFetching: false,
        isError: true,
        refresh: vi.fn(),
      });
    });
    when('the card renders', () => render(<LiquidationHealth addressesByChain={{}} />));
    then('it surfaces the failure instead of "no lending positions detected"', () => {
      expect(screen.getByRole('alert').textContent).toMatch(/couldn't check lending positions/i);
      expect(screen.queryByText('No lending positions detected')).toBeNull();
    });
  });

  scenario('a partial failure shows positions alongside an incompleteness warning', () => {
    given('one adapter failed but another returned a position', () => {
      useHealthPositionsMock.mockReturnValue({
        positions: [POSITION],
        isLoading: false,
        isFetching: false,
        isError: true,
        refresh: vi.fn(),
      });
    });
    when('the card renders', () => render(<LiquidationHealth addressesByChain={{}} />));
    then('the position is shown next to a warning that results may be incomplete', () => {
      expect(screen.getByRole('alert').textContent).toMatch(/may be incomplete/i);
      expect(screen.getByText('Aave v3')).toBeTruthy();
    });
  });

  scenario('no error and no positions still reads as genuinely empty', () => {
    given('every adapter succeeded and found nothing', () => {
      useHealthPositionsMock.mockReturnValue({
        positions: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        refresh: vi.fn(),
      });
    });
    when('the card renders', () => render(<LiquidationHealth addressesByChain={{}} />));
    then('it shows the plain empty state with no error callout', () => {
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText('No lending positions detected')).toBeTruthy();
    });
  });
});
