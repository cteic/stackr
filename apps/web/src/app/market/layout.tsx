import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Markets — Live Crypto Prices and Order Book | Stackr',
  description:
    'Live prices, 24-hour change and a streaming Kraken order book for Bitcoin, Ethereum, Stacks, Solana and Sui, plus daily closes for the stocks you track.',
  alternates: { canonical: '/market' },
};

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
