import type { Activity, Chain, Transaction } from '@stackr/models';
import { fetchTransactions as defaultFetchTransactions } from '@stackr/services';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type StateMetadata,
} from './BaseController.js';
import type { Messenger } from './Messenger.js';
import type { WalletRef } from './PortfolioController.js';
import {
  selectConnectedAccounts,
  type WalletConnectionControllerState,
  type WalletConnectionControllerStateChangeEvent,
} from './WalletConnectionController.js';

/**
 * ActivityController — the stateful layer over the per-chain transaction
 * normalizers, producing one merged, deduped, chronologically-sorted activity
 * feed.
 *
 * This is stackr's analog of MetaMask's `TransactionController` + the
 * activity-list pipeline that renders on top of it — generalized from one chain
 * to four. The services package already draws the anti-corruption boundary
 * (ADR 0012): each chain's raw provider response is normalized to a domain
 * `Transaction` behind `fetchTransactions(chain, address)`. This controller adds
 * what a *feed* needs that a single chain's list does not:
 *
 *   1. **Fan-out.** One `refresh` queries every watched address across every
 *      chain in parallel (the four normalizers behind the ACL).
 *   2. **Enrichment.** Each `Transaction` becomes an `Activity` tagged with its
 *      feed `source`, the `wallet` it belongs to, a normalized `direction`, and
 *      a coarse `category`.
 *   3. **Dedupe + merge-sort.** Entries are deduped on `(chain, hash)` and
 *      merge-sorted by timestamp into a single descending feed.
 *
 * Like every controller it owns its state privately and announces changes on
 * `:stateChange`; the dashboard "recent activity" panel and the wallet-detail
 * transaction list become thin mirrors of this feed via `useController`.
 *
 * The wallet set it refreshes is the union of two inputs, mirroring the issue's
 * two triggers:
 *   - **Connected accounts** arrive through the messenger by subscribing to
 *     `WalletConnectionController:stateChange` — no reference to that
 *     controller, exactly the decoupling PortfolioController uses.
 *   - **Watch-only addresses** are pushed in via `setWatchedWallets`, the bridge
 *     from the app's wallet atoms (which live in the app, not a controller).
 * Either changing re-runs the feed, with no UI glue in between.
 */

export type ActivityStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Narrows a `refresh` to a slice of the feed. With no scope the whole feed is
 * rebuilt; with a `chain` and/or `address` only the matching wallets are
 * re-fetched and that slice of the existing feed is replaced — the rest is kept.
 * This is what lets the wallet-detail page refresh just its own address without
 * disturbing the dashboard's merged feed.
 */
export type ActivityScope = {
  chain?: Chain;
  address?: string;
};

export type ActivityControllerState = {
  /** The merged, deduped, timestamp-descending feed. */
  items: Activity[];
  /**
   * The most-recent timestamp seen per feed source — a high-water mark, not an
   * opaque pagination token (see ADR 0017). The underlying normalizers return
   * the latest page rather than a cursor, so "where we are" in each source is
   * best expressed as the newest row we have, usable as a "what's new since"
   * boundary on the next refresh.
   */
  cursorBySource: Partial<Record<Chain, string | null>>;
  status: ActivityStatus;
};

/**
 * Per-property policy flags (the metadata that drives `getPersistentState` /
 * `getAnonymizedState` in MetaMask). The three properties land on three
 * different combinations, which is the point of the flags existing:
 *
 *   - `items` — holds addresses, counterparties and amounts, so it is never
 *     safe to log (`includeInStateLogs: false`), the same redaction judgement
 *     PortfolioController applies to `holdings`. It is re-fetched from live
 *     provider data on load, so it is not persisted.
 *   - `cursorBySource` — a map of chain → timestamp carries no PII, so it *is*
 *     safe to log, and it *is* worth persisting: it survives a reload as the
 *     "what's new since last visit" boundary even though the items themselves
 *     are re-fetched.
 *   - `status` — a transient lifecycle flag: not persisted, safe to log.
 */
const metadata: StateMetadata<ActivityControllerState> = {
  items: { persist: false, usedInUi: true, includeInStateLogs: false },
  cursorBySource: { persist: true, usedInUi: false, includeInStateLogs: true },
  status: { persist: false, usedInUi: true, includeInStateLogs: true },
};

export function getDefaultActivityControllerState(): ActivityControllerState {
  return { items: [], cursorBySource: {}, status: 'idle' };
}

const controllerName = 'ActivityController';

/** Injected data source, so the controller is testable without the network. */
export type FetchTransactionsFn = (chain: Chain, address: string) => Promise<Transaction[]>;

export type ActivityControllerGetStateAction = ControllerGetStateAction<
  'ActivityController',
  ActivityControllerState
>;

export type ActivityControllerRefreshAction = {
  type: 'ActivityController:refresh';
  handler: (scope?: ActivityScope) => Promise<void>;
};

