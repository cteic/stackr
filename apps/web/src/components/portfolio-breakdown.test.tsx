import { describe as feature, it as scenario, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { bdd } from '../lib/bdd';
import { PortfolioBreakdown } from './portfolio-breakdown';

const { given, when, then } = bdd;

afterEach(cleanup);

feature('portfolio breakdown', () => {
  scenario('chain bar segments source their color from theme tokens, not hardcoded hex', () => {
    given('a single-chain allocation', () => {});
    const rendered = when('the allocation bar renders', () =>
      render(
        <PortfolioBreakdown
          allocations={[{ chain: 'btc', fiatValue: 600, percentage: 60 }]}
          currency="usd"
        />,
      ),
    );
    then('the BTC segment uses the bg-chain-btc token class, not an inline color', () => {
      const segment = rendered.container.querySelector('.bg-chain-btc');
      expect(segment).toBeTruthy();
      expect(segment?.getAttribute('style')).not.toMatch(/background-color/i);
    });
  });
});
