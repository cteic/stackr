'use client';

import type { Chain } from '@stackr/models';
import { isRateLimitError, useTokenPositions } from '@stackr/queries';
import { Callout, Card, ItemLayout, Skeleton } from '@stackr/ui';
import { maskFiat } from '@/lib/mask-fiat';

interface TokenPositionsProps {
  chain: Chain;
  /** The owner address, or an empty string when no wallet is connected. */
  address: string;
  hideBalance?: boolean;
}

/**
 * Fungible token positions for one address — SPL tokens on Solana today, and
 * whatever chain registers a token adapter next, with no change here.
 *
 * Each remote outcome gets its own state, because they call for different
 * actions from the user:
 *
 * - **no wallet** — nothing to read; the panel does not render at all.
 * - **empty** — the account genuinely holds no tokens. A success, not a fault.
 * - **rate-limited** — the shared RPC proxy refused this client for a window;
 *   the data is fine, the user should come back shortly.
 * - **failed** — the read broke. Say so plainly and keep the panel present.
 */
export function TokenPositions({ chain, address, hideBalance = false }: TokenPositionsProps) {
  const connected = address !== '';
  const { data, isLoading, isError, error } = useTokenPositions(chain, address, {
    enabled: connected,
  });

  // No wallet connected and no address to read: there is nothing to say, so the
  // panel stays out of the layout entirely rather than showing an empty shell.
  if (!connected) return null;

  const positions = data ?? [];

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b p-4 text-sm text-muted-foreground">Tokens</div>
      <div className="p-2">
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-label="Loading tokens">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} width="100%" height={48} />
            ))}
          </div>
        ) : isRateLimitError(error) ? (
          <Callout variant="warning" className="m-2">
            Too many requests to the Solana RPC right now — token balances will load again shortly.
          </Callout>
        ) : isError ? (
          <Callout variant="error" className="m-2">
            Couldn&apos;t load token balances — the Solana RPC read failed.
          </Callout>
        ) : positions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No token balances on this account.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {positions.map(position => (
              <li key={position.tokenId} className="rounded-md p-3">
                <ItemLayout
                  titleLeft={
                    <span className="text-sm font-medium text-foreground">{position.symbol}</span>
                  }
                  captionLeft={
                    <span className="text-xs text-muted-foreground">{position.name}</span>
                  }
                  titleRight={
                    <span className="font-mono text-xs text-foreground">
                      {maskFiat(position.amount, hideBalance)}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
