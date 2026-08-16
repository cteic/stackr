'use client';

import type { Currency } from '@stackr/models';
import { formatFiat, formatChange } from '@stackr/services';
import { Badge, Card, Skeleton } from '@stackr/ui';
import { Sparkline } from '@stackr/charts/react';
import { maskFiat } from '@/lib/mask-fiat';

interface PortfolioSummaryProps {
  totalFiat: number;
  currency: Currency;
  change24h?: number;
  sparklineData?: number[];
  isLoading: boolean;
  isError?: boolean;
  hideBalance?: boolean;
}

export function PortfolioSummary({
  totalFiat,
  currency,
  change24h,
  sparklineData,
  isLoading,
  isError = false,
  hideBalance = false,
}: PortfolioSummaryProps) {
  return (
    <Card className="p-6 mb-6">
      <div className="text-sm text-muted-foreground mb-2">Total Portfolio Value</div>
      <div className="flex items-center gap-4">
        <div>
          {isLoading ? (
            <Skeleton width={180} height="2.5rem" />
          ) : isError ? (
            <div className="text-3xl font-mono font-bold text-muted-foreground">&mdash;</div>
          ) : (
            <div className="text-3xl font-mono font-bold text-foreground">
              {maskFiat(formatFiat(totalFiat, currency), hideBalance)}
            </div>
          )}
          {!isLoading && !isError && change24h !== undefined && (
            <Badge variant={change24h >= 0 ? 'success' : 'error'} className="mt-1">
              {formatChange(change24h)}
            </Badge>
          )}
          {!isLoading && isError && (
            <div className="mt-1 text-xs text-muted-foreground">Couldn&apos;t load prices</div>
          )}
        </div>
        {!isError && sparklineData && sparklineData.length >= 2 && (
          <div className="ml-auto">
            <Sparkline data={sparklineData} width={120} height={40} />
          </div>
        )}
      </div>
    </Card>
  );
}
