import { test, expect } from '@playwright/test';

const MOCK_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TRUNCATED = `${MOCK_ADDRESS.slice(0, 6)}…${MOCK_ADDRESS.slice(-4)}`;

/*
 * Injects a minimal EIP-1193 window.ethereum mock before any page script runs,
 * so the RainbowKit/wagmi MetaMask connector takes its injected-extension path
 * (rainbowkit's `isMetaMask(window.ethereum)` runs at config-creation time and
 * the MetaMask SDK then drives the injected provider directly — no real
 * extension needed). The app's own connect modal (`WalletConnectModal`, not
 * RainbowKit's) is then clicked through, and the assertions follow the state
 * the whole way: wagmi connect → WalletConnectionBridge → wallet-store →
 * modal row, header trigger, and the dashboard's connected-wallet card.
 */
function installEthereumMock({ mockAddress }: { mockAddress: string }) {
  type Listener = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();

  function on(event: string, listener: Listener) {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
  }

  function removeListener(event: string, listener: Listener) {
    listeners.get(event)?.delete(listener);
  }

  function emit(event: string, ...args: unknown[]) {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  }

  let accounts: string[] = [];

  const provider = {
    isMetaMask: true,
    chainId: '0x1',
    networkVersion: '1',
    selectedAddress: null as string | null,
    request: async ({ method }: { method: string }) => {
      switch (method) {
        case 'eth_requestAccounts':
          accounts = [mockAddress];
          provider.selectedAddress = mockAddress;
          emit('accountsChanged', accounts);
          return accounts;
        case 'eth_accounts':
          return accounts;
        case 'eth_chainId':
          return '0x1';
        case 'net_version':
          return '1';
        case 'wallet_getPermissions':
        case 'wallet_requestPermissions':
          return accounts.length > 0 ? [{ parentCapability: 'eth_accounts' }] : [];
        default:
          return null;
      }
    },
    on,
    once: on,
    removeListener,
    off: removeListener,
    emit,
  };

  Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
}

test('connects MetaMask wallet and surfaces the address across the app', async ({ page }) => {
  await page.addInitScript(installEthereumMock, { mockAddress: MOCK_ADDRESS });

  await page.goto('/');

  // Disconnected state: the header trigger reads "Connect".
  const trigger = page.getByRole('button', { name: 'Connect', exact: true });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Connect a wallet' });
  await expect(dialog).toBeVisible();

  // The MetaMask row detects the injected provider and offers Connect (not Install).
  const metamaskRow = dialog.locator('li', { hasText: 'MetaMask' });
  await metamaskRow.getByRole('button', { name: 'Connect', exact: true }).click();

  // Connected: the row flips to Disconnect once the address lands in the store.
  await expect(metamaskRow.getByRole('button', { name: 'Disconnect' })).toBeVisible({
    timeout: 15_000,
  });

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  // The header trigger now reads "Wallets" and the dashboard shows the
  // connected address as a truncated wallet-card label.
  await expect(page.getByRole('button', { name: 'Wallets', exact: true })).toBeVisible();
  await expect(page.getByText(TRUNCATED).first()).toBeVisible({ timeout: 15_000 });
});

test('shows the install link when no wallet extension is present', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Connect', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Connect a wallet' });
  await expect(dialog).toBeVisible();

  // Without an injected provider the MetaMask row offers Install, not Connect.
  const metamaskRow = dialog.locator('li', { hasText: 'MetaMask' });
  const installLink = metamaskRow.getByRole('link', { name: 'Install' });
  await expect(installLink).toBeVisible();
  await expect(installLink).toHaveAttribute('href', 'https://metamask.io/download');
});
