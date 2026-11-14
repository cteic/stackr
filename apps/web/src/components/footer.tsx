import Link from 'next/link';
import { Github } from 'lucide-react';
import { LEGAL_LINKS } from '@/lib/legal';

const FOOTER_LINK_CLASS =
  'flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Every page renders its own <Header /> then a <main> of whatever height its
 * content needs — several routes (Settings, Holdings empty, Collectibles
 * empty, Account, Login) are a single short card, leaving a large dead void
 * below on any real viewport. Rendered once in the root layout inside a
 * min-h-screen flex column, this sits at `mt-auto` so it grounds the bottom
 * of the viewport on short pages and trails normally on tall ones.
 */
export function Footer() {
  return (
    <footer className="mt-auto flex flex-col gap-1 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-5">
      <p className="font-mono uppercase tracking-widest">
        <span>STACKR</span>
        <span className="text-primary">{'////'}</span>
        <span className="ml-2 hidden normal-case tracking-normal sm:inline">
          Watch-only · self-custody · runs in your browser
        </span>
      </p>
      <nav aria-label="Legal and support" className="flex flex-wrap items-center gap-4">
        {LEGAL_LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className={FOOTER_LINK_CLASS}>
            {label}
          </Link>
        ))}
        <a
          href="https://github.com/pete-watters/stackr"
          target="_blank"
          rel="noreferrer"
          className={FOOTER_LINK_CLASS}
        >
          <Github className="h-3.5 w-3.5" aria-hidden="true" />
          Source
        </a>
      </nav>
    </footer>
  );
}
