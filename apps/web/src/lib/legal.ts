/**
 * Facts the legal and support pages share, kept in one place so the footer,
 * the pages and the sitemap cannot drift apart on a path or a date.
 */

export const SUPPORT_EMAIL = 'support@stackr.ie';

export const OPERATOR_NAME = 'cteic';

export const OPERATOR_COUNTRY = 'Ireland';

/** Shown on every legal page; bump when the wording changes. */
export const LEGAL_LAST_UPDATED = '16 September 2026';

export interface SiteLink {
  href: string;
  label: string;
}

/** Footer order, left to right. Every entry is a public, indexable route. */
export const LEGAL_LINKS: readonly SiteLink[] = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/support', label: 'Support' },
];

export interface FaqEntry {
  question: string;
  answer: string;
}

export const SUPPORT_FAQ: readonly FaqEntry[] = [
  {
    question: 'How do I connect a wallet?',
    answer:
      'On stackr.ie there are three ways. Add Wallet lets you paste any Bitcoin, Ethereum, Stacks, Solana or Sui address to watch it — no keys and no sign-in. Connect, in the header, reads addresses from a browser wallet such as MetaMask, Phantom, Leather or Slush; Stackr only reads the addresses and never asks you to sign anything. Connect also offers Pair for Stackr Wallet: scan the QR code with the app and its addresses appear on your dashboard.',
  },
  {
    question: 'How do liquidation alerts work?',
    answer:
      'Sign in on the Account page with an email magic link, enable notifications on the device you want alerted, then choose a watched wallet. Stackr re-checks the position every few minutes and sends a push notification when its risk passes 80% (warning) or 95% (critical) of the liquidation threshold. Alerts cover lending protocols on Ethereum, Solana and Stacks today, and free accounts can watch one wallet. Alerts are best effort — do not rely on them alone to manage a position.',
  },
  {
    question: 'What does non-custodial mean?',
    answer:
      'Stackr Wallet creates your keys on your phone and keeps them in the device’s hardware-backed secure storage (the Secure Enclave and Keychain on iPhone, the Keystore on Android). They never leave the device and are never sent to Stackr, so nobody at Stackr can access, move, freeze or recover your funds. Your recovery phrase is the only backup: write it down and keep it offline.',
  },
  {
    question: 'How do I delete my account?',
    answer:
      'Email support@stackr.ie from the address you signed in with and we will delete the account together with its watched addresses, alert subscriptions and push subscriptions. Wallets and preferences saved in your browser are removed by clearing the site’s data in your browser. Deleting the account does not touch the keys in Stackr Wallet — those exist only on your device, so make sure you have your recovery phrase before removing the app.',
  },
  {
    question: 'How do I restore my wallet from a recovery phrase?',
    answer:
      'Stackr Wallet shows your 12-word recovery phrase under Backup & keys after you unlock with your device passcode or biometrics. It is a standard BIP-39 phrase using the derivation paths of each chain’s main wallets, so importing it into a BIP-39 compatible wallet (Leather, Phantom, Slush and similar) restores the same Bitcoin, Stacks and Sui accounts. Importing a phrase into Stackr Wallet itself is not available yet. Ethereum and Solana accounts are tied to your Privy email login, so signing in with the same email on a new device brings them back.',
  },
];
