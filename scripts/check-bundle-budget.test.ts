import { describe, expect, it } from 'vitest';
import { MAX_FIRST_LOAD_KB, firstLoadFromStats, overBudget } from './check-bundle-budget.mjs';

// Same shape as Next 16's .next/diagnostics/route-bundle-stats.json, trimmed.
const STATS = [
  {
    route: '/',
    firstLoadUncompressedJsBytes: 9000,
    firstLoadChunkPaths: ['.next/static/chunks/shared.js', '.next/static/chunks/home.js'],
  },
  {
    route: '/labs',
    firstLoadUncompressedJsBytes: 12000,
    firstLoadChunkPaths: ['.next/static/chunks/shared.js', '.next/static/chunks/labs.js'],
  },
];

const GZIP_BYTES: Record<string, number> = {
  '.next/static/chunks/shared.js': 400 * 1024,
  '.next/static/chunks/home.js': 111 * 1024,
  '.next/static/chunks/labs.js': 213 * 1024,
};

function gzipBytesOf(path: string): number {
  const bytes = GZIP_BYTES[path];
  if (bytes === undefined) throw new Error(`unexpected chunk ${path}`);
  return bytes;
}

describe('firstLoadFromStats', () => {
  it('sums the gzipped size of each route’s first-load chunks, in kB', () => {
    const rows = firstLoadFromStats(STATS, gzipBytesOf);
    expect(rows).toEqual([
      { route: '/', firstLoadKb: 511 },
      { route: '/labs', firstLoadKb: 613 },
    ]);
  });

  it('measures a chunk shared by several routes only once', () => {
    let calls = 0;
    firstLoadFromStats(STATS, path => {
      calls += 1;
      return gzipBytesOf(path);
    });
    expect(calls).toBe(3);
  });

  it('throws on a stats shape it does not recognise instead of passing empty', () => {
    expect(() => firstLoadFromStats({ routes: [] }, gzipBytesOf)).toThrow(/unrecognised/);
    expect(() => firstLoadFromStats([{ route: '/' }], gzipBytesOf)).toThrow(/unrecognised/);
  });
});

describe('overBudget', () => {
  it('flags only routes above the ceiling', () => {
    const rows = firstLoadFromStats(STATS, gzipBytesOf);
    expect(overBudget(rows, 600).map(r => r.route)).toEqual(['/labs']);
  });

  it('defaults to the configured ceiling', () => {
    const rows = firstLoadFromStats(STATS, gzipBytesOf);
    expect(overBudget(rows)).toEqual(overBudget(rows, MAX_FIRST_LOAD_KB));
    expect(overBudget(rows).map(r => r.route)).toEqual(['/labs']);
  });
});
