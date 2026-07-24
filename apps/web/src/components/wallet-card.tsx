'use client';

import Link from 'next/link';
import type { Wallet, Balance, Price, Currency } from '@stackr/models';
import { createPortfolioRowView } from '@stackr/features';
import { ChainAvatar, ItemLayout, Skeleton, Badge } from '@stackr/ui';
import { Sparkline } from '@stackr/charts/react';
import { useEnsName } from '@/lib/ens-queries';
import { walletHref } from '@/lib/wallet-href';

interface WalletCardProps {
  wallet: Wallet;
  balance?: Balance;
  isLoading?: boolean;
  price?: Price;
  sparklineData?: number[];
  currency?: Currency;
  connected?: boolean;
  hideBalance?: boolean;
}

export function WalletCard({
  wallet,
  balance,
  isLoading,
  price,
  sparklineData,
  currency = 'usd',
  connected = false,
  hideBalance = false,
}: WalletCardProps) {
  const view = createPortfolioRowView({
    wallet,
    balance,
    price,
    settings: { currency, hideBalance },
  });

  const { data: ensName } = useEnsName(
    wallet.chain === 'eth' ? (wallet.address as `0x${string}`) : undefined,
  );

  return (
    <Link
      href={walletHref(wallet.chain, wallet.address)}
      className="block rounded-lg border bg-card p-4 transition-colors hover:border-ring"
    >
      <div className="flex items-center gap-3">
        <ChainAvatar chain={wallet.chain} size="md" />
        <ItemLayout
          titleLeft={
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">{view.title}</span>
              {connected && <Badge variant="info">Connected</Badge>}
            </div>
          }
          captionLeft={
            <span className="text-xs text-muted-foreground">
              {view.chainName} &middot;{' '}
              <span className="font-mono">{ensName ?? view.truncatedAddress}</span>
            </span>
          }
          titleRight={
            isLoading ? (
              <Skeleton width={80} height="1.25em" />
            ) : view.symbolText !== null ? (
              <div className="flex items-center gap-2">
                {sparklineData && sparklineData.length >= 2 && (
                  <Sparkline data={sparklineData} width={60} height={20} strokeWidth={1} />
                )}
                <span className="font-mono text-sm text-foreground">{view.symbolText}</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">&mdash;</span>
            )
          }
          captionRight={
            isLoading ? (
              <Skeleton width={60} height="0.875em" />
            ) : view.fiatText !== null ? (
              <span className="text-xs text-muted-foreground">
                {view.fiatText}
                {view.changeText !== null && (
                  <span
                    className={`ml-1 ${
                      view.changeDirection === 'positive' ? 'text-success' : 'text-destructive'
                    }`}
                  >
                    {view.changeText}
                  </span>
                )}
              </span>
            ) : undefined
          }
        />
      </div>
    </Link>
  );
}
