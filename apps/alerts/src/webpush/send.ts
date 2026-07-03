import { base64UrlDecode, utf8Bytes } from '../base64url.js';
import { encryptPushPayload } from './encrypt.js';
import { type VapidKeys, vapidAuthorizationHeader } from './vapid.js';

/** Push services keep undelivered alerts this long; a liquidation warning goes stale fast. */
const PUSH_TTL_SECONDS = 60 * 60;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PushTarget {
  endpoint: string;
  /** Base64url `p256dh` key from the subscription. */
  p256dh: string;
  /** Base64url `auth` secret from the subscription. */
  authKey: string;
}

export interface PushSendResult {
  ok: boolean;
  status: number;
  /** True when the push service says the subscription no longer exists. */
  gone: boolean;
}

/** Encrypt and deliver one payload to one subscription endpoint. */
export async function sendWebPush(
  target: PushTarget,
  payloadJson: string,
  vapid: VapidKeys,
  now: Date,
  fetchImpl: FetchLike = fetch,
): Promise<PushSendResult> {
  const body = await encryptPushPayload(
    utf8Bytes(payloadJson),
    base64UrlDecode(target.p256dh),
    base64UrlDecode(target.authKey),
  );

  const response = await fetchImpl(target.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorizationHeader(target.endpoint, vapid, now),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(PUSH_TTL_SECONDS),
      urgency: 'high',
    },
    body,
  });

  return {
    ok: response.ok,
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  };
}
