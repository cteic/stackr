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
// hard to game. Current worst-case is `/labs` at ~613 kB (measured 2026-06);
// the 650 kB ceiling leaves ~37 kB (~6%) of headroom for normal churn while
// still catching a real regression. Raising it must be a deliberate, reviewed
// edit to this file — that is the gate.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const MAX_FIRST_LOAD_KB = 650;

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

function main() {
  const build = spawnSync('pnpm', ['--filter', '@stackr/web', 'build'], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  // Echo the build output so CI logs still show the full route table.
  process.stdout.write(build.stdout ?? '');
  if (build.stderr) process.stderr.write(build.stderr);

  if (build.status !== 0) {
    console.error('\n✗ bundle-budget: web build failed; cannot evaluate budget.');
    process.exit(build.status ?? 1);
  }

  const stats = JSON.parse(readFileSync(join(WEB_DIR, STATS_PATH), 'utf8'));
  const rows = firstLoadFromStats(
    stats,
    path => gzipSync(readFileSync(join(WEB_DIR, path))).length,
  );
  if (rows.length === 0) {
    console.error(`\n✗ bundle-budget: no routes found in ${STATS_PATH}.`);
    process.exit(1);
  }

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
