# 0014 — Capacitor mobile via an env-gated static-export build mode

- **Status:** Superseded by 0020 (native Expo wallet); the export mode was removed once the Capacitor wrap was abandoned
- **Date:** 2026-06-11

## Context

Stackr wants a mobile presence without a second codebase. The web app is already
a polished, responsive PWA; on mobile it only needs to be a **watch-only** view
of the same portfolio (no signing). The wrap-don't-rewrite direction — wrap the
existing Next.js app with **Capacitor** rather than build a native client — was
proposed earlier (ADR drafted on the `feat/capacitor-mobile` scaffold branch,
which added `capacitor.config.ts` and the `@capacitor/*` dependencies). This ADR
records the **implementation** decisions that make that wrap actually build.

Two facts about the codebase make a naive `output: 'export'` fail:

1. **The web app is server-rendered.** It deploys as a Worker via
   `@opennextjs/cloudflare`. Capacitor instead loads a **static** bundle from a
   native WebView, so it needs `next build` with `output: 'export'` producing
   `./out`. That output mode must not leak into the web build, which has to stay
   byte-for-byte identical.
2. **Two things are incompatible with `output: 'export'` as written:**
   - the wallet-connect provider stack in `src/lib/providers.tsx` (wagmi /
     RainbowKit / WalletConnect / Solana wallet-adapter) — unwanted on mobile
     (watch-only) and several of those libraries touch browser/native globals at
     module scope, which breaks the export prerender;
   - the dynamic route `/wallet/[chain]/[address]` — addresses are user-supplied
     watch-only data with no finite path set to pre-render.

Alternatives considered: a separate React Native app (rejected — duplicate
codebase for a read-only view); a pure "Add to Home Screen" PWA (rejected — no
store presence / install link). Both were already weighed in the proposal; this
ADR does not relitigate them.

## Decision

Add a single build flag, **`NEXT_PUBLIC_TARGET=capacitor`** (driven by a new
`apps/web` script `build:mobile`), that turns on the mobile target. Everything is
additive and the default web build is unchanged when the flag is absent.

- **`next.config.ts`** sets `output: 'export'` + `images.unoptimized` **only**
  under the flag. With the flag absent the config is exactly `{ reactStrictMode:
true }` as before.
- **Provider swap.** Under the flag, a webpack `resolve.alias` substitutes
  `@/lib/providers` with `@/lib/providers.capacitor.tsx`, a **watch-only**
  provider set: React Query, theme, tooltips and analytics are kept; the entire
  wallet-connect stack and the connected-address sync components are dropped. The
  alias (rather than a runtime `if`) guarantees those libraries are never bundled
  into — or evaluated during — the mobile prerender. The web `providers.tsx` is
  left untouched.
- **Wallet route.** The detail UI is extracted into a shared client component
  `components/wallet-detail-view.tsx`. The server route
  `/wallet/[chain]/[address]` becomes a thin wrapper that `await`s its params and
  renders that component, and exports `generateStaticParams()` returning `[]` —
  which is what lets `output: 'export'` accept the dynamic segment (it emits no
  pages for it) while the web build still renders any address on demand. A new
  static route `/wallet/view?chain=&address=` resolves the same component from
  the query string for mobile. A `walletHref(chain, address)` helper picks the
  path form (web) or query form (mobile) by the inlined flag; the only call site
  that builds these links (`wallet-card.tsx`) uses it.
- **Capacitor config** stays as scaffolded: `appId: ie.stackr.app`,
  `appName: Stackr`, `webDir: out`.

## Consequences

**Positive:**

- One codebase. Mobile is the web app's watch-only flow inside a WebView; the
  `@stackr/{models,queries,services,charts,ui}` packages are reused as-is.
- The web (Cloudflare/OpenNext) build is provably unchanged — no flag, no diff in
  behaviour. All gates pass in the default mode and the mobile export produces a
  static `out/`.
- Watch-only addresses stay first-class and signature-free; nothing about the
  existing add/track flow changes.

**Negative / trade-offs:**

- Two wallet-detail routes now exist (`[chain]/[address]` for web, `/wallet/view`
  for mobile) sharing one view component. The query-param route also ships in the
  web build, where it is simply never linked.
- The mobile bundle is a static export: no Image Optimization server (hence
  `images.unoptimized`) and no server-rendered routes.
- The build branches on a webpack alias, so the two targets resolve a different
  providers module — a small amount of build-time conditionality to keep in mind
  when touching providers.

**Owner-only follow-ups (cannot run here — no Xcode / Android Studio / store
accounts):** `npx cap add ios && npx cap add android`, then `npx cap sync`;
icons/splash via `@capacitor/assets`; distribution through TestFlight (Apple
Developer, $99/yr) and the Play internal track ($25 one-time).

## Notes

- Builds on the `feat/capacitor-mobile` scaffold (`capacitor.config.ts` +
  `@capacitor/*` deps) — reused here verbatim.
- Scope cap: **no wallet-connect on mobile, no signing.** Wallet adapters live
  only in the web build.
- Related ADRs: 0008 (design-system direction), 0009 (wallet-connect
  architecture), 0010 (Solana wallet stack), 0011 (Stacks wallet stack).
- Refs issue #23.
