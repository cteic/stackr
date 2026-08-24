import type { Metadata } from 'next';
import { chainMeta, ChainSchema } from '@stackr/models';
import { WalletDetailView } from '@/components/wallet-detail-view';

interface WalletDetailPageProps {
  params: Promise<{ chain: string; address: string }>;
}

/**
 * Address-keyed, so the route is an unbounded crawl space with no search value
 * — every URL renders the same shell around one stranger's public balance.
 * Explicitly noindex/nofollow rather than merely absent from the sitemap, which
 * only withholds an invitation and does not withdraw one.
 */
export async function generateMetadata({ params }: WalletDetailPageProps): Promise<Metadata> {
  const { chain } = await params;
  const parsed = ChainSchema.safeParse(chain);
  const chainName = parsed.success ? chainMeta[parsed.data].name : 'Unknown chain';

  return {
    title: `${chainName} wallet — Stackr`,
    description: `Watch-only ${chainName} wallet view: balance, recent activity and liquidation health for one address.`,
    alternates: { canonical: null },
    robots: { index: false, follow: false },
  };
}

// Wallet addresses are user-supplied watch-only data, so there is no finite set
// of paths to pre-render.
export default async function WalletDetailPage({ params }: WalletDetailPageProps) {
  const { chain, address } = await params;
  return <WalletDetailView chain={chain} address={address} />;
}
