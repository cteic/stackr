/** A nav link is "active" for its own route and any nested route beneath it. */
export function isNavLinkActive(pathname: string | null, href: string): boolean {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

/** Shared class string for a top-level nav link, given its active state. */
export function NAV_LINK_CLASS(active: boolean): string {
  return active
    ? 'border-b border-foreground py-1 text-xs font-medium uppercase tracking-widest text-foreground transition-colors'
    : 'border-b border-transparent py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground';
}
