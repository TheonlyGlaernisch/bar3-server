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
import { StoredPushSubscription } from '../interfaces/schemas/Pushsubscriptionschema';

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
  console.log('[pushService] VAPID configured, push notifications enabled');
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
  console.log('[pushService] Subscription saved for user:', usernameLower);
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
 * First tries exact username match, then tries substring matches (for nation names
 * that contain the mentioned word), then tries prefix match as fallback.
 *
 * Stale subscriptions (404/410) are automatically removed.
 * Silently no-ops when VAPID is not configured.
 */
export async function sendToUsername(
  username: string,
  payload: PushPayload
): Promise<void> {
  ensureVapid();
  if (!vapidConfigured) {
    console.warn('[pushService] VAPID not configured, skipping push for:', username);
    return;
  }

  const usernameLower = username.toLowerCase();
  console.log('[pushService] Attempting to send push for user:', usernameLower);

  // First try exact match
  let subs = await StoredPushSubscription.find({ username: usernameLower })
    .lean()
    .exec();
  
  console.log('[pushService] Found', subs.length, 'exact match subscriptions for', usernameLower);

  // If no exact match, try case-insensitive substring/contains match
  // This handles cases where @kinkidom mentions someone with full name "Kinkidom of Ze Baguette"
  if (subs.length === 0) {
    console.log('[pushService] No exact match, trying substring match for:', usernameLower);
    const allSubs = await StoredPushSubscription.find({})
      .lean()
      .exec();
    
    subs = allSubs.filter(sub => 
      sub.username.toLowerCase().includes(usernameLower) ||
      usernameLower.includes(sub.username.toLowerCase())
    );
    
    console.log('[pushService] Found', subs.length, 'substring match subscriptions');
  }

  if (subs.length === 0) {
    console.warn('[pushService] No subscriptions found for:', usernameLower);
    return;
  }

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? `bar3-mention-${Date.now()}`,
  });

  console.log('[pushService] Payload:', data);

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      };
      try {
        console.log('[pushService] Sending to endpoint:', sub.endpoint.slice(0, 50) + '...');
        await webpush.sendNotification(pushSub, data);
        console.log('[pushService] Successfully sent push to:', sub.endpoint.slice(0, 50) + '...');
      } catch (err: any) {
        const status: number | undefined = err?.statusCode ?? err?.status;
        console.error('[pushService] Push send error (status:', status, '):', err?.message ?? err);
        if (status === 404 || status === 410) {
          console.log('[pushService] Removing stale subscription:', sub.endpoint.slice(0, 50) + '...');
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
