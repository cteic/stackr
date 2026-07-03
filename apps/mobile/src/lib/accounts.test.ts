import { deriveAccount } from '@stackr/signer';
import { describe, expect, it } from 'vitest';
import { buildAccountsView, type LocalAddresses } from './accounts';

const ETH_ADDRESS = '0x1111111111111111111111111111111111111111';
const SOL_ADDRESS = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
// Really derived (BIP-39 test mnemonic), so the models-layer validators see
// genuine addresses — this doubles as a signer↔models integration check.
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const BTC_ADDRESS = deriveAccount(TEST_MNEMONIC, 'btc', 0).address;
const STX_ADDRESS = deriveAccount(TEST_MNEMONIC, 'stx', 0).address;
const SUI_ADDRESS = deriveAccount(TEST_MNEMONIC, 'sui', 0).address;

const NO_LOCAL: LocalAddresses = { btc: null, stx: null, sui: null };

let counter = 0;
function identity() {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    createdAt: '2026-07-03T00:00:00.000Z',
  };
}

describe('buildAccountsView', () => {
  it('maps Privy embedded addresses to labelled wallet rows', () => {
    const view = buildAccountsView(
      { ethereumAddress: ETH_ADDRESS, solanaAddress: SOL_ADDRESS, localAddresses: NO_LOCAL },
      identity,
    );

    expect(view.accounts).toHaveLength(2);
    expect(view.accounts[0]?.wallet).toMatchObject({
      chain: 'eth',
      address: ETH_ADDRESS,
      label: 'Ethereum',
    });
    expect(view.accounts[1]?.wallet).toMatchObject({
      chain: 'sol',
      address: SOL_ADDRESS,
      label: 'Solana',
    });
    expect(view.accounts.every(account => account.source === 'privy')).toBe(true);
  });

  it('drops a malformed address instead of querying it', () => {
    const view = buildAccountsView(
      { ethereumAddress: 'not-an-address', solanaAddress: SOL_ADDRESS, localAddresses: NO_LOCAL },
      identity,
    );

    expect(view.accounts.map(account => account.wallet.chain)).toEqual(['sol']);
  });

  it('lists BTC/STX/SUI as pending only until the seed derivation lands', () => {
    const view = buildAccountsView(
      { ethereumAddress: null, solanaAddress: null, localAddresses: NO_LOCAL },
      identity,
    );

    expect(view.accounts).toEqual([]);
    expect(view.pending.map(entry => entry.chain)).toEqual(['btc', 'stx', 'sui']);
    expect(view.pending.every(entry => entry.reason === 'seed-not-ready')).toBe(true);
  });

  it('promotes derived local addresses to source=local rows and clears pending', () => {
    const view = buildAccountsView(
      {
        ethereumAddress: ETH_ADDRESS,
        solanaAddress: SOL_ADDRESS,
        localAddresses: { btc: BTC_ADDRESS, stx: STX_ADDRESS, sui: SUI_ADDRESS },
      },
      identity,
    );

    expect(view.pending).toEqual([]);
    expect(view.accounts.map(account => [account.wallet.chain, account.source])).toEqual([
      ['eth', 'privy'],
      ['sol', 'privy'],
      ['btc', 'local'],
      ['stx', 'local'],
      ['sui', 'local'],
    ]);
    expect(view.accounts[2]?.wallet.label).toBe('Bitcoin');
  });

  it('keeps a chain pending when only its own address is missing', () => {
    const view = buildAccountsView(
      {
        ethereumAddress: null,
        solanaAddress: null,
        localAddresses: { btc: BTC_ADDRESS, stx: null, sui: SUI_ADDRESS },
      },
      identity,
    );

    expect(view.pending).toEqual([{ chain: 'stx', reason: 'seed-not-ready' }]);
    expect(view.accounts.map(account => account.wallet.chain)).toEqual(['btc', 'sui']);
  });
});
