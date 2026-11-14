/**
 * Display metadata for well-known SPL mints.
 *
 * Solana's `getTokenAccountsByOwner` returns a mint address, an amount and the
 * mint's decimals — but no symbol or name. Resolving those properly means
 * another network call per mint (a token-list service or the Metaplex metadata
 * account), which adds a second provider dependency and a per-render fan-out
 * for what is, in the end, a label.
 *
 * So this is a small curated registry instead. It supplies **display metadata
 * only**: `decimals` always comes from the chain response, never from here, so
 * a stale or wrong entry can mis-label a row but can never mis-scale an amount.
 * An unknown mint falls back to a truncated mint address, which is honest
 * rather than blank.
 *
 * Adding a mint is one entry. Replacing the whole thing with a token-list
 * adapter is a change to `resolveTokenMeta` and nothing else.
 */

export interface SolTokenMeta {
  readonly symbol: string;
  readonly name: string;
}

export const SOL_TOKEN_REGISTRY: Record<string, SolTokenMeta> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD' },
  So11111111111111111111111111111111111111112: { symbol: 'wSOL', name: 'Wrapped SOL' },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: 'BONK', name: 'Bonk' },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', name: 'Jupiter' },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: 'mSOL', name: 'Marinade staked SOL' },
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { symbol: 'JitoSOL', name: 'Jito staked SOL' },
  jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL: { symbol: 'JTO', name: 'Jito' },
};

/** How many leading/trailing mint characters an unknown token shows. */
const MINT_FRAGMENT = 4;

/** A readable stand-in for a mint with no registry entry. */
export function truncateMint(mint: string): string {
  if (mint.length <= MINT_FRAGMENT * 2 + 1) return mint;
  return `${mint.slice(0, MINT_FRAGMENT)}…${mint.slice(-MINT_FRAGMENT)}`;
}

/**
 * Display metadata for a mint. Known mints get their real symbol and name;
 * everything else gets a truncated mint for both, so the row still reads as a
 * distinct token rather than an empty cell.
 */
export function resolveTokenMeta(mint: string): SolTokenMeta {
  const known = SOL_TOKEN_REGISTRY[mint];
  if (known) return known;
  const fallback = truncateMint(mint);
  return { symbol: fallback, name: fallback };
}
