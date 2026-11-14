import type { Metadata } from 'next';

/**
 * Private/utility surface: useful to a signed-in person, worthless in a search
 * index or an answer engine, so it is kept out of both.
 */
export const metadata: Metadata = {
  title: 'Labs — Stackr',
  description:
    'Unlisted sandbox for in-progress Stackr experiments. Not part of the product surface.',
  // No canonical either: the root layout's self-referencing `/` would otherwise
  // be inherited here, telling a crawler this page *is* the homepage.
  alternates: { canonical: null },
  robots: { index: false, follow: false },
};

export default function LabsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
