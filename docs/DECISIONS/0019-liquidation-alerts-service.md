# 0019 — Liquidation alerts: Supabase accounts + a Cloudflare cron Worker + web push

- **Status:** Accepted
- **Date:** 2026-07-03

## Context

Stackr's differentiator is liquidation health — normalized risk across Aave
(EVM), Kamino (SOL), and, uniquely, the Stacks protocols Zest and Granite
(ADR 0016). Today that is a read-only dashboard: it tells you your risk while
you happen to be looking at it. The feature people would pay for is the
inverse — being told, wherever you are, the moment a position drifts toward
liquidation. Nobody alerts on Stacks positions today; that is the wedge, and
it is the first paid surface Stackr will grow.

Alerting breaks the "hosted nothing" stance for the first time: something has
to remember who watches what, re-read positions when no browser is open, and
deliver a message. Three architecture questions follow.

**Where does subscription state live?** Options considered: Cloudflare KV
keyed on a messaging-app chat id (no accounts at all — smallest possible v1,
but a dead end: no way to attach payments, no cross-device identity, a
second storage story the moment anything else needs state), or a real
database with real user accounts. The decision is to build the long-term
shape now: **Supabase** — hosted Postgres with built-in auth (email
magic-link to start), row-level security so every user is fenced to their own
rows by the database itself, and a REST interface any runtime can query.
Accounts are also the prerequisite for the premium tier: a paying customer
must be _somebody_ we can attach an entitlement to.

**Where does the periodic work run?** The sweep — re-read every subscribed
position via the existing `@stackr/services` health adapters, compare against
per-subscription thresholds, decide whether to notify — is a small scheduled
job. It stays on **Cloudflare**: a plain Worker on a 5-minute cron, next to
everything else we deploy. Supabase edge functions could host it, but the
adapters and their tests already live in this monorepo's workspace packages,
Wrangler is already our deploy tool, and Workers' cron + fetch is all the job
needs. Supabase is the system of record; Cloudflare is the compute. Each does
the one thing it is best at.

**How do alerts reach the user?** **Web push** (the browser Push API +
service worker), not email or a chat-bot bridge. It is native to the PWA we
already ship, works when the tab is closed, costs nothing per message, and
the subscription handshake produces exactly the per-device keys the
`push_subscriptions` table stores. Delivery is signed with our VAPID keypair
and the payload is encrypted per RFC 8291 — implemented on WebCrypto in the
Worker, because the popular push libraries lean on Node crypto that a Worker
does not have.

## Decision

Three pieces, each deliberately small:

1. **Supabase is the system of record** (`supabase/migrations/`): `profiles`
   (auto-created from `auth.users` by trigger), `watched_wallets` (the cloud
   twin of the local watch-only list), `alert_subscriptions` (wallet ×
   protocol × warn/critical thresholds, defaults 0.8/0.95 of normalized
   liquidation risk, plus the sweep's `last_band` / `last_alerted_at` dedupe
   state), `alert_events` (audit log of everything sent), and
   `push_subscriptions` (one row per browser that opted in). **RLS on every
   table**; owners see and manage only their own rows; `alert_events` inserts
   and sweep-state writes come only from the service-role key, which never
   leaves the Worker's secrets.

2. **The web app gains optional accounts** (`@supabase/ssr`): `/login`
   (magic link) and `/account` (session, alert subscriptions, push opt-in).
   Logged-out Stackr is unchanged — local-only, self-custody, no tracking;
   an account is the thing you add when you want the cloud to watch your
   positions while you sleep. The browser client holds only the anon key,
   which is public by design: RLS is the security boundary, not the key.

3. **A cron Worker sweeps and notifies** (`apps/alerts`): every 5 minutes,
   load subscriptions + push subscriptions via the service role, re-read
   health through the same adapters the dashboard uses, run the band/cooldown
   decision (alert on band change; re-alert while at risk only after the
   per-subscription cooldown, default 6h; announce recovery once), deliver
   via web push, log to `alert_events`, and drop push subscriptions the push
   service reports gone (HTTP 410).

Free tier at launch: one alert subscription per user, default thresholds.
Premium (multi-wallet, custom thresholds/cooldowns) gates on payments — a
**merchant-of-record decision (Paddle / Lemon Squeezy / Polar vs raw Stripe)
that is deliberately deferred**; nothing in this schema changes either way,
we only add an entitlements column/table when it lands.

## Consequences

- Stackr runs a database with user PII (email addresses) for the first time.
  The privacy stance narrows but stays honest: portfolio watching remains
  fully local and account-free; only alert subscriptions live server-side,
  and only for users who asked for them.
- Two platforms instead of one: Supabase (auth + Postgres) joins Cloudflare.
  Accepted for the account/payments path it opens; the sweep's compute stays
  on Cloudflare so there is exactly one deploy story for code.
- The Worker holds the service-role key — the one credential that bypasses
  RLS. It lives only in Wrangler secrets, is never sent to a browser, and the
  Worker exposes no HTTP surface that proxies it.
- Web push does not reach iOS Safari users who haven't installed the PWA to
  the home screen; native mobile push arrives with the Capacitor wrap
  (ADR 0014) and extends `push_subscriptions.platform` when it does.
- The RFC 8291 encryption is our code and must be right; it ships with tests
  pinned to the RFC's published test vectors rather than trust-me crypto.

## Notes

- Chains/protocols in SQL check constraints mirror `@stackr/models`
  (`ChainSchema`, `ProtocolSchema`) — extend both together.
- Sweep cadence (5 min) is bounded by upstream free tiers (ADR 0016), not by
  Workers limits; tighten later per-protocol if a paid data plan arrives.
- Related: #46 (data architecture), #122 (path to revenue).
