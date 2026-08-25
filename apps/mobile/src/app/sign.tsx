import { useState } from 'react';
import { router } from 'expo-router';
import { Button, Text, YStack } from 'tamagui';
import { useSignQueue } from '@/lib/sign-queue-singleton';
import { SignRequestSheet } from '@/components/sign-request-sheet';

export default function SignScreen() {
  const { queue, resolve, enqueue } = useSignQueue();
  const [busy, setBusy] = useState(false);
  const head = queue[0];

  async function decide(approved: boolean) {
    if (head === undefined) return;
    setBusy(true);
    try {
      await resolve({ id: head.id, approved });
      if (queue.length <= 1) router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <YStack flex={1} backgroundColor="$background" justifyContent="flex-end" padding="$5" gap="$4">
      {head === undefined ? (
        <YStack flex={1} justifyContent="center" alignItems="center" gap="$4">
          <Text color="$textMuted" fontSize="$3">
            Nothing waiting for your signature.
          </Text>
          {__DEV__ ? (
            <Button
              chromeless
              onPress={() =>
                enqueue({
                  id: `demo-${Date.now()}`,
                  chain: 'stx',
                  origin: 'Paired device · demo0000',
                  originVerified: false,
                  kind: 'message',
                  display: 'Sign in to Stackr\n\nnonce: 8f3a-demo',
                  payload: { message: 'demo' },
                  receivedAt: new Date().toISOString(),
                })
              }
            >
              <Text color="$accent" fontSize="$3">
                Enqueue a sample request (dev)
              </Text>
            </Button>
          ) : null}
          <Button chromeless onPress={() => router.back()}>
            <Text color="$textMuted" fontSize="$3">
              Back
            </Text>
          </Button>
        </YStack>
      ) : (
        <SignRequestSheet
          request={head}
          queueLength={queue.length}
          busy={busy}
          onApprove={() => void decide(true)}
          onReject={() => void decide(false)}
        />
      )}
    </YStack>
  );
}
