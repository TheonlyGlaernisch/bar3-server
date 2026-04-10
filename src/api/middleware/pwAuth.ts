import { Request, Response, NextFunction } from 'express';
import { PwSession } from '../../interfaces/schemas/PwSessionSchema';
import { PwAccount, IPwAccount } from '../../interfaces/schemas/PwAccountSchema';
import { sha256Hex } from '../../utilities/cryptoBox';

declare global {
  namespace Express {
    interface Request {
      pwAccount?: IPwAccount;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers['authorization'];
  if (!auth || typeof auth !== 'string') return null;
  const parts = auth.split(' ');
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;
  const token = parts[1].trim();
  return token.length ? token : null;
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
  const token = extractBearerToken(req);
  if (!token) {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing bearer token or x-api-key' });
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

  const tokenHash = sha256Hex(token);
  const session = await PwSession.findOne({ tokenHash }).exec();
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const account = await PwAccount.findById(session.accountId).exec();
  if (!account) {
    return res.status(401).json({ error: 'Session account not found' });
  }

  session.lastUsedAt = new Date();
  await session.save().catch(() => undefined);
  account.lastUsedAt = new Date();
  await account.save().catch(() => undefined);

  req.pwAccount = account;
  return next();
}
