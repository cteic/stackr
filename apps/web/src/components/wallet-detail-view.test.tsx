import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type * as QueriesModule from '@stackr/queries';
import { WalletDetailView } from './wallet-detail-view';

const BTC_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const SOL_ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

// The header drags in the wallet-connect modal and every wallet adapter with
// it; none of that is under test here.
vi.mock('@/components/header', () => ({ Header: () => null }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

vi.mock('@stackr/analytics', () => ({ track: () => {} }));

const trackWallet = () => {};

vi.mock('@/lib/controllers/activity-controller-provider', () => ({
  useActivityState: () => ({ items: [], status: 'ready' }),
  useTrackWallet: () => trackWallet,
}));

vi.mock('@stackr/queries', async () => {
  const actual = await vi.importActual<typeof QueriesModule>('@stackr/queries');
  return {
    ...actual,
    useBalance: () => ({ data: undefined, isLoading: false, error: null }),
    usePrices: () => ({ data: undefined }),
    useTokenPositions: () => ({ data: [], isLoading: false, isError: false, error: null }),
  };
});

afterEach(() => {
  cleanup();
});

describe('WalletDetailView token positions', () => {
  it('shows the Tokens panel on a chain that has a token adapter', () => {
    render(<WalletDetailView chain="sol" address={SOL_ADDRESS} />);

    expect(screen.getByText('Tokens')).toBeTruthy();
    expect(screen.getByText('No token balances on this account.')).toBeTruthy();
  });

  it('omits the Tokens panel on a chain with no token adapter', () => {
    // Without the chain guard the panel renders anyway, and its disabled query
    // leaves it stuck on "No token balances on this account." — which reads as
    // an empty Bitcoin wallet rather than a chain we read no token layer for.
    render(<WalletDetailView chain="btc" address={BTC_ADDRESS} />);

    expect(screen.queryByText('Tokens')).toBeNull();
    expect(screen.queryByText('No token balances on this account.')).toBeNull();
  });
});
