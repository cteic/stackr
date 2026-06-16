# Local development

## Prerequisites

- **Node 22+** — pin via `.nvmrc` or your version manager of choice.
- **pnpm 9.15+** — `corepack enable && corepack prepare pnpm@9.15.4 --activate`.

## Install

```bash
pnpm install
```

This installs every workspace (`apps/web`, `packages/*`) in one pass.

## Run the web app

```bash
pnpm dev:web   # or just `pnpm dev`
```

Opens [http://localhost:3000](http://localhost:3000). Hot-reload, Turbopack.

## Common commands

```bash
pnpm build         # Build every package + app (Turbo handles the order)
pnpm lint          # ESLint, all workspaces
pnpm typecheck     # tsc --noEmit, all workspaces
pnpm test:unit     # Vitest unit tests
pnpm test:e2e      # Playwright E2E (apps/web only)
pnpm format        # Prettier write
pnpm format:check  # Prettier check (CI mode)
```

## Environment variables

All env vars are optional. Without them, stackr falls back to public RPCs
where possible.

| Variable               | Purpose                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| `ALCHEMY_API_KEY`      | Higher-rate Ethereum RPC (server-only, via `/api/rpc/eth`)                       |
| `HELIUS_API_KEY`       | Higher-rate Solana RPC + SPL token metadata (server-only, via `/api/rpc/solana`) |
| `ETHERSCAN_API_KEY`    | Higher-rate ETH balances + transactions (server-only, via `/api/etherscan`)      |
| `ALPHAVANTAGE_API_KEY` | Stock quotes / search / price history (server-only, via `/api/stocks`)           |

Public (`NEXT_PUBLIC_`) vars go in `.env.local`. Server-only secrets —
`ALCHEMY_API_KEY`, `HELIUS_API_KEY`, `ETHERSCAN_API_KEY`,
`ALPHAVANTAGE_API_KEY` — must **never** carry a `NEXT_PUBLIC_` prefix; that
would inline them into the browser bundle. They go in `apps/web/.dev.vars`
(copy `apps/web/.dev.vars.example`) for local dev and become
`wrangler secret put <NAME>` secrets for deploys — never commit them. Each is
consumed exclusively by its same-origin proxy (`/api/rpc/eth`,
`/api/rpc/solana`, `/api/etherscan`, `/api/stocks`); client code never reads
them directly, and each proxy falls back to a public keyless upstream when its
key is absent.

## Workspace layout

```
apps/
  web/                  Next.js 15 web app
packages/
  models/               Zod schemas (Wallet, Balance, Chain, Price, …)
  services/             Multi-chain API clients (BTC, ETH, SOL, STX)
  queries/              TanStack Query hooks + query keys
  ui/                   Hand-rolled component library (Radix + Tailwind)
  charts/               Custom SVG charting (Kraken-inspired)
  eslint-config/        Shared ESLint flat config
  prettier-config/      Shared Prettier config
  tsconfig-config/      Shared TS configs
docs/
  DECISIONS/            ADRs (numbered, append-only)
```

## CI

GitHub Actions runs lint → typecheck → test → build → Playwright on every pull
request (and on push to `main`). Deploys auto-trigger on push to `main` via
Cloudflare Workers (`@opennextjs/cloudflare`).

## Conventions

- **Commits** follow Conventional Commits (enforced by commitlint via
  Husky).
- **Branches** are short kebab-case with a scoped prefix: `feat/...`,
  `fix/...`, `chore/...`, `docs/...`.
- **PRs** use the template at `.github/pull_request_template.md`. Title +
  summary bullets + linked issue.
- **ADRs** live in `docs/DECISIONS/`, numbered sequentially. Use
  `docs/DECISIONS/_template.md` as a starting point.

## Useful internal docs

- [CLAUDE.md](./CLAUDE.md) — project overview, kept in sync with the stack
- [docs/DECISIONS/](./docs/DECISIONS/) — architecture decision records
- [.claude/commands/hotfix.md](./.claude/commands/hotfix.md) — the hotfix
  workflow for production fixes
