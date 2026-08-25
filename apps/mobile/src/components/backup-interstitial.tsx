import { Button, Text, YStack } from 'tamagui';

interface BackupInterstitialProps {
  onBackupNow: () => void;
  onLater: () => void;
}

/**
 * One-time full-screen notice shown right after the silent seed generation on
 * first onboarding (shown-once semantics live in `useBackupStatus`; this is
 * purely presentational). Returning users never see it.
 */
export function BackupInterstitial({ onBackupNow, onLater }: BackupInterstitialProps) {
  return (
    <YStack
      position="absolute"
      top={0}
      bottom={0}
      left={0}
      right={0}
      backgroundColor="$background"
      justifyContent="center"
      padding="$6"
      gap="$4"
      zIndex={100}
    >
      <Text color="$text" fontSize="$7" fontWeight="700">
        Your wallet is ready
      </Text>
      <YStack gap="$3">
        <Text color="$text" fontSize="$3">
          One thing to know: the keys for Bitcoin, Stacks and Sui live only on this device until you
          back them up. If this phone is lost, they cannot be recovered.
        </Text>
        <Text color="$textMuted" fontSize="$3">
          Ethereum and Solana are different — those recover through your email sign-in.
        </Text>
      </YStack>
      <YStack gap="$2">
        <Button testID="interstitial-backup-now" backgroundColor="$accent" onPress={onBackupNow}>
          <Text color="$accentText" fontSize="$4" fontWeight="700">
            Back up now
          </Text>
        </Button>
        <Button testID="interstitial-later" chromeless onPress={onLater}>
          <Text color="$textMuted" fontSize="$3">
            Later
          </Text>
        </Button>
      </YStack>
    </YStack>
  );
}
