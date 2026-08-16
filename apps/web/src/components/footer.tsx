import { Github } from 'lucide-react';

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
      <a
        href="https://github.com/pete-watters/stackr"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 transition-colors hover:text-foreground"
      >
        <Github className="h-3.5 w-3.5" aria-hidden="true" />
        Source
      </a>
    </footer>
  );
}
