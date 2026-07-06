import { WalletDetailView } from '@/components/wallet-detail-view';

// Wallet addresses are user-supplied watch-only data, so there is no finite set
// of paths to pre-render.
export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ chain: string; address: string }>;
}) {
  const { chain, address } = await params;
  return <WalletDetailView chain={chain} address={address} />;
}
