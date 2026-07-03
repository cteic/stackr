import { Text, XStack, YStack } from 'tamagui';
import type { PortfolioRowView } from '@stackr/features';

/**
 * TEMPORARY HOME: stand-in for `@stackr/wallet-ui`'s BalanceCard (parallel
 * branch). Props are the agreed contract — the shared package replaces the
 * body, not the call sites.
 */
interface BalanceCardProps {
  totalFiatText: string;
  rows: PortfolioRowView[];
  pendingChains: string[];
}

export function BalanceCard({ totalFiatText, rows, pendingChains }: BalanceCardProps) {
  return (
    <YStack gap="$4">
      <YStack gap="$1">
        <Text color="$textMuted" fontSize="$2" textTransform="uppercase" letterSpacing={1}>
          Total balance
        </Text>
        <Text fontFamily="$mono" fontSize="$9" fontWeight="700" color="$text">
          {totalFiatText}
        </Text>
      </YStack>

      <YStack gap="$2">
        {rows.map(row => (
          <XStack
            key={`${row.chainName}-${row.truncatedAddress}`}
            backgroundColor="$surface"
            borderColor="$border"
            borderWidth={1}
            borderRadius="$4"
            padding="$4"
            alignItems="center"
            gap="$3"
          >
            <YStack width={10} height={10} borderRadius={5} backgroundColor={row.chainColor} />
            <YStack flex={1} gap="$1">
              <Text color="$text" fontSize="$4" fontWeight="600">
                {row.title}
              </Text>
              <Text color="$textFaint" fontFamily="$mono" fontSize="$2">
                {row.truncatedAddress}
              </Text>
            </YStack>
            <YStack alignItems="flex-end" gap="$1">
              <Text color="$text" fontFamily="$mono" fontSize="$4">
                {row.fiatText ?? '—'}
              </Text>
              <XStack gap="$2" alignItems="center">
                {row.symbolText === null ? null : (
                  <Text color="$textMuted" fontFamily="$mono" fontSize="$2">
                    {row.symbolText}
                  </Text>
                )}
                {row.changeText === null ? null : (
                  <Text
                    fontFamily="$mono"
                    fontSize="$2"
                    color={row.changeDirection === 'positive' ? '$positive' : '$negative'}
                  >
                    {row.changeText}
                  </Text>
                )}
              </XStack>
            </YStack>
          </XStack>
        ))}
      </YStack>

      {pendingChains.length === 0 ? null : (
        <YStack
          borderColor="$border"
          borderWidth={1}
          borderStyle="dashed"
          borderRadius="$4"
          padding="$4"
          gap="$1"
        >
          <Text color="$textMuted" fontSize="$3" fontWeight="600">
            {pendingChains.join(' · ')}
          </Text>
          <Text color="$textFaint" fontSize="$2">
            Local key derivation for these chains arrives with the signer integration.
          </Text>
        </YStack>
      )}
    </YStack>
  );
}
