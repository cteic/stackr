import type { Signer } from './contracts/signer';
import type { LocalAddresses } from './accounts';
import { ensureLocalSeed, type EnsureSeedResult } from './local-seed';

export type LocalWalletStatus = 'idle' | 'preparing' | 'ready' | 'error';

export interface LocalWalletState {
  status: LocalWalletStatus;
  /** How this device got its seed — drives the one-time backup interstitial. */
  seedResult: EnsureSeedResult | null;
  addresses: LocalAddresses;
}

export interface LocalWalletStore {
  getState(): LocalWalletState;
  subscribe(listener: () => void): () => void;
  /**
   * Silent seed bootstrap + first-account derivation for BTC/STX/SUI.
   * Idempotent and race-safe: concurrent calls share one in-flight run, a
   * completed run is never repeated, and a failed run may be retried.
   */
  bootstrap(): Promise<void>;
}

const EMPTY_ADDRESSES: LocalAddresses = { btc: null, stx: null, sui: null };

export function createLocalWalletStore(deps: {
  signer: Signer;
  generate: () => string;
}): LocalWalletStore {
  let state: LocalWalletState = { status: 'idle', seedResult: null, addresses: EMPTY_ADDRESSES };
  let inFlight: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function setState(next: LocalWalletState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  async function run(): Promise<void> {
    setState({ ...state, status: 'preparing' });
    try {
      const seedResult = await ensureLocalSeed(deps.signer, deps.generate);
      const [btc, stx, sui] = await Promise.all([
        deps.signer.getAccount('btc', 0),
        deps.signer.getAccount('stx', 0),
        deps.signer.getAccount('sui', 0),
      ]);
      setState({
        status: 'ready',
        seedResult,
        addresses: { btc: btc.address, stx: stx.address, sui: sui.address },
      });
    } catch (error) {
      setState({ ...state, status: 'error' });
      throw error;
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bootstrap(): Promise<void> {
      if (state.status === 'ready') return Promise.resolve();
      if (inFlight === null) {
        inFlight = run().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}
