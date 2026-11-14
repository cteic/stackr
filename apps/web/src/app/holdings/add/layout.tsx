import type { Metadata } from 'next';
import { breadcrumbSchema, JsonLd } from '@/lib/structured-data';
import { resolveSiteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Add a Holding — Cash, Stocks or Gold | Stackr',
  description:
    'Add cash, a stock position or physical gold to your Stackr portfolio. Amounts stay in your browser and are valued live against the base currency you picked.',
  alternates: { canonical: '/holdings/add' },
};

export default function AddHoldingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        schema={breadcrumbSchema(
          [
            { name: 'Portfolio', path: '/' },
            { name: 'Holdings', path: '/holdings' },
            { name: 'Add a holding', path: '/holdings/add' },
          ],
          resolveSiteUrl(),
        )}
      />
      {children}
    </>
  );
}
