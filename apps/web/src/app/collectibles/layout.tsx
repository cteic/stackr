import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Collectibles — Stacks NFT Holdings | Stackr',
  description:
    'See the NFTs held by any Stacks address: SIP-9 collections, media previews and floor-price estimates, shown separately from your portfolio total so totals stay honest.',
  alternates: { canonical: '/collectibles' },
};

export default function CollectiblesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
