/**
 * pushService.ts — server-side Web Push delivery.
 *
 * VAPID keys must be set via environment variables:
 *   VAPID_PUBLIC_KEY   – base64url-encoded EC public key
 *   VAPID_PRIVATE_KEY  – base64url-encoded EC private key
 *   VAPID_SUBJECT      – mailto: or https: contact URI
 *
 * Generate once with:  npx web-push generate-vapid-keys
 */
import webpush from 'web-push';
import { StoredPushSubscription } from '../interfaces/schemas/PushSubscriptionSchema';

const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:admin@example.com').trim();

let vapidConfigured = false;

function ensureVapid(): void {
  if (vapidConfigured) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn(
      '[pushService] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set. ' +
        'Server-push notifications are disabled. ' +
        'Run `npx web-push generate-vapid-keys` and set the env vars to enable them.'
    );
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
}

/**
 * Upsert a push subscription for a given username.
 * Username is always stored lowercase for consistent lookup regardless of
 * the casing of the chat display name.
 */
export async function saveSubscription(
  username: string,
  endpoint: string,
  keys: { p256dh: string; auth: string }
): Promise<void> {
  const usernameLower = username.toLowerCase();
  await StoredPushSubscription.findOneAndUpdate(
    { username: usernameLower, endpoint },
    { username: usernameLower, endpoint, keys, updatedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
}

/**
 * Remove a specific push subscription.
 */
export async function removeSubscription(endpoint: string): Promise<void> {
  await StoredPushSubscription.deleteOne({ endpoint }).exec();
}

/**
 * Send a push notification to all stored subscriptions for the given username.
 * Accepts any casing — always lowercases before lookup so "AdminBob" and
 * "adminbob" both resolve to the same subscriptions.
 *
 * Stale subscriptions (404/410) are automatically removed.
 * Silently no-ops when VAPID is not configured.
 */
export async function sendToUsername(
  username: string,
  payload: PushPayload
): Promise<void> {
  ensureVapid();
  if (!vapidConfigured) return;

  const usernameLower = username.toLowerCase();
  const subs = await StoredPushSubscription.find({ username: usernameLower })
    .lean()
    .exec();
  if (subs.length === 0) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? `bar3-mention-${Date.now()}`,
  });

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      };
      try {
        await webpush.sendNotification(pushSub, data);
      } catch (err: any) {
        const status: number | undefined = err?.statusCode ?? err?.status;
        if (status === 404 || status === 410) {
          await StoredPushSubscription.deleteOne({ endpoint: sub.endpoint })
            .exec()
            .catch(() => undefined);
        } else {
          throw err;
        }
      }
    })
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[pushService] Push delivery failed:', r.reason?.message ?? r.reason);
    }
  }
}

/**
 * Parse all @username mentions out of a chat message.
 * Returns a Set of lowercased usernames (without the @ prefix).
 */
export function extractMentionedUsernames(text: string): Set<string> {
  const mentioned = new Set<string>();
  const re = /@(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    mentioned.add(m[1].toLowerCase());
  }
  return mentioned;
}
