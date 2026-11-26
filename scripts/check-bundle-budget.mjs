// First-load JS bundle-size budget for `apps/web` (CI gate, issue #97).
//
// The wallet-adapter / RainbowKit / charts stack is heavy and easy to bloat
// silently. This script builds the web app, reads each route's first-load
// chunk list from `.next/diagnostics/route-bundle-stats.json`, sums the
// gzipped size of those chunks, and fails if any route exceeds the ceiling
// below. Next 16 no longer prints a "First Load JS" column in its build
// summary; gzipped bytes match what that column used to report.
//
// Ceiling, not a per-route baseline: a single documented ceiling is simple and
// hard to game. With the wallet stack loaded after first paint, the worst case
// is `/account` at ~469 kB (measured 2026-11); the 520 kB ceiling leaves ~51 kB
// (~11%) of headroom for normal churn while still catching a real regression.
// Raising it must be a deliberate, reviewed edit to this file — that is the
// gate.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

export const MAX_FIRST_LOAD_KB = 520;

const WEB_DIR = new URL('../apps/web/', import.meta.url).pathname;
export const STATS_PATH = '.next/diagnostics/route-bundle-stats.json';

function isRouteStat(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.route === 'string' &&
    Array.isArray(value.firstLoadChunkPaths) &&
    value.firstLoadChunkPaths.every(p => typeof p === 'string')
  );
}

/**
 * Turn Next's route bundle stats into `{ route, firstLoadKb }` rows.
 *
 * `gzipBytesOf` maps a chunk path (relative to `apps/web`) to its gzipped
 * size in bytes, so tests can supply sizes without a build. Throws on a
 * stats shape it does not recognise, so a future Next change fails loudly
 * instead of passing with zero routes.
 */
export function firstLoadFromStats(stats, gzipBytesOf) {
  if (!Array.isArray(stats) || !stats.every(isRouteStat)) {
    throw new Error(`unrecognised ${STATS_PATH} shape`);
  }
  const cache = new Map();
  const sizeOf = path => {
    if (!cache.has(path)) cache.set(path, gzipBytesOf(path));
    return cache.get(path);
  };
  return stats.map(({ route, firstLoadChunkPaths }) => ({
    route,
    firstLoadKb: firstLoadChunkPaths.reduce((sum, p) => sum + sizeOf(p), 0) / 1024,
  }));
}

/** Routes whose first-load JS exceeds the ceiling. */
export function overBudget(rows, ceilingKb = MAX_FIRST_LOAD_KB) {
  return rows.filter(r => r.firstLoadKb > ceilingKb);
}

/**
 * Gzipped size of a chunk listed in the stats. Next lists chunks relative to
 * `apps/web` (`.next/static/...`), so they resolve against the `.next`
 * directory being measured, which may be a base build outside this checkout.
 */
export function chunkReader(nextDir) {
  return path => gzipSync(readFileSync(join(nextDir, path.replace(/^\.next\//, '')))).length;
}

function isReportRow(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.route === 'string' &&
    typeof value.firstLoadKb === 'number'
  );
}

/** Rows from a `--json` report, or `undefined` when the file is not one. */
export function readReport(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.routes) && parsed.routes.every(isReportRow)) return parsed.routes;
  } catch {
    // Fall through: an unreadable base only loses the comparison.
  }
  return undefined;
}

function kb(value) {
  return `${value.toFixed(1)} kB`;
}

function change(head, base) {
  if (base === undefined) return 'new';
  const delta = head - base;
  if (Math.abs(delta) < 0.05) return '0.0 kB';
  return `${delta > 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)} kB`;
}

/**
 * The pull-request report: one row per route, worst first, with the change
 * against the base build when there is one. Built only from route names and
 * numbers, so the comment cannot carry anything else.
 */
