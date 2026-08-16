import { describe, expect, it } from 'vitest';
import { isNavLinkActive } from './nav-active';

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
