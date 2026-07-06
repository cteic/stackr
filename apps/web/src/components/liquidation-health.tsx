'use client';

import type { Protocol } from '@stackr/models';
import { chainMeta } from '@stackr/models';
import { Badge, Button, Callout, Card, ChainAvatar, Skeleton } from '@stackr/ui';
import { formatFiat } from '@stackr/services';
import { useHealthPositions, type HealthAddressesByChain } from '@stackr/queries';
import { maskFiat } from '@/lib/mask-fiat';
import { RiskPill } from './risk-pill';

const protocolLabels: Record<Protocol, string> = {
  'aave-v3': 'Aave v3',
  kamino: 'Kamino',
  zest: 'Zest',
  granite: 'Granite',
};

function maskAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface LiquidationHealthProps {
  /**
   * Watched + connected addresses to read liquidation health for, grouped by
   * chain — EVM addresses feed Aave, Solana addresses feed Kamino, Stacks
   * addresses feed Zest + Granite.
   */
  addressesByChain: HealthAddressesByChain;
  hideBalance?: boolean;
}

export function LiquidationHealth({
  addressesByChain,
  hideBalance = false,
}: LiquidationHealthProps) {
  const { positions, isLoading, isFetching, isError, refresh } =
    useHealthPositions(addressesByChain);

  return (
    <Card className="mt-4 p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Liquidation health</h2>
        <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Collateral and debt shown in USD.</p>

      {isError && (
        <Callout variant="error" className="mb-3">
          {positions.length === 0
            ? "Couldn't check lending positions — one or more protocol reads failed."
            : 'Some protocol reads failed — positions below may be incomplete.'}
        </Callout>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton height="3.5em" />
          <Skeleton height="3.5em" />
        </div>
      ) : positions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {isError ? 'No lending positions confirmed.' : 'No lending positions detected'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {positions.map(position => (
            <li
              key={`${position.protocol}:${position.address}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ChainAvatar chain={position.chain} size="sm" />
                <div className="min-w-0">
                  <Badge variant="default">{protocolLabels[position.protocol]}</Badge>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {chainMeta[position.chain].name} &middot;{' '}
                    <span className="font-mono">{maskAddress(position.address)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    Collateral{' '}
                    <span className="font-mono text-foreground">
                      {maskFiat(formatFiat(position.collateralValueUsd, 'usd'), hideBalance)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Debt{' '}
                    <span className="font-mono text-foreground">
                      {maskFiat(formatFiat(position.debtValueUsd, 'usd'), hideBalance)}
                    </span>
                  </div>
                </div>
                <RiskPill risk={position.liquidationRisk} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
