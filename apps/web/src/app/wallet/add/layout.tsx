import type { Metadata } from 'next';
import { breadcrumbSchema, JsonLd } from '@/lib/structured-data';
import { resolveSiteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Add a Wallet — Watch BTC, ETH, STX, SOL or SUI | Stackr',
  description:
    'Add any Bitcoin, Ethereum, Stacks, Solana or Sui address to watch. The address is validated before it is saved, and the list stays in your browser — never uploaded.',
  alternates: { canonical: '/wallet/add' },
};

export default function AddWalletLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        schema={breadcrumbSchema(
          [
            { name: 'Portfolio', path: '/' },
            { name: 'Add a wallet', path: '/wallet/add' },
          ],
          resolveSiteUrl(),
        )}
      />
      {children}
    </>
  );
}
