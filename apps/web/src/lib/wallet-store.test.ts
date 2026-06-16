import { describe as feature, it as scenario, expect, beforeEach } from 'vitest';
import { bdd } from './bdd';
const { given, when, then, and } = bdd;
import { useWalletStore } from './wallet-store';

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const ALICE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const BOB = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

beforeEach(() => {
  useWalletStore.setState({ wallets: [], connectedAddresses: {} });
});

feature('watch-only wallets', () => {
  scenario('a watch address is added to the portfolio', () => {
    when('a Bitcoin wallet is added', () =>
      useWalletStore.getState().addWallet({
        label: 'Cold storage',
        chain: 'btc',
        address: 'bc1qtest123',
      }),
    );
    then('it appears in the wallet list with an id and timestamp', () => {
      const [wallet, ...rest] = useWalletStore.getState().wallets;
      expect(rest).toHaveLength(0);
      expect(wallet.label).toBe('Cold storage');
      expect(wallet.chain).toBe('btc');
      expect(wallet.address).toBe('bc1qtest123');
      expect(wallet.id).toBeDefined();
      expect(wallet.createdAt).toBeDefined();
    });
  });

  scenario('a watch address can be removed', () => {
    given('a tracked Ethereum wallet', () =>
      useWalletStore.getState().addWallet({ label: 'Hot', chain: 'eth', address: ALICE }),
    );
    when('it is removed by id', () => {
      const { id } = useWalletStore.getState().wallets[0];
      useWalletStore.getState().removeWallet(id);
    });
    then('no wallets remain', () => {
      expect(useWalletStore.getState().wallets).toHaveLength(0);
    });
  });

  scenario('a wallet label can be edited', () => {
    given('a wallet with an initial label', () =>
      useWalletStore.getState().addWallet({ label: 'Old Label', chain: 'sol', address: 'SolTest' }),
    );
    when('the label is updated', () => {
      const { id } = useWalletStore.getState().wallets[0];
      useWalletStore.getState().updateLabel(id, 'New Label');
    });
    then('the new label is stored', () => {
      expect(useWalletStore.getState().wallets[0].label).toBe('New Label');
    });
  });
});

feature('connected wallet addresses', () => {
  scenario('the store starts with no connected addresses', () => {
    then('connectedAddresses is empty', () => {
      expect(useWalletStore.getState().connectedAddresses).toEqual({});
    });
  });

  scenario('a connected address is recorded per chain', () => {
    when('an Ethereum address connects', () =>
      useWalletStore.getState().setConnectedAddresses('eth', [VITALIK]),
    );
    then('it is stored under the eth key', () => {
      expect(useWalletStore.getState().connectedAddresses.eth).toEqual([VITALIK]);
    });
  });

  scenario('reconnecting replaces the previous address for that chain', () => {
    given('a connected Ethereum address', () =>
      useWalletStore.getState().setConnectedAddresses('eth', [ALICE]),
    );
    when('a different address connects on the same chain', () =>
      useWalletStore.getState().setConnectedAddresses('eth', [BOB]),
    );
    then('only the latest address remains', () => {
      expect(useWalletStore.getState().connectedAddresses.eth).toEqual([BOB]);
    });
  });

  scenario('disconnecting one chain leaves the others intact', () => {
    given('connected Ethereum and Solana addresses', () => {
      useWalletStore.getState().setConnectedAddresses('eth', [ALICE]);
      useWalletStore.getState().setConnectedAddresses('sol', ['SolAddr1']);
    });
    when('Ethereum is disconnected', () =>
      useWalletStore.getState().clearConnectedAddresses('eth'),
    );
    then('the Ethereum entry is gone', () => {
      expect(useWalletStore.getState().connectedAddresses.eth).toBeUndefined();
    });
    and('the Solana entry survives', () => {
      expect(useWalletStore.getState().connectedAddresses.sol).toEqual(['SolAddr1']);
    });
  });

  scenario('Leather contributes both a Stacks and a Bitcoin address', () => {
    when('a Leather wallet connects', () => {
      useWalletStore.getState().setConnectedAddresses('stx', ['SP123']);
      useWalletStore.getState().setConnectedAddresses('btc', ['bc1qleather']);
    });
    then('both chains are populated independently', () => {
      const { connectedAddresses } = useWalletStore.getState();
      expect(connectedAddresses.stx).toEqual(['SP123']);
      expect(connectedAddresses.btc).toEqual(['bc1qleather']);
    });
  });
});

feature('persisted wallet migration', () => {
  scenario('a tampered or stale wallet record is dropped on rehydrate', async () => {
    const valid = {
      id: crypto.randomUUID(),
      label: 'Cold storage',
      chain: 'btc',
      address: 'bc1qtest123',
      createdAt: new Date().toISOString(),
    };
    given('a version 0 store holding one valid wallet plus a corrupt record', () =>
      localStorage.setItem(
        'stackr-wallets',
        JSON.stringify({
          state: { wallets: [valid, { id: 'not-a-uuid', chain: 'doge' }] },
          version: 0,
        }),
      ),
    );
    when('the store rehydrates under the current version', async () => {
      await useWalletStore.persist.rehydrate();
    });
    then('only the schema-valid wallet survives', () => {
      const { wallets } = useWalletStore.getState();
      expect(wallets).toHaveLength(1);
      expect(wallets[0]).toMatchObject({ chain: 'btc', address: 'bc1qtest123' });
    });
  });

  scenario('a persisted blob with no wallet array rehydrates empty', async () => {
    given('a store missing its wallets array', () =>
      localStorage.setItem(
        'stackr-wallets',
        JSON.stringify({ state: { wallets: 'not-an-array' }, version: 0 }),
      ),
    );
    when('the store rehydrates', async () => {
      await useWalletStore.persist.rehydrate();
    });
    then('the wallet list is empty rather than corrupt', () => {
      expect(useWalletStore.getState().wallets).toEqual([]);
    });
  });

  scenario('a non-object persisted state rehydrates empty', async () => {
    given('a store whose state is not an object', () =>
      localStorage.setItem('stackr-wallets', JSON.stringify({ state: null, version: 0 })),
    );
    when('the store rehydrates', async () => {
      await useWalletStore.persist.rehydrate();
    });
    then('no wallets are restored', () => {
      expect(useWalletStore.getState().wallets).toEqual([]);
    });
  });
});
