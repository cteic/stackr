#!/usr/bin/env node
// Fails if any workflow job can run without a timeout.
//
// GitHub's default job timeout is 360 minutes. A step that *hangs* rather than
// fails therefore runs for six hours and, on a private repo, bills for all of
// it. This repo lost 451 minutes across two runs that way — apt sat waiting on
// an unreachable Ubuntu mirror until the ceiling killed it.
//
// A cap on each job is the difference between a flaky minute and a flaky
// afternoon. This check exists so the next workflow cannot quietly omit one.
//
// Deliberately dependency-free: it runs from a bare checkout with nothing
// installed, the same as everything else in the quality gate.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = ".github/workflows";
const MAX_SANE_MINUTES = 60;

if (!existsSync(DIR)) {
  console.log("no .github/workflows directory — nothing to check");
  process.exit(0);
}

const problems = [];
let checked = 0;

for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).sort()) {
  const lines = readFileSync(join(DIR, file), "utf8").split("\n");

  let inJobs = false;
  let job = null;
  let jobLine = 0;
  let hasTimeout = false;
  let isReusable = false;
  let timeoutValue = null;

  const finish = () => {
    if (job === null) return;
    checked++;
    // A job that calls a reusable workflow cannot declare timeout-minutes;
    // the cap belongs in the called workflow, not here.
    if (!isReusable && !hasTimeout) {
      problems.push(`${file}:${jobLine}  job "${job}" has no timeout-minutes`);
    }
    if (timeoutValue !== null && timeoutValue > MAX_SANE_MINUTES) {
      problems.push(
        `${file}:${jobLine}  job "${job}" allows ${timeoutValue} minutes — over the ${MAX_SANE_MINUTES}-minute ceiling`,
      );
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^jobs:\s*$/.test(line)) { inJobs = true; continue; }
    if (inJobs && /^\S/.test(line)) { finish(); job = null; inJobs = false; continue; }
    if (!inJobs) continue;

    const start = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (start) {
      finish();
      job = start[1];
      jobLine = i + 1;
      hasTimeout = false;
      isReusable = false;
      timeoutValue = null;
      continue;
    }

    if (job === null) continue;
    if (/^ {4}uses:/.test(line)) isReusable = true;
    const t = line.match(/^ {4}timeout-minutes:\s*(\d+)/);
    if (t) { hasTimeout = true; timeoutValue = Number(t[1]); }
  }
  finish();
}

if (problems.length > 0) {
  console.error("Workflow jobs without a runtime cap:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\nAdd \`timeout-minutes: <n>\` beside each job's \`runs-on:\`, sized to roughly` +
      `\nthree times the job's normal duration. Without it the job inherits 360 minutes.`,
  );
  process.exit(1);
}

console.log(`workflow timeouts: ${checked} jobs checked, all capped`);
