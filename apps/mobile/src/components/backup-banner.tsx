import { Link } from 'expo-router';
import { Button, Text, XStack, YStack } from 'tamagui';
import type { BackupBanner as BannerVariant } from '@/lib/backup-status';

interface BackupBannerProps {
  variant: BannerVariant;
  onDismiss: () => void;
}

/**
 * The deferred-backup nudge on the Balance screen. Neutral is dismissable for
 * the session; urgent (funds on unbacked-up local chains) is not — the keys
 * exist only on this device until the phrase is written down.
 */
export function BackupBanner({ variant, onDismiss }: BackupBannerProps) {
  if (variant === 'hidden') return null;
  const urgent = variant === 'urgent';

  return (
    <YStack
      backgroundColor="$surface"
      borderColor={urgent ? '$negative' : '$border'}
      borderWidth={1}
      borderRadius="$2"
      padding="$3"
      gap="$2"
    >
      <Text color={urgent ? '$negative' : '$text'} fontSize="$3" fontWeight="700">
        {urgent ? 'Back up your wallet — you have funds at risk' : 'Back up your wallet'}
      </Text>
      <Text color="$textMuted" fontSize="$2">
        {urgent
          ? 'Your Bitcoin, Stacks and Sui keys exist only on this phone. If it is lost before you back up, those funds are gone.'
          : 'Your Bitcoin, Stacks and Sui keys live only on this device until you save the recovery phrase.'}
      </Text>
      <XStack gap="$2">
        <Link href="/(wallet)/backup" asChild>
          <Button size="$3" backgroundColor="$accent" flexGrow={1}>
            <Text color="$accentText" fontSize="$3" fontWeight="700">
              Back up now
            </Text>
          </Button>
        </Link>
        {urgent ? null : (
          <Button size="$3" chromeless onPress={onDismiss}>
            <Text color="$textMuted" fontSize="$3">
              Later
            </Text>
          </Button>
        )}
      </XStack>
    </YStack>
  );
}
