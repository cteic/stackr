import { RefreshControl } from 'react-native';
import { ScrollView, Text } from 'tamagui';
import { ActivityList } from '@/components/activity-list';
import { useActivity } from '@/lib/queries';
import { useWalletState } from '@/lib/use-wallet-state';

export default function ActivityScreen() {
  const { accountsView } = useWalletState();
  const activity = useActivity(accountsView.accounts);

  return (
    <ScrollView
      flex={1}
      backgroundColor="$background"
      contentContainerStyle={{ padding: 20, paddingTop: 72, gap: 20 }}
      refreshControl={
        <RefreshControl
          refreshing={activity.isRefetching}
          onRefresh={() => void activity.refetch()}
          tintColor="#8b93a1"
        />
      }
    >
      <Text color="$text" fontSize="$5" fontWeight="700">
        Activity
      </Text>
      <ActivityList
        transactions={activity.data ?? []}
        emptyText="No activity yet — transactions across your chains land here."
      />
    </ScrollView>
  );
}
