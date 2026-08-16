'use client';

import type { Transaction, Chain } from '@stackr/models';
import { chainMeta } from '@stackr/models';
import { getExplorerUrl } from '@stackr/services';
import { ItemLayout, Skeleton } from '@stackr/ui';

interface TransactionListProps {
  transactions: Transaction[];
  chain: Chain;
  isLoading: boolean;
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(isoDate).toLocaleDateString();
}

export function TransactionList({ transactions, chain, isLoading }: TransactionListProps) {
  const meta = chainMeta[chain];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={48} />
        ))}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">No transactions found</div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {transactions.map(tx => (
        <a
          key={tx.hash}
          href={getExplorerUrl(chain, 'tx', tx.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-md transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ItemLayout
            titleLeft={
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${tx.type === 'receive' ? 'text-success' : 'text-destructive'}`}
                >
                  {tx.type === 'receive' ? '\u2193 Received' : '\u2191 Sent'}
                </span>
                {!tx.confirmed && (
                  <span className="text-xs text-warning bg-warning/15 px-1 rounded-sm">
                    Pending
                  </span>
                )}
              </div>
            }
            captionLeft={
              <span className="text-xs text-muted-foreground">
                {tx.counterparty !== 'unknown' ? (
                  <span className="font-mono">
                    {tx.counterparty.slice(0, 8)}&hellip;{tx.counterparty.slice(-4)}
                  </span>
                ) : (
                  'Unknown'
                )}
              </span>
            }
            titleRight={
              <span
                className={`font-mono text-xs ${tx.type === 'receive' ? 'text-success' : 'text-foreground'}`}
              >
                {tx.type === 'receive' ? '+' : '-'}
                {tx.amount} {meta.symbol}
              </span>
            }
            captionRight={
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(tx.timestamp)}
              </span>
            }
          />
        </a>
      ))}
    </div>
  );
}
