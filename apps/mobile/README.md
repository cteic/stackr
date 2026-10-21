# Stackr Wallet (`@stackr/mobile`)

The native signer app: an Expo (React Native) app that generates and holds keys
on the device, shows balances and activity, and signs what stackr.ie asks it to
sign. The web app stays watch-only. See
[ADR 0020](../../docs/DECISIONS/0020-native-wallet-expo-tamagui.md) for why the
app exists in this shape.

| Fact         | Value                                   |
| ------------ | --------------------------------------- |
| Display name | Stackr Wallet                           |
| iOS bundle   | `ie.stackr.wallet`                      |
| Android pkg  | `ie.stackr.wallet`                      |
| Scheme       | `stackr://`                             |
| Expo slug    | `stackr-wallet`                         |
| Store status | Not submitted. Accounts not yet active. |

## Local development

```bash
pnpm install                       # from the repo root
pnpm --filter @stackr/mobile dev   # expo start
```

`pnpm --filter @stackr/mobile dev` reads `.env.development`, which is committed
because every value in it is a public identifier.

## Brand assets

`assets/*.png` is generated output. Do not edit the PNGs by hand.

```bash
pnpm --filter @stackr/mobile assets   # rewrites all four files
```

`scripts/generate-brand-assets.mjs` rasterises the mark and writes the PNGs with
`node:zlib`, so it runs on a clean checkout with no image library installed. The
mark is the web app's own icon (`apps/web/public/icons/icon-512.svg`): four bars
in the chain brand colours on the dark terminal background. Its proportions are
constants in the script, so the phone icon and the browser tab cannot drift
apart. The "STACKR" wordmark on the web icon is dropped, because at the 60px a
launcher actually renders it becomes noise.

| File                | Size      | Alpha channel | Why                                                                                                            |
| ------------------- | --------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `icon.png`          | 1024x1024 | None          | App Store Connect rejects an icon with an alpha channel. Corners stay square because iOS applies its own mask. |
| `adaptive-icon.png` | 1024x1024 | Yes           | Android foreground layer. The mark is sized so its whole bounding box fits the 66% safe circle.                |
| `splash.png`        | 1024x1024 | Yes           | Launch screen logo, drawn over `splash.backgroundColor` with `resizeMode: contain`.                            |
| `favicon.png`       | 64x64     | None          | `expo start --web` and any web export.                                                                         |

`scripts/generate-brand-assets.test.ts` holds those rules as tests: the iOS icon
has no alpha channel and square corners, and every corner of every bar on the
adaptive icon sits inside the Android safe circle.

## Environment separation

Expo picks the env file from the build mode, not from a flag:

| Build                                 | Reads                                               |
| ------------------------------------- | --------------------------------------------------- |
| `expo start`, `--profile development` | `.env.development` (committed)                      |
| `--profile preview`                   | EAS environment variables, `preview` environment    |
| `--profile production`                | EAS environment variables, `production` environment |

`.env.production` is no longer committed and is in `.gitignore`. It used to be a
byte-for-byte copy of `.env.development`, which meant a TestFlight build silently
inherited whatever the development config pointed at. Production configuration is
now explicit: if the EAS variables below are missing, the build produces an app
that shows the setup notice instead of one wired to the wrong backend.

Set each one once, per environment:

```bash
cd apps/mobile
eas env:create --environment production \
  --name EXPO_PUBLIC_PRIVY_APP_ID --value <id> --visibility plaintext
```

| Variable                        | Value comes from                                                           |
| ------------------------------- | -------------------------------------------------------------------------- |
| `EXPO_PUBLIC_PRIVY_APP_ID`      | Privy dashboard, app settings, App ID                                      |
| `EXPO_PUBLIC_PRIVY_CLIENT_ID`   | Privy dashboard, app settings, Client ID for the `ie.stackr.wallet` client |
| `EXPO_PUBLIC_SUPABASE_URL`      | Supabase project settings, API, Project URL                                |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings, API, publishable (anon) key                     |

Use `plaintext` visibility, not `secret`. Every `EXPO_PUBLIC_*` value is inlined
into the JavaScript bundle and is readable by anyone who downloads the app.
Marking one `secret` hides it from the dashboard without hiding it from users.
Nothing in this app needs a real secret: keys never leave the device, and the
provider API keys stay behind the web app's Cloudflare Worker proxies.

**Open gap, account action.** The development and production environments still
resolve to the same Privy app and the same Supabase project, because only one of
each exists. Separating them needs a second Privy app and a second Supabase
project created in those dashboards. Until that happens, a TestFlight tester and
a developer on a laptop share one backend.

## Placeholders in `eas.json`

Four values in `apps/mobile/eas.json` are written as `<<NAME>>`. They are
deliberately not valid, so `eas submit` fails loudly rather than submitting to
the wrong account. Find them all with:

```bash
grep -n '<<' apps/mobile/eas.json
```

