import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { IPnwNativeAccount } from '../../interfaces/schemas/PnwNativeAccountSchema';
import {
  confirmCredentialResetVerification,
  confirmVerification,
  login,
  startCredentialResetVerification,
  startVerification,
} from '../../services/pnwNativeAuthService';

const router = express.Router();

function jsonRateLimit(max: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
    },
  });
}

const registerLimiter = jsonRateLimit(5, 15 * 60 * 1000);
const verifyLimiter = jsonRateLimit(10, 10 * 60 * 1000);
const loginLimiter = jsonRateLimit(10, 15 * 60 * 1000);
const resetRequestLimiter = jsonRateLimit(5, 15 * 60 * 1000);
const resetConfirmLimiter = jsonRateLimit(10, 10 * 60 * 1000);

function parseNationId(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) return Math.trunc(input);
  if (typeof input === 'string' && input.trim()) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

function setNativeSession(req: Request, account: IPnwNativeAccount): void {
  req.session.discordAuthenticated = true;
  req.session.discordUserId = `pnw:${account.nationId}`;
  req.session.discordUsername = account.username;
  req.session.discordRoles = {
    verified: false,
    bar3_client: false,
    bar3_server: false,
    member_guild: true,
  };
  req.session.pnwNativeAuthenticated = true;
  req.session.pnwNativeAccountId = account._id.toString();
  req.session.pnwNativeNationId = account.nationId;
  req.session.pnwNativeUsername = account.username;
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  const nationId = parseNationId(req.body?.nationId);
  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const result = await startVerification(nationId, username, password);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(200).json({ ok: true, message: 'Verification code sent to your Politics and War inbox.' });
});

router.post('/verify', verifyLimiter, async (req: Request, res: Response) => {
  const nationId = parseNationId(req.body?.nationId);
  const code = typeof req.body?.code === 'string' ? req.body.code : '';

  const result = await confirmVerification(nationId, code);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  try {
    await regenerateSession(req);
    setNativeSession(req, result.account);
    await saveSession(req);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to establish session.' });
  }
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const result = await login(username, password);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  try {
    await regenerateSession(req);
    setNativeSession(req, result.account);
    await saveSession(req);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to establish session.' });
  }
});

router.post('/reset/request', resetRequestLimiter, async (req: Request, res: Response) => {
  const nationId = parseNationId(req.body?.nationId);
  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const result = await startCredentialResetVerification(nationId, username, password);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.status(200).json({ ok: true, message: 'Reset verification code sent to your Politics and War inbox.' });
});

router.post('/reset/confirm', resetConfirmLimiter, async (req: Request, res: Response) => {
  const nationId = parseNationId(req.body?.nationId);
  const code = typeof req.body?.code === 'string' ? req.body.code : '';

  const result = await confirmCredentialResetVerification(nationId, code);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  try {
    await regenerateSession(req);
    setNativeSession(req, result.account);
    await saveSession(req);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to establish session.' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((error) => {
    if (error) {
      res.status(500).json({ error: 'Failed to destroy session.' });
      return;
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ ok: true });
  });
});

router.get('/session', (req: Request, res: Response) => {
  const authenticated = req.session.pnwNativeAuthenticated === true;
  res.status(200).json({
    ok: true,
    authenticated,
    account: authenticated
      ? {
        accountId: req.session.pnwNativeAccountId,
        nationId: req.session.pnwNativeNationId,
        username: req.session.pnwNativeUsername,
      }
      : null,
  });
});

export default router;
