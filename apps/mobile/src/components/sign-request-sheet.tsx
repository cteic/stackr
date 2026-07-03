import { Button, Text, XStack, YStack } from 'tamagui';
import type { SignRequest } from '@/lib/sign-requests';

/**
 * TEMPORARY HOME: stand-in for `@stackr/wallet-ui`'s SignRequestSheet
 * (parallel branch). Props are the agreed contract.
 *
 * The sheet renders exactly what is being signed — the signing UX IS the
 * product (issue #130): origin, chain, kind, and the human-readable payload,
 * with reject as the visually-default action.
 */
interface SignRequestSheetProps {
  request: SignRequest;
  queueLength: number;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}

export function SignRequestSheet({
  request,
  queueLength,
  onApprove,
  onReject,
  busy,
}: SignRequestSheetProps) {
  return (
    <YStack
      backgroundColor="$surface"
      borderColor="$border"
      borderWidth={1}
      borderRadius="$5"
      padding="$5"
      gap="$4"
    >
      <YStack gap="$1">
        <Text color="$textMuted" fontSize="$2" textTransform="uppercase" letterSpacing={1}>
          Signature request{queueLength > 1 ? ` · 1 of ${queueLength}` : ''}
        </Text>
        <Text color="$text" fontSize="$5" fontWeight="700">
          {request.origin}
        </Text>
        <Text color="$textFaint" fontFamily="$mono" fontSize="$2">
          {request.chain.toUpperCase()} · {request.kind}
        </Text>
      </YStack>

      <YStack
        backgroundColor="$background"
        borderColor="$border"
        borderWidth={1}
        borderRadius="$3"
        padding="$4"
      >
        <Text color="$text" fontFamily="$mono" fontSize="$3">
          {request.display}
        </Text>
      </YStack>

      <XStack gap="$3">
        <Button
          flex={1}
          backgroundColor="$background"
          borderColor="$border"
          borderWidth={1}
          disabled={busy}
          onPress={onReject}
        >
          <Text color="$text" fontSize="$4">
            Reject
          </Text>
        </Button>
        <Button flex={1} backgroundColor="$accent" disabled={busy} onPress={onApprove}>
          <Text color="$accentText" fontSize="$4" fontWeight="700">
            Approve
          </Text>
        </Button>
      </XStack>
    </YStack>
  );
}
