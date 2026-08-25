# Stackr — Multi-Chain Portfolio Tracker

## Scoped instruction files

This is the only instruction file in the repo. The packages here share one set
of rules, so don't add a directory-scoped `CLAUDE.md` or `AGENTS.md` — a second
file would only drift from this one. If a package ever earns genuinely
different hard rules, add its file then and state the boundary in it.

`AGENTS.md` is a symlink to this file, so tools reading either name get the same
rules.

Standing rules that apply everywhere — attribution, commit authorship,
confidentiality, secrets, verification before "done" — are global and are
deliberately not repeated here.

## Project Overview

Stackr is a multi-chain address watcher where users can add BTC/STX/ETH/SOL/SUI wallet addresses and view balances, activity, liquidation health, and NFTs (Stacks first). Installable web app (manifest only — no service worker/offline yet), dark theme.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web**: Next.js (App Router) deployed to Cloudflare via @opennextjs/cloudflare
- **Mobile**: Stackr Wallet, a native signer app — Expo + Tamagui + Privy (ADR 0020), sharing `@stackr/models`/`@stackr/services`/`@stackr/features` with the web app. Supersedes the earlier Capacitor watch-only wrap (ADR 0014).
- **Styling**: Tailwind v4 + hand-rolled `@stackr/ui` (Radix headless primitives, styled by us)
- **State**: TanStack React Query (server) + Zustand (client/persisted wallet list)
- **Testing**: Vitest (unit) + Playwright (e2e)
- **CI/CD**: GitHub Actions + release-please

## Workspace Structure

- `packages/tsconfig-config` — Shared TypeScript configs
- `packages/prettier-config` — Shared Prettier config
- `packages/eslint-config` — Shared ESLint flat configs
- `packages/models` — Zod schemas + types (Wallet, Balance, Chain)
- `packages/services` — Multi-chain API clients (BTC, STX, ETH, SOL, SUI)
- `packages/queries` — TanStack React Query hooks + query key factories
- `packages/controllers` — Controller/messenger layer (ActivityController)
- `packages/features` — Platform-independent view-models (web + mobile share)
- `packages/analytics` — PostHog wrapper (opt-in, PII-free events)
- `packages/ui` — Shared React components (Radix-based, hand-styled)
- `packages/charts` — Custom SVG charting library (Kraken-inspired, Fritsch-Carlson monotone interpolation)
- `apps/web` — Next.js web app
- `apps/mobile` — Stackr Wallet, native signer app (Expo + Tamagui + Privy)
- `apps/alerts` — Cron worker delivering liquidation web-push alerts

## Common Commands

```bash
pnpm build          # Build all packages and apps
pnpm dev:web        # Start Next.js dev server
pnpm lint           # Lint all packages
pnpm typecheck      # Type check all packages
pnpm test:unit      # Run Vitest unit tests
pnpm test:e2e       # Run Playwright e2e tests
```

## Conventions

- All packages scoped under `@stackr/*`
- Commit messages follow Conventional Commits (enforced by commitlint)
- ESLint flat config format
- Node 22+, pnpm 9+

## Branching (GitFlow)

- **`main`** — production. Deploys to Cloudflare on push via the Deploy workflow (needs the `CLOUDFLARE_*` repo secrets). Never direct-push; lands only via merged PRs from `dev` (releases) or `hotfix/*` (urgent fixes).
- **`dev`** — integration branch. Default branch on GitHub. Every feature/chore/docs PR targets `dev`.
- **`feat/...`, `fix/...`, `chore/...`, `docs/...`** — short-lived branches off `dev`. Merge back into `dev` via PR.
- **`hotfix/...`** — branches off `main` for urgent production fixes. PR to `main`, then cherry-pick into `dev` (see `.claude/commands/hotfix.md`).
- **Releases:** PR `dev → main` with a merge commit + tag.
- See `.github/pull_request_template.md` for PR body shape (`Closes #N` or `Type:` tag).
