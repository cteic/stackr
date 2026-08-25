'use client';

import type { Wallet } from '@stackr/models';
import { chainMeta } from '@stackr/models';
import { getExplorerUrl } from '@stackr/services';
import { Card, Skeleton, ChainAvatar } from '@stackr/ui';
import { useActivityState } from '@/lib/controllers/activity-controller-provider';

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

/**
 * A thin mirror of the ActivityController's merged feed. The controller owns the
 * fan-out across every watched/connected wallet, the dedupe on (chain, hash),
 * and the chronological merge-sort; this component only reads `items` off the
 * controller via `useActivityState` and renders the top of the feed. The
 * `wallets` prop is kept so existing callers are unchanged and the panel hides
 * when nothing is watched.
 */
export function RecentActivity({ wallets }: { wallets: Wallet[] }) {
  const { items, status } = useActivityState();

  if (wallets.length === 0) return null;

  const entries = items.slice(0, 8);
  const stillLoading = (status === 'loading' || status === 'idle') && entries.length === 0;

  return (
    <Card className="mt-4 overflow-hidden">
      <h2 className="border-b p-4 text-sm font-semibold">Recent activity</h2>
      <div className="p-2">
        {stillLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={40} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No transactions found yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {entries.map(activity => {
              const chain = activity.source;
              const meta = chainMeta[chain];
              const received = activity.direction === 'incoming';
              return (
                <li key={`${chain}:${activity.hash}`}>
                  <a
                    href={getExplorerUrl(chain, 'tx', activity.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChainAvatar chain={chain} size="sm" />
                      <span
                        className={`text-sm font-medium ${received ? 'text-success' : 'text-destructive'}`}
                      >
                        {received ? '↓ Received' : '↑ Sent'}
                      </span>
                      {!activity.confirmed && (
                        <span className="rounded-sm bg-warning/15 px-1 text-xs text-warning">
                          Pending
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span
                        className={`font-mono text-xs ${received ? 'text-success' : 'text-foreground'}`}
                      >
                        {received ? '+' : '−'}
                        {activity.amount} {meta.symbol}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(activity.timestamp)}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
