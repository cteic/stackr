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
 * E2E-only escape hatch: with NEXT_PUBLIC_E2E_WALLET_MOCK=1 the config swaps
 * the real MetaMask connector stack for wagmi's in-memory mock connector, so
 * the connect flow can be exercised end-to-end without a browser extension
 * (the MetaMask SDK probes transport methods a window-level stub cannot
 * satisfy). The flag is set only by the Playwright web server — it must never
 * be set in a deployed environment.
 */
const e2eWalletMock = process.env.NEXT_PUBLIC_E2E_WALLET_MOCK === '1';

export const wagmiConfig = e2eWalletMock
  ? createConfig({
      chains: [mainnet],
      transports: {
        [mainnet.id]: http(resolveEthRpcUrl()),
      },
      connectors: [mock({ accounts: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'] })],
      ssr: true,
    })
  : getDefaultConfig({
      appName: 'Stackr',
      projectId,
      chains: [mainnet],
      transports: {
        // Same-origin proxy in the browser (keeps the Alchemy key server-side),
        // public RPC during SSR. See `resolveEthRpcUrl`.
        [mainnet.id]: http(resolveEthRpcUrl()),
      },
      wallets: [{ groupName: 'Recommended', wallets: [metaMaskWallet] }],
      ssr: true,
    });
