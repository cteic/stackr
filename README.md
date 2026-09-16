# Stackr

**A cross-chain Web3 portfolio for self-custodial holders.**

Track your real holdings across Bitcoin, Ethereum, Solana, Stacks, and Sui in one
view — connected wallets, watch-only addresses, and stablecoin positions
unified with live prices, depth-aware charts, and a trading-terminal aesthetic
built for people who actually use crypto.

🌐 **Live:** [stackr.ie](https://stackr.ie)

---

## What stackr is

Most portfolio trackers force a trade-off: hosted convenience with a KYC
wall, or DIY self-custody with no useful UI. Stackr is built on the premise
that the right answer is _self-custody by default, hosted nothing, beautiful
anyway_.

Connect MetaMask, Phantom, or Leather and your holdings render in seconds —
ETH, ERC-20s, SOL, SPL tokens, BTC, STX, Stacks fungibles, BNS names, ENS
names, stacking positions, FIAT-pegged stablecoins. Or add watch-only
addresses (cold storage, a partner's stack, a trading wallet) with custom
labels and groups. Everything is computed client-side from public chain RPCs;
no account, no database, no custody, no tracking pixels — only
privacy-preserving, PII-free product analytics, and only when you opt in by
configuring a key.

## Features

- **Multi-chain by default** — Bitcoin, Ethereum, Solana, Stacks, Sui. Stable
  coins and FIAT-pegged tokens treated as first-class citizens.
- **Connected + watch-only unified** — your hardware wallet, your hot wallet,
  and your partner's address all in one portfolio view.
- **Realtime market data** — Kraken-backed orderbook + depth chart, live
  price ticks, hand-rolled SVG charts that don't choke on 10+ updates/sec.
- **ENS / `.sol` / `.btc` resolution** — names where addresses would normally
  blur into noise.
- **EUR + USD** — because Dublin.
- **No accounts, privacy-preserving analytics, no PII** — watch-only addresses
  live in `localStorage`. Connected wallets are auth + address-discovery only;
  stackr never signs transactions. Optional product analytics are PII-free by
  design: no addresses, balances, fiat amounts, or names ever leave the device,
  autocapture and session replay are off, and Do Not Track is respected.
- **Mobile-first** — designed for 375px and up; a native iOS + Android wallet
  app (Expo) is in development in `apps/mobile`.

## Tech

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 ·
TanStack Query · Jotai · wagmi + viem · `@solana/wallet-adapter` ·
`@stacks/connect` · custom SVG charts · pnpm workspaces · Turborepo ·
Cloudflare Workers (`@opennextjs/cloudflare`).

## Architecture

Stackr defines one interface per capability and one adapter per chain. The ports
live in `packages/services/src/ports.ts` — `BalanceAdapter`,
`TokenPositionAdapter`, `TransactionAdapter`, `HealthAdapter`, `NftAdapter`,
`PriceAdapter` — and the dispatch registries that map a chain onto its adapter
live in `packages/services/src/index.ts`. Adding a chain is a new adapter plus
one registry entry; `balanceAdapters` is declared
`satisfies Record<Chain, BalanceAdapter>`, so a missing adapter is a compile
error rather than a runtime `undefined`. Every adapter returns domain types from
`@stackr/models` and never a vendor payload. That is why one component renders a
position or a transaction from any chain.

Remote data belongs to TanStack Query; client UI state belongs to Jotai. The
dividing line is ownership: if the server owns the value and the app can only ask
for it again, it is a query; if the app owns it and no refetch could produce it,
it is an atom. A balance, a token position or a price is shared, cached,
refetched on a cadence and able to fail, so it gets a key, a `staleTime` and a
retry policy — see [DATA-FETCHING.md](./docs/DATA-FETCHING.md). The selected
currency, hidden balances and the watch-only wallet list are app-owned and never
refetched, so they sit in Jotai atoms where a component subscribes to one value
instead of a whole store. The reasoning is recorded in
[ADR 0022](./docs/DECISIONS/0022-jotai-for-client-state.md).

No provider key ever reaches the browser. Keyed providers are reached through App
Router route handlers under `apps/web/src/app/api/`, and the Solana one is
`apps/web/src/app/api/rpc/solana/route.ts`. It reads `HELIUS_API_KEY`
server-side, with no `NEXT_PUBLIC_` prefix, so the value is never inlined into
the client bundle; the browser only ever calls the same-origin path
`/api/rpc/solana`, resolved in `packages/services/src/sol-rpc.ts`. The route
constrains what it will forward so it cannot serve as an open relay: a read-only
JSON-RPC method allow-list, a 64 KB body cap, a ten-call batch cap, a same-origin
check and a per-client rate limit. With no key configured it forwards to the
public mainnet cluster instead of failing, so local development needs no secret.

## Status

Active development. The wallet-connect layer, multi-chain data layer, and
charting library are in place. See open [issues](https://github.com/pete-watters/stackr/issues)
for what's next.

## Local development

See [SETUP.md](./SETUP.md) for prerequisites, install, and common commands.

## License

Proprietary — All Rights Reserved. See [LICENSE](./LICENSE).

Built and maintained by [Pete Watters](https://github.com/pete-watters) in Dublin.
