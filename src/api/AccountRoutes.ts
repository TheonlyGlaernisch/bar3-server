import express, { Request, Response } from 'express';
import AccountService from '../services/AccountService';

const router = express.Router();

const authenticateApiKey = async (req: Request, res: Response, next: Function) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  try {
    const account = await AccountService.getOrCreateAccount(apiKey);
    (req as any).account = account;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to authenticate' });
  }
};

router.get('/account', authenticateApiKey, (req: Request, res: Response) => {
  const account = (req as any).account;
  res.json({
    apiKey: account.apiKey,
    customMessage: account.customMessage,
    createdAt: account.createdAt
  });
});

router.post('/account/message', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }

    const account = (req as any).account;
    const updated = await AccountService.updateCustomMessage(account.apiKey, message);
    res.json({
      success: true,
      customMessage: updated?.customMessage
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update message' });
  }
});

router.post('/api-key/create', async (req: Request, res: Response) => {
  try {
    const newApiKey = await AccountService.createNewApiKey();
    res.json({
      success: true,
      apiKey: newApiKey
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

export default router;
