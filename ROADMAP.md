# Roadmap

What stackr has shipped, what is being built now, and what comes next.
Grounded in the actual tree — every "shipped" item below is live at
[stackr.ie](https://stackr.ie) or merged on `dev` with tests.

## Shipped

**Portfolio**

- Five chains — Bitcoin, Ethereum, Solana, Stacks, Sui — connected wallets
  (MetaMask, Phantom, Leather, Slush) and watch-only addresses in one view
- Total-wealth tracking beyond crypto: stocks, multi-currency cash, gold
  (spot-priced via PAXG), and self-valued assets
- Live markets: Kraken orderbook + depth chart, custom SVG charting
- Collectibles, Stacks (SIP-9) first
- One-click demo portfolio on the first-run screen

**Liquidation health — the core bet**

- Normalized liquidation risk across lending protocols, computed from
  protocol-native reads, never an aggregator
- Ethereum: Aave v3. Solana: Kamino. **Stacks: Zest and Granite via direct
  Clarity call-reads** — no data provider covers Stacks, so stackr reads the
  contracts itself; that is the moat and the maintenance commitment
- Failed protocol reads surface honestly on the card instead of vanishing

**Alerts + accounts**

- Optional accounts (magic-link email, Supabase + row-level security); the
  app remains fully usable logged-out
- Web-push liquidation alerts: a Cloudflare cron worker re-reads positions
  and pushes when risk crosses warn/critical thresholds (RFC 8291 encryption
  implemented and unit-verified byte-for-byte)

**Stackr Wallet (native app, in progress on `dev`)**

- Expo app with two surfaces — balance and activity — plus a sign-request
  sheet; the product is a signer, not another dashboard
- Signer core: BIP39 + per-chain HD derivation for all five chains, audited
  primitives (@scure/@noble), every derivation path pinned against published
  test vectors; keys live in hardware-backed device storage
- Onboarding: email login (Privy) creates ETH/SOL embedded wallets; the
  BTC/STX/SUI seed is generated silently on-device — no mnemonic ceremony at
  signup, backup deferred to an escalating in-app ceremony with biometric
  gate, screenshot blocking, and a verify-two-words check
- Stackr Link: end-to-end-encrypted QR pairing (X25519 + XChaCha20-Poly1305
  over an ephemeral relay) that announces wallet addresses into the web
  portfolio; the same envelope carries sign requests

**Engineering posture**

- ~900 unit tests plus Playwright e2e, coverage gates, weekly dependency
  audits, security headers + strict CSP, server-side key proxies with
  fleet-wide rate limiting and edge caching
- Public repo, CI on every PR, conventional commits, release-please

## Next (Q3 2026)

- **Arkadiko** liquidation-health adapter — third Stacks protocol, CDP-style
  (150% collateral ratio), same protocol-native Clarity approach
- **sBTC depth**: positions and health for the sBTC DeFi surface as it grows
- **Wallet signing on Stacks**: sign-request relay wired end-to-end
  (Stackr Link ↔ wallet app), Reown WalletKit wallet-side for third-party
  dapp connections, Stacks transaction signing UX
- **Alerts premium tier**: multi-wallet subscriptions, custom thresholds and
  cooldowns; payments via merchant of record
- Store-ready wallet builds (EAS; TestFlight + Play internal tracks)

## Later (Q4 2026 →)

- Remaining EVM/SOL/BTC collectibles adapters
- Internationalisation (FR, DE, ES, RU, AR, ZH, JA)
- Opt-in encrypted seed sync (iCloud Keychain / Android backup)
- Desktop shell built from the shared component layer

## Principles

Self-custody by default; hosted nothing that can be client-side; free and
generous-free-tier data with aggressive caching; liquidation health stays on
protocol-native reads we control. Features land when they are tested, not
when they are announced.
