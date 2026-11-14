import { describe as feature, it as scenario, expect } from 'vitest';
import type { Wallet } from '@stackr/models';
import { bdd } from './bdd';
import {
  buildConnectedWallets,
  connectedAddressKeys,
  isConnectedWallet,
} from './connected-wallets';

const { given, when, then } = bdd;

const NOW = '2026-01-01T00:00:00.000Z';

const ALICE_ETH = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ALICE_ETH_LOWER = ALICE_ETH.toLowerCase();
const SOL_ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const OTHER_SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

function watched(chain: Wallet['chain'], address: string, label = 'Watched'): Wallet {
  return { id: `${chain}:${address}`, label, chain, address, createdAt: NOW };
}

feature('connected wallets surface alongside watch-only ones', () => {
  scenario('a connected Solana account becomes a portfolio wallet', () => {
    let result: Wallet[] = [];
    when('a Solana address is connected and nothing is watched', () => {
      result = buildConnectedWallets([], { sol: [SOL_ADDRESS] }, NOW);
    });
    then('it renders as a virtual wallet on the sol chain', () => {
      expect(result).toHaveLength(1);
      expect(result[0].chain).toBe('sol');
      expect(result[0].address).toBe(SOL_ADDRESS);
      expect(result[0].label).toBe(`${SOL_ADDRESS.slice(0, 6)}…${SOL_ADDRESS.slice(-4)}`);
    });
  });

  scenario('both chains surface from one connected set', () => {
    let result: Wallet[] = [];
    when('an ETH and a SOL address are connected', () => {
      result = buildConnectedWallets([], { eth: [ALICE_ETH], sol: [SOL_ADDRESS] }, NOW);
    });
    then('one virtual wallet exists per chain', () => {
      expect(result.map(w => w.chain)).toEqual(['eth', 'sol']);
    });
  });

  scenario('an already-watched address is not duplicated', () => {
    let result: Wallet[] = [];
    given('the same Solana address is already watch-listed', () => undefined);
    when('it is also connected', () => {
      result = buildConnectedWallets([watched('sol', SOL_ADDRESS)], { sol: [SOL_ADDRESS] }, NOW);
    });
    then('no virtual wallet is added for it', () => {
      expect(result).toEqual([]);
    });
  });

  scenario('EVM address case does not create a duplicate', () => {
    let result: Wallet[] = [];
    given('a checksum-case ETH address is watch-listed', () => undefined);
    when('the connector reports the lowercase form', () => {
      result = buildConnectedWallets([watched('eth', ALICE_ETH)], { eth: [ALICE_ETH_LOWER] }, NOW);
    });
    then('it is recognised as the same account', () => {
      expect(result).toEqual([]);
    });
  });

  scenario('Solana addresses are compared case-sensitively', () => {
    let result: Wallet[] = [];
    given('a watch-listed Solana address', () => undefined);
    when('a differently-cased base58 string is connected', () => {
      result = buildConnectedWallets(
        [watched('sol', SOL_ADDRESS)],
        { sol: [SOL_ADDRESS.toLowerCase()] },
        NOW,
      );
    });
    then('it is treated as a different account, because base58 is case-sensitive', () => {
      expect(result).toHaveLength(1);
    });
  });

  scenario('a repeated connected address yields one wallet', () => {
    let result: Wallet[] = [];
    when('the same address is reported twice', () => {
      result = buildConnectedWallets([], { sol: [SOL_ADDRESS, SOL_ADDRESS] }, NOW);
    });
    then('only one virtual wallet is built', () => {
      expect(result).toHaveLength(1);
    });
  });

  scenario('unbridged chains do not surface', () => {
    let result: Wallet[] = [];
    when('a Stacks address is present in the connected set', () => {
      result = buildConnectedWallets([], { stx: ['SP123'] }, NOW);
    });
    then('no virtual wallet is built for it', () => {
      expect(result).toEqual([]);
    });
  });
});

feature('connected-wallet marking', () => {
  scenario('a connected wallet is marked, a watch-only one is not', () => {
    const keys = connectedAddressKeys({ eth: [ALICE_ETH_LOWER], sol: [SOL_ADDRESS] });
    then('the connected Solana wallet is marked', () => {
      expect(isConnectedWallet(keys, watched('sol', SOL_ADDRESS))).toBe(true);
    });
    then('the connected ETH wallet matches regardless of case', () => {
      expect(isConnectedWallet(keys, watched('eth', ALICE_ETH))).toBe(true);
    });
    then('an unrelated Solana wallet is not marked', () => {
      expect(isConnectedWallet(keys, watched('sol', OTHER_SOL))).toBe(false);
    });
    then('a chain with no connection is not marked', () => {
      expect(isConnectedWallet(keys, watched('btc', 'bc1qtest'))).toBe(false);
    });
  });
});
