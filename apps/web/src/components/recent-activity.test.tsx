import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Activity, Wallet } from '@stackr/models';
import { RecentActivity } from './recent-activity';

const WALLET: Wallet = {
  id: '11111111-1111-1111-1111-111111111111',
  label: 'Demo · vitalik.eth',
  chain: 'eth',
  address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA9604',
  createdAt: '2026-06-11T10:00:00.000Z',
};

const ACTIVITY: Activity = {
  hash: '0xabc',
  chain: 'eth',
  type: 'receive',
  amount: '1.5',
  counterparty: '0xdef',
  timestamp: '2026-06-11T10:00:00.000Z',
  confirmed: true,
  source: 'eth',
  wallet: WALLET.address,
  direction: 'incoming',
  category: 'transfer',
};

const mockUseActivityState = vi.fn();

vi.mock('@/lib/controllers/activity-controller-provider', () => ({
  useActivityState: () => mockUseActivityState(),
}));

afterEach(() => {
  cleanup();
  mockUseActivityState.mockReset();
});

describe('RecentActivity', () => {
  it('gives each row a focus-visible ring so keyboard users can see where they are', () => {
    mockUseActivityState.mockReturnValue({ items: [ACTIVITY], status: 'ready' });

    render(<RecentActivity wallets={[WALLET]} />);

    const row = screen.getByRole('link');
    expect(row.className).toContain('focus-visible:ring-2');
    expect(row.className).toContain('focus-visible:ring-ring');
  });
});
