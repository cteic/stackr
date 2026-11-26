import { useState } from 'react';
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
  // A request whose display can't be trusted needs a second, deliberate tap.
  // The sign screen keys this sheet by request id, so this resets per request.
  const [armed, setArmed] = useState(false);
  const needsSecondTap = request.warning !== undefined && !armed;

  function handleApprove() {
    if (needsSecondTap) {
      setArmed(true);
      return;
    }
    onApprove();
  }

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

      {request.originVerified ? null : (
        <YStack
          backgroundColor="$background"
          borderColor="$warning"
          borderWidth={1}
          borderRadius="$3"
          padding="$3"
          gap="$1"
        >
          <Text color="$warning" fontSize="$2" fontWeight="700" textTransform="uppercase">
            Unverified requester
          </Text>
          <Text color="$textMuted" fontSize="$2">
            Stackr can’t confirm who sent this. Only approve if you started this request on a device
            you trust.
          </Text>
        </YStack>
      )}

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

      {request.warning === undefined ? null : (
        <YStack
          backgroundColor="$background"
          borderColor="$warning"
          borderWidth={1}
          borderRadius="$3"
          padding="$3"
          gap="$1"
          testID="sign-payload-warning"
        >
          <Text color="$warning" fontSize="$2" fontWeight="700" textTransform="uppercase">
            Check before signing
          </Text>
          <Text color="$textMuted" fontSize="$2">
            {request.warning}
          </Text>
        </YStack>
      )}

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
        <Button
          flex={1}
          backgroundColor={armed ? '$warning' : '$accent'}
          disabled={busy}
          onPress={handleApprove}
          testID="sign-approve"
        >
          <Text color="$accentText" fontSize="$4" fontWeight="700">
            {armed ? 'Approve anyway' : 'Approve'}
          </Text>
        </Button>
      </XStack>
    </YStack>
  );
}
