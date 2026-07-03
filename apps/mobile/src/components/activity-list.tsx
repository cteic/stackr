import { Text, XStack, YStack } from 'tamagui';
import type { Transaction } from '@stackr/models';
import { chainMeta } from '@stackr/models';

/**
 * TEMPORARY HOME: stand-in for `@stackr/wallet-ui`'s ActivityList (parallel
 * branch). Props are the agreed contract.
 */
interface ActivityListProps {
  transactions: Transaction[];
  emptyText: string;
}

function truncateMiddle(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function ActivityList({ transactions, emptyText }: ActivityListProps) {
  if (transactions.length === 0) {
    return (
      <YStack
        borderColor="$border"
        borderWidth={1}
        borderStyle="dashed"
        borderRadius="$4"
        padding="$6"
        alignItems="center"
      >
        <Text color="$textMuted" fontSize="$3">
          {emptyText}
        </Text>
      </YStack>
    );
  }

  return (
    <YStack gap="$2">
      {transactions.map(tx => {
        const received = tx.type === 'receive';
        return (
          <XStack
            key={`${tx.chain}-${tx.hash}`}
            backgroundColor="$surface"
            borderColor="$border"
            borderWidth={1}
            borderRadius="$4"
            padding="$4"
            alignItems="center"
            gap="$3"
          >
            <Text fontFamily="$mono" fontSize="$4" color={received ? '$positive' : '$negative'}>
              {received ? '↓' : '↑'}
            </Text>
            <YStack flex={1} gap="$1">
              <Text color="$text" fontSize="$3" fontWeight="600">
                {received ? 'Received' : 'Sent'} · {chainMeta[tx.chain].symbol}
              </Text>
              <Text color="$textFaint" fontFamily="$mono" fontSize="$2">
                {truncateMiddle(tx.counterparty)} · {new Date(tx.timestamp).toLocaleDateString()}
              </Text>
            </YStack>
            <YStack alignItems="flex-end" gap="$1">
              <Text color="$text" fontFamily="$mono" fontSize="$3">
                {received ? '+' : '−'}
                {tx.amount} {chainMeta[tx.chain].symbol}
              </Text>
              {tx.confirmed ? null : (
                <Text color="$warning" fontSize="$1" textTransform="uppercase">
                  pending
                </Text>
              )}
            </YStack>
          </XStack>
        );
      })}
    </YStack>
  );
}
