import { describe, expect, it } from 'vitest';
import { buildAccountsView } from './accounts';

const ETH_ADDRESS = '0x1111111111111111111111111111111111111111';
const SOL_ADDRESS = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

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
      { ethereumAddress: ETH_ADDRESS, solanaAddress: SOL_ADDRESS },
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
      { ethereumAddress: 'not-an-address', solanaAddress: SOL_ADDRESS },
      identity,
    );

    expect(view.accounts.map(account => account.wallet.chain)).toEqual(['sol']);
  });

  it('lists BTC/STX/SUI as pending until the signer package integrates', () => {
    const view = buildAccountsView({ ethereumAddress: null, solanaAddress: null }, identity);

    expect(view.accounts).toEqual([]);
    expect(view.pending.map(entry => entry.chain)).toEqual(['btc', 'stx', 'sui']);
    expect(view.pending.every(entry => entry.reason === 'signer-not-integrated')).toBe(true);
  });
});
