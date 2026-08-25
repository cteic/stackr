import { describe, expect, it } from 'vitest';
import { MAX_FIRST_LOAD_KB, overBudget, parseFirstLoad } from './check-bundle-budget.mjs';

// A trimmed copy of a real Next 15 build summary (apps/web).
const SAMPLE = `
Route (app)                                 Size  First Load JS
┌ ○ /                                    4.97 kB         511 kB
├ ○ /_not-found                            143 B         106 kB
├ ƒ /api/rpc/eth                           143 B         106 kB
├ ○ /icon.svg                                0 B            0 B
├ ○ /labs                                3.78 kB         613 kB
├ ● /wallet/[chain]/[address]              212 B         496 kB
└ ○ /wallet/view                           426 B         496 kB
+ First Load JS shared by all             106 kB
  └ other shared chunks (total)          5.69 kB
`;

describe('parseFirstLoad', () => {
  it('extracts the first-load JS (last size column) per route', () => {
    const rows = parseFirstLoad(SAMPLE);
    const byRoute = Object.fromEntries(rows.map(r => [r.route, r.firstLoadKb]));
    expect(byRoute['/']).toBe(511);
    expect(byRoute['/labs']).toBe(613);
    expect(byRoute['/wallet/[chain]/[address]']).toBe(496);
  });

  it('ignores the shared-chunk summary lines, not just route rows', () => {
    const routes = parseFirstLoad(SAMPLE).map(r => r.route);
    expect(routes).not.toContain('First');
    expect(routes).toContain('/icon.svg');
  });

  it('normalises B and MB units to kB', () => {
    const rows = parseFirstLoad('┌ ○ /a   1 kB   512 B\n├ ○ /b   1 kB   2 MB');
    const byRoute = Object.fromEntries(rows.map(r => [r.route, r.firstLoadKb]));
    expect(byRoute['/a']).toBeCloseTo(0.5, 5);
    expect(byRoute['/b']).toBe(2048);
  });

  it('strips a turbo task prefix when the log was captured through it', () => {
    const rows = parseFirstLoad('@stackr/web:build: ├ ○ /x   1 kB   200 kB');
    expect(rows).toEqual([{ route: '/x', firstLoadKb: 200 }]);
  });
});

describe('overBudget', () => {
  it('flags only routes above the ceiling', () => {
    const rows = parseFirstLoad(SAMPLE);
    expect(overBudget(rows, 600).map(r => r.route)).toEqual(['/labs']);
  });

  it('passes the sample under the configured ceiling', () => {
    expect(overBudget(parseFirstLoad(SAMPLE), MAX_FIRST_LOAD_KB)).toEqual([]);
  });
});
