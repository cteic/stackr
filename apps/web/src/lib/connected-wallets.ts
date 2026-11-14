import type { Chain, Wallet } from '@stackr/models';

/**
 * Chains whose connected addresses become virtual wallets in the portfolio.
 *
 * These are the chains the WalletConnectionController bridges from a live
 * wallet SDK. Leather (stx/btc) and Slush (sui) still mirror their addresses
 * through `use-wallet-connections.ts`, so they are added here only once that
 * path folds into the controller (ADR 0015).
 */
const SURFACED_CHAINS: Chain[] = ['eth', 'sol'];

/**
 * Address comparison per chain. EVM addresses are case-insensitive hex, so a
 * watch-only entry saved in checksum case must still match the lowercase form
 * a connector reports. Solana addresses are base58 and **case-sensitive** —
 * lowercasing one would make two different accounts collide.
 */
function addressKey(chain: Chain, address: string): string {
  return chain === 'eth' ? address.toLowerCase() : address;
}

/**
 * Build the virtual `Wallet` records for connected addresses that are not
 * already watch-listed, so a connected account renders through the exact same
 * `WalletCard` as a watch-only one — one component, every chain.
 *
 * Pure and chain-agnostic on purpose: the dashboard passes the store's two
 * slices in and gets a list out, which keeps this unit-testable without React
 * or a wallet SDK.
 */
export function buildConnectedWallets(
  watched: Wallet[],
  connectedAddresses: Partial<Record<Chain, string[]>>,
  now: string = new Date().toISOString(),
): Wallet[] {
  return SURFACED_CHAINS.flatMap(chain => {
    const watchedKeys = new Set(
      watched.filter(wallet => wallet.chain === chain).map(w => addressKey(chain, w.address)),
    );
    const seen = new Set<string>();
    return (connectedAddresses[chain] ?? []).flatMap<Wallet>(address => {
      const key = addressKey(chain, address);
      if (watchedKeys.has(key) || seen.has(key)) return [];
      seen.add(key);
      return [
        {
          id: `connected:${chain}:${address}`,
          label: `${address.slice(0, 6)}…${address.slice(-4)}`,
          chain,
          address,
          createdAt: now,
        },
      ];
    });
  });
}

/**
 * The set of connected address keys, for marking a rendered wallet card as
 * "connected" rather than watch-only. Keyed the same way as
 * {@link buildConnectedWallets} so the two agree on what counts as a match.
 */
export function connectedAddressKeys(
  connectedAddresses: Partial<Record<Chain, string[]>>,
): Set<string> {
  const keys = new Set<string>();
  for (const chain of SURFACED_CHAINS) {
    for (const address of connectedAddresses[chain] ?? []) {
      keys.add(`${chain}:${addressKey(chain, address)}`);
    }
  }
  return keys;
}

/** Whether a wallet's address is one the user has connected a signer for. */
export function isConnectedWallet(keys: Set<string>, wallet: Wallet): boolean {
  return keys.has(`${wallet.chain}:${addressKey(wallet.chain, wallet.address)}`);
}
