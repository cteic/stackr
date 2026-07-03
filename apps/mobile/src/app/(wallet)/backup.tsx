import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { useFocusEffect } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { createHoldToConfirm } from '@stackr/wallet-ui';
import { Button, Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import {
  backupFlowReducer,
  checkQuizAnswers,
  isPhraseVisible,
  pickQuizIndexes,
} from '@/lib/backup-flow';
import { authenticateForReveal } from '@/lib/device-auth';
import { getSigner } from '@/lib/local-wallet-singleton';
import { buildShareMessage, createExpiringClipboard } from '@/lib/phrase-export';
import { createScreenGuard } from '@/lib/screen-guard';
import { useBackupStatus } from '@/lib/use-backup-status';

const screenGuard = createScreenGuard(ScreenCapture);
const expiringClipboard = createExpiringClipboard(Clipboard, (fn, ms) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
});

function Paragraph({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <Text color={muted ? '$textMuted' : '$text'} fontSize="$3">
      {children}
    </Text>
  );
}

function HoldToReveal({ onReveal }: { onReveal: () => void }) {
  const [progress, setProgress] = useState(0);
  const hold = useMemo(
    () => createHoldToConfirm({ holdMs: 1200, onConfirm: onReveal, onProgress: setProgress }),
    [onReveal],
  );
  useEffect(() => hold.dispose, [hold]);

  return (
    <YStack gap="$3">
      <Paragraph>Make sure nobody can see your screen.</Paragraph>
      <Button backgroundColor="$accent" onPressIn={hold.start} onPressOut={hold.cancel}>
        <Text color="$accentText" fontSize="$4" fontWeight="700">
          {progress > 0 && progress < 1 ? 'Keep holding…' : 'Hold to reveal'}
        </Text>
      </Button>
      <View style={{ height: 2, backgroundColor: '#232830' }}>
        <View
          style={{ height: 2, width: `${Math.round(progress * 100)}%`, backgroundColor: '#ff9f0a' }}
        />
      </View>
    </YStack>
  );
}

