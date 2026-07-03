import { useQuery } from '@tanstack/react-query';
import type { Balance, Chain, Currency, Price, Transaction } from '@stackr/models';
import { fetchBalance, fetchPrices, fetchTransactions } from '@stackr/services';
import type { WalletAccount } from './accounts';
import { fetchEthActivityPublic, fetchEthBalancePublic } from './eth-public';

/**
 * Mobile mirrors the web app's refresh posture (ADR 0016): on-demand +
 * interval reads against free tiers, no aggressive polling. ETH routes through
 * the RN-safe public readers in `eth-public.ts`; every other chain uses the
 * services adapters directly.
 */

function readBalance(chain: Chain, address: string): Promise<Balance> {
  return chain === 'eth' ? fetchEthBalancePublic(address) : fetchBalance(chain, address);
}

function readActivity(chain: Chain, address: string): Promise<Transaction[]> {
  return chain === 'eth' ? fetchEthActivityPublic(address) : fetchTransactions(chain, address);
}

export interface AccountBalance {
  account: WalletAccount;
  balance: Balance;
}

export function useAccountBalances(accounts: WalletAccount[]) {
  return useQuery({
    queryKey: ['mobile', 'balances', accounts.map(a => `${a.wallet.chain}:${a.wallet.address}`)],
    enabled: accounts.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AccountBalance[]> => {
      const settled = await Promise.allSettled(
        accounts.map(async account => ({
          account,
          balance: await readBalance(account.wallet.chain, account.wallet.address),
        })),
      );
      // One failing chain must not blank the whole balance screen.
      return settled
        .filter(
          (result): result is PromiseFulfilledResult<AccountBalance> =>
            result.status === 'fulfilled',
        )
        .map(result => result.value);
    },
  });
}

export function usePrices(chains: Chain[], currency: Currency) {
  return useQuery({
    queryKey: ['mobile', 'prices', chains, currency],
    enabled: chains.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: (): Promise<Price[]> => fetchPrices(chains, currency),
  });
}

export function useActivity(accounts: WalletAccount[]) {
  return useQuery({
    queryKey: ['mobile', 'activity', accounts.map(a => `${a.wallet.chain}:${a.wallet.address}`)],
    enabled: accounts.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<Transaction[]> => {
      const settled = await Promise.allSettled(
        accounts.map(account => readActivity(account.wallet.chain, account.wallet.address)),
      );
      const transactions = settled
        .filter(
          (result): result is PromiseFulfilledResult<Transaction[]> =>
            result.status === 'fulfilled',
        )
        .flatMap(result => result.value);
      return transactions.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    },
  });
}
