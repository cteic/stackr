# Shared behaviour specs

The `.feature` files in this directory are the single source of truth for
user-facing behaviour that exists on more than one platform. Write the
behaviour once here; each platform proves it with its own step bindings:

- **Web** — `apps/web/tests/e2e/bdd/` binds scenarios to Playwright. The
  runner (`runner.ts`) parses these files at collection time and registers one
  Playwright test per scenario, so they run inside the normal
  `pnpm test:e2e` job with zero extra dependencies.
- **Mobile** — `apps/mobile/.maestro/` mirrors the same scenarios as Maestro
  flows (YAML). Maestro cannot parse Gherkin, so each flow's header comment
  names the feature and scenario it implements; treat this directory as the
  contract when editing either side.

## Conventions

- Tag every scenario with the platforms that can prove it today: `@web`,
  `@mobile`, or both. The web runner executes only `@web` scenarios; Maestro
  flows exist only for `@mobile` scenarios.
- Steps must be platform-neutral ("they open the connect modal", never
  "click the button with class …"). Selectors live in the step bindings.
- Every scenario must run network-free: web steps rely on the mock wagmi
  connector and seeded local state; mobile flows rely on Privy test accounts
  and the services fixtures. See `docs/TESTING.md`.
- Keep scenarios short (3–7 steps) and behaviour-shaped. If a scenario needs
  ten steps, it is probably two scenarios.
