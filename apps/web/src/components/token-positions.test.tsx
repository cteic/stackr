import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type * as QueriesModule from '@stackr/queries';
import type { TokenPosition } from '@stackr/models';
import { ServiceException } from '@stackr/services';
import { TokenPositions } from './token-positions';

const OWNER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const USDC: TokenPosition = {
  chain: 'sol',
  owner: OWNER,
  tokenId: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  rawAmount: '1234567',
  amount: '1.234567',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockUseTokenPositions = vi.fn();

vi.mock('@stackr/queries', async () => {
  const actual = await vi.importActual<typeof QueriesModule>('@stackr/queries');
  return { ...actual, useTokenPositions: () => mockUseTokenPositions() };
});

function queryResult(overrides: Record<string, unknown>) {
  return { data: undefined, isLoading: false, isError: false, error: null, ...overrides };
}

afterEach(() => {
  cleanup();
  mockUseTokenPositions.mockReset();
});

describe('TokenPositions', () => {
  it('renders nothing when no wallet is connected', () => {
    mockUseTokenPositions.mockReturnValue(queryResult({}));

    const { container } = render(<TokenPositions chain="sol" address="" />);

    expect(container.innerHTML).toBe('');
  });

  it('shows a loading placeholder while the read is in flight', () => {
    mockUseTokenPositions.mockReturnValue(queryResult({ isLoading: true }));

    render(<TokenPositions chain="sol" address={OWNER} />);

    expect(screen.getByLabelText('Loading tokens')).toBeTruthy();
  });

  it('says the account is empty rather than showing an error', () => {
    mockUseTokenPositions.mockReturnValue(queryResult({ data: [] }));

    render(<TokenPositions chain="sol" address={OWNER} />);

    expect(screen.getByText('No token balances on this account.')).toBeTruthy();
  });

  it('renders symbol, name and human-readable amount for a position', () => {
    mockUseTokenPositions.mockReturnValue(queryResult({ data: [USDC] }));

    render(<TokenPositions chain="sol" address={OWNER} />);

    expect(screen.getByText('USDC')).toBeTruthy();
    expect(screen.getByText('USD Coin')).toBeTruthy();
    expect(screen.getByText('1.234567')).toBeTruthy();
  });

  it('masks amounts when balances are hidden', () => {
    mockUseTokenPositions.mockReturnValue(queryResult({ data: [USDC] }));

    render(<TokenPositions chain="sol" address={OWNER} hideBalance />);

    expect(screen.queryByText('1.234567')).toBeNull();
    expect(screen.getByText('••••')).toBeTruthy();
  });

  it('distinguishes a rate limit from a broken read', () => {
    mockUseTokenPositions.mockReturnValue(
      queryResult({
        isError: true,
        error: new ServiceException({ kind: 'rate-limited', message: 'rate limit exceeded' }),
      }),
    );

    render(<TokenPositions chain="sol" address={OWNER} />);

    expect(screen.getByText(/load again shortly/)).toBeTruthy();
  });

  it('reports a failed read plainly', () => {
    mockUseTokenPositions.mockReturnValue(
      queryResult({
        isError: true,
        error: new ServiceException({ kind: 'upstream', status: 502, message: 'upstream error' }),
      }),
    );

    render(<TokenPositions chain="sol" address={OWNER} />);

    expect(screen.getByText(/the Solana RPC read failed/)).toBeTruthy();
  });
});
