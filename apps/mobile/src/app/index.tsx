import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useLoginWithEmail } from '@privy-io/expo';
import { Button, Input, Spinner, Text, YStack } from 'tamagui';
import { readPrivyConfig } from '@/lib/privy-config';
import { useWalletState } from '@/lib/use-wallet-state';

function CenteredScreen({ children }: { children: React.ReactNode }) {
  return (
    <YStack flex={1} backgroundColor="$background" justifyContent="center" padding="$6" gap="$4">
      {children}
    </YStack>
  );
}

function UnconfiguredNotice() {
  return (
    <CenteredScreen>
      <Text color="$text" fontSize="$6" fontWeight="700">
        Stackr Wallet
      </Text>
      <Text color="$textMuted" fontSize="$3">
        Privy is not configured for this build. Create an app in the Privy dashboard, then set
        EXPO_PUBLIC_PRIVY_APP_ID and EXPO_PUBLIC_PRIVY_CLIENT_ID and rebuild.
      </Text>
    </CenteredScreen>
  );
}

function EmailLogin() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const { sendCode, loginWithCode } = useLoginWithEmail();

  async function submitEmail() {
    setError(null);
    try {
      await sendCode({ email });
      setStage('code');
    } catch {
      setError('Could not send the code — check the address and try again.');
    }
  }

  async function submitCode() {
    setError(null);
    try {
      await loginWithCode({ code, email });
    } catch {
      setError('That code did not match — try again.');
    }
  }

  return (
    <CenteredScreen>
      <YStack gap="$1">
        <Text color="$text" fontSize="$7" fontWeight="700">
          Stackr Wallet
        </Text>
        <Text color="$textMuted" fontSize="$3">
          One signer for BTC, ETH, SOL, STX and SUI. Sign in to create your wallet.
        </Text>
      </YStack>

      {stage === 'email' ? (
        <YStack gap="$3">
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            backgroundColor="$surface"
            borderColor="$border"
            color="$text"
          />
          <Button backgroundColor="$accent" disabled={email.length === 0} onPress={submitEmail}>
            <Text color="$accentText" fontSize="$4" fontWeight="700">
              Continue with email
            </Text>
          </Button>
        </YStack>
      ) : (
        <YStack gap="$3">
          <Text color="$textMuted" fontSize="$2">
            Enter the 6-digit code sent to {email}
          </Text>
          <Input
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            backgroundColor="$surface"
            borderColor="$border"
            color="$text"
            fontFamily="$mono"
          />
          <Button backgroundColor="$accent" disabled={code.length !== 6} onPress={submitCode}>
            <Text color="$accentText" fontSize="$4" fontWeight="700">
              Sign in
            </Text>
          </Button>
          <Button chromeless onPress={() => setStage('email')}>
            <Text color="$textMuted" fontSize="$3">
              Use a different email
            </Text>
          </Button>
        </YStack>
      )}

      {error === null ? null : (
        <Text color="$negative" fontSize="$2">
          {error}
        </Text>
      )}
    </CenteredScreen>
  );
}

function PreparingWallets() {
  const { onboarding, createEthereumWallet, createSolanaWallet } = useWalletState();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (onboarding.nextAction === 'create-ethereum') await createEthereumWallet();
        if (onboarding.nextAction === 'create-solana') await createSolanaWallet();
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    if (onboarding.nextAction !== 'none') void run();
    return () => {
      cancelled = true;
    };
  }, [onboarding.nextAction, createEthereumWallet, createSolanaWallet]);

  return (
    <CenteredScreen>
      <Spinner size="large" color="$accent" />
      <Text color="$textMuted" fontSize="$3" textAlign="center">
        {failed
          ? 'Wallet setup hit a snag — it will retry automatically.'
          : 'Creating your wallet…'}
      </Text>
    </CenteredScreen>
  );
}

function Gate() {
  const { onboarding } = useWalletState();

  switch (onboarding.phase) {
    case 'booting':
      return (
        <CenteredScreen>
          <Spinner size="large" color="$accent" />
        </CenteredScreen>
      );
    case 'signed-out':
      return <EmailLogin />;
    case 'preparing-wallets':
      return <PreparingWallets />;
    case 'ready':
      return <Redirect href="/(wallet)/balance" />;
    default:
      return <UnconfiguredNotice />;
  }
}

export default function Index() {
  // The Privy hooks in Gate require the provider, which mounts only when
  // configured — so the unconfigured branch must render before touching them.
  if (readPrivyConfig() === null) return <UnconfiguredNotice />;
  return <Gate />;
}
