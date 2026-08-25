'use client';

import { chainMeta } from '@stackr/models';
import type { Chain, Currency } from '@stackr/models';
import { Card } from '@stackr/ui';

interface Allocation {
  chain: Chain;
  fiatValue: number;
  percentage: number;
}

interface PortfolioBreakdownProps {
  allocations: Allocation[];
  currency: Currency;
}

// Every chain sources its color from the theme tokens in `globals.css`, same
// as the error pages' chain bars — so the bars follow the light/dark palettes
// instead of drifting from a second, hardcoded copy.
const chainBarClasses: Record<Chain, string> = {
  btc: 'bg-chain-btc',
  eth: 'bg-chain-eth',
  stx: 'bg-chain-stx',
  sol: 'bg-chain-sol',
  sui: 'bg-chain-sui',
};

export function PortfolioBreakdown({ allocations }: PortfolioBreakdownProps) {
  if (allocations.length === 0) return null;

  const sorted = [...allocations].sort((a, b) => b.percentage - a.percentage);

  return (
    <Card className="p-4 mb-6">
      <h2 className="text-sm text-muted-foreground mb-3">Allocation</h2>

      {/* Stacked bar */}
      <div className="flex h-2 rounded-full overflow-hidden mb-3">
        {sorted.map(a => (
          <div
            key={a.chain}
            className={chainBarClasses[a.chain]}
            style={{ width: `${a.percentage}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {sorted.map(a => (
          <div key={a.chain} className="flex items-center gap-1">
            <div className={`h-2 w-2 rounded-full ${chainBarClasses[a.chain]}`} />
            <span className="text-xs text-muted-foreground">
              {chainMeta[a.chain].symbol} {a.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
