# 0018 — @stackr/features, the platform-independent view-model layer

- **Status:** Accepted
- **Date:** 2026-06-15

## Context

stackr already draws a clean line from raw provider data to the screen. The
anti-corruption layer (ADR [0012](./0012-provider-anti-corruption-layer.md))
normalizes each chain's API into domain models in `@stackr/services`;
`@stackr/queries` wraps those in TanStack Query hooks; `@stackr/controllers`
(ADR [0013](./0013-controller-messenger-pattern-spike.md)) holds the
cross-cutting _state_ a portfolio tracker needs on a MetaMask-style messenger.
What has no home is the last hop: turning a domain model into the exact strings,
flags, and colours a row should paint. Today that logic lives _inline in the
React components_ — `wallet-card.tsx` truncates the address, multiplies balance
by price, formats the fiat, masks it when balances are hidden, formats the 24h
change, and picks a positive/negative colour, all in JSX.

That is fine while there is one renderer. It stops being fine the moment there
are two. ADR [0014](./0014-capacitor-export-mode.md) commits us to shipping the
same app to mobile as a Capacitor wrap, and the longer-term plan allows a native
shell. Every piece of derivation buried in a web component is logic that would
be **duplicated and allowed to drift** the day a second platform renders the
same portfolio row. It is also logic that is awkward to unit-test, because it
only exists inside a component that needs a DOM to mount.

The open-source Leather wallet (MIT) solved exactly this with
`@leather.io/features`: headless, framework-agnostic modules that take a domain
model and return a render-ready view model, with React as a peer dependency and
a lint rule banning platform imports so the package physically cannot reach for
the DOM or a native API. Its `createActivityView`-style transforms are the shape
we want to replicate (not copy wholesale).

## Decision

Add `@stackr/features`: a package of **pure, stateless view-model transforms**
that take a domain model and return the render-ready shape the UI paints. It
slots in as the final pure step before rendering:

```
services (ACL adapters)  →  queries (React Query)  →  features (view-model transforms)  →  app renders
@stackr/services            @stackr/queries            @stackr/features                   apps/web (+ future mobile)
```

### Package rules (the guardrail)

Ported from Leather's `features/README`, these are what keep the layer
portable — and they are enforced, not just documented:

- **No platform imports.** A `no-restricted-imports` rule (a new `features`
  flat-config exported from `@stackr/eslint-config`) bans `react-native`,
  `expo-*`, `next/*`, `wagmi`, and `@solana/*`, plus a `no-restricted-globals`
  ban on `window`/`document`/`localStorage`/`sessionStorage`/`navigator`. A
  banned import or a DOM global fails `pnpm lint`. This is the line that makes
  "platform-independent" a fact rather than an intention.
- **React is a `peerDependency`,** never a dependency — each consumer (the web
  app, a future mobile shell) brings its own copy, exactly as `@stackr/queries`
  already does.
- **Headless.** Modules export functions returning view models / typed strings.
  Zero JSX, zero presentational components.
- **Pure unit tests.** Vitest in a `node` environment (no jsdom), input →
  output, co-located `*.test.ts`. The node environment is itself a guard: a
  transform that reached for `window` would throw in test.
- Built like every other package — `tsc` to `dist/`, `@stackr/*` scope, the
  same `exports` shape.

It depends only on `@stackr/models` (the domain types) and `@stackr/services`
(the existing format helpers); it adds no runtime dependencies of its own.

### How this differs from `@stackr/controllers`

The two are **complementary, not competing**, and the difference is state.

| `@stackr/controllers`                               | `@stackr/features`                                         |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Holds cross-cutting _state_ on the messenger.       | _Stateless_ transforms — same input, same output, always.  |
| MetaMask pattern: owns "what is true right now".    | Leather pattern: owns "how this truth should look".        |
| Announces changes on `:stateChange`; UI mirrors it. | Called in a React Query `select` or a controller selector. |
| Lives close to the data lifecycle.                  | Lives one step before the pixels.                          |

A controller _selector_ that derives a view is a natural caller of a feature
transform; so is a `useQuery({ select })`. Neither absorbs the other. The
selector rule from ADR 0013 — derived views are pure functions, never getters on
a controller — is the same instinct that makes a feature transform pure.

### Exemplar: `createPortfolioRowView`

To prove the pattern end-to-end (and only that — migrating the rest of the
inline view logic is explicitly out of scope), the portfolio-row presentation
inline in `wallet-card.tsx` moves into a single transform:

```ts
createPortfolioRowView({ wallet, balance?, price?, settings }): PortfolioRowView
// → { title, chainName, truncatedAddress, symbolText, fiatText,
//     changeText, changeDirection, chainColor }
```

It is hide-balances and display-currency aware, reuses the existing
`formatFiat` / `formatChange` helpers, and shares one masking convention via
`maskFiat` — which moves into `@stackr/services` alongside the other formatters
so the web app and `@stackr/features` cannot drift (the app's `@/lib/mask-fiat`
becomes a thin re-export, leaving every existing import path untouched). The
chain brand colours move out of the component and into the transform, so any
platform rendering a row gets the same accent without redefining the map.

`wallet-card.tsx` then **only paints** the returned view model — no derivation,
no formatting, no branching beyond loading/empty states. The change is
behaviour-preserving and pixel-identical: the masking gate (`fiatText !== null`),
the symbol gate, and the change colour map one-to-one to the previous inline
expressions.

## Consequences

**Positive:**

- The portfolio-row derivation is now testable as pure input → output, covered
  by node-env tests (hide-balances on/off, currency, positive/negative change,
  unpriced and zero-balance rows) with no DOM in scope.
- The logic is ready to drive the Capacitor target (ADR 0014) without
  duplication — a native renderer consumes the same view model.
- `maskFiat` has a single source of truth in `@stackr/services`; the formatting
  conventions stop living in the app layer.
- The lint guardrail makes the portability rule self-enforcing: a future PR that
  imports `next/navigation` into a feature transform fails CI rather than
  silently coupling the layer to the web.

**Negative / trade-offs:**

- One more package and one more hop for a row's data. For trivial presentation
  this is ceremony; the payoff only lands once a second platform exists or a
  transform grows real branching. We accept the early cost deliberately, the way
  we accepted the controller core before its second consumer.
- This PR migrates exactly one exemplar. The rest of the inline view logic
  (`portfolio-summary`, `portfolio-breakdown`, the holdings page) still lives in
  components and now looks inconsistent until it is migrated — a known, scoped
  follow-on, not an oversight.

## Notes

- Package: `packages/features/` (`src/portfolio/create-portfolio-row-view.ts` +
  co-located test, barrel `src/index.ts`). Guardrail:
  `packages/eslint-config/src/features.js`. Shared helper: `maskFiat` in
  `packages/services/src/format.ts`. Consumer: `apps/web/src/components/wallet-card.tsx`.
- The NFT view model is a follow-on (its own issue) that builds in this package,
  gated on this one landing. Mobile wiring is out of scope — the package only has
  to be mobile-_ready_.
- Pattern, README rules, and the `createActivityView`-shaped exemplar are
  modelled on the open-source Leather wallet's `@leather.io/features` (MIT) —
  replicated here, not copied.
- Related: ADR [0012](./0012-provider-anti-corruption-layer.md) (the ACL whose
  models feed these transforms), ADR
  [0013](./0013-controller-messenger-pattern-spike.md) (the controller core this
  is complementary to, and the selector rule), ADR
  [0014](./0014-capacitor-export-mode.md) (the mobile target that motivates
  sharing).
