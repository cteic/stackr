import { useQuery } from '@tanstack/react-query';
import type { Chain, TokenPosition } from '@stackr/models';
import { fetchTokenPositions, supportsTokenPositions } from '@stackr/services';
import { queryKeys } from './keys.js';
import { retryRemoteRead, type RemoteReadError } from './retry.js';

export interface UseTokenPositionsOptions {
  /** Skip the read entirely — used when no wallet is connected. */
  enabled?: boolean;
}

/**
 * Fungible token positions for one address — SPL tokens on Solana today.
 *
 * Longer-lived than a native balance: token positions change when the user
 * trades, not every block, so the data is trusted for two minutes and refetched
 * every five rather than at the 30s balance cadence. That also keeps the read
 * inside the RPC proxy's rate-limit window when several wallets are watched.
 *
 * Failures are typed as {@link RemoteReadError}, so a caller can tell a
 * rate-limit ("come back shortly") from a dead provider ("this is broken")
 * without reading an error message.
 */
export function useTokenPositions(
  chain: Chain,
  address: string,
  { enabled = true }: UseTokenPositionsOptions = {},
) {
  return useQuery<TokenPosition[], RemoteReadError>({
    queryKey: queryKeys.tokenPositions(chain, address),
    queryFn: () => fetchTokenPositions(chain, address),
    enabled: enabled && address !== '' && supportsTokenPositions(chain),
    staleTime: 120_000,
    refetchInterval: 300_000,
    retry: retryRemoteRead,
  });
}
