import { Request, Response, NextFunction } from 'express';
import { PwAccount, IPwAccount } from '../../interfaces/schemas/PwAccountSchema';
import { sha256Hex } from '../../utilities/cryptoBox';

declare global {
  namespace Express {
    interface Request {
      pwAccount?: IPwAccount;
    }
  }
}

function extractApiKey(req: Request): string | null {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();

  const bodyKey = (req.body as any)?.apiKey;
  if (typeof bodyKey === 'string' && bodyKey.trim()) return bodyKey.trim();

  const queryKey = req.query?.apiKey;
  if (typeof queryKey === 'string' && queryKey.trim()) return queryKey.trim();

  return null;
}

export async function requirePwSession(req: Request, res: Response, next: NextFunction) {
  const sessionAccountId = typeof req.session?.pwAccountId === 'string'
    ? req.session.pwAccountId.trim()
    : '';
  if (sessionAccountId) {
    const accountBySession = await PwAccount.findById(sessionAccountId).exec();
    if (accountBySession) {
      accountBySession.lastUsedAt = new Date();
      await accountBySession.save().catch(() => undefined);
      req.pwAccount = accountBySession;
      return next();
    }
  }

  const apiKey = extractApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing authenticated session or x-api-key' });
  }

  const pwApiKeyHash = sha256Hex(apiKey);
  const accountByApiKey = await PwAccount.findOne({ pwApiKeyHash }).exec();
  if (!accountByApiKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  accountByApiKey.lastUsedAt = new Date();
  await accountByApiKey.save().catch(() => undefined);
  req.pwAccount = accountByApiKey;
  return next();
}
