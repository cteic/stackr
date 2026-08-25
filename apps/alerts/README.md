# @stackr/alerts

Cron Worker that powers liquidation alerts (ADR 0019): every 5 minutes it
re-reads subscribed positions through the `@stackr/services` health adapters
(Aave, Kamino, Zest, Granite), applies each subscription's warn/critical
thresholds and cooldown, and delivers web-push notifications signed with our
VAPID keys (RFC 8292) and encrypted per RFC 8291 — implemented on WebCrypto,
verified against the RFC's Appendix A test vector.

Supabase is the system of record (`supabase/migrations/`); this Worker is the
only holder of the service-role key. It exposes no HTTP surface.

## First deploy

```bash
# 1. Secrets (from apps/alerts). Generate the VAPID pair once:
#    npx web-push generate-vapid-keys
#    — the public key must match the web app's NEXT_PUBLIC_VAPID_PUBLIC_KEY.
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_SUBJECT        # e.g. mailto:ops@stackr.ie
wrangler secret put HIRO_API_KEY         # optional, lifts Stacks reads to 500 rpm

# 2. Deploy (builds workspace deps first)
pnpm turbo run build --filter=@stackr/alerts^...
pnpm deploy:cf

# 3. Smoke-test the cron locally
cp .dev.vars.example .dev.vars   # fill in
pnpm dev                          # then: curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```
