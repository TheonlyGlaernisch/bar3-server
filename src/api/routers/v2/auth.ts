import express, { Request, Response } from 'express';
import { loginWithPwApiKey } from '../../../services/pwAccountService';

const router = express.Router();

router.post('/login', async (req: Request, res: Response) => {
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  try {
    const result = await loginWithPwApiKey(apiKey);
    req.session.pwAccountId = result.accountId;
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to persist session' });
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
  delete req.session.pwAccountId;
  req.session.save((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to persist session' });
    }
    return res.status(204).end();
  });
});

export default router;
