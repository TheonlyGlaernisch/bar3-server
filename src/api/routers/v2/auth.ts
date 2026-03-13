import express, { Request, Response } from 'express';
import { loginWithPwApiKey } from '../../../services/pwAccountService';

const router = express.Router();

router.post('/login', async (req: Request, res: Response) => {
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  try {
    const result = await loginWithPwApiKey(apiKey);
    return res.status(200).json({ token: result.token, accountId: result.accountId });
  } catch (e: any) {
    const status = typeof e?.status === 'number' ? e.status : 500;
    return res.status(status).json({ error: e?.message || 'Login failed' });
  }
});

export default router;

