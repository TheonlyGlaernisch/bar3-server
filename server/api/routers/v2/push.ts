/**
 * /api/v2/push — Web Push subscription management.
 *
 * GET    /api/v2/push/vapid-key    — returns the VAPID public key (unauthenticated)
 * POST   /api/v2/push/subscribe    — register or refresh a push subscription
 * DELETE /api/v2/push/subscribe    — remove a specific push subscription
 */
import express, { Request, Response } from 'express';
import {
  getVapidPublicKey,
  removeSubscription,
  saveSubscription,
} from '../../../services/pushService';
import { resolveChatAccess } from '../../../services/chatServer';

const router = express.Router();
router.use(express.json());

/** Resolve the authenticated chat username from the session. */
async function requireChatUsername(req: Request, res: Response): Promise<string | null> {
  const session = (req as any).session ?? null;
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  const access = await resolveChatAccess(session);
  if (!access) {
    res.status(403).json({ error: 'Chat access required to register push notifications' });
    return null;
  }
  return access.username;
}

/**
 * GET /api/v2/push/vapid-key
 * Returns the server's VAPID public key so clients can call
 * pushManager.subscribe({ applicationServerKey: publicKey }).
 * This endpoint is intentionally unauthenticated — the key is public.
 */
router.get('/vapid-key', (_req: Request, res: Response) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(503).json({
      error:
        'Push notifications are not configured on this server. ' +
        'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.',
    });
  }
  return res.status(200).json({ publicKey: key });
});

/**
 * POST /api/v2/push/subscribe
 * Body: { endpoint: string, keys: { p256dh: string, auth: string } }
 *
 * Stores (or refreshes) a Web Push subscription tied to the current user's
 * chat username. The server will use this to deliver @mention notifications
 * even when the client is closed or in the background.
 */
router.post('/subscribe', async (req: Request, res: Response) => {
  const username = await requireChatUsername(req, res);
  if (!username) return;

  const { endpoint, keys } = req.body ?? {};
  if (
    typeof endpoint !== 'string' ||
    !endpoint ||
    typeof keys?.p256dh !== 'string' ||
    !keys.p256dh ||
    typeof keys?.auth !== 'string' ||
    !keys.auth
  ) {
    return res
      .status(400)
      .json({ error: 'Invalid push subscription: endpoint and keys.p256dh / keys.auth are required' });
  }

  await saveSubscription(username, endpoint, { p256dh: keys.p256dh, auth: keys.auth });
  return res.status(204).end();
});

/**
 * DELETE /api/v2/push/subscribe
 * Body: { endpoint: string }
 *
 * Removes a specific subscription (e.g. when the user explicitly disables
 * notifications or the browser invalidates the subscription).
 */
router.delete('/subscribe', async (req: Request, res: Response) => {
  const { endpoint } = req.body ?? {};
  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ error: 'endpoint is required' });
  }
  await removeSubscription(endpoint);
  return res.status(204).end();
});

export default router;
