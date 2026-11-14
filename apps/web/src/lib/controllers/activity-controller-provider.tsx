'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  ActivityController,
  Messenger,
  type ActivityControllerActions,
  type ActivityControllerEvents,
  type ActivityControllerMessenger,
  type ActivityControllerState,
  type WalletRef,
} from '@stackr/controllers';
import type { Chain } from '@stackr/models';
import { useAtomValue } from 'jotai';
import { connectedAddressesAtom, walletsAtom } from '@/lib/wallet-store';

/**
 * Production wiring for the ActivityController — the one place the app builds an
 * activity feed, mounted app-wide so the dashboard "recent activity" panel and
 * the wallet-detail transaction list can mirror it via `useActivityState`.
 *
 * Unlike the /labs ControllerProvider (which is a self-contained spike), this
 * provider feeds the controller from the production source of truth: the Jotai
 * wallet atoms. A small bridge mirrors the store's watch-only `wallets` and the
 * `connectedAddresses` (already populated by `WalletConnectionBridge`) into the
 * controller via `setWatchedWallets` — the same store→controller direction the
 * WalletConnectionBridge uses. The controller owns the fan-out, dedupe and
 * merge-sort; the components stay thin.
 *
 * Constructing the controller during a server render is safe: it registers
 * messenger handlers only, with no DOM or network. The actual fetch happens in
 * the effect below (client-only), when the wallet set is first pushed in.
 */

interface ActivityControllers {
  messenger: Messenger<ActivityControllerActions, ActivityControllerEvents>;
  activity: ActivityController;
}

const ActivityContext = createContext<ActivityControllers | null>(null);

/**
 * Lets a view (the wallet-detail page) pin an address into the feed even when it
 * is not in the store — e.g. a wallet reached by direct URL. Without this, a
 * detail page for an unwatched address would show an empty feed instead of
 * fetching it. Default is a no-op so the hook is safe outside the provider.
 */
const TrackWalletContext = createContext<(ref: WalletRef) => void>(() => undefined);

function sameRef(a: WalletRef, b: WalletRef): boolean {
  return a.chain === b.chain && a.address === b.address;
}

/** Flatten the store's watch-only wallets, connected addresses, and pinned refs. */
function buildWalletRefs(
  wallets: { chain: Chain; address: string }[],
  connectedAddresses: Partial<Record<Chain, string[]>>,
  pinned: WalletRef[],
): WalletRef[] {
  const refs: WalletRef[] = wallets.map(wallet => ({
    chain: wallet.chain,
    address: wallet.address,
  }));
  for (const [chain, addresses] of Object.entries(connectedAddresses)) {
    for (const address of addresses ?? []) {
      refs.push({ chain: chain as Chain, address });
    }
  }
  refs.push(...pinned);
  // The controller dedupes internally, so a duplicate here is harmless.
  return refs;
}

export function ActivityControllerProvider({ children }: { children: ReactNode }) {
  const [controllers] = useState<ActivityControllers>(() => {
    const messenger = new Messenger<ActivityControllerActions, ActivityControllerEvents>();
    const activity = new ActivityController({
      messenger: messenger.getRestricted<ActivityControllerMessenger>(),
    });
    return { messenger, activity };
  });

  const wallets = useAtomValue(walletsAtom);
  const connectedAddresses = useAtomValue(connectedAddressesAtom);
  const [pinned, setPinned] = useState<WalletRef[]>([]);

  const trackWallet = useCallback((ref: WalletRef) => {
    setPinned(prev => (prev.some(entry => sameRef(entry, ref)) ? prev : [...prev, ref]));
  }, []);

  useEffect(() => {
    controllers.activity.setWatchedWallets(buildWalletRefs(wallets, connectedAddresses, pinned));
  }, [controllers, wallets, connectedAddresses, pinned]);

  return (
    <ActivityContext.Provider value={controllers}>
      <TrackWalletContext.Provider value={trackWallet}>{children}</TrackWalletContext.Provider>
    </ActivityContext.Provider>
  );
}

function useActivityControllers(): ActivityControllers {
  const controllers = useContext(ActivityContext);
  if (!controllers) {
    throw new Error('useActivityControllers must be used within an ActivityControllerProvider');
  }
  return controllers;
}

/**
 * Subscribe a component to the ActivityController's feed. Re-renders on every
 * `:stateChange`; the snapshot is `activity.state`, whose reference is stable
 * between updates (immer structural sharing), so `useSyncExternalStore`'s
 * `Object.is` check does the right thing with no extra memoization.
 */
export function useActivityState(): ActivityControllerState {
  const { messenger, activity } = useActivityControllers();

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      messenger.subscribe('ActivityController:stateChange', onStoreChange),
    [messenger],
  );
  const getSnapshot = useCallback(() => activity.state, [activity]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Pin a wallet into the feed for the lifetime of the view that calls it. */
export function useTrackWallet(): (ref: WalletRef) => void {
  return useContext(TrackWalletContext);
}
