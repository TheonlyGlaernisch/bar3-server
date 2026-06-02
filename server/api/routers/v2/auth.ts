import express, { Request, Response } from 'express';
import { loginWithPwApiKey } from '../../../services/pwAccountService';
import { isTrustedOrigin } from '../../middleware/sameOrigin';

const router = express.Router();

router.post('/login', async (req: Request, res: Response) => {
  if (!isTrustedOrigin(req)) {
    return res.status(403).json({ error: 'Blocked by same-origin policy' });
  }
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  try {
    const result = await loginWithPwApiKey(apiKey);
    req.session.pwAccountId = result.accountId;
    return req.session.save((err) => {
      if (err) {
        console.error('[v2/auth] Failed to persist login session:', err);
        return res.status(500).json({ error: 'Failed to persist login session' });
      }
      return res.status(200).json({
        accountId: result.accountId,
      });
    });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500;
    return res.status(status).json({ error: e?.message || 'Login failed' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  if (!isTrustedOrigin(req)) {
    return res.status(403).json({ error: 'Blocked by same-origin policy' });
  }
  delete req.session.pwAccountId;
  return req.session.save((err) => {
    if (err) {
      console.error('[v2/auth] Failed to persist logout session:', err);
      return res.status(500).json({ error: 'Failed to persist logout session' });
    }
    return res.status(204).end();
  });
});

export default router;
