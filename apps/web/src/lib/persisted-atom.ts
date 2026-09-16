import { getDefaultStore } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

/**
 * Client UI state that outlives a reload, stored under one localStorage key.
 *
 * The on-disk shape is an envelope — `{ "state": <fields>, "version": <n> }` —
 * and it is deliberately unchanged from what the app has always written. A
 * browser that already holds a user's wallet list keeps it across this change:
 * only the in-memory library differs, never the bytes in localStorage. That
 * also means a rollback reads the same blob back without a migration step.
 *
 * `migrate` runs on every read, not only when the stored version differs. It
 * re-validates the blob against the domain schema, so a tampered or truncated
 * entry is dropped instead of rehydrated. Running it unconditionally costs one
 * parse per load and removes a whole class of "valid version, invalid data"
 * bug.
 */

export type JotaiStore = ReturnType<typeof getDefaultStore>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whether persistence is available at all.
 *
 * Server rendering has no `localStorage`, and a browser in private mode can
 * throw on access rather than return null. Both resolve to "no persisted
 * value", so the atom falls back to its default and the app still renders.
 */
function readRaw(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // A full or blocked quota must not take the app down: the value stays in
    // memory for this session and is simply not persisted.
  }
}

function buildStorage<T>(version: number, migrate: (persisted: unknown) => T) {
  return {
    getItem(key: string, initialValue: T): T {
      const raw = readRaw(key);
      if (raw === null) return initialValue;
      try {
        const envelope: unknown = JSON.parse(raw);
        return migrate(isRecord(envelope) ? envelope.state : undefined);
      } catch {
        return initialValue;
      }
    },
    setItem(key: string, newValue: T): void {
      writeRaw(key, JSON.stringify({ state: newValue, version }));
    },
    removeItem(key: string): void {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.removeItem(key);
      } catch {
        // Nothing to do — the value is already unreachable.
      }
    },
  };
}

/**
 * Build a persisted atom plus the explicit rehydrate its tests need.
 *
 * The atom reads storage when it is first subscribed, not when the module
 * loads. That ordering matters under server rendering: the first client render
 * matches the server's HTML, and the persisted value arrives immediately after,
 * which is the same sequence the app rendered before this change.
 *
 * `rehydrate` re-reads storage, migrates, publishes and writes the migrated
 * value back. The write-back is what strips fields a newer version has dropped,
 * so a stale blob is cleaned up rather than carried forever.
 */
export function persistedAtom<T>(
  key: string,
  version: number,
  initialValue: T,
  migrate: (persisted: unknown) => T,
) {
  const storage = buildStorage(version, migrate);
  const valueAtom = atomWithStorage<T>(key, initialValue, storage);

  function rehydrate(store: JotaiStore = getDefaultStore()): void {
    store.set(valueAtom, storage.getItem(key, initialValue));
  }

  return { valueAtom, rehydrate };
}
