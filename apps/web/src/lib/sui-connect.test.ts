import { beforeEach, describe as feature, it as scenario, expect, vi } from 'vitest';
import { bdd } from './bdd';
const { given, when, then, and } = bdd;
import {
  connectSuiWallet,
  disconnectSuiWallet,
  findSuiWallet,
  isSuiWalletAvailable,
  isSuiWalletRemembered,
  restoreSuiWallet,
  subscribeSuiWalletAvailability,
} from './sui-connect';

/**
 * Fake Wallet Standard registry. The real `getWallets()` is a window-backed
 * singleton fed by extension events; tests swap it for this controllable
 * in-memory registry.
 */
const registry = vi.hoisted(() => ({
  wallets: [] as unknown[],
  listeners: new Map<string, Set<() => void>>(),
  emit(event: string) {
    for (const listener of this.listeners.get(event) ?? []) listener();
  },
}));

vi.mock('@wallet-standard/app', () => ({
  getWallets: () => ({
    get: () => registry.wallets,
    on: (event: string, listener: () => void) => {
      const set = registry.listeners.get(event) ?? new Set<() => void>();
      set.add(listener);
      registry.listeners.set(event, set);
      return () => set.delete(listener);
    },
  }),
}));

const SUI_ADDRESS = `0x${'a'.repeat(64)}`;
const OTHER_SUI_ADDRESS = `0x${'b'.repeat(64)}`;

interface FakeWalletOptions {
  name?: string;
  chains?: string[];
  connect?: (input?: { silent?: boolean }) => Promise<unknown>;
  disconnect?: () => Promise<void>;
  accounts?: unknown[];
}

/** Build a wallet in the registry's untrusted upstream shape. */
function makeWallet(options: FakeWalletOptions = {}) {
  const features: Record<string, unknown> = {};
  if (options.connect) features['standard:connect'] = { connect: options.connect };
  if (options.disconnect) features['standard:disconnect'] = { disconnect: options.disconnect };
  return {
    version: '1.0.0',
    name: options.name ?? 'Slush',
    icon: 'data:image/svg+xml;base64,',
    chains: options.chains ?? ['sui:mainnet'],
    features,
    accounts: options.accounts ?? [],
  };
}

function suiAccount(address: string) {
  return { address, chains: ['sui:mainnet'] };
}

const connectedAccounts = (accounts: unknown[]) => async () => ({ accounts });

beforeEach(() => {
  registry.wallets = [];
  registry.listeners.clear();
  window.localStorage.clear();
});

feature('Sui wallet discovery over the Wallet Standard registry', () => {
  scenario('no wallet is available on an empty registry', () => {
    then('nothing is found', () => {
      expect(isSuiWalletAvailable()).toBe(false);
      expect(findSuiWallet()).toBeNull();
    });
  });

  scenario('a wallet without a sui chain is not a Sui wallet', () => {
    given('a Solana-only Wallet Standard wallet', () => {
      registry.wallets = [
        makeWallet({ name: 'Phantom', chains: ['solana:mainnet'], connect: async () => ({}) }),
      ];
    });
    then('it is ignored', () => expect(isSuiWalletAvailable()).toBe(false));
  });

  scenario('a sui-chain wallet missing standard:connect is not connectable', () => {
    given('a sui wallet with no connect feature', () => {
      registry.wallets = [makeWallet({ connect: undefined })];
    });
    then('it is ignored', () => expect(isSuiWalletAvailable()).toBe(false));
  });

  scenario('Slush is preferred when several Sui wallets are installed', () => {
    given('another Sui wallet registered before Slush', () => {
      registry.wallets = [
        makeWallet({ name: 'Suiet', connect: async () => ({}) }),
        makeWallet({ name: 'Slush', connect: async () => ({}) }),
      ];
    });
    then('Slush wins', () => expect(findSuiWallet()?.name).toBe('Slush'));
  });

  scenario('availability changes reach subscribers on register/unregister', () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeSuiWalletAvailability(available => seen.push(available));

    when('a Sui wallet registers', () => {
      registry.wallets = [makeWallet({ connect: async () => ({}) })];
      registry.emit('register');
    });
    and('it unregisters again', () => {
      registry.wallets = [];
      registry.emit('unregister');
    });
    then('the listener saw both states', () => expect(seen).toEqual([true, false]));

    and('unsubscribing stops further updates', () => {
      unsubscribe();
      registry.emit('register');
      expect(seen).toEqual([true, false]);
    });
  });
});

