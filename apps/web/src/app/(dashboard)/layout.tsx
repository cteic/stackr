import type { Metadata } from 'next';
import { JsonLd, webApplicationSchema } from '@/lib/structured-data';
import { resolveSiteUrl } from '@/lib/site';

/**
 * `/` is a client-rendered dashboard, so its metadata lives in this layout —
 * a `'use client'` page cannot export `metadata`. Same pattern for every other
 * route in this app.
 */
export const metadata: Metadata = {
  title: 'Stackr — Self-Custody Multi-Chain Portfolio Tracker',
  description:
    'Track Bitcoin, Ethereum, Stacks, Solana and Sui balances in one dashboard. Watch-only and self-custody: paste an address, no account, no keys, no custody.',
  alternates: { canonical: '/' },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd schema={webApplicationSchema(resolveSiteUrl())} />
      {children}
    </>
  );
}
