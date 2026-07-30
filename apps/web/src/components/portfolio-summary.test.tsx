import { describe as feature, it as scenario, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { bdd } from '../lib/bdd';
import { PortfolioSummary } from './portfolio-summary';

const { given, when, then } = bdd;

afterEach(cleanup);

feature('portfolio summary', () => {
  scenario('renders the total once balances and prices load', () => {
    when('the summary renders with a resolved total', () =>
      render(<PortfolioSummary totalFiat={1234.56} currency="usd" isLoading={false} />),
    );
    then('the formatted total is shown', () => {
      expect(screen.getByText('$1,234.56')).toBeTruthy();
    });
  });

  scenario('a failed price/balance read shows a dash, not a false zero', () => {
    given('every balance and price read failed, leaving nothing to total', () => {});
    when('the summary renders with isError set', () =>
      render(<PortfolioSummary totalFiat={0} currency="usd" isLoading={false} isError />),
    );
    then('it shows a dash instead of $0.00', () => {
      expect(screen.getByText('—')).toBeTruthy();
      expect(screen.queryByText('$0.00')).toBeNull();
    });
    then('it explains why', () => {
      expect(screen.getByText("Couldn't load prices")).toBeTruthy();
    });
  });
});
