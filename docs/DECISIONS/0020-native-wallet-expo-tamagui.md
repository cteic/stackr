# 0020 — Stackr Wallet: native signer app on Expo + Tamagui, replacing the Capacitor wrap

- **Status:** Accepted
- **Date:** 2026-07-03
- **Supersedes:** 0014 (Capacitor export mode)
- **Refs:** issue #130, issue #23 (to be reworked), PR #116 (to be reworked)

## Context

The mobile plan to date (ADR 0014) wrapped the web app in Capacitor: cheap to
ship, watch-only by design, and always a WebView — the "clunk" of driving a
web bundle through a native shell. Meanwhile the product ambition moved: not a
portfolio viewer in a wrapper, but a **native signer** — one wallet that
replaces MetaMask/Phantom/Slush/Leather across BTC / ETH / SOL / STX / SUI,
where the entire UI is balance, activity, and sign requests, and the web app
at stackr.ie stays the watch-only portfolio surface it already is.

## Decision

### Expo + Tamagui, sharing the logic layers we already isolated

`apps/mobile` is an Expo (React Native) app. UI is Tamagui: design tokens once,
rendered natively on mobile with a web adoption path via `@tamagui/next-plugin`
later. The app consumes the platform-independent layers this repo already
built for exactly this moment: `@stackr/models` (schemas/validators),
`@stackr/services` (chain adapters), `@stackr/features` (view-models, ADR
0018). No web code is wrapped; no logic is duplicated.

The Capacitor build mode (0014) is superseded. Issue #23 and PR #116 (Fastlane
CD for the Capacitor wrap) get reworked against EAS builds instead.

### Onboarding: Privy, with a per-chain key split

Seed-phrase ceremonies are the single biggest onboarding cliff in every wallet
this app intends to replace. Privy (`@privy-io/expo`) removes it: email/social
login and the user has a self-custodial wallet in seconds.

Privy's embedded wallets natively cover **Ethereum (all EVM) and Solana**; its
underlying keys can be used on further chains (e.g. Bitcoin), but there is no
managed support for Stacks or Sui. So the split is:

| Chains        | Keys                                 | How                                                                                                           |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| ETH, SOL      | Privy embedded wallets               | created lazily after first login                                                                              |
| BTC, STX, SUI | locally derived via `@stackr/signer` | BIP39 seed in hardware-backed storage (`expo-secure-store`: iOS Keychain / Android Keystore), biometric-gated |

`@stackr/signer` is being built on a parallel branch; until it merges the app
compiles against its agreed contract (`src/lib/contracts/signer.ts`) and
renders BTC/STX/SUI as explicit "pending signer integration" rows rather than
faking addresses. BTC may later migrate to Privy's raw-key path if their
Bitcoin support matures — the accounts builder isolates that decision.

### Signing UX is the product

Every request renders origin, chain, kind, and a human-readable payload, with
reject as the default-weight action. Requests arrive through a transport
interface (`SignRequestTransport`); the wallet-link workstream supplies the
real channel (pairing with stackr.ie and, later, WalletConnect for third-party
dapps). The queue semantics (dedupe on retry, decisions flow back through the
transport) are unit-tested independently of any transport.

### What the app deliberately does not do

- No token sends from the wallet UI itself in v1 — it signs what connected
  surfaces ask it to sign; balance and activity are read-only views.
- No key material anywhere but secure storage: never in logs, state stores,
  analytics, or JS-readable persistence. The web app remains watch-only with
  zero custody (unchanged).
- ETH reads go through the public endpoints the services package already
  exports as its non-browser fallbacks, because React Native detects as a
  browser and would otherwise resolve the web app's same-origin proxy paths.
  A configurable service base is the follow-up recorded on the PR.

## Consequences

- Two mobile-relevant build systems briefly coexist in history (Capacitor
  config in `apps/web` from 0014, Expo in `apps/mobile`); the Capacitor mode
  is removed once this app reaches feature parity for the watch-only case.
- EAS replaces the PR #116 Fastlane pipeline as the store path.
- The Tamagui token set lives app-local until `@stackr/wallet-ui` (parallel
  branch) lands, then moves there and the web can adopt the same tokens.
- Privy becomes an onboarding dependency with a public app-id pair; the trust
  boundary is Privy's dashboard config (allowed apps, login methods), not
  secrecy. A build without ids degrades to a clear setup notice.
- Onboarding stays ceremony-free: the BTC/STX/SUI seed is generated silently
  into the hardware keystore at first login, and backup is deferred to a
  one-time interstitial plus a recurring nudge that escalates once real funds
  arrive. The Backup & keys section (device re-auth → hold-to-reveal →
  confirm-two-words) is the only surface where the phrase is ever displayed.
- Phase-2 candidate, documented not built: opt-in cloud seed sync (iCloud
  Keychain / Android backup) so the phrase stops being single-device, and
  Android's Credential Manager one-click save-to-password-manager (needs a
  native module; the share-sheet and auto-expiring clipboard paths ship
  first).
