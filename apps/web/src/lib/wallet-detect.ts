export type WalletId = 'metamask' | 'phantom' | 'leather' | 'slush';

/**
 * Slush announces itself through the Wallet Standard event registry instead of
 * a window global, so its detection lives in `sui-connect.ts` — this module
 * only covers the wallets discoverable from a window shape.
 */
export type WindowDetectedWalletId = Exclude<WalletId, 'slush'>;

export const INSTALL_URLS: Record<WalletId, string> = {
  metamask: 'https://metamask.io/download',
  phantom: 'https://phantom.app/download',
  leather: 'https://leather.io/install-extension',
  slush: 'https://slush.app/download',
};

/**
 * Detect which wallet extensions have injected a provider. Pure and
 * window-shaped so it is unit-testable with plain objects, and dependency-free
 * so importing it does not pull in the wallet SDKs.
 */
export function detectInstalledWallets(w: object): Record<WindowDetectedWalletId, boolean> {
  return {
    metamask: 'ethereum' in w,
    phantom: 'phantom' in w,
    leather: 'LeatherProvider' in w,
  };
}
