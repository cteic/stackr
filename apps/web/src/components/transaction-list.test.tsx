import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Transaction } from '@stackr/models';
import { TransactionList } from './transaction-list';

const TX: Transaction = {
  hash: '0xabc',
  chain: 'eth',
  type: 'receive',
  amount: '1.5',
  counterparty: '0xdef',
  timestamp: '2026-06-11T10:00:00.000Z',
  confirmed: true,
};

afterEach(() => {
  cleanup();
});

describe('TransactionList', () => {
  it('gives each row a focus-visible ring so keyboard users can see where they are', () => {
    render(<TransactionList transactions={[TX]} chain="eth" isLoading={false} />);

    const row = screen.getByRole('link');
    expect(row.className).toContain('focus-visible:ring-2');
    expect(row.className).toContain('focus-visible:ring-ring');
  });
});
