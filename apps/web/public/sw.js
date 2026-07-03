/**
 * Stackr service worker: receives liquidation-alert pushes from the alerts
 * Worker and opens the app on click. Deliberately minimal — no caching or
 * offline behaviour yet, so the web app's network story stays unchanged.
 *
 * The worker global scope is addressed through `globalThis` (`sw` below)
 * rather than `self`, which repo-root lint runs don't recognise.
 */

const sw = globalThis;

sw.addEventListener('install', () => {
  sw.skipWaiting();
});

sw.addEventListener('activate', event => {
  event.waitUntil(sw.clients.claim());
});

sw.addEventListener('push', event => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || typeof payload !== 'object' || typeof payload.title !== 'string') {
    return;
  }

  const body = typeof payload.body === 'string' ? payload.body : '';
  const url = typeof payload.url === 'string' ? payload.url : '/';
  const tag = typeof payload.tag === 'string' ? payload.tag : undefined;

  event.waitUntil(
    sw.registration.showNotification(payload.title, {
      body,
      tag,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: { url },
    }),
  );
});

sw.addEventListener('notificationclick', event => {
  event.notification.close();
  const url =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/';

  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return sw.clients.openWindow(url);
    }),
  );
});
