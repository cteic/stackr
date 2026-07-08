# Testing

The pyramid, bottom-up:

| Layer                  | Tool                 | Where                                       | Runs in CI                                    |
| ---------------------- | -------------------- | ------------------------------------------- | --------------------------------------------- |
| Unit / logic           | Vitest               | co-located `*.test.ts` everywhere           | yes (`checks`)                                |
| Web e2e                | Playwright           | `apps/web/tests/e2e`                        | yes (`integration-tests`, chromium ×3 shards) |
| Shared behaviour (BDD) | Gherkin + Playwright | `tests/features` + `apps/web/tests/e2e/bdd` | yes (same job)                                |
| Mobile e2e             | Maestro              | `apps/mobile/.maestro`                      | no — run locally on a simulator               |

## Shared BDD specs

`tests/features/*.feature` is the single source of truth for behaviour that
exists on both platforms (see its README for the convention). The web side
executes every `@web` scenario through a small dependency-free runner
(`apps/web/tests/e2e/bdd/runner.ts`); the mobile side mirrors `@mobile`
scenarios as Maestro flows whose header comments name the scenario they
implement. Change the `.feature` first, then update both bindings.

## Mocks doctrine

No test may touch the network:

- **Unit tests** stub `fetch` (see `packages/services/src/*.test.ts` for the
  house pattern) or inject fakes through constructor/port seams
  (`SecureStorage`, `LinkTransport`'s in-memory hub, the signer's injectable
  fetchers).
- **Web e2e** runs against the dev server with the wagmi **mock connector**:
  the Playwright web server sets `NEXT_PUBLIC_E2E_WALLET_MOCK=1`
  (`playwright.config.ts`), which swaps the MetaMask connector stack for
  wagmi's in-memory mock (`src/lib/wagmi-config.ts`). Wallet-extension
  _detection_ is satisfied per-test with a one-line `window.ethereum` marker.
  The flag must never be set in a deployed environment.
- **Maestro** signs in with a **Privy test account** (fixed OTP, no real
  email) — configure one in the Privy dashboard under User management → Test
  accounts, then pass it via `--env`.

## Running

```bash
pnpm test:unit                  # all Vitest suites
pnpm test:e2e                   # Playwright (includes the BDD scenarios)
pnpm test:e2e:mobile            # Maestro — requires a booted simulator with
                                # the dev build installed, plus:
#   maestro test apps/mobile/.maestro --env EMAIL=<test email> --env OTP=<otp>
```

Maestro prerequisites: `curl -Ls https://get.maestro.mobile.dev | bash`, a
simulator/emulator running the app (`pnpm --filter @stackr/mobile exec expo
run:ios`), and the Privy test account above. Flows cover onboarding, tab
smoke, the backup gate up to hold-to-reveal (the two-word quiz needs a human
who can read the phrase), and the Link scanner up to the camera (a real QR on
a second screen is inherently manual).
