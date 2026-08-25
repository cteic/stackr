import { describe, expect, it } from 'vitest';
import type { Balance, Price, Wallet } from '@stackr/models';
import { createPortfolioRowView } from './create-portfolio-row-view.js';

const wallet: Wallet = {
  id: '11111111-1111-1111-1111-111111111111',
  label: 'Cold storage',
  chain: 'btc',
  address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const balance: Balance = {
  chain: 'btc',
  address: wallet.address,
  rawBalance: '50000000',
  balance: '0.5',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const price: Price = {
  chain: 'btc',
  usdPrice: 60000,
  fiatPrice: 60000,
  currency: 'usd',
  change24h: 2.5,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('createPortfolioRowView', () => {
  it('derives title, chain name, symbol and truncated address', () => {
    const view = createPortfolioRowView({
      wallet,
      balance,
      price,
      settings: { currency: 'usd', hideBalance: false },
    });

    expect(view.title).toBe('Cold storage');
    expect(view.chainName).toBe('Bitcoin');
    expect(view.symbolText).toBe('0.5 BTC');
    expect(view.truncatedAddress).toBe('bc1qar…5mdq');
    expect(view.chainColor).toBe('#F7931A');
  });

  it('formats fiat in the chosen display currency', () => {
    const usd = createPortfolioRowView({
      wallet,
      balance,
      price,
      settings: { currency: 'usd', hideBalance: false },
    });
    const gbp = createPortfolioRowView({
      wallet,
      balance,
      price: { ...price, currency: 'gbp', fiatPrice: 48000 },
      settings: { currency: 'gbp', hideBalance: false },
    });

    expect(usd.fiatText).toBe('$30,000.00');
    expect(gbp.fiatText).toBe('£24,000.00');
  });

  it('masks fiat when balances are hidden but keeps the symbol text', () => {
    const view = createPortfolioRowView({
      wallet,
      balance,
      price,
      settings: { currency: 'usd', hideBalance: true },
    });

    expect(view.fiatText).toBe('••••');
    expect(view.symbolText).toBe('0.5 BTC');
  });

  it('marks a positive 24h change', () => {
    const view = createPortfolioRowView({
      wallet,
      balance,
      price: { ...price, change24h: 2.5 },
      settings: { currency: 'usd', hideBalance: false },
    });

    expect(view.changeText).toBe('+2.50%');
    expect(view.changeDirection).toBe('positive');
  });

  it('marks a negative 24h change', () => {
    const view = createPortfolioRowView({
      wallet,
      balance,
      price: { ...price, change24h: -3.75 },
      settings: { currency: 'usd', hideBalance: false },
    });

    expect(view.changeText).toBe('-3.75%');
    expect(view.changeDirection).toBe('negative');
  });

  it('returns null fiat and change when there is no price yet', () => {
    const view = createPortfolioRowView({
      wallet,
      balance,
      settings: { currency: 'usd', hideBalance: false },
    });

    expect(view.symbolText).toBe('0.5 BTC');
    expect(view.fiatText).toBeNull();
    expect(view.changeText).toBeNull();
    expect(view.changeDirection).toBeNull();
  });

  it('returns null symbol and fiat when there is no balance yet', () => {
    const view = createPortfolioRowView({
      wallet,
      price,
      settings: { currency: 'usd', hideBalance: false },
    });

    expect(view.symbolText).toBeNull();
    expect(view.fiatText).toBeNull();
    expect(view.changeText).toBe('+2.50%');
  });
});
