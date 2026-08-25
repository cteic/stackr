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
import { WebMcpRegistrar } from '@/components/web-mcp-registrar';
import { Footer } from '@/components/footer';
import { isProductionSiteUrl, resolveSiteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';
import { JsonLd, organizationSchema, webSiteSchema } from '@/lib/structured-data';
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

// The origin this build represents, resolved once (see lib/site.ts). Anything
// other than the production custom domain is a preview Worker — and Workers,
// unlike Pages, send no automatic `X-Robots-Tag: noindex` — so the root
// metadata carries an explicit noindex there instead.
const siteUrl = resolveSiteUrl();
const isProduction = isProductionSiteUrl(siteUrl);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${SITE_NAME} — Multi-Chain Portfolio Tracker`,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  robots: isProduction ? undefined : { index: false, follow: false },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Multi-Chain Portfolio Tracker`,
    description: 'Cross-chain Web3 portfolio for self-custody.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Multi-Chain Portfolio Tracker`,
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
      <body className="flex min-h-screen flex-col">
        <JsonLd schema={organizationSchema(siteUrl)} />
        <JsonLd schema={webSiteSchema(siteUrl)} />
        <ServiceWorkerRegistrar />
        <WebMcpRegistrar />
        <Providers>
          <div className="flex flex-1 flex-col">{children}</div>
        </Providers>
        <Footer />
      </body>
    </html>
  );
}
