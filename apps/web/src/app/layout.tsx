import type { Metadata, Viewport } from 'next';
import {
  IBM_Plex_Mono,
  Schibsted_Grotesk,
  Hanken_Grotesk,
  Bricolage_Grotesque,
  Spline_Sans_Mono,
} from 'next/font/google';
import { Providers } from '@/lib/providers';
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar';
import './globals.css';

// Per-theme typefaces, exposed as CSS variables that each theme class picks up.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-mono',
  display: 'swap',
});
const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-schibsted',
  display: 'swap',
});
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' });
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});
const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-spline-mono',
  display: 'swap',
});

const fontVars = [
  plexMono.variable,
  schibsted.variable,
  hanken.variable,
  bricolage.variable,
  splineMono.variable,
].join(' ');

export const metadata: Metadata = {
  metadataBase: new URL('https://stackr.ie'),
  title: 'Stackr — Multi-Chain Portfolio Tracker',
  description:
    'Cross-chain Web3 portfolio for self-custody. Track BTC, ETH, STX, and SOL wallet balances in one place.',
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    url: 'https://stackr.ie',
    siteName: 'Stackr',
    title: 'Stackr — Multi-Chain Portfolio Tracker',
    description: 'Cross-chain Web3 portfolio for self-custody.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stackr — Multi-Chain Portfolio Tracker',
    description: 'Cross-chain Web3 portfolio for self-custody.',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a1a1a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${fontVars}`} suppressHydrationWarning>
      <body>
        <ServiceWorkerRegistrar />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
