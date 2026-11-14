# Stackr Wallet: store listing copy

Draft copy for App Store Connect and the Google Play Console. Nothing here has
been submitted. Every factual claim is taken from the privacy policy
(`apps/web/src/app/privacy/page.tsx`), the non-custodial notice
(`packages/ui/src/non-custodial-notice.tsx`) and
[ADR 0020](../../../docs/DECISIONS/0020-native-wallet-expo-tamagui.md). If the
app changes, change those first and then this file, not the other way round.

Character limits are the stores' own and are respected below.

## Identity

| Field               | Value                         |
| ------------------- | ----------------------------- |
| App name (30 max)   | Stackr Wallet                 |
| Subtitle (30 max)   | Multi-chain self-custody keys |
| Bundle id / package | `ie.stackr.wallet`            |
| Seller / developer  | cteic                         |
| Primary category    | Finance                       |
| Secondary category  | Utilities                     |
| Support URL         | https://stackr.ie/support     |
| Marketing URL       | https://stackr.ie             |
| Privacy policy URL  | https://stackr.ie/privacy     |
| Terms URL           | https://stackr.ie/terms       |
| Support email       | support@stackr.ie             |
| Copyright           | 2026 cteic                    |

## Promotional text (App Store, 170 max, editable without a new build)

> Bitcoin, Ethereum, Solana, Stacks and Sui in one wallet. Keys are created on
> your phone and stay there. Sign in with email, no seed phrase ceremony to get
> started.

## Short description (Google Play, 80 max)

> One self-custody wallet for BTC, ETH, SOL, STX and SUI. Your keys never leave
> your phone.

## Full description (both stores, 4000 max)

> Stackr Wallet is a self-custody wallet for Bitcoin, Ethereum, Solana, Stacks
> and Sui. Your keys are generated on your device and never leave it. Stackr
> cannot access, move or recover your funds.
>
> ONE WALLET, FIVE CHAINS
> Hold and sign on Bitcoin, Ethereum, Solana, Stacks and Sui without installing
> a separate app for each one. Balances and recent activity for every account
> sit on a single screen, priced in the currency you choose.
>
> NO SEED PHRASE CEREMONY TO START
> Sign in with your email address and the wallet is ready. There is no twelve
> word transcription before you can do anything. Your recovery phrase is waiting
> under Backup and keys for when you want it, behind your device passcode or
> biometrics.
>
> SIGNING YOU CAN READ
> Every signing request shows where it came from, which chain it touches and
> what it actually says, in plain language rather than a wall of hex. Reject is
> the default action. Nothing is signed without you tapping approve.
>
> PAIRS WITH STACKR ON THE WEB
> Scan the code on stackr.ie and your addresses appear on your dashboard there,
> alongside any addresses you already watch. Pairing traffic is end-to-end
> encrypted before it reaches our relay. The website stays watch-only: it reads
> public addresses and never asks for a key or a signature.
>
> KEYS STAY IN HARDWARE-BACKED STORAGE
> Your recovery phrase lives in the Secure Enclave and Keychain on iPhone, and
> in the Keystore on Android. It is never sent to a server, never written to
> logs, and the screen that displays it blocks screenshots. Sign-in for your
> Ethereum and Solana accounts is handled by Privy; your Bitcoin, Stacks and Sui
> keys are derived on the device from a standard BIP-39 phrase, so you can
> restore them in any compatible wallet.
>
> WHAT THIS APP IS NOT
> Stackr Wallet is not an exchange. There is no trading, no swapping, no buying
> or selling of cryptocurrency, and no in-app purchase of any kind. It does not
> custody your assets and it does not mine.
>
> PRIVACY
> No analytics SDK ships in this app. To show balances and prices, the app sends
> the public addresses in your wallet to blockchain data providers. Those
> addresses are already public on their blockchains. Your keys and recovery
> phrase are not among the things that get sent anywhere.
>
> Operated by cteic, Ireland. Questions: support@stackr.ie
> Privacy policy: https://stackr.ie/privacy
> Terms: https://stackr.ie/terms

## Keywords (App Store, 100 max, comma separated, no spaces)

```
crypto,bitcoin,ethereum,solana,stacks,sui,self-custody,web3,portfolio,signer,defi,seed
```

86 characters. "Wallet" is left out on purpose: it is already in the app name,
which Apple indexes separately, so repeating it wastes the budget.

## App Review notes (App Store Connect, Review Information)

Paste this into the App Review notes field on the build.

> Stackr Wallet is a non-custodial wallet.
>
> - Keys are generated on the device and stored in the Secure Enclave and
>   Keychain. They are never transmitted to our servers. We cannot access, move,
>   freeze or recover a user's funds.
> - There is no exchange function. The app does not buy, sell, swap or trade
>   cryptocurrency, and it offers no in-app purchase. Guideline 3.1.5(ii) and
>   3.1.5(iii) do not apply.
> - Guideline 3.1.5(i): this app is submitted by cteic, enrolled in the Apple
>   Developer Program as an organisation, as the guideline requires of apps that
>   facilitate virtual currency storage.
> - The app does not mine cryptocurrency on the device.
>
> To review the app: tap Continue on the welcome screen and sign in with the
> email address below. A one-time code arrives by email. The wallet is created
> automatically on first sign-in, so no funding is required to see every screen.
> Balance and Activity read public blockchain data. Backup and keys asks for the
> device passcode or biometrics before it reveals the recovery phrase, which is
> expected behaviour and not a bug.
>
> Demo account: TO BE SUPPLIED BEFORE SUBMISSION
> Demo one-time codes: TO BE SUPPLIED BEFORE SUBMISSION

