import { Tabs, useRouter } from 'expo-router';
import { Text } from 'tamagui';
import { BackupInterstitial } from '@/components/backup-interstitial';
import { useBackupStatus } from '@/lib/use-backup-status';

const colors = {
  background: '#0b0d10',
  border: '#232830',
  active: '#ff9f0a',
  inactive: '#5c6470',
};

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      fontSize="$2"
      textTransform="uppercase"
      letterSpacing={1}
      color={focused ? colors.active : colors.inactive}
    >
      {label}
    </Text>
  );
}

export default function WalletLayout() {
  const router = useRouter();
  const backup = useBackupStatus(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.active,
          tabBarInactiveTintColor: colors.inactive,
        }}
      >
        <Tabs.Screen
          name="balance"
          options={{
            title: 'Balance',
            tabBarIcon: () => null,
            tabBarLabel: ({ focused }) => <TabLabel label="Balance" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: 'Activity',
            tabBarIcon: () => null,
            tabBarLabel: ({ focused }) => <TabLabel label="Activity" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="backup"
          options={{
            title: 'Backup',
            tabBarIcon: () => null,
            tabBarLabel: ({ focused }) => <TabLabel label="Backup" focused={focused} />,
          }}
        />
      </Tabs>
      {backup.interstitialVisible ? (
        <BackupInterstitial
          onBackupNow={() => {
            void backup.dismissInterstitial();
            router.push('/(wallet)/backup');
          }}
          onLater={() => {
            void backup.dismissInterstitial();
          }}
        />
      ) : null}
    </>
  );
}
