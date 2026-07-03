import { describe, expect, it } from 'vitest';
import { HIRO_PROXY_PATH, hiroPublicBase, resolveHiroBase } from './hiro-config.js';

describe('resolveHiroBase', () => {
  it('targets the same-origin proxy path in the browser', () => {
    // `fetch` resolves this relative path against the document origin, so the
    // request lands on the key-bearing proxy route.
    expect(resolveHiroBase(true)).toBe(HIRO_PROXY_PATH);
  });

  it('falls back to the public base outside the browser (SSR/tests/server)', () => {
    // No origin to resolve a relative path against, so the request needs an
    // absolute URL it can fetch directly.
    expect(resolveHiroBase(false)).toBe(hiroPublicBase);
  });

  it('keeps the public fallback an absolute URL fetch can consume', () => {
    expect(() => new URL(hiroPublicBase)).not.toThrow();
  });
});
