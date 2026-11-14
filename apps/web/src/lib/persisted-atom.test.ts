import { describe as feature, it as scenario, expect, beforeEach, vi, afterEach } from 'vitest';
import { getDefaultStore } from 'jotai';
import { bdd } from './bdd';
import { persistedAtom } from './persisted-atom';

const { given, when, then, and } = bdd;

const store = getDefaultStore();
const KEY = 'stackr-test-blob';
const VERSION = 3;

interface Counter {
  count: number;
}

/** Keeps only a numeric `count`, so anything else in the blob is dropped. */
function migrateCounter(persisted: unknown): Counter {
  if (typeof persisted !== 'object' || persisted === null) return { count: 0 };
  const { count } = Object(persisted);
  return { count: typeof count === 'number' ? count : 0 };
}

function build() {
  return persistedAtom<Counter>(KEY, VERSION, { count: 0 }, migrateCounter);
}

function readEnvelope(): { state?: unknown; version?: unknown } {
  const raw = localStorage.getItem(KEY);
  return raw === null ? {} : JSON.parse(raw);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

feature('persisted atom storage envelope', () => {
  scenario('a written value round-trips through a fresh atom', () => {
    const first = build();
    given('a value written by one atom', () => store.set(first.valueAtom, { count: 7 }));

    const second = build();
    when('a fresh atom rehydrates from the same key', () => second.rehydrate(store));

    then('it reads the written value back', () =>
      expect(store.get(second.valueAtom)).toEqual({ count: 7 }),
    );
  });

  scenario('the stored blob keeps the state-and-version envelope', () => {
    const { valueAtom } = build();
    when('a value is written', () => store.set(valueAtom, { count: 2 }));

    then('the state sits under a state key', () =>
      expect(readEnvelope().state).toEqual({ count: 2 }),
    );
    and('the current version is recorded alongside it', () =>
      expect(readEnvelope().version).toBe(VERSION),
    );
  });

  scenario('a blob written by an older version is migrated on read', () => {
    given('a v1 blob carrying a field this version dropped', () =>
      localStorage.setItem(
        KEY,
        JSON.stringify({ state: { count: 4, removedField: 'stale' }, version: 1 }),
      ),
    );

    const { valueAtom, rehydrate } = build();
    when('the atom rehydrates', () => rehydrate(store));

    then('the surviving field is kept', () => expect(store.get(valueAtom)).toEqual({ count: 4 }));
    and('the dropped field is not written back to storage', () =>
      expect(localStorage.getItem(KEY)).not.toContain('removedField'),
    );
  });

  scenario('an unparseable blob falls back to the default', () => {
    given('a key holding text that is not JSON', () => localStorage.setItem(KEY, 'not json'));

    const { valueAtom, rehydrate } = build();
    when('the atom rehydrates', () => rehydrate(store));

    then('the default value is used', () => expect(store.get(valueAtom)).toEqual({ count: 0 }));
  });

  scenario('a blob with no envelope migrates from undefined rather than throwing', () => {
    given('a bare array where an envelope was expected', () =>
      localStorage.setItem(KEY, JSON.stringify([1, 2, 3])),
    );

    const { valueAtom, rehydrate } = build();
    when('the atom rehydrates', () => rehydrate(store));

    then('the default value is used', () => expect(store.get(valueAtom)).toEqual({ count: 0 }));
  });

  scenario('storage that refuses to read leaves the app on its defaults', () => {
    given('a browser whose localStorage throws on read', () =>
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('access denied');
      }),
    );

    const { valueAtom, rehydrate } = build();
    when('the atom rehydrates', () => rehydrate(store));

    then('the default value is used instead of an error', () =>
      expect(store.get(valueAtom)).toEqual({ count: 0 }),
    );
  });

  scenario('storage that refuses to write keeps the value in memory', () => {
    given('a browser whose localStorage throws on write', () =>
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      }),
    );

    const { valueAtom } = build();
    when('a value is written', () => store.set(valueAtom, { count: 9 }));

    then('the session still sees it', () => expect(store.get(valueAtom)).toEqual({ count: 9 }));
  });
});