export default function BackupScreen() {
  const [stage, dispatch] = useReducer(backupFlowReducer, 'intro');
  const [words, setWords] = useState<string[]>([]);
  const [quizIndexes, setQuizIndexes] = useState<[number, number]>([0, 1]);
  const [quizAnswers, setQuizAnswers] = useState<[string, string]>(['', '']);
  const [quizError, setQuizError] = useState(false);
  const [copied, setCopied] = useState(false);
  const backup = useBackupStatus(false);
  const { refresh: refreshBackup } = backup;

  const phraseVisible = isPhraseVisible(stage);

  // Screenshot/recording block strictly while words are on screen; the words
  // themselves live only in this component's state and are dropped on exit.
  useEffect(() => {
    if (phraseVisible) {
      void screenGuard.acquire();
      return () => {
        void screenGuard.release();
      };
    }
    return undefined;
  }, [phraseVisible]);

  const leave = useCallback(() => {
    setWords([]);
    setQuizAnswers(['', '']);
    setQuizError(false);
    setCopied(false);
    void expiringClipboard.clearNow();
    dispatch({ type: 'exit' });
  }, []);

  // Leaving the tab abandons the ceremony and clears everything.
  useFocusEffect(
    useCallback(() => {
      void refreshBackup();
      return leave;
    }, [refreshBackup, leave]),
  );

  async function begin(): Promise<void> {
    dispatch({ type: 'begin' });
    const result = await authenticateForReveal(LocalAuthentication);
    if (result === 'passed') dispatch({ type: 'auth-passed' });
    else if (result === 'unavailable') dispatch({ type: 'auth-unavailable' });
    else dispatch({ type: 'auth-failed' });
  }

  const reveal = useCallback((): void => {
    void getSigner()
      .revealMnemonic()
      .then(mnemonic => {
        setWords(mnemonic.split(' '));
        dispatch({ type: 'hold-confirmed' });
      });
  }, []);

  function startQuiz(): void {
    setQuizIndexes(pickQuizIndexes(words.length, Math.random));
    setQuizAnswers(['', '']);
    setQuizError(false);
    dispatch({ type: 'start-quiz' });
  }

  async function submitQuiz(): Promise<void> {
    if (checkQuizAnswers(words, quizIndexes, quizAnswers)) {
      await backup.confirmVerified();
      dispatch({ type: 'quiz-passed' });
    } else {
      setQuizError(true);
      dispatch({ type: 'quiz-failed' });
    }
  }

  const phrase = useMemo(() => words.join(' '), [words]);

  return (
    <ScrollView
      flex={1}
      backgroundColor="$background"
      contentContainerStyle={{ padding: 20, paddingTop: 72, gap: 20 }}
    >
      <Text color="$text" fontSize="$5" fontWeight="700">
        Backup & keys
      </Text>

      {stage === 'intro' ? (
        <YStack gap="$3">
          <Paragraph>
            Your recovery phrase is the only backup for Bitcoin, Stacks and Sui. Anyone who has it
            controls those funds; Stackr can never recover it for you, and will never ask for it.
          </Paragraph>
          <Paragraph muted>
            Ethereum and Solana are held by your email sign-in and recover through it — the phrase
            below does not affect them.
          </Paragraph>
          {backup.verified ? (
            <Paragraph muted>
              Backup verified on this device. You can view it again anytime.
            </Paragraph>
          ) : null}
          <Button backgroundColor="$accent" onPress={() => void begin()}>
            <Text color="$accentText" fontSize="$4" fontWeight="700">
              Show recovery phrase
            </Text>
          </Button>
          <YStack
            backgroundColor="$surface"
            borderColor="$border"
            borderWidth={1}
            borderRadius="$2"
            padding="$3"
            gap="$2"
          >
            <Text color="$text" fontSize="$3" fontWeight="700">
              Ethereum & Solana keys
            </Text>
            <Paragraph muted>
              Those keys are managed by Privy and recover via your email. Key export from the app is
              coming; until then it is available from Privy directly.
            </Paragraph>
          </YStack>
        </YStack>
      ) : null}

      {stage === 'authenticating' ? <Paragraph muted>Confirm it is you…</Paragraph> : null}

      {stage === 'unprotected-warning' ? (
        <YStack gap="$3">
          <Paragraph>
            This device has no passcode or biometrics. Anyone holding it could open this screen —
            consider enabling a device lock first.
          </Paragraph>
          <Button
            backgroundColor="$accent"
            onPress={() => dispatch({ type: 'acknowledge-unprotected' })}
          >
            <Text color="$accentText" fontSize="$4" fontWeight="700">
              I understand, continue
            </Text>
          </Button>
          <Button chromeless onPress={leave}>
            <Text color="$textMuted" fontSize="$3">
              Cancel
            </Text>
          </Button>
        </YStack>
      ) : null}

      {stage === 'hold' ? <HoldToReveal onReveal={reveal} /> : null}

      {stage === 'revealed' || stage === 'quiz' ? (
        <YStack gap="$3">
          <XStack flexWrap="wrap" gap="$2">
            {words.map((word, index) => (
              <XStack
                key={`${index}-${word}`}
                backgroundColor="$surface"
                borderColor="$border"
                borderWidth={1}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
                gap="$2"
              >
                <Text color="$textMuted" fontSize="$2" fontFamily="$mono">
                  {index + 1}
                </Text>
                <Text color="$text" fontSize="$3" fontFamily="$mono">
                  {word}
                </Text>
              </XStack>
            ))}
          </XStack>

          {stage === 'revealed' ? (
            <YStack gap="$2">
              <Button backgroundColor="$accent" onPress={startQuiz}>
                <Text color="$accentText" fontSize="$4" fontWeight="700">
                  I wrote it down — verify
                </Text>
              </Button>
              <Button
                chromeless
                onPress={() => {
                  void Share.share({ message: buildShareMessage(phrase) });
                }}
              >
                <Text color="$textMuted" fontSize="$3">
                  Save to password manager…
                </Text>
              </Button>
              <Button
                chromeless
                onPress={() => {
                  void expiringClipboard.copy(phrase).then(() => setCopied(true));
                }}
              >
                <Text color="$textMuted" fontSize="$3">
                  {copied ? 'Copied — clears in 60s' : 'Copy (auto-clears in 60s)'}
                </Text>
              </Button>
              <Paragraph muted>
                A phrase in a password manager is recoverable, but only as safe as that manager.
                Ethereum and Solana are unaffected either way.
              </Paragraph>
            </YStack>
          ) : (
            <YStack gap="$2">
              <Paragraph>
                Enter word #{quizIndexes[0] + 1} and word #{quizIndexes[1] + 1} to verify your
                backup.
              </Paragraph>
              <Input
                value={quizAnswers[0]}
                onChangeText={value => setQuizAnswers([value, quizAnswers[1]])}
                placeholder={`Word #${quizIndexes[0] + 1}`}
                autoCapitalize="none"
                autoCorrect={false}
                backgroundColor="$surface"
                borderColor="$border"
                color="$text"
                fontFamily="$mono"
              />
              <Input
                value={quizAnswers[1]}
                onChangeText={value => setQuizAnswers([quizAnswers[0], value])}
                placeholder={`Word #${quizIndexes[1] + 1}`}
                autoCapitalize="none"
                autoCorrect={false}
                backgroundColor="$surface"
                borderColor="$border"
                color="$text"
                fontFamily="$mono"
              />
              {quizError ? (
                <Text color="$negative" fontSize="$2">
                  Those words do not match — check your backup and try again.
                </Text>
              ) : null}
              <Button backgroundColor="$accent" onPress={() => void submitQuiz()}>
                <Text color="$accentText" fontSize="$4" fontWeight="700">
                  Verify backup
                </Text>
              </Button>
            </YStack>
          )}
        </YStack>
      ) : null}

      {stage === 'verified' ? (
        <YStack gap="$3">
          <Paragraph>
            Backup verified. Your Bitcoin, Stacks and Sui keys are now recoverable from your phrase.
          </Paragraph>
          <Button chromeless onPress={leave}>
            <Text color="$textMuted" fontSize="$3">
              Done
            </Text>
          </Button>
        </YStack>
      ) : null}
    </ScrollView>
  );
}
