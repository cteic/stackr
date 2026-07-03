import { useCallback, useMemo } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { RefreshControl } from 'react-native';
import { Button, ScrollView, Text, XStack } from 'tamagui';
import { chainMeta } from '@stackr/models';
import { formatFiat } from '@stackr/services';
import { createPortfolioRowView, type PortfolioRowView } from '@stackr/features';
import { BackupBanner } from '@/components/backup-banner';
import { BalanceCard } from '@/components/balance-card';
import { useAccountBalances, usePrices } from '@/lib/queries';
import { useBackupStatus } from '@/lib/use-backup-status';
import { useSignQueue } from '@/lib/sign-queue-singleton';
import { useWalletState } from '@/lib/use-wallet-state';

const DISPLAY_CURRENCY = 'usd';

export default function BalanceScreen() {
  const { accountsView, logout } = useWalletState();
  const { queue } = useSignQueue();

  const balances = useAccountBalances(accountsView.accounts);
  const chains = useMemo(
    () => [...new Set(accountsView.accounts.map(account => account.wallet.chain))],
    [accountsView.accounts],
  );
  const prices = usePrices(chains, DISPLAY_CURRENCY);

  const rows: PortfolioRowView[] = useMemo(() => {
    return accountsView.accounts.map(account => {
      const balance = balances.data?.find(
        entry => entry.account.wallet.id === account.wallet.id,
      )?.balance;
      const price = prices.data?.find(entry => entry.chain === account.wallet.chain);
      return createPortfolioRowView({
        wallet: account.wallet,
        balance,
        price,
        settings: { currency: DISPLAY_CURRENCY, hideBalance: false },
      });
    });
  }, [accountsView.accounts, balances.data, prices.data]);

  const totalFiat = useMemo(() => {
    let total = 0;
    for (const entry of balances.data ?? []) {
      const price = prices.data?.find(p => p.chain === entry.balance.chain);
      if (price === undefined) continue;
      total += parseFloat(entry.balance.balance) * price.fiatPrice;
    }
    return total;
  }, [balances.data, prices.data]);

  const backup = useBackupStatus(totalFiat > 0);
  const { refresh: refreshBackup } = backup;
  // Re-read the persisted flags when the tab regains focus (e.g. returning
  // from a just-verified backup ceremony).
  useFocusEffect(
    useCallback(() => {
      void refreshBackup();
    }, [refreshBackup]),
  );

  return (
    <ScrollView
      flex={1}
      backgroundColor="$background"
      contentContainerStyle={{ padding: 20, paddingTop: 72, gap: 20 }}
      refreshControl={
        <RefreshControl
          refreshing={balances.isRefetching}
          onRefresh={() => {
            void balances.refetch();
            void prices.refetch();
          }}
          tintColor="#8b93a1"
        />
      }
    >
      <XStack justifyContent="space-between" alignItems="center">
        <Text color="$text" fontSize="$5" fontWeight="700">
          Stackr Wallet
        </Text>
        <XStack gap="$2">
          {queue.length === 0 ? null : (
            <Link href="/sign" asChild>
              <Button size="$3" backgroundColor="$accent">
                <Text color="$accentText" fontSize="$3" fontWeight="700">
                  {queue.length} to sign
                </Text>
              </Button>
            </Link>
          )}
          <Button size="$3" chromeless onPress={() => void logout()}>
            <Text color="$textMuted" fontSize="$3">
              Sign out
            </Text>
          </Button>
        </XStack>
      </XStack>

      <BackupBanner variant={backup.banner} onDismiss={backup.dismissBanner} />

      <BalanceCard
        totalFiatText={formatFiat(totalFiat, DISPLAY_CURRENCY)}
        rows={rows}
        pendingChains={accountsView.pending.map(entry => chainMeta[entry.chain].name)}
      />
    </ScrollView>
  );
}
