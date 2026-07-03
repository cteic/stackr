import { Tabs } from 'expo-router';
import { Text } from 'tamagui';

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
  return (
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
    </Tabs>
  );
}