| Placeholder                           | Replace with                                            | Where the value comes from                                                                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<<APPLE_ID>>`                        | The Apple ID email used to sign in to App Store Connect | App Store Connect, Users and Access. Needs the App Manager or Admin role on the organisation team.                                                                                                                                                       |
| `<<ASC_APP_ID>>`                      | The app record's numeric id, 10 digits                  | App Store Connect, the app, App Information, General Information, "Apple ID". Exists only after the app record is created.                                                                                                                               |
| `<<APPLE_TEAM_ID>>`                   | The 10-character team id, for example `A1B2C3D4E5`      | developer.apple.com, Account, Membership details, Team ID.                                                                                                                                                                                               |
| `<<GOOGLE_SERVICE_ACCOUNT_KEY_PATH>>` | `./credentials/play-service-account.json`               | Google Cloud console: a service account with the Google Play Android Developer API enabled, then Play Console, Users and permissions, invite that service account with "Release to testing tracks". Download the JSON key. `credentials/` is gitignored. |

One more value is missing on purpose: `expo.extra.eas.projectId` in `app.json`.
`eas init` writes it, and that needs an Expo account, so it is not in the repo.

## What has to be true before any of this works

| Precondition                                                                                                                                                           | Status on 21 October 2026                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Apple Developer Program enrolment as an **organisation**, not an individual. App Review guideline 3.1.5(i) requires a wallet app to come from an organisation account. | Submitted 21 October, awaiting verification. Blocks everything iOS.                                            |
| Google Play Developer account, with the organisation identity verified                                                                                                 | Not created.                                                                                                   |
| Expo account, and an EAS project id written into `app.json` by `eas init`                                                                                              | Not created.                                                                                                   |
| App record in App Store Connect for `ie.stackr.wallet`                                                                                                                 | Blocked on the Apple account.                                                                                  |
| App record in Play Console for `ie.stackr.wallet`                                                                                                                      | Blocked on the Play account.                                                                                   |
| Privacy policy reachable at `https://stackr.ie/privacy`                                                                                                                | Written in PR #213, not merged or deployed yet. Both stores refuse a listing without a live URL.               |
| The four `EXPO_PUBLIC_*` variables set in the EAS `production` environment                                                                                             | Blocked on the Expo account.                                                                                   |
| BTC, STX and SUI rows no longer render as "pending signer integration"                                                                                                 | Open. A reviewer who sees unfinished rows can reject under guideline 2.1. Decide before submitting, not after. |

Google applies a closed-testing requirement (a minimum number of testers for 14
continuous days) before granting production access to **personal** developer
accounts created since November 2023. Organisation accounts are exempt. Confirm
which rule applies when the Play account is created, because it changes the
calendar by two weeks.

## Release runbook

Written for someone who has never released this app. Run every step from the
repo root unless it says otherwise.

### 1. Start from a clean checkout and prove it is green

```bash
git fetch origin && git checkout dev && git pull --ff-only
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
cd apps/mobile && npx expo-doctor && cd ../..
```

All six must pass. `expo-doctor` is the one that catches a missing native peer
dependency, which does not fail a local build but does crash a store build.

### 2. Install and sign in to the EAS CLI (once per machine)

```bash
npm install -g eas-cli
eas login
```

### 3. Create the EAS project (once per repo)

```bash
cd apps/mobile
eas init
```

This writes `expo.extra.eas.projectId` into `app.json`. Commit that change.

### 4. Set the production configuration (once, then on change)

Create the four variables from the "Environment separation" table above in the
`production` environment, then confirm:

```bash
eas env:list --environment production
```

### 5. Fill in the submit placeholders

Replace the four `<<NAME>>` values in `apps/mobile/eas.json` using the table
above, and put the Play service-account JSON at
`apps/mobile/credentials/play-service-account.json`. Commit the `eas.json`
change. Never commit the JSON key; `credentials/` is gitignored.

### 6. Set the version

`eas.json` uses `"appVersionSource": "remote"`, so EAS owns `buildNumber` and
`versionCode` and increments them on every production build. You own the
marketing version. Bump `expo.version` in `app.json` for a user-visible release.

### 7. Build

```bash
cd apps/mobile
eas build --platform ios --profile production
eas build --platform android --profile production
```

The first iOS build asks to generate a distribution certificate and provisioning
profile. Let EAS manage them; it needs the Apple account to exist. The first
Android build generates an upload keystore and stores it on EAS. Back that
keystore up (`eas credentials`), because losing it means you can never update
the app under the same package name.

### 8. Submit to TestFlight

```bash
eas submit --platform ios --profile production --latest
```

The upload lands in App Store Connect. Processing takes 10 to 60 minutes. Then,
in App Store Connect: answer the export-compliance question, add the build to a
TestFlight group, and paste the "App Review notes" block from
[`store/listing.md`](store/listing.md). Internal testers can install it
immediately; an external group needs a short Beta App Review first.

### 9. Submit to the Play internal track

```bash
eas submit --platform android --profile production --latest
```

The profile targets `track: "internal"` with `releaseStatus: "draft"`, so the
upload does not go live by itself. In the Play Console, open the internal
testing release, complete the data safety form from
[`store/listing.md`](store/listing.md), and roll it out to the internal tester
list.

### 10. Record what shipped

Bump `expo.version` on a branch off `dev`, open a PR, and let the release flow
carry it to `main`: a `dev` to `main` pull request with a merge commit and a
tag. Never direct-push to either branch.

## Testing

```bash
pnpm test:unit                       # whole workspace, includes this app
pnpm test:e2e:mobile                 # Maestro flows in .maestro/, needs a simulator
```

Unit tests cover the logic layer only: the sign queue, the stores, the backup
flow, the adapters behind injected ports, and the brand-asset generator. No test
here renders a React Native component.