export function renderMarkdown(rows, baseRows, ceilingKb = MAX_FIRST_LOAD_KB) {
  const base = new Map((baseRows ?? []).map(r => [r.route, r.firstLoadKb]));
  const sorted = [...rows].sort((a, b) => b.firstLoadKb - a.firstLoadKb);
  const over = overBudget(rows, ceilingKb);
  const lines = [
    over.length === 0
      ? `Every route is within the ${ceilingKb} kB first-load JS ceiling (gzipped).`
      : `${over.length} of ${rows.length} routes are over the ${ceilingKb} kB first-load JS ceiling (gzipped).`,
    '',
    baseRows ? '| Route | Base | This PR | Change | Budget |' : '| Route | This PR | Budget |',
    baseRows ? '| --- | ---: | ---: | ---: | --- |' : '| --- | ---: | --- |',
  ];
  for (const { route, firstLoadKb } of sorted) {
    const name = `\`${route.replaceAll('|', '\\|').replaceAll('`', '')}\``;
    const status = firstLoadKb > ceilingKb ? 'over' : 'ok';
    const before = base.get(route);
    lines.push(
      baseRows
        ? `| ${name} | ${before === undefined ? '-' : kb(before)} | ${kb(firstLoadKb)} | ${change(firstLoadKb, before)} | ${status} |`
        : `| ${name} | ${kb(firstLoadKb)} | ${status} |`,
    );
  }
  const current = new Set(rows.map(r => r.route));
  const removed = [...base.keys()].filter(route => !current.has(route));
  if (removed.length > 0) {
    lines.push('', `Removed since the base: ${removed.map(r => `\`${r}\``).join(', ')}.`);
  }
  return `${lines.join('\n')}\n`;
}

function readArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'build-dir': { type: 'string' },
      json: { type: 'string' },
      base: { type: 'string' },
      markdown: { type: 'string' },
    },
  });
  return values;
}

function build() {
  const result = spawnSync('pnpm', ['--filter', '@stackr/web', 'build'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  // Echo the build output so CI logs still show the full route table.
  process.stdout.write(result.stdout ?? '');
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    console.error('\n✗ bundle-budget: web build failed; cannot evaluate budget.');
    process.exit(result.status ?? 1);
  }
}

function main() {
  const args = readArgs(process.argv.slice(2));
  // With --build-dir the caller has already built (the shared CI workflow
  // builds the pull request and its base); without it, build here.
  const nextDir = args['build-dir'] ? resolve(args['build-dir']) : join(WEB_DIR, '.next');
  if (!args['build-dir']) build();

  const stats = JSON.parse(
    readFileSync(join(nextDir, 'diagnostics', 'route-bundle-stats.json'), 'utf8'),
  );
  const rows = firstLoadFromStats(stats, chunkReader(nextDir));
  if (rows.length === 0) {
    console.error(`\n✗ bundle-budget: no routes found in ${STATS_PATH}.`);
    process.exit(1);
  }

  const baseRows = args.base ? readReport(readFileSync(args.base, 'utf8')) : undefined;
  if (args.base && !baseRows) console.warn(`bundle-budget: ignoring unreadable base ${args.base}`);
  if (args.json) {
    writeFileSync(
      args.json,
      `${JSON.stringify({ ceilingKb: MAX_FIRST_LOAD_KB, routes: rows }, null, 2)}\n`,
    );
  }
  if (args.markdown) writeFileSync(args.markdown, renderMarkdown(rows, baseRows));

  const offenders = overBudget(rows);
  const worst = rows.reduce((a, b) => (b.firstLoadKb > a.firstLoadKb ? b : a));

  console.log(
    `\nbundle-budget: ${rows.length} routes, ceiling ${MAX_FIRST_LOAD_KB} kB first-load JS.`,
  );
  console.log(`  worst: ${worst.route} at ${worst.firstLoadKb.toFixed(1)} kB`);

  if (offenders.length > 0) {
    console.error('\n✗ bundle-budget: first-load JS over budget:');
    for (const o of offenders) {
      console.error(`  ${o.route}: ${o.firstLoadKb.toFixed(1)} kB > ${MAX_FIRST_LOAD_KB} kB`);
    }
    console.error('\nTrim the route or, if intentional, raise MAX_FIRST_LOAD_KB with a reason.');
    process.exit(1);
  }

  console.log('✓ bundle-budget: all routes within budget.');
}

// Run only when invoked directly, so the parser stays importable for tests.
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
