import type { NextConfig } from 'next';
import path from 'node:path';

// Mobile (Capacitor) build target. Driven by `NEXT_PUBLIC_TARGET=capacitor`
// (set by the `build:mobile` script). When the flag is absent the config below
// is the plain web build — byte-for-byte identical to before this flag existed.
const isCapacitor = process.env.NEXT_PUBLIC_TARGET === 'capacitor';

// Modules swapped out for watch-only stubs in the mobile build. Mobile is
// watch-only by design (no wallet-connect, no signing), and these modules pull
// in wagmi / RainbowKit / WalletConnect / Solana wallet-adapter / @stacks/connect
// — several of which touch browser/native globals at module scope and break the
// static export. Replacing the modules (rather than runtime-gating their render)
// keeps those libraries out of the mobile bundle and out of the export prerender.
const capacitorModuleStubs: Array<[RegExp, string]> = [
  [/^@\/lib\/providers$/, 'src/lib/providers.capacitor.tsx'],
  [/^@\/components\/wallet-connect-modal$/, 'src/components/wallet-connect-modal.capacitor.tsx'],
];

// Content-Security-Policy. This now ships ENFORCING (was report-only in #85):
// every origin below was enumerated from the code that actually opens it —
// the chain service clients (`packages/services`), the same-origin RPC proxies
// (`/api/rpc/*`, covered by `'self'`), the wallet stacks (RainbowKit / wagmi /
// WalletConnect / Reown / Solana wallet-adapter), the Kraken market sockets,
// and PostHog analytics. Grep `https?://` / `wss?://` across `apps/web/src` and
// `packages/*/src` to re-derive this list when a new data source lands.
//
// `connect-src` is the security-critical directive (it bounds where the app can
// exfiltrate to). It is tightened off the previous blanket `https: wss:` to the
// specific data hosts, plus WALLETCONNECT/REOWN WILDCARDS
// (`*.walletconnect.com|org`, `*.reown.com`): the WalletConnect relay and Reown
// AppKit rotate through a fleet of subdomains we can't pin individually, so the
// wildcard is the safe enforcement boundary that still blocks arbitrary
// third-party origins. `img-src` keeps `https:` because wallet/token logos are
// served from many third-party CDNs (the WalletConnect explorer, Reown image
// delivery, token lists) we likewise can't enumerate; `http:`/data exfiltration
// via `<img>` is still blocked. See #97 / #69.
const walletConnectConnect = [
  // WalletConnect v2 relay (websocket) + HTTP infra; Reown AppKit / web3modal.
  'wss://relay.walletconnect.com',
  'wss://relay.walletconnect.org',
  'https://*.walletconnect.com',
  'https://*.walletconnect.org',
  'https://*.reown.com',
  'https://api.web3modal.org',
  'https://api.web3modal.com',
];

const chainDataConnect = [
  'https://blockstream.info', // BTC balances + transactions (services/btc, transactions)
  // Etherscan (ETH balances + transactions), Alpha Vantage (stocks), and Hiro
  // (STX balances, BNS, transactions, NFTs, health call-reads) are no longer
  // listed: the browser only ever reaches the same-origin proxies at
  // /api/etherscan, /api/stocks, and /api/hiro (covered by 'self'), which hold
  // the server-only keys and forward upstream. See #69.
  'https://gamma.io', // Stacks NFT metadata enrichment (services/nft/stacks)
  'https://api.mainnet-beta.solana.com', // SOL balance JSON-RPC (services/sol)
  'https://api.coingecko.com', // spot prices + market charts (services/prices)
  'https://fullnode.mainnet.sui.io', // SUI balances + transactions (services/sui)
  'https://api.kamino.finance', // Kamino liquidation-health reads (services/health/kamino)
  'wss://ws.kraken.com', // live ticker + order book (services/ticker, orderbook)
];

const analyticsConnect = [
  'https://us.i.posthog.com', // PostHog ingest (packages/analytics)
  'https://us-assets.i.posthog.com', // PostHog static assets (array.js / recorder)
];

// Next's dev runtime (React Refresh / HMR / eval'd source maps) requires
// 'unsafe-eval'; production does not. We allow it ONLY in development so the
// enforced production policy stays strict ('wasm-unsafe-eval' for wallet/crypto
// WASM, no general eval). e2e runs against `pnpm dev`, so without this the dev
// CSP blocks React Refresh and breaks client rendering.
const isDev = process.env.NODE_ENV !== 'production';
const scriptSrc = [
  "script-src 'self'",
  "'unsafe-inline'", // Next inline bootstrap scripts (no nonce pipeline under OpenNext)
  "'wasm-unsafe-eval'", // wallet/crypto WASM
  ...(isDev ? ["'unsafe-eval'"] : []), // dev-only: React Refresh / HMR
  'https://us-assets.i.posthog.com',
].join(' ');

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline' covers Next's inline bootstrap scripts (no nonce pipeline
  // under OpenNext); 'wasm-unsafe-eval' covers wallet/crypto WASM. The blanket
  // 'unsafe-eval' is dropped in production, allowed only in dev (see scriptSrc).
  scriptSrc,
  // Tailwind, RainbowKit and the wallet UIs inject inline styles.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:", // next/font self-hosts; no runtime font CDN
  `connect-src ${["'self'", ...chainDataConnect, ...analyticsConnect, ...walletConnectConnect].join(' ')}`,
  // WalletConnect / Reown render their pairing + verify UI in iframes.
  "frame-src 'self' https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com",
  "worker-src 'self' blob:", // wallet adapters spin up blob workers
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `headers()` is unsupported (and ignored, with a build warning) under
  // `output: 'export'`, so the mobile target skips it; a native WebView has no
  // response headers anyway.
  ...(isCapacitor
    ? {}
    : {
        async headers() {
          return [{ source: '/(.*)', headers: securityHeaders }];
        },
      }),
  // Capacitor ships a static bundle inside a native WebView, so the mobile
  // target switches Next to a static export (`./out`, consumed via
  // capacitor.config.ts `webDir`). The default web build (OpenNext on
  // Cloudflare) keeps its server-rendered output untouched.
  ...(isCapacitor
    ? {
        output: 'export' as const,
        // The static export has no Image Optimization server.
        images: { unoptimized: true },
        webpack: (
          config: { plugins: unknown[] },
          { webpack }: { webpack: typeof import('webpack') },
        ) => {
          for (const [pattern, target] of capacitorModuleStubs) {
            config.plugins.push(
              new webpack.NormalModuleReplacementPlugin(
                pattern,
                path.resolve(import.meta.dirname, target),
              ),
            );
          }
          return config;
        },
      }
    : {}),
};

export default nextConfig;
