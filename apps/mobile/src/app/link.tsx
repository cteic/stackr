import { useState } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Text, YStack } from 'tamagui';
import { AnnouncedAddressSchema, type AnnouncedAddress } from '@stackr/wallet-link';
import { useWalletState } from '@/lib/use-wallet-state';
import { isLinkAvailable, useLinkSession } from '@/lib/link-singleton';

/**
 * "Connect to Stackr web" — scan the QR shown in the stackr.ie connect modal,
 * pair over the encrypted link, and announce this wallet's addresses. While
 * paired, sign requests from the portfolio arrive on the sign sheet.
 */
export default function LinkScreen() {
  const { link, pair, disconnect } = useLinkSession();
  const { accountsView } = useWalletState();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);

  const addresses: AnnouncedAddress[] = accountsView.accounts.map(account =>
    AnnouncedAddressSchema.parse({
      chain: account.wallet.chain,
      address: account.wallet.address,
      label: account.wallet.label,
    }),
  );

  async function beginScan(): Promise<void> {
    if (permission === null || !permission.granted) {
      const asked = await requestPermission();
      if (!asked.granted) return;
    }
    setScanning(true);
  }

  function onScanned(data: string): void {
    if (link.status === 'pairing') return;
    setScanning(false);
    void pair(data, addresses);
  }

  return (
    <YStack flex={1} backgroundColor="$background" padding="$5" gap="$4">
      <Text color="$text" fontSize="$5" fontWeight="700">
        Connect to Stackr web
      </Text>

      {!isLinkAvailable() ? (
        <Text color="$textMuted" fontSize="$3">
          Pairing is not configured in this build.
        </Text>
      ) : link.status === 'paired' ? (
        <YStack gap="$4">
          <Text color="$text" fontSize="$3">
            Paired with stackr.ie. Your addresses are shared and sign requests from the portfolio
            will appear here for approval.
          </Text>
          <Button onPress={() => void disconnect()}>
            <Text color="$text" fontSize="$3" fontWeight="700">
              Disconnect
            </Text>
          </Button>
        </YStack>
      ) : scanning ? (
        <YStack flex={1} gap="$3">
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={result => onScanned(result.data)}
          />
          <Button chromeless onPress={() => setScanning(false)}>
            <Text color="$textMuted" fontSize="$3">
              Cancel
            </Text>
          </Button>
        </YStack>
      ) : (
        <YStack gap="$4">
          <Text color="$textMuted" fontSize="$3">
            On stackr.ie, open Connect wallet and choose Stackr Wallet, then scan the QR code it
            shows. The connection is end-to-end encrypted — the relay never sees your addresses.
          </Text>
          {link.status === 'pairing' ? (
            <Text color="$textMuted" fontSize="$3">
              Pairing…
            </Text>
          ) : (
            <Button backgroundColor="$accent" onPress={() => void beginScan()}>
              <Text color="$accentText" fontSize="$3" fontWeight="700">
                Scan pairing code
              </Text>
            </Button>
          )}
          {link.status === 'error' ? (
            <Text color="$negative" fontSize="$3">
              {link.message}
            </Text>
          ) : null}
        </YStack>
      )}

      <Button chromeless onPress={() => router.back()}>
        <Text color="$textMuted" fontSize="$3">
          Back
        </Text>
      </Button>
    </YStack>
  );
}