export type ActivityControllerSetWatchedWalletsAction = {
  type: 'ActivityController:setWatchedWallets';
  handler: (wallets: WalletRef[]) => void;
};

export type ActivityControllerActions =
  | ActivityControllerGetStateAction
  | ActivityControllerRefreshAction
  | ActivityControllerSetWatchedWalletsAction;

export type ActivityControllerStateChangeEvent = ControllerStateChangeEvent<
  'ActivityController',
  ActivityControllerState
>;

export type ActivityControllerEvents = ActivityControllerStateChangeEvent;

/** Events this controller reacts to on the shared messenger. */
type AllowedEvents = WalletConnectionControllerStateChangeEvent;

/**
 * The messenger this controller is handed: its own surface plus the
 * `WalletConnectionController:stateChange` event it subscribes to (the
 * `Allowed*` union a real `RestrictedMessenger` would enforce at runtime).
 */
export type ActivityControllerMessenger = Messenger<
  ActivityControllerActions,
  ActivityControllerEvents | AllowedEvents
>;

export class ActivityController extends BaseController<
  'ActivityController',
  ActivityControllerState,
  ActivityControllerMessenger
> {
  readonly #fetchTransactions: FetchTransactionsFn;

  /** Watch-only addresses, pushed in from the wallet store via the bridge. */
  #watchedWallets: WalletRef[] = [];

  /** Connected accounts, mirrored from WalletConnectionController:stateChange. */
  #connectedWallets: WalletRef[] = [];

  /**
   * A stable key for the wallet set we last refreshed on. A connection's
   * `:stateChange` fires for status-only transitions too, so we only re-refresh
   * when the *set of addresses* actually moves (the same debounce
   * PortfolioController applies).
   */
  #lastWalletKey = '';

  /** The most recent refresh promise, so callers/UI can await in-flight work. */
  #refreshing: Promise<void> = Promise.resolve();

  constructor({
    messenger,
    state,
    fetchTransactions = defaultFetchTransactions,
  }: {
    messenger: ActivityControllerMessenger;
    state?: Partial<ActivityControllerState>;
    fetchTransactions?: FetchTransactionsFn;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...getDefaultActivityControllerState(), ...state },
    });

    this.#fetchTransactions = fetchTransactions;

    this.messagingSystem.registerActionHandler(
      'ActivityController:refresh',
      this.refresh.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'ActivityController:setWatchedWallets',
      this.setWatchedWallets.bind(this),
    );

    // React to wallet connections through the messenger, with no reference to
    // WalletConnectionController. When the connected account set changes,
    // re-build the feed — the same coordination PortfolioController uses.
    this.messagingSystem.subscribe(
      'WalletConnectionController:stateChange',
      this.#onConnectedAccountsChange.bind(this),
    );
  }

  /** The most recent (possibly in-flight) refresh, for awaiting/teardown. */
  get refreshing(): Promise<void> {
    return this.#refreshing;
  }

  /**
   * Replace the watch-only address set (the bridge from the app's wallet
   * store). Re-runs the feed if the effective wallet set changed. Registered as
   * `ActivityController:setWatchedWallets`.
   */
  setWatchedWallets(wallets: WalletRef[]): void {
    this.#watchedWallets = wallets;
    this.#refreshIfWalletsChanged();
  }

  /**
   * Rebuild the feed. With no `scope`, every watched/connected wallet is
   * re-fetched and the feed is replaced wholesale. With a `scope`, only the
   * matching wallets are re-fetched and only that slice of the feed is replaced.
   * Registered as `ActivityController:refresh`.
   */
  async refresh(scope?: ActivityScope): Promise<void> {
    this.#refreshing = this.#performRefresh(scope);
    return this.#refreshing;
  }

  async #performRefresh(scope?: ActivityScope): Promise<void> {
    const targets = this.#targetsForScope(scope);
    this.update(state => {
      state.status = 'loading';
    });

    // `allSettled`, not `all`: one chain's provider failing (an Etherscan rate
    // limit, a flaky RPC) must not blank the entire cross-chain feed. We keep
    // every source that succeeded and only surface `error` when *nothing* came
    // back. This is a deliberate divergence from PortfolioController's
    // all-or-nothing refresh — a portfolio total is wrong if a leg is missing,
    // but an activity feed is still useful partial (see ADR 0017).
    const settled = await Promise.allSettled(
      targets.map(async wallet => ({
        wallet,
        txs: await this.#fetchTransactions(wallet.chain, wallet.address),
      })),
    );

    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<{ wallet: WalletRef; txs: Transaction[] }> =>
        result.status === 'fulfilled',
    );
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (fulfilled.length === 0 && rejected.length > 0) {
      this.update(state => {
        state.status = 'error';
      });
      throw rejected[0].reason;
    }

    const fetched = fulfilled.flatMap(({ value }) =>
      value.txs.map(tx => toActivity(tx, value.wallet.address)),
    );

    this.update(state => {
      // For a scoped refresh, keep the entries outside the scope; for a full
      // refresh, start from nothing. Either way the union is deduped and sorted.
      const retained = scope ? state.items.filter(item => !matchesScope(item, scope)) : [];
      const merged = dedupeAndSort([...retained, ...fetched]);
      state.items = merged;
      state.cursorBySource = cursorsFromItems(merged);
      state.status = 'ready';
    });
  }

  /**
   * Connected accounts changed → rebuild from the new union. Debounced against
   * status-only `:stateChange`s via the wallet-set key, exactly as
   * PortfolioController does.
   */
  #onConnectedAccountsChange(walletConnection: WalletConnectionControllerState): void {
    this.#connectedWallets = selectConnectedAccounts(walletConnection).map(account => ({
      chain: account.chain,
      address: account.address,
    }));
    this.#refreshIfWalletsChanged();
  }

  /** The deduped union of watch-only and connected wallets. */
  #effectiveWallets(): WalletRef[] {
    const byKey = new Map<string, WalletRef>();
    for (const wallet of [...this.#watchedWallets, ...this.#connectedWallets]) {
      byKey.set(`${wallet.chain}:${wallet.address}`, wallet);
    }
    return [...byKey.values()];
  }

  /** The wallets a refresh should target, after applying an optional scope. */
  #targetsForScope(scope?: ActivityScope): WalletRef[] {
    const wallets = this.#effectiveWallets();
    if (!scope) {
      return wallets;
    }
    return wallets.filter(
      wallet =>
        (scope.chain === undefined || wallet.chain === scope.chain) &&
        (scope.address === undefined || wallet.address === scope.address),
    );
  }

  /** Refresh only when the effective wallet *set* changed, not on every signal. */
  #refreshIfWalletsChanged(): void {
    const key = this.#effectiveWallets()
      .map(wallet => `${wallet.chain}:${wallet.address}`)
      .sort()
      .join('|');
    if (key === this.#lastWalletKey) {
      return;
    }
    this.#lastWalletKey = key;
    // A wallet-set-driven refresh has no caller to await it, so swallow the
    // rejection: a total failure is already reflected in `state.status`, and the
    // same promise stays observable via `refreshing` for anyone who does await.
    void this.refresh().catch(() => undefined);
  }
}

