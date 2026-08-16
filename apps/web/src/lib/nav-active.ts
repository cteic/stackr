/** A nav link is "active" for its own route and any nested route beneath it. */
export function isNavLinkActive(pathname: string | null, href: string): boolean {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

/** Shared class string for a top-level nav link, given its active state. */
export function NAV_LINK_CLASS(active: boolean): string {
  return active
    ? 'text-xs font-medium uppercase tracking-widest text-foreground'
    : 'text-xs font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground';
}
