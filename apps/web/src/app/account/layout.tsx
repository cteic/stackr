import type { Metadata } from 'next';

/**
 * Private/utility surface: useful to a signed-in person, worthless in a search
 * index or an answer engine, so it is kept out of both.
 */
export const metadata: Metadata = {
  title: 'Account — Stackr',
  description:
    'Manage your Stackr sign-in, liquidation alert subscriptions and paired Stackr Wallet devices.',
  // No canonical either: the root layout's self-referencing `/` would otherwise
  // be inherited here, telling a crawler this page *is* the homepage.
  alternates: { canonical: null },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
