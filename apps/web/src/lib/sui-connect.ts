/**
 * Sui wallet connect flow over the Wallet Standard registry. Slush (the Sui
 * wallet, formerly Sui Wallet) registers itself through the
 * `wallet-standard:register-wallet` event protocol rather than a window
 * global, so discovery goes through `getWallets()` instead of
 * `wallet-detect.ts`.
 *
 * Mirrors the Leather pattern in `stacks-connect.ts`: this module owns the
 * connect/disconnect calls and session persistence, and
 * `use-wallet-connections.ts` owns writing the discovered addresses into the
 * wallet store. Connection is address discovery only — Stackr never requests
 * a signing feature (`standard:connect` is the sole feature invoked).
 *
 * We deliberately do NOT restrict to Slush alone — any Wallet Standard wallet
 * exposing a `sui:*` chain works; when several are installed, Slush is
 * preferred as the canonical Sui wallet.
 */
import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import { validateAddress } from '@stackr/models';

const SUI_CHAIN_PREFIX = 'sui:';
const CONNECT_FEATURE = 'standard:connect';
const DISCONNECT_FEATURE = 'standard:disconnect';
const PREFERRED_WALLET_NAME = 'slush';

/**
 * Remember that the user connected, so the session survives a refresh via a
 * silent reconnect. Wallet Standard wallets own the actual authorization; this
 * flag only records that a restore should be attempted (same division of
 * labour as the @stacks/connect-owned localStorage session).
 */
const REMEMBER_KEY = 'stackr-sui-wallet-connected';

type UnknownFunction = (...args: unknown[]) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFunction(value: unknown): value is UnknownFunction {
  return typeof value === 'function';
}

/** The `standard:connect` feature's `connect` method, when validly shaped. */
function connectMethodOf(wallet: Wallet): UnknownFunction | null {
  const feature: unknown = wallet.features[CONNECT_FEATURE];
  if (!isRecord(feature)) return null;
  const connect = feature['connect'];
  return isFunction(connect) ? connect : null;
}

function isSuiWallet(wallet: Wallet): boolean {
  return (
    wallet.chains.some(chain => chain.startsWith(SUI_CHAIN_PREFIX)) &&
    connectMethodOf(wallet) !== null
  );
}

/**
 * Pull the valid Sui addresses out of an untrusted `standard:connect` result
 * (or a wallet's own `accounts` list). Everything the wallet hands back is
 * treated as untrusted input: shape-checked, chain-checked, then validated
 * against the domain address pattern — never cast.
 */
function readSuiAddresses(accounts: unknown): string[] {
  if (!Array.isArray(accounts)) return [];

  const addresses: string[] = [];
  for (const account of accounts) {
    if (!isRecord(account)) continue;
    const address = account['address'];
    const chains = account['chains'];
    const onSui =
      Array.isArray(chains) &&
      chains.some(chain => typeof chain === 'string' && chain.startsWith(SUI_CHAIN_PREFIX));
    if (typeof address !== 'string' || !onSui) continue;
    if (!validateAddress('sui', address).valid) continue;
    if (!addresses.includes(address)) addresses.push(address);
  }
  return addresses;
}

/**
 * Find the connectable Sui wallet in the Wallet Standard registry, preferring
 * Slush by name when more than one is installed.
 */
export function findSuiWallet(): Wallet | null {
  const suiWallets = getWallets().get().filter(isSuiWallet);
  if (suiWallets.length === 0) return null;
  return (
    suiWallets.find(wallet => wallet.name.toLowerCase().includes(PREFERRED_WALLET_NAME)) ??
    suiWallets[0] ??
    null
  );
}

export function isSuiWalletAvailable(): boolean {
  return findSuiWallet() !== null;
}

/**
 * Watch the registry for Sui wallets registering or unregistering. Extensions
 * register asynchronously (their content script can land after hydration), so
 * install detection can't be a one-shot mount check like `wallet-detect.ts`.
 * Returns the unsubscribe function.
 */
export function subscribeSuiWalletAvailability(listener: (available: boolean) => void): () => void {
  const wallets = getWallets();
  const notify = () => listener(isSuiWalletAvailable());
  const offRegister = wallets.on('register', notify);
  const offUnregister = wallets.on('unregister', notify);
  return () => {
    offRegister();
    offUnregister();
  };
}

async function connectThrough(
  wallet: Wallet,
  input: { silent: boolean } | undefined,
): Promise<string[]> {
  const connect = connectMethodOf(wallet);
  if (!connect) return [];

  const result: unknown = await connect(input);
  const fromResult = isRecord(result) ? readSuiAddresses(result['accounts']) : [];
  // Per the spec the connect output carries the authorized accounts, but fall
  // back to the wallet's own account list for wallets that only populate that.
  return fromResult.length > 0 ? fromResult : readSuiAddresses(wallet.accounts);
}

/**
 * Connect to the installed Sui wallet and return its addresses, or null when
 * no wallet is installed or the wallet authorized no usable Sui account.
 * A user rejection rejects the promise — the connect modal surfaces it.
 */
export async function connectSuiWallet(): Promise<string[] | null> {
  const wallet = findSuiWallet();
  if (!wallet) return null;

  const addresses = await connectThrough(wallet, undefined);
  if (addresses.length === 0) return null;

  rememberSuiConnection(true);
  return addresses;
}

/**
 * Re-read the addresses of a previously connected wallet without prompting
 * (`silent: true`). Returns null when there is nothing to restore — no
 * remembered session, wallet not (yet) registered, or the wallet declined the
 * silent connect. The remembered flag is kept on a failed restore: the wallet
 * may simply not have registered yet.
 */
export async function restoreSuiWallet(): Promise<string[] | null> {
  if (!isSuiWalletRemembered()) return null;
  const wallet = findSuiWallet();
  if (!wallet) return null;

  try {
    const addresses = await connectThrough(wallet, { silent: true });
    return addresses.length > 0 ? addresses : null;
  } catch {
    return null;
  }
}

export function disconnectSuiWallet(): void {
  rememberSuiConnection(false);

  const wallet = findSuiWallet();
  if (!wallet) return;
  const feature: unknown = wallet.features[DISCONNECT_FEATURE];
  if (!isRecord(feature)) return;
  const disconnect = feature['disconnect'];
  if (!isFunction(disconnect)) return;

  // Best-effort: revoke the wallet-side authorization too, but the local
  // session is already forgotten whether or not the wallet supports it.
  void Promise.resolve(disconnect()).catch(() => undefined);
}

export function isSuiWalletRemembered(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REMEMBER_KEY) === 'true';
}

function rememberSuiConnection(remembered: boolean): void {
  if (typeof window === 'undefined') return;
  if (remembered) {
    window.localStorage.setItem(REMEMBER_KEY, 'true');
  } else {
    window.localStorage.removeItem(REMEMBER_KEY);
  }
}
