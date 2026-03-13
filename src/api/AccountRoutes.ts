import express, { NextFunction, Request, Response } from 'express';
import AccountService from '../services/accountService';
import IAccount from '../interfaces/account';

declare global {
  namespace Express {
    interface Request {
      account?: IAccount;
    }
  }
}

const router = express.Router();

const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  try {
    const account = await AccountService.getOrCreateAccount(apiKey);
    req.account = account;
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to authenticate' });
  }
};

router.get('/account', authenticateApiKey, (req: Request, res: Response) => {
  const account = req.account;

  if (!account) {
    return res.status(500).json({ error: 'Authenticated account missing from request' });
  }

  res.json({
    apiKey: account.apiKey,
    createdAt: account.createdAt,
  });
});

router.post('/api-key/create', async (_req: Request, res: Response) => {
  try {
    const newApiKey = await AccountService.createNewApiKey();
    return res.json({
      success: true,
      apiKey: newApiKey,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create API key' });
  }
});

export default router;