feature('connectSuiWallet', () => {
  scenario('returns the validated addresses and remembers the session', async () => {
    given('Slush authorizing one account', () => {
      registry.wallets = [makeWallet({ connect: connectedAccounts([suiAccount(SUI_ADDRESS)]) })];
    });

    const addresses = await connectSuiWallet();

    then('the address comes back', () => expect(addresses).toEqual([SUI_ADDRESS]));
    and('the session is remembered for a silent restore', () =>
      expect(isSuiWalletRemembered()).toBe(true),
    );
  });

  scenario('filters malformed, foreign-chain, and duplicate accounts', async () => {
    given('a connect result full of junk around one valid account', () => {
      registry.wallets = [
        makeWallet({
          connect: connectedAccounts([
            null,
            'not-an-account',
            { address: 42, chains: ['sui:mainnet'] },
            { address: SUI_ADDRESS, chains: ['solana:mainnet'] }, // wrong chain
            { address: '0xshort', chains: ['sui:mainnet'] }, // fails validation
            suiAccount(SUI_ADDRESS),
            suiAccount(SUI_ADDRESS), // duplicate
            suiAccount(OTHER_SUI_ADDRESS),
          ]),
        }),
      ];
    });

    await then('only the valid, deduped Sui addresses survive', async () =>
      expect(await connectSuiWallet()).toEqual([SUI_ADDRESS, OTHER_SUI_ADDRESS]),
    );
  });

  scenario('falls back to the wallet account list when the result carries none', async () => {
    given('a wallet that only populates its own accounts', () => {
      registry.wallets = [
        makeWallet({
          connect: connectedAccounts([]),
          accounts: [suiAccount(SUI_ADDRESS)],
        }),
      ];
    });

    await then('the wallet accounts are used', async () =>
      expect(await connectSuiWallet()).toEqual([SUI_ADDRESS]),
    );
  });

  scenario('returns null when no wallet is installed', async () => {
    await then('connect resolves null and nothing is remembered', async () => {
      expect(await connectSuiWallet()).toBeNull();
      expect(isSuiWalletRemembered()).toBe(false);
    });
  });

  scenario('a user rejection propagates to the caller', async () => {
    given('a wallet whose connect rejects', () => {
      registry.wallets = [
        makeWallet({
          connect: async () => {
            throw new Error('user rejected');
          },
        }),
      ];
    });

    await then('the rejection surfaces (the modal shows it)', async () => {
      await expect(connectSuiWallet()).rejects.toThrow('user rejected');
    });
    and('no session is remembered', () => expect(isSuiWalletRemembered()).toBe(false));
  });
});

feature('restoreSuiWallet', () => {
  scenario('does nothing without a remembered session', async () => {
    const connect = vi.fn(connectedAccounts([suiAccount(SUI_ADDRESS)]));
    given('an installed wallet but no prior connection', () => {
      registry.wallets = [makeWallet({ connect })];
    });

    await then('restore resolves null without prompting', async () => {
      expect(await restoreSuiWallet()).toBeNull();
      expect(connect).not.toHaveBeenCalled();
    });
  });

  scenario('silently reconnects a remembered session', async () => {
    const connect = vi.fn(connectedAccounts([suiAccount(SUI_ADDRESS)]));
    await given('a remembered session and an installed wallet', async () => {
      registry.wallets = [makeWallet({ connect })];
      await connectSuiWallet();
      connect.mockClear();
    });

    const addresses = await restoreSuiWallet();

    then('the addresses come back from a silent connect', () => {
      expect(addresses).toEqual([SUI_ADDRESS]);
      expect(connect).toHaveBeenCalledWith({ silent: true });
    });
  });

  scenario('a declined silent connect keeps the session for a later retry', async () => {
    await given('a remembered session whose wallet refuses the silent connect', async () => {
      registry.wallets = [makeWallet({ connect: connectedAccounts([suiAccount(SUI_ADDRESS)]) })];
      await connectSuiWallet();
      registry.wallets = [
        makeWallet({
          connect: async () => {
            throw new Error('silent connect not authorized');
          },
        }),
      ];
    });

    await then('restore resolves null but stays remembered', async () => {
      expect(await restoreSuiWallet()).toBeNull();
      expect(isSuiWalletRemembered()).toBe(true);
    });
  });
});

feature('disconnectSuiWallet', () => {
  scenario('forgets the session and revokes wallet-side authorization', async () => {
    const disconnect = vi.fn(async () => undefined);
    await given('a connected wallet exposing standard:disconnect', async () => {
      registry.wallets = [
        makeWallet({ connect: connectedAccounts([suiAccount(SUI_ADDRESS)]), disconnect }),
      ];
      await connectSuiWallet();
    });

    when('the user disconnects', () => disconnectSuiWallet());

    then('the session is forgotten and the wallet notified', () => {
      expect(isSuiWalletRemembered()).toBe(false);
      expect(disconnect).toHaveBeenCalledOnce();
    });
  });

  scenario('works for wallets without a disconnect feature', async () => {
    await given('a connected wallet with connect only', async () => {
      registry.wallets = [makeWallet({ connect: connectedAccounts([suiAccount(SUI_ADDRESS)]) })];
      await connectSuiWallet();
    });

    then('disconnect still forgets the session', () => {
      disconnectSuiWallet();
      expect(isSuiWalletRemembered()).toBe(false);
    });
  });
});
