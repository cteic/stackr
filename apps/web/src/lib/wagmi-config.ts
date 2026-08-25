import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';
import { mainnet } from 'wagmi/chains';
import { createConfig, http } from 'wagmi';
import { mock } from 'wagmi/connectors';
import { resolveEthRpcUrl } from '@stackr/services';

// RainbowKit's getDefaultConfig requires a non-empty projectId even when the
// wallet list excludes WalletConnect — set a placeholder so SSR prerender
// doesn't crash when the env var is missing. Replace with a real Cloud
// projectId from https://cloud.reown.com when WalletConnect is reintroduced.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'stackr-dev';

/**
 * Playwright's `webServer` sets this — the real MetaMask connector drives the
 * MetaMask SDK, which probes transport methods no `window.ethereum` stub can
 * answer, so a real browser extension is the only thing that satisfies it.
 * The e2e config swaps in wagmi's connector-level mock instead, which
 * resolves a connection with no extension and no SDK involved. Never set
 * outside that one webServer invocation.
 */
export const E2E_MOCK_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const transports = {
  // Same-origin proxy in the browser (keeps the Alchemy key server-side),
  // public RPC during SSR. See `resolveEthRpcUrl`.
  [mainnet.id]: http(resolveEthRpcUrl()),
};

export const wagmiConfig =
  process.env.NEXT_PUBLIC_E2E_MOCK_WALLET === 'true'
    ? createConfig({
        chains: [mainnet],
        connectors: [mock({ accounts: [E2E_MOCK_ACCOUNT] })],
        transports,
        ssr: true,
      })
    : getDefaultConfig({
        appName: 'Stackr',
        projectId,
        chains: [mainnet],
        transports,
        wallets: [{ groupName: 'Recommended', wallets: [metaMaskWallet] }],
        ssr: true,
      });
