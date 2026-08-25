// First-load JS bundle-size budget for `apps/web` (CI gate, issue #97).
//
// The wallet-adapter / RainbowKit / charts stack is heavy and easy to bloat
// silently. This script builds the web app, parses the per-route "First Load
// JS" column from Next's build summary, and fails if any route exceeds the
// ceiling below. It parses the build *summary* (not a fragile internal
// manifest) because that's the same number Next reports and reviewers see.
//
// Ceiling, not a per-route baseline: a single documented ceiling is simple and
// hard to game. Current worst-case is `/labs` at ~613 kB (measured 2026-06);
// the 650 kB ceiling leaves ~37 kB (~6%) of headroom for normal churn while
// still catching a real regression. Raising it must be a deliberate, reviewed
// edit to this file — that is the gate.

import { spawnSync } from 'node:child_process';

export const MAX_FIRST_LOAD_KB = 650;

/**
 * Parse Next's build summary into `{ route, firstLoadKb }` rows.
 *
 * Route rows look like:
 *   ├ ○ /labs                                3.78 kB         613 kB
 * The First Load JS is the last size token on the line. Sizes come in B / kB /
 * MB; everything is normalised to kB. Non-route lines are ignored.
 */
export function parseFirstLoad(log) {
  const rows = [];
  for (const raw of log.split('\n')) {
    // Defensive: strip a turbo task prefix if the log was captured through it.
    const line = raw.replace(/^@stackr\/web:build:\s?/, '');
    // Route rows start with a tree connector and a route-type glyph.
    const match = line.match(/^[┌├└]\s+[○●ƒλ]\s+(\S+)\s+(.*)$/u);
    if (!match) continue;
    const [, route, rest] = match;
    const sizes = [...rest.matchAll(/([\d.]+)\s?(B|kB|MB)\b/g)];
    if (sizes.length === 0) continue;
    const [, value, unit] = sizes[sizes.length - 1];
    rows.push({ route, firstLoadKb: toKb(Number(value), unit) });
  }
  return rows;
}

function toKb(value, unit) {
  if (unit === 'MB') return value * 1024;
  if (unit === 'B') return value / 1024;
  return value;
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

  const rows = parseFirstLoad(build.stdout ?? '');
  if (rows.length === 0) {
    console.error('\n✗ bundle-budget: no route sizes parsed from the build output.');
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
