import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * L1 regression (staff review round 2, #141): the service worker must only
 * ever open a page of this app, whatever `url` a push payload carries.
 */

const SOURCE = readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://stackr.ie';

type Listener = (event: unknown) => void;

function loadWorker() {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; data: { url: string } }[] = [];
  const openWindow = vi.fn(() => Promise.resolve(undefined));
  const scope = {
    URL,
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    registration: {
      showNotification: (title: string, options: { data: { url: string } }) => {
        shown.push({ title, data: options.data });
        return Promise.resolve();
      },
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve([]),
      openWindow,
    },
  };
  // sw.js reads its scope from `globalThis`; hand it the stub instead.
  new Function('globalThis', SOURCE)(scope);

  async function push(payload: unknown): Promise<string | undefined> {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get('push')?.({
      data: { json: () => payload },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    return shown.at(-1)?.data.url;
  }

  async function click(url: unknown): Promise<unknown> {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get('notificationclick')?.({
      notification: { close: () => undefined, data: { url } },
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
    return openWindow.mock.calls.at(-1)?.at(0);
  }

  return { push, click };
}

describe('service worker push url', () => {
  it('keeps a same-origin path, query and hash', async () => {
    const { push } = loadWorker();
    await expect(push({ title: 'Alert', url: '/wallet/stx/SP1?tab=health#zest' })).resolves.toBe(
      '/wallet/stx/SP1?tab=health#zest',
    );
  });

  it('reduces an absolute same-origin url to its path', async () => {
    const { push } = loadWorker();
    await expect(push({ title: 'Alert', url: `${ORIGIN}/holdings` })).resolves.toBe('/holdings');
  });

  it('never keeps another origin', async () => {
    const { push } = loadWorker();
    await expect(push({ title: 'Alert', url: 'https://evil.example/login' })).resolves.toBe('/');
    await expect(push({ title: 'Alert', url: '//evil.example/login' })).resolves.toBe('/');
    await expect(push({ title: 'Alert', url: 'javascript:alert(1)' })).resolves.toBe('/');
  });

  it('opens only a same-origin path on click, even from tampered notification data', async () => {
    const { click } = loadWorker();
    await expect(click('https://evil.example/')).resolves.toBe('/');
    await expect(click('/market')).resolves.toBe('/market');
  });
});
