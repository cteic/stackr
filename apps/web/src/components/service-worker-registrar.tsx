'use client';

import { useEffect } from 'react';

/**
 * Registers the push service worker once per page load. Rendered from the root
 * layout so a subscribed browser keeps receiving alerts no matter which page
 * it lands on. No-ops where service workers aren't available (SSR, the
 * Capacitor WebView, old browsers).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing (private mode, unsupported) must never break the app.
    });
  }, []);

  return null;
}
