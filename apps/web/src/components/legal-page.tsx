import type { ReactNode } from 'react';
import { Header } from '@/components/header';
import { LEGAL_LAST_UPDATED, SUPPORT_EMAIL } from '@/lib/legal';
import { resolveSiteUrl } from '@/lib/site';
import { breadcrumbSchema, JsonLd } from '@/lib/structured-data';

interface LegalPageProps {
  title: string;
  /** Site-relative route, for the breadcrumb graph. */
  path: string;
  intro: string;
  children: ReactNode;
}

/**
 * Shell for the long-form public pages (/privacy, /terms, /support). Server
 * rendered, no client state: a heading, the last-updated stamp, and prose
 * sections. Kept deliberately plain so these routes stay at the bottom of the
 * first-load JS table.
 */
export function LegalPage({ title, path, intro, children }: LegalPageProps) {
  return (
    <>
      <JsonLd
        schema={breadcrumbSchema(
          [
            { name: 'Portfolio', path: '/' },
            { name: title, path },
          ],
          resolveSiteUrl(),
        )}
      />
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-5">
        <div className="mb-8 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{intro}</p>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
        </div>
        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </main>
    </>
  );
}

interface LegalSectionProps {
  title: string;
  children: ReactNode;
}

export function LegalSection({ title, children }: LegalSectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** A bulleted list with the page's prose styling. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

const LEGAL_LINK_CLASS =
  'rounded-sm text-foreground underline underline-offset-2 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** The support address as a mailto link, styled to read as a link inside prose. */
export function SupportMailLink() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={LEGAL_LINK_CLASS}>
      {SUPPORT_EMAIL}
    </a>
  );
}
