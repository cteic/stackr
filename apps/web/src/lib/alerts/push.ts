import { z } from 'zod';

/**
 * Browser-side web-push plumbing: turn the VAPID public key into the
 * `applicationServerKey` bytes, subscribe via the service worker, and extract
 * the row `push_subscriptions` stores. The push keys come out of
 * `PushSubscription.toJSON()`, which is untrusted-shaped enough to validate.
 */

/** Decode a base64url VAPID public key into the bytes PushManager expects. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  // Backed by an explicit ArrayBuffer so the result satisfies BufferSource
  // (PushManager's applicationServerKey) under TS's generic typed arrays.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

const PushSubscriptionJsonSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  authKey: string;
}

/** Validate a subscription's JSON form and pull out the stored fields. */
export function extractSubscriptionKeys(subscriptionJson: unknown): PushSubscriptionKeys {
  const parsed = PushSubscriptionJsonSchema.safeParse(subscriptionJson);
  if (!parsed.success) {
    throw new Error('alerts: push subscription missing endpoint or keys');
  }
  return {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    authKey: parsed.data.keys.auth,
  };
}

/** Register (or reuse) the service worker and return a push subscription. */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionKeys> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('alerts: this browser does not support web push');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('alerts: notification permission was not granted');
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  return extractSubscriptionKeys(subscription.toJSON());
}

/** Unsubscribe this browser; returns the endpoint that was removed, if any. */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription === null) {
    return null;
  }
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}