/**
 * Enrich a normalized `Transaction` into a feed `Activity`. `direction` maps
 * `receive`/`send` to `incoming`/`outgoing`; `category` is `unknown` only when
 * the source could not determine an amount *and* a counterparty — the Solana
 * signatures path, which placeholders both — and `transfer` otherwise.
 */
export function toActivity(transaction: Transaction, wallet: string): Activity {
  const indeterminate = transaction.amount === '0' && transaction.counterparty === 'unknown';
  return {
    ...transaction,
    source: transaction.chain,
    wallet,
    direction: transaction.type === 'receive' ? 'incoming' : 'outgoing',
    category: indeterminate ? 'unknown' : 'transfer',
  };
}

/**
 * Dedupe on `(chain, hash)` and sort newest-first. A transaction between two
 * watched wallets surfaces once from each side with the same `(chain, hash)`;
 * deduping collapses it to a single feed entry (attributed to the first wallet
 * seen), which is the intended behavior — one transaction, one row.
 */
export function dedupeAndSort(activities: Activity[]): Activity[] {
  const byKey = new Map<string, Activity>();
  for (const activity of activities) {
    const key = `${activity.chain}:${activity.hash}`;
    if (!byKey.has(key)) {
      byKey.set(key, activity);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/** The newest timestamp seen per source — the high-water-mark cursor map. */
function cursorsFromItems(items: Activity[]): Partial<Record<Chain, string | null>> {
  const cursors: Partial<Record<Chain, string | null>> = {};
  for (const item of items) {
    const current = cursors[item.source];
    if (current === undefined || current === null || item.timestamp > current) {
      cursors[item.source] = item.timestamp;
    }
  }
  return cursors;
}

/** Whether a feed entry falls inside a scope (used to replace that slice). */
function matchesScope(item: Activity, scope: ActivityScope): boolean {
  if (scope.chain !== undefined && item.source !== scope.chain) {
    return false;
  }
  if (scope.address !== undefined && item.wallet !== scope.address) {
    return false;
  }
  return true;
}

/**
 * The feed entries for a single watched address. Pure, so the wallet-detail
 * page derives its transaction list directly from controller state — the
 * ADR 0013 selector rule (derived views are selectors, never controller
 * getters).
 */
export function selectActivityByWallet(
  state: ActivityControllerState,
  address: string,
): Activity[] {
  return state.items.filter(item => item.wallet === address);
}

/** The feed entries from a single chain source. */
export function selectActivityByChain(state: ActivityControllerState, chain: Chain): Activity[] {
  return state.items.filter(item => item.source === chain);
}
