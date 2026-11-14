# 0022 — Jotai for client UI state

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

The web app held three Zustand stores: `settings-store` (currency, hidden
balances, the custom theme), `wallet-store` (the watch-only wallet list and the
per-chain connected addresses) and `holdings-store` (manually entered
positions). Each was one `create()` call wrapped in `persist`, and components
read from them with a selector — `useSettingsStore(s => s.currency)`.

That shape worked, but three things had started to rub:

1. **One store object per concern, read through a selector.** Every component
   subscribing to `settings-store` subscribes to the whole store and then
   narrows with a selector. It works because Zustand compares the selector's
   result, but the unit of subscription is still the store. Splitting a value
   out means writing another selector, and there is nothing stopping a call site
   from selecting the whole object by accident and re-rendering on every change.

2. **The store is a module singleton.** `useSettingsStore` is created at import
   time and there is exactly one of it per process. Tests reset it with
   `setState` in a `beforeEach`, which is shared mutable state between test
   files in the same worker. Scoping a store to a subtree — a preview pane, a
   second portfolio — is not expressible.

3. **React 19 fit.** Zustand reaches external state through
   `useSyncExternalStore`, which is correct but opaque to the compiler: it
   cannot see which value a component actually depends on. Jotai's atoms are
   ordinary values in a dependency graph, and a derived atom that recomputes to
   an equal value notifies nobody.

The alternatives were: stay on Zustand and add `useShallow` discipline
(rejected — it treats the symptom, and the singleton and scoping problems
remain); move client state into the controller layer from ADR 0013 (rejected —
controllers are for coordinated domain state with a messenger, not for "is the
balance hidden"); or move to Jotai (chosen).

## Decision

Client UI state is Jotai atoms. Remote data stays in TanStack Query. The
dividing line: if the value can be refetched from a provider it belongs to
Query, and if the app owns it outright it belongs to an atom.

Each former store becomes one persisted base atom plus derived atoms per field:

- `settings-store` — `settingsAtom` holds the persisted `{ currency, customTheme }`
  blob; `currencyAtom` and `customThemeAtom` are derived read/write atoms over
  it. `hideBalanceAtom` is a plain atom, unpersisted, exactly as before.
- `wallet-store` — `walletsAtom` over the persisted `{ wallets }` blob, and an
  unpersisted `connectedAddressesAtom`.
- `holdings-store` — `holdingsAtom` over the persisted `{ holdings }` blob.

Mutations are write-only atoms (`addWalletAtom`, `toggleHideBalanceAtom`,
`setCustomThemeTokenAtom`, …), so a component that only writes never subscribes
to the value it writes. Call sites use `useAtomValue` and `useSetAtom`, which
keeps the `const addWallet = …; addWallet(input)` shape the components already
had.

**The persisted bytes do not change.** `persisted-atom.ts` wraps
`atomWithStorage` with a storage adapter that reads and writes the same
`{ "state": …, "version": n }` envelope under the same keys (`stackr-settings`,
`stackr-wallets`, `stackr-holdings`). A browser holding a user's wallet list
keeps it across this change, and a rollback reads the same blob back. The
migration function now runs on **every** read rather than only when the stored
version differs, so a tampered blob at the current version is re-validated
instead of trusted.

## Consequences

**Positive:**

- Subscriptions are per value. A test asserts this directly: editing a theme
  token notifies no subscriber of `currencyAtom`, because the derived atom
  recomputes to the same string and Jotai stops there.
- No store singleton in the design. Atoms are values; a `Provider` can scope
  them to a subtree when a second portfolio view or a preview pane needs it.
- Persisted state is validated on every load, not only on a version bump.
- Write-only atoms make "this component only dispatches" explicit and
  unsubscribed.

**Negative / trade-offs:**

- **We still use the default store today.** Nothing mounts a Jotai `Provider`,
  so `getDefaultStore()` is the one store in practice. The scoping benefit is
  available, not realised — this ADR claims the option, not the outcome.
- **Two layers where there was one.** A field is now a derived atom over a
  persisted blob rather than a key in a store object. That is the price of
  keeping one localStorage key per concern while subscribing per field.
- **Imperative access is less obvious.** Zustand's `getState()` worked anywhere;
  the equivalent is `getDefaultStore().get(atom)`, which the tests now do
  explicitly. Non-React callers must reach for the store deliberately.
- **Jotai 3 is a recent major.** The API used here (`atom`, `atomWithStorage`,
  `useAtomValue`, `useSetAtom`, `store.sub`) is the stable core, but the version
  is young.
- **Zustand is not gone from the repo.** `apps/mobile` still uses
  `zustand/vanilla` for its link-session and sign-request stores. This decision
  covers the web app; the mobile stores are untouched and out of scope.

## Notes

- `apps/web/src/lib/persisted-atom.ts` holds the storage envelope and the
  explicit `rehydrate` the persistence tests drive. Storage reads and writes are
  both wrapped: a private-mode browser that throws on access falls back to the
  atom's default rather than taking the app down.
- Behaviour is proved by the store tests that existed before this change. Every
  scenario name and assertion is unchanged; only the way the test reaches the
  state differs.
- Related ADRs: [0013](./0013-controller-messenger-pattern-spike.md) (the
  controller/messenger spike, which this leaves alone),
  [0009](./0009-wallet-connect-architecture.md) and
  [0015](./0015-wallet-connection-controller.md) (both describe the wallet store
  as Zustand; that is the historical record and is left as written).
- Data fetching, keys and retry policy: [`docs/DATA-FETCHING.md`](../DATA-FETCHING.md).
