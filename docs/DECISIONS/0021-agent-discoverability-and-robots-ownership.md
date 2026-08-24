# 0021 — The app owns robots.txt; allow citation crawlers, refuse training-only ones

- **Status:** Accepted
- **Date:** 2026-08-18
- **Refs:** PR #204

## Context

Stackr had no per-page metadata: none of the 13 routes under
`apps/web/src/app` exported `metadata`, so every route inherited the root
layout's title and description and presented itself to crawlers and answer
engines as the homepage. Fixing that raised two questions the code alone could
not settle — who owns `robots.txt`, and which AI crawlers are welcome.

Two facts, both verified against the live site rather than assumed:

1. **Cloudflare's Managed robots.txt prepends its block.** App-emitted rules
   and the `Sitemap:` line survive below `# END Cloudflare Managed Content`.
   But a per-bot group beats `User-agent: *` regardless of file order, so the
   managed block's per-bot `Disallow: /` entries were the operative rules —
   ClaudeBot, GPTBot, Google-Extended, CCBot, Bytespider, Amazonbot,
   meta-externalagent and Applebot-Extended were all refused. Its managed
   `Content-Signal` line also omits `ai-input` entirely
   (`search=yes, ai-train=no, use=reference`), which reads as "no opinion" on
   exactly the live-answer use this site wants.
2. **Cloudflare Workers noindexes nothing.** Cloudflare _Pages_ stamps
   `X-Robots-Tag: noindex` onto every branch preview automatically. Workers —
   what this app deploys to via `@opennextjs/cloudflare` — has no equivalent,
   so a preview Worker was fully indexable.

## Decision

### The app owns robots.txt

Managed robots.txt is disabled in the Cloudflare dashboard. The file is emitted
by a Route Handler at `apps/web/src/app/robots.txt/route.ts`, with the body
built in `apps/web/src/lib/robots-txt.ts`.

A Route Handler rather than Next's `app/robots.ts` convention because
`MetadataRoute.Robots` models exactly `User-agent` / `Allow` / `Disallow` /
`Sitemap` / `Host` / `Crawl-delay` and has no escape hatch for an arbitrary
directive — it cannot emit a `Content-Signal:` line at all.

The consequence to hold onto: **with Managed robots.txt off, Cloudflare's
per-bot `Disallow` groups are gone.** If the app stops emitting them, training
crawlers become allowed silently, with no visible symptom. That is why
`BLOCKED_TRAINING_CRAWLERS` is asserted crawler-by-crawler in the tests rather
than as one "some groups exist" check.

### Allow crawlers that cite; refuse crawlers that only train

Refused outright, one `Disallow: /` group each — **CCBot, Bytespider,
Amazonbot, meta-externalagent, Applebot-Extended**. These collect training
corpora and return no citation, no referral and no grounding.

Allowed deliberately, named in the emitted file with no `Disallow` —
**ClaudeBot, Google-Extended, GPTBot, OAI-SearchBot, PerplexityBot**. These
fetch to answer a question now and cite the source back, which is the whole
reason for being crawlable. Blocking them would buy nothing that
`Content-Signal: ai-train=no` does not already withhold, and would cost every
citation. They are listed in the output text specifically so a future reader
sees a decision rather than an oversight.

The `*` group carries `Content-Signal: search=yes, ai-input=yes, ai-train=no` —
indexable, answerable, not trainable — with `ai-input` set explicitly rather
than left to inference, plus the Article 4 (EU Directive 2019/790) express
reservation of rights that makes the restriction legally operative.

### Preview deployments noindex themselves

When the resolved site URL is not the production custom domain, `robots.txt`
serves `Disallow: /` with an `X-Robots-Tag: noindex, nofollow` header, and the
root metadata carries `robots: { index: false, follow: false }`.

**The control is `NEXT_PUBLIC_SITE_URL`, set at build time on preview
deployments. The host check is only a safety net.** This matters because of a
finding that is easy to lose: under `@opennextjs/cloudflare`, a configured
custom-domain route in `wrangler.jsonc` **rewrites both `Host` and
`x-forwarded-host` to that domain**. Reproduced with `wrangler dev` against the
built Worker — a request to `http://localhost:8799` arrives at the Worker
reporting `host: stackr.ie` and `x-forwarded-host: stackr.ie`. Anyone reading
`isIndexableDeployment` and assuming the host reflects the client's host will
be wrong. Both signals must agree for a deployment to count as production, and
the build-time value is the one that actually distinguishes a preview.

Belt-and-braces beyond this: gate any staging Worker with a Cloudflare Access
policy, so indexing does not rest on a header crawlers are merely supposed to
respect.

## Consequences

- `robots.txt` is code, reviewed and unit-tested, instead of dashboard state.
  Changing crawler policy is a PR, not a click.
- Managed robots.txt must stay **off**. Re-enabling it silently re-blocks
  ClaudeBot and Google-Extended, undoing the decision above.
- Content Signals remain advisory — honoured voluntarily, not enforced. Actual
  enforcement would need Cloudflare WAF / Bot Management rules, which this ADR
  does not adopt.
