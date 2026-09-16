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
  PortfolioController,
  PreferencesController,
  WalletConnectionController,
  type ActivityControllerActions,
  type ActivityControllerEvents,
  type ActivityControllerMessenger,
  type ActivityControllerState,
  type PortfolioControllerActions,
  type PortfolioControllerEvents,
  type PortfolioControllerMessenger,
  type PortfolioControllerState,
  type PreferencesControllerActions,
  type PreferencesControllerEvents,
  type PreferencesControllerMessenger,
  type PreferencesControllerState,
  type WalletConnectionControllerActions,
  type WalletConnectionControllerEvents,
  type WalletConnectionControllerMessenger,
  type WalletConnectionControllerState,
} from '@stackr/controllers';
import { wagmiConfig } from '@/lib/wagmi-config';
import { getSolanaWallets } from '@/lib/solana-wallet-instance';
import { createEvmWalletAdapter } from '@/lib/wallet-adapters/evm-wallet-adapter';
import { createSolanaWalletAdapter } from '@/lib/wallet-adapters/solana-wallet-adapter';
import { createStacksWalletAdapter } from '@/lib/wallet-adapters/stacks-wallet-adapter';

/**
 * Bridges the controller/messenger world into React for the /labs demo. The
 * point it illustrates: the controller is the source of truth, and the UI is a
 * thin mirror that re-renders off `:stateChange` via `useSyncExternalStore`.
 *
 * Phase 2 (issue #74) adds a WalletConnectionController fed by all three real
 * wallet source adapters, so /labs reflects live connection state and the
 * PortfolioController re-aggregates through the messenger when accounts change.
 * This demo wiring is still scoped to /labs — the rest of the app reads
 * connection state from the Zustand store via the WalletConnectionBridge.
 */

type RootMessenger = Messenger<
  | PreferencesControllerActions
  | PortfolioControllerActions
  | WalletConnectionControllerActions
  | ActivityControllerActions,
  | PreferencesControllerEvents
  | PortfolioControllerEvents
  | WalletConnectionControllerEvents
  | ActivityControllerEvents
>;

interface Controllers {
  messenger: RootMessenger;
  preferences: PreferencesController;
  portfolio: PortfolioController;
  walletConnection: WalletConnectionController;
  activity: ActivityController;
}

const ControllerContext = createContext<Controllers | null>(null);

export function ControllerProvider({ children }: { children: ReactNode }) {
  // One messenger, shared by every controller; each is handed a narrowed view
  // via `getRestricted`. Built once and held in state so the instances survive
  // re-renders (the controllers, not React, own the state). The adapters' event
  // subscriptions are SSR-guarded, so building this during a server render
  // registers no listeners; the client rebuild wires them for real.
  const [controllers] = useState<Controllers>(() => {
    const messenger: RootMessenger = new Messenger();
    const preferences = new PreferencesController({
      messenger: messenger.getRestricted<PreferencesControllerMessenger>(),
    });
    const portfolio = new PortfolioController({
      messenger: messenger.getRestricted<PortfolioControllerMessenger>(),
    });
    const walletConnection = new WalletConnectionController({
      messenger: messenger.getRestricted<WalletConnectionControllerMessenger>(),
      adapters: [
        createEvmWalletAdapter(wagmiConfig),
        ...getSolanaWallets().map(entry =>
          createSolanaWalletAdapter(entry.adapter, `solana:${entry.id}`),
        ),
        createStacksWalletAdapter(),
      ],
    });
    // The activity feed subscribes to WalletConnectionController:stateChange on
    // this same messenger, so connecting a wallet in the demo re-runs the feed —
    // through the messenger, with no reference between the two controllers.
    const activity = new ActivityController({
      messenger: messenger.getRestricted<ActivityControllerMessenger>(),
    });
    return { messenger, preferences, portfolio, walletConnection, activity };
  });

  // Capture connections already live on mount, and tear the adapter
  // subscriptions down when the demo unmounts.
  useEffect(() => {
    controllers.walletConnection.syncFromAdapters();
    return () => controllers.walletConnection.destroy();
  }, [controllers]);

  return <ControllerContext.Provider value={controllers}>{children}</ControllerContext.Provider>;
}

export function useControllers(): Controllers {
  const controllers = useContext(ControllerContext);
  if (!controllers) {
    throw new Error('useControllers must be used within a ControllerProvider');
  }
  return controllers;
}

/**
 * Subscribe a component to a controller's state. Returns the current state and
 * re-renders on every `:stateChange`. `getSnapshot` returns `controller.state`,
 * whose reference is stable between updates (immer structural sharing), so
 * `useSyncExternalStore`'s `Object.is` check does the right thing with no extra
 * memoization.
 */
export function useController(controller: PreferencesController): PreferencesControllerState;
export function useController(controller: PortfolioController): PortfolioControllerState;
export function useController(
  controller: WalletConnectionController,
): WalletConnectionControllerState;
export function useController(controller: ActivityController): ActivityControllerState;
export function useController(
  controller:
    | PreferencesController
    | PortfolioController
    | WalletConnectionController
    | ActivityController,
):
  | PreferencesControllerState
  | PortfolioControllerState
  | WalletConnectionControllerState
  | ActivityControllerState {
  const { messenger } = useControllers();

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      messenger.subscribe(
        `${controller.name}:stateChange` as PreferencesControllerEvents['type'],
        onStoreChange,
      ),
    [messenger, controller],
  );

  const getSnapshot = useCallback(() => controller.state, [controller]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