The two "TO BE SUPPLIED" lines are the only placeholders in this file. Apple
rejects a wallet submission that a reviewer cannot sign in to, so a reviewer
mailbox has to exist before the first submission. Creating it is an account
action.

## Apple privacy nutrition labels (App Privacy)

Apple's question is "does the app or its third-party SDKs collect this". These
answers are drafts to be confirmed against the shipping build.

| Data type                           | Collected | Linked to the user | Used for tracking | Purpose           | Why                                                                                                                                                                                               |
| ----------------------------------- | --------- | ------------------ | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info: Email Address         | Yes       | Yes                | No                | App Functionality | Privy handles sign-in and processes the email address.                                                                                                                                            |
| Identifiers: User ID                | Yes       | Yes                | No                | App Functionality | Privy issues an account identifier for the session.                                                                                                                                               |
| Other Data: public wallet addresses | Yes       | Yes                | No                | App Functionality | Sent to blockchain data providers to read balances and activity, and to the Link relay when pairing with stackr.ie. Apple has no blockchain-address category, so Other Data is the honest bucket. |
| Identifiers: Device ID              | No        | n/a                | No                | n/a               | No advertising or device identifier is read.                                                                                                                                                      |
| Usage Data                          | No        | n/a                | No                | n/a               | No analytics SDK is bundled in this app.                                                                                                                                                          |
| Diagnostics                         | No        | n/a                | No                | n/a               | No crash or performance reporting SDK is bundled.                                                                                                                                                 |
| Financial Info                      | No        | n/a                | No                | n/a               | No payment details are taken. Balances are read from public chains and are not sent to us.                                                                                                        |
| Location, Contacts, Photos, Health  | No        | n/a                | No                | n/a               | Never requested. The camera is used only to scan a pairing code, and the frames are not stored or transmitted.                                                                                    |

App Tracking Transparency: no. The app does not track users across apps or
websites owned by other companies, so no ATT prompt is required.

## Google Play data safety form

Play's definition of "collected" is "transmitted off the device", which is
narrower than most people assume and is the definition used here.

| Question                                 | Answer                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Does the app collect or share user data? | Yes                                                                                    |
| Is all data encrypted in transit?        | Yes                                                                                    |
| Can users request data deletion?         | Yes, by emailing support@stackr.ie. Deletion is described at https://stackr.ie/privacy |
| Committed to the Play Families policy?   | Not applicable. The app is not directed at children.                                   |
| Independent security review              | No                                                                                     |

Data types to declare:

| Data type                                   | Collected | Shared | Required | Purpose                               | Note                                                                                                                                        |
| ------------------------------------------- | --------- | ------ | -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal info: Email address                | Yes       | Yes    | Required | Account management, App functionality | Shared with Privy, which runs sign-in on our behalf.                                                                                        |
| Personal info: User IDs                     | Yes       | Yes    | Required | Account management, App functionality | The Privy account identifier.                                                                                                               |
| Financial info: Other financial info        | Yes       | Yes    | Required | App functionality                     | Public wallet addresses, sent to blockchain data providers to read balances and activity. The addresses are already public on their chains. |
| App activity, App info and performance      | No        | No     | n/a      | n/a                                   | No analytics, crash or performance SDK is bundled.                                                                                          |
| Device or other IDs                         | No        | No     | n/a      | n/a                                   | Not read.                                                                                                                                   |
| Photos and videos                           | No        | No     | n/a      | n/a                                   | The camera scans a pairing code; frames are not stored or sent.                                                                             |
| Location, Contacts, Messages, Health, Files | No        | No     | n/a      | n/a                                   | Never requested.                                                                                                                            |

Say plainly in the form's free-text field, and in the listing itself: private
keys and recovery phrases are generated on the device, are stored in the Android
Keystore, and are never collected, shared or transmitted.

## Still to decide before submission

| Item                                | Needs                                                                                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screenshots                         | 6.7 inch and 6.5 inch iPhone sets for Apple, phone set for Play. Needs a build on a device or simulator.                                                                                                                            |
| Age rating answers                  | Apple's questionnaire and Play's content rating questionnaire both ask whether the app enables financial transactions. Answer once, consistently, with the actual behaviour: the app signs transactions, it does not sell anything. |
| Play Financial Features declaration | Google requires a declaration form for software crypto wallets, and asks for company details. Account action.                                                                                                                       |
| Export compliance                   | The app uses standard cryptography. Expect to answer the App Store Connect export question as exempt, but confirm against the current wording.                                                                                      |
| Reviewer demo account               | Account action. See App Review notes above.                                                                                                                                                                                         |
