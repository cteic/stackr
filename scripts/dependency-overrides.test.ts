import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the dependency fixes behind the CI audit gate
// (`pnpm audit --prod --audit-level high`). Delete the query-string cases
// together with patches/query-string@7.1.3.patch once no dependency pulls
// query-string 7.

const root = fileURLToPath(new URL('..', import.meta.url));

// pnpm links every installed package into node_modules/.pnpm/node_modules, so
// a transitive dependency resolves from there without being a direct one.
const requireHoisted = createRequire(join(root, 'node_modules/.pnpm/node_modules/'));

interface QueryStringModule {
  parse: (input: string) => Record<string, unknown>;
}

function isQueryStringModule(value: unknown): value is QueryStringModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'parse' in value &&
    typeof value.parse === 'function'
  );
}

function loadQueryString(): QueryStringModule {
  const loaded: unknown = requireHoisted('query-string');
  if (!isQueryStringModule(loaded)) {
    throw new Error('query-string did not load with a parse function');
  }
  return loaded;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function zodRange(manifest: unknown): string | undefined {
  if (typeof manifest !== 'object' || manifest === null || !('dependencies' in manifest)) {
    return undefined;
  }
  const { dependencies } = manifest;
  if (typeof dependencies !== 'object' || dependencies === null || !('zod' in dependencies)) {
    return undefined;
  }
  return typeof dependencies.zod === 'string' ? dependencies.zod : undefined;
}

function workspaceManifests(): string[] {
  return ['apps', 'packages'].flatMap(group =>
    readdirSync(join(root, group), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(root, group, entry.name, 'package.json')),
  );
}

function isAtLeast(version: string, minimum: readonly number[]): boolean {
  const parts = version.split('.').map(Number);
  for (const [index, wanted] of minimum.entries()) {
    const actual = parts[index] ?? 0;
    if (actual !== wanted) {
      return actual > wanted;
    }
  }
  return true;
}

describe('decode-uri-component override', () => {
  it('resolves no version below the patched 0.5.1', () => {
    const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
    const versions = [...lockfile.matchAll(/^ {2}decode-uri-component@([\d.]+):$/gm)].map(
      match => match[1] ?? '',
    );

    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(isAtLeast(version, [0, 5, 1]), `decode-uri-component@${version}`).toBe(true);
    }
  });

  it('keeps query-string 7 decoding percent-encoded values', () => {
    // query-string 7 is CommonJS and the patched decoder is ESM-only. Without
    // the patch, parse throws "decodeComponent is not a function".
    const queryString = loadQueryString();

    expect(queryString.parse('symKey=ab%20cd&emoji=%F0%9F%98%80')).toEqual({
      symKey: 'ab cd',
      emoji: '\u{1F600}',
    });
  });

  it('leaves a malformed percent sequence untouched', () => {
    const queryString = loadQueryString();

    expect(queryString.parse('topic=%E0%A4%A')).toEqual({ topic: '%E0%A4%A' });
  });
});

describe('zod in workspace packages', () => {
  it('requires the patched 4.6.6 line wherever our own code depends on zod', () => {
    const ranges = workspaceManifests()
      .map(path => ({ path, range: zodRange(readJson(path)) }))
      .filter(entry => entry.range !== undefined);

    expect(ranges.length).toBeGreaterThan(0);
    for (const { path, range } of ranges) {
      const version = (range ?? '').replace(/^[\^~]/, '');
      expect(isAtLeast(version, [4, 6, 6]), `${path} requires zod ${range}`).toBe(true);
    }
  });
});
