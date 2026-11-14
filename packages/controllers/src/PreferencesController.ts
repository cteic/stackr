import type { Chain, Currency } from '@stackr/models';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type StateMetadata,
} from './BaseController.js';
import type { Messenger } from './Messenger.js';

/**
 * PreferencesController — display preferences only.
 *
 * MetaMask ships a real `PreferencesController`; this is the same idea scoped
 * to stackr. It owns *how the portfolio is shown*, not the portfolio itself:
 * the display currency, and which chains are counted toward the total. Change a
 * preference here and the PortfolioController recomputes — purely through the
 * messenger, with neither controller referencing the other.
 *
 * It deliberately does NOT absorb the existing `settings-store` atoms' user
 * API keys. This spike is additive: the settings-store remains the source of
 * truth for secrets, and this controller only mirrors the two display knobs the
 * coordination demo needs.
 */

export type PreferencesControllerState = {
  /** The fiat currency the portfolio total is displayed in. */
  displayCurrency: Currency;
  /** Which chains are counted toward the portfolio total. */
  includedChains: Chain[];
};

/**
 * `persist: true` — these are user choices worth keeping across sessions.
 * `includeInStateLogs: true` — a currency code and a list of chain ids carry no
 * sensitive financial information, so they are safe to include in diagnostics
 * (contrast with PortfolioController, where holdings are flagged `false`).
 */
const metadata: StateMetadata<PreferencesControllerState> = {
  displayCurrency: { persist: true, usedInUi: true, includeInStateLogs: true },
  includedChains: { persist: true, usedInUi: true, includeInStateLogs: true },
};

const ALL_CHAINS: Chain[] = ['btc', 'stx', 'eth', 'sol'];

/**
 * The factory mirrors MetaMask's `getDefault…State()` convention: a single
 * pure source of truth for the initial state, reused by the controller default
 * and by tests.
 */
export function getDefaultPreferencesControllerState(): PreferencesControllerState {
  return {
    displayCurrency: 'usd',
    includedChains: [...ALL_CHAINS],
  };
}

const controllerName = 'PreferencesController';

export type PreferencesControllerGetStateAction = ControllerGetStateAction<
  'PreferencesController',
  PreferencesControllerState
>;

export type PreferencesControllerSetDisplayCurrencyAction = {
  type: 'PreferencesController:setDisplayCurrency';
  handler: (currency: Currency) => void;
};

export type PreferencesControllerSetIncludedChainsAction = {
  type: 'PreferencesController:setIncludedChains';
  handler: (chains: Chain[]) => void;
};

export type PreferencesControllerActions =
  | PreferencesControllerGetStateAction
  | PreferencesControllerSetDisplayCurrencyAction
  | PreferencesControllerSetIncludedChainsAction;

export type PreferencesControllerStateChangeEvent = ControllerStateChangeEvent<
  'PreferencesController',
  PreferencesControllerState
>;

export type PreferencesControllerEvents = PreferencesControllerStateChangeEvent;

/**
 * The messenger this controller is handed. In real MetaMask this would be a
 * `RestrictedMessenger` whose action/event unions are exactly this controller's
 * own surface; here we union the types directly (see ADR 0013).
 */
export type PreferencesControllerMessenger = Messenger<
  PreferencesControllerActions,
  PreferencesControllerEvents
>;

export class PreferencesController extends BaseController<
  'PreferencesController',
  PreferencesControllerState,
  PreferencesControllerMessenger
> {
  constructor({
    messenger,
    state,
  }: {
    messenger: PreferencesControllerMessenger;
    state?: Partial<PreferencesControllerState>;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...getDefaultPreferencesControllerState(), ...state },
    });

    // Expose the setters as actions too, so any holder of the messenger can
    // drive preferences by name — not just a holder of this instance.
    this.messagingSystem.registerActionHandler(
      'PreferencesController:setDisplayCurrency',
      this.setDisplayCurrency.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'PreferencesController:setIncludedChains',
      this.setIncludedChains.bind(this),
    );
  }

  /** Change the display currency. The `:stateChange` event does the rest. */
  setDisplayCurrency(currency: Currency): void {
    this.update(state => {
      state.displayCurrency = currency;
    });
  }

  /** Change which chains count toward the total. */
  setIncludedChains(chains: Chain[]): void {
    this.update(state => {
      state.includedChains = chains;
    });
  }
}
