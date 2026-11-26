import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  MAX_FIRST_LOAD_KB,
  chunkReader,
  firstLoadFromStats,
  overBudget,
  readReport,
  renderMarkdown,
} from './check-bundle-budget.mjs';

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

describe('chunkReader', () => {
  it('resolves .next/ chunk paths against the measured directory, not the checkout', () => {
    const nextDir = mkdtempSync(join(tmpdir(), 'base-next-'));
    mkdirSync(join(nextDir, 'static', 'chunks'), { recursive: true });
    const body = 'x'.repeat(4096);
    writeFileSync(join(nextDir, 'static', 'chunks', 'a.js'), body);
    expect(chunkReader(nextDir)('.next/static/chunks/a.js')).toBe(gzipSync(body).length);
  });
});

describe('readReport', () => {
  it('reads the rows a --json run wrote', () => {
    const json = JSON.stringify({ ceilingKb: 520, routes: [{ route: '/', firstLoadKb: 400 }] });
    expect(readReport(json)).toEqual([{ route: '/', firstLoadKb: 400 }]);
  });

  it('returns undefined for a file that is not a report', () => {
    expect(readReport('not json')).toBeUndefined();
    expect(readReport(JSON.stringify({ routes: [{ route: '/' }] }))).toBeUndefined();
  });
});

describe('renderMarkdown', () => {
  const rows = [
    { route: '/', firstLoadKb: 410.04 },
    { route: '/account', firstLoadKb: 530 },
    { route: '/new', firstLoadKb: 300 },
  ];
  const base = [
    { route: '/', firstLoadKb: 700 },
    { route: '/account', firstLoadKb: 530 },
    { route: '/gone', firstLoadKb: 200 },
  ];

  it('shows each route against the base, worst first', () => {
    const md = renderMarkdown(rows, base, 520);
    expect(md).toContain('1 of 3 routes are over the 520 kB');
    const tableRows = md.split('\n').filter(line => line.startsWith('| `'));
    expect(tableRows).toEqual([
      '| `/account` | 530.0 kB | 530.0 kB | 0.0 kB | over |',
      '| `/` | 700.0 kB | 410.0 kB | -290.0 kB | ok |',
      '| `/new` | - | 300.0 kB | new | ok |',
    ]);
    expect(md).toContain('Removed since the base: `/gone`.');
  });

  it('drops the base columns when there is no base', () => {
    const md = renderMarkdown([{ route: '/', firstLoadKb: 100 }], undefined, 520);
    expect(md).toContain('Every route is within the 520 kB');
    expect(md).toContain('| `/` | 100.0 kB | ok |');
  });

  it('keeps a route name from breaking out of its table cell', () => {
    const md = renderMarkdown([{ route: '/a|b`c', firstLoadKb: 1 }], undefined, 520);
    expect(md).toContain('| `/a\\|bc` | 1.0 kB | ok |');
  });
});
