import { describe, expect, it } from 'vitest';
import { isNavLinkActive, NAV_LINK_CLASS } from './nav-active';

describe('isNavLinkActive', () => {
  it('matches the exact route', () => {
    expect(isNavLinkActive('/holdings', '/holdings')).toBe(true);
  });

  it('matches a nested route beneath it', () => {
    expect(isNavLinkActive('/holdings/add', '/holdings')).toBe(true);
  });

  it('does not match a sibling route with a shared prefix', () => {
    expect(isNavLinkActive('/holdings-export', '/holdings')).toBe(false);
  });

  it('does not match an unrelated route', () => {
    expect(isNavLinkActive('/market', '/holdings')).toBe(false);
  });

  it('treats a null pathname (no router context) as inactive', () => {
    expect(isNavLinkActive(null, '/holdings')).toBe(false);
  });
});

describe('NAV_LINK_CLASS', () => {
  it('gives both active and inactive states a visible keyboard focus ring', () => {
    expect(NAV_LINK_CLASS(true)).toContain('focus-visible:ring-2');
    expect(NAV_LINK_CLASS(false)).toContain('focus-visible:ring-2');
  });
});
