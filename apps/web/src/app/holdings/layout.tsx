import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Holdings — Cash, Stocks and Gold Beside Your Wallets | Stackr',
  description:
    'Hold cash, stock positions and physical gold next to your on-chain balances. Stackr totals every position in one currency, so net worth is one number, not five apps.',
  alternates: { canonical: '/holdings' },
};

export default function HoldingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
