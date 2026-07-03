/**
 * Pure display helpers for the wallet surfaces. Balances arrive as already
 * formatted decimal strings (the services layer owns base-unit math — see
 * `formatBaseUnits`); nothing here does numeric arithmetic on amounts, so no
 * precision can be lost at the display layer.
 */

/** Mask shown wherever a value is privacy-hidden. */
export const HIDDEN_VALUE = '••••••';

/** Middle-truncate an address: `bc1qxy2k…0wlh` — enough to recognise, short enough for a row. */
export function truncateAddress(address: string, visible = 4): string {
  const head = visible * 2;
  if (address.length <= head + visible + 1) {
    return address;
  }
  return `${address.slice(0, head)}…${address.slice(-visible)}`;
}

/** Sign-prefixed amount for an activity row: `+0.5 SOL` / `-0.5 SOL`. */
export function formatSignedAmount(
  direction: 'send' | 'receive',
  amount: string,
  symbol: string,
): string {
  const sign = direction === 'receive' ? '+' : '-';
  return `${sign}${amount} ${symbol}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact relative timestamp for activity rows. `now` is an explicit input
 * (not read from the clock) so rendering stays deterministic and testable.
 * Falls back to a locale date once the event is more than a week old.
 */
export function formatRelativeTime(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const elapsed = now.getTime() - then;
  if (elapsed < MINUTE) {
    return 'just now';
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h ago`;
  }
  if (elapsed < 7 * DAY) {
    return `${Math.floor(elapsed / DAY)}d ago`;
  }
  return new Date(then).toLocaleDateString();
}
