import { describe, expect, it } from 'vitest';
import {
  buildShareMessage,
  CLIPBOARD_CLEAR_MS,
  createExpiringClipboard,
  type ClipboardModule,
  type Scheduler,
} from './phrase-export';

const PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';

function mockClipboard(): ClipboardModule & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    setStringAsync: value => {
      writes.push(value);
      return Promise.resolve(true);
    },
  };
}

/** Manual scheduler: fire() runs every pending callback; cancels are tracked. */
function manualScheduler(): { schedule: Scheduler; fire(): void; pending(): number } {
  let queue: Array<{ fn: () => void; cancelled: boolean }> = [];
  return {
    schedule: fn => {
      const entry = { fn, cancelled: false };
      queue.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    fire() {
      const due = queue.filter(entry => !entry.cancelled);
      queue = [];
      for (const entry of due) entry.fn();
    },
    pending() {
      return queue.filter(entry => !entry.cancelled).length;
    },
  };
}

describe('buildShareMessage', () => {
  it('labels the entry and carries the phrase verbatim', () => {
    const message = buildShareMessage(PHRASE);
    expect(message).toContain('Stackr Wallet recovery phrase');
    expect(message.endsWith(PHRASE)).toBe(true);
  });
});

describe('createExpiringClipboard', () => {
  it('copies the phrase and overwrites the clipboard when the timer fires', async () => {
    const clipboard = mockClipboard();
    const timer = manualScheduler();
    const expiring = createExpiringClipboard(clipboard, timer.schedule);

    await expiring.copy(PHRASE);
    expect(clipboard.writes).toEqual([PHRASE]);
    expect(timer.pending()).toBe(1);

    timer.fire();
    expect(clipboard.writes).toEqual([PHRASE, '']);
  });

  it('re-copy cancels the previous expiry so only one clear lands', async () => {
    const clipboard = mockClipboard();
    const timer = manualScheduler();
    const expiring = createExpiringClipboard(clipboard, timer.schedule);

    await expiring.copy(PHRASE);
    await expiring.copy(PHRASE);
    expect(timer.pending()).toBe(1);

    timer.fire();
    expect(clipboard.writes).toEqual([PHRASE, PHRASE, '']);
  });

  it('clearNow overwrites immediately and cancels the pending expiry', async () => {
    const clipboard = mockClipboard();
    const timer = manualScheduler();
    const expiring = createExpiringClipboard(clipboard, timer.schedule);

    await expiring.copy(PHRASE);
    await expiring.clearNow();
    expect(clipboard.writes).toEqual([PHRASE, '']);
    expect(timer.pending()).toBe(0);

    timer.fire();
    expect(clipboard.writes).toEqual([PHRASE, '']);
  });

  it('uses a 60s default expiry', () => {
    expect(CLIPBOARD_CLEAR_MS).toBe(60_000);
  });
});
