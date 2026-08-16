import fs from 'node:fs';
import path from 'node:path';
import { test, type Page, type TestInfo } from '@playwright/test';

/**
 * Minimal, dependency-free Gherkin runner for the shared specs in
 * `tests/features/` at the repo root (see its README for the convention).
 *
 * Supported subset — deliberately small: `Feature:`, scenario-level tags,
 * `Scenario:`, and `Given/When/Then/And/But` steps. No tables, outlines, or
 * backgrounds; if a spec ever needs those, reconsider a real Gherkin dep.
 * Only scenarios tagged `@web` are executed here; `@mobile` scenarios are
 * implemented as Maestro flows in `apps/mobile/.maestro/`.
 */

export interface StepContext {
  page: Page;
  testInfo: TestInfo;
}

type StepFn = (ctx: StepContext, ...captures: string[]) => Promise<void>;

interface StepDefinition {
  pattern: RegExp;
  fn: StepFn;
}

const registry: StepDefinition[] = [];

/** Register a step. Keywords are stripped before matching, so one definition
 * serves Given/When/Then/And/But alike. */
export function defineStep(pattern: RegExp, fn: StepFn): void {
  registry.push({ pattern, fn });
}

interface Scenario {
  name: string;
  tags: string[];
  steps: string[];
}

const STEP_KEYWORD = /^(Given|When|Then|And|But)\s+/;

function parseScenarios(source: string): Scenario[] {
  const scenarios: Scenario[] = [];
  let pendingTags: string[] = [];
  let current: Scenario | null = null;

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('@')) {
      pendingTags = line.split(/\s+/);
      continue;
    }
    if (line.startsWith('Scenario:')) {
      current = { name: line.slice('Scenario:'.length).trim(), tags: pendingTags, steps: [] };
      pendingTags = [];
      scenarios.push(current);
      continue;
    }
    const step = line.replace(STEP_KEYWORD, '');
    if (step !== line && current !== null) {
      current.steps.push(step);
    }
  }
  return scenarios;
}

function resolveStep(text: string): { definition: StepDefinition; captures: string[] } {
  for (const definition of registry) {
    const match = text.match(definition.pattern);
    if (match) {
      return { definition, captures: match.slice(1) };
    }
  }
  throw new Error(
    `No step definition matches: "${text}". Register one with defineStep() in steps.ts.`,
  );
}

/** Load a feature file and register one Playwright test per @web scenario. */
export function runFeature(featureFile: string): void {
  // Playwright's cwd is apps/web (the config directory); the shared specs
  // live two levels up at the repo root.
  const file = path.resolve(process.cwd(), '../../tests/features', featureFile);
  const source = fs.readFileSync(file, 'utf8');

  for (const scenario of parseScenarios(source)) {
    if (!scenario.tags.includes('@web')) continue;

    test(`${featureFile}: ${scenario.name}`, async ({ page }, testInfo) => {
      // Steps that prepare the environment (init scripts) must all be
      // resolvable before any of them runs, so a typo fails fast.
      const resolved = scenario.steps.map(text => ({ text, ...resolveStep(text) }));
      for (const step of resolved) {
        await test.step(step.text, async () => {
          await step.definition.fn({ page, testInfo }, ...step.captures);
        });
      }
    });
  }
}
