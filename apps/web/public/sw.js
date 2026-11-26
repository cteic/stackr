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

/**
 * Only ever open a page of this app. A push payload's `url` is reduced to a
 * same-origin path, so a payload can never send the user to another site;
 * anything else falls back to the home page.
 */
function sameOriginPath(raw) {
  try {
    const target = new sw.URL(raw, sw.location.origin);
    if (target.origin !== sw.location.origin) {
      return '/';
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

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
  const url = typeof payload.url === 'string' ? sameOriginPath(payload.url) : '/';
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
      ? sameOriginPath(event.notification.data.url)
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
