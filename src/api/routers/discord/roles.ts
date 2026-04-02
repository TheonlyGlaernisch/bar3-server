import express, { Request, Response } from 'express';
import superagent from 'superagent';

const router = express.Router();

const FLAME_BOT_API_URL = (process.env.FLAME_BOT_API_URL || '').replace(/\/$/, '');
const FLAME_BOT_API_KEY = process.env.FLAME_BOT_API_KEY || '';

/**
 * GET /api/roles/:discordId
 *
 * Proxies a role-check request to flame_bot on behalf of the authenticated
 * browser client.  The caller must already hold a valid Discord session
 * (enforced by the global requireDiscordAuth middleware in src/index.ts).
 */
router.get('/:discordId', async (req: Request, res: Response) => {
  if (!FLAME_BOT_API_URL) {
    return res.status(503).json({ error: 'Role service is not configured on this server.' });
  }
  if (!FLAME_BOT_API_KEY) {
    return res.status(503).json({ error: 'Role service API key is not configured on this server.' });
  }

  const { discordId } = req.params;

  // Validate that discordId is a Discord snowflake (1–20 digit numeric string)
  // before embedding it in an outbound URL to prevent SSRF.
  if (!/^\d{1,20}$/.test(discordId)) {
    return res.status(400).json({ error: 'Invalid Discord user ID.' });
  }

  try {
    const rolesRes = await superagent
      .get(`${FLAME_BOT_API_URL}/api/roles/${discordId}`)
      .set('X-API-Key', FLAME_BOT_API_KEY);

    return res.status(200).json(rolesRes.body);
  } catch (err: any) {
    const status = err?.response?.status || 500;
    // Return a safe, generic error rather than forwarding flame_bot internals.
    const message =
      status === 404 ? 'User not found.' :
      status === 403 ? 'Access denied.' :
      'Failed to fetch roles. Please try again later.';
    return res.status(status).json({ error: message });
  }
});

export default router;
