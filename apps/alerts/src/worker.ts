import { z } from 'zod';
import { readPosition } from './health.js';
import {
  deletePushSubscription,
  fetchPushSubscriptions,
  fetchSweepSubscriptions,
  insertAlertEvents,
  saveSubscriptionState,
  type SupabaseServiceConfig,
} from './supabase.js';
import { runSweep } from './sweep.js';
import { sendWebPush } from './webpush/send.js';

/**
 * The alerts Worker: a cron sweep and nothing else. No HTTP surface exists on
 * purpose — the service-role key must never sit behind an endpoint.
 */

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().default('mailto:pete@cteic.ie'),
});

// Typed structurally rather than against @cloudflare/workers-types (see
// tsconfig.json); wrangler validates the handler shape at deploy time.
const worker = {
  async fetch(): Promise<Response> {
    return new Response('not found', { status: 404 });
  },

  async scheduled(_controller: unknown, env: unknown): Promise<void> {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) {
      // Name only the missing variables — never a value.
      const missing = parsed.error.issues.map(issue => issue.path.join('.')).join(', ');
      console.error(`alerts: refusing to run — env invalid (${missing})`);
      return;
    }

    const config: SupabaseServiceConfig = {
      url: parsed.data.SUPABASE_URL,
      serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    };
    const vapid = {
      publicKey: parsed.data.VAPID_PUBLIC_KEY,
      privateKey: parsed.data.VAPID_PRIVATE_KEY,
      subject: parsed.data.VAPID_SUBJECT,
    };

    const summary = await runSweep({
      listSubscriptions: () => fetchSweepSubscriptions(config),
      listPushSubscriptions: userIds => fetchPushSubscriptions(config, userIds),
      readPosition,
      sendPush: (target, payload) =>
        sendWebPush(
          { endpoint: target.endpoint, p256dh: target.p256dh, authKey: target.auth_key },
          JSON.stringify(payload),
          vapid,
          new Date(),
        ),
      saveState: (subscriptionId, state) => saveSubscriptionState(config, subscriptionId, state),
      logEvents: events => insertAlertEvents(config, events),
      removePushSubscription: pushSubscriptionId =>
        deletePushSubscription(config, pushSubscriptionId),
      now: () => new Date(),
    });

    console.log(
      `alerts: sweep done — ${summary.subscriptions} subscriptions, ${summary.notified} notified, ${summary.deliveries} delivered, ${summary.failures} failures`,
    );
  },
};

export default worker;
