import { Request, Response, NextFunction } from 'express';
import { resolveDiscordAuth } from '../routers/discord/auth';

/** Paths that are always accessible without Discord authentication. */
const PUBLIC_PREFIXES = [
  '/',
  '/discord-login',
  '/constitution',
  '/js',
  '/css',
  '/img',
  '/fonts',
  '/assets',
  '/manifest.json',
  '/robots.txt',
  '/auth/login',
  '/auth/discord',
  '/auth/session',
  '/auth/logout',
  '/api/v2/auth/login',
  '/api/v2/auth/logout',
  '/api/v2/analytics/l',
  '/api/v2/analytics/p',
  '/analytics/v2/l',
  '/analytics/v2/p',
  '/health',
  '/favicon.ico',
];

/**
 * Express middleware that enforces Discord authentication for all routes.
 *
 * - Browser requests to unprotected paths are passed straight through.
 * - Browser requests to protected paths that have no Discord session are
 *   redirected to /auth/login.
 * - Non-browser (API) requests without a session receive HTTP 401.
 */
export function requireDiscordAuth(req: Request, res: Response, next: NextFunction): void {
  // Allow public paths through unconditionally
  for (const prefix of PUBLIC_PREFIXES) {
    if (req.path === prefix || req.path.startsWith(prefix + '/')) {
      return next();
    }
  }

  const discordAuth = resolveDiscordAuth(req);
  if (discordAuth) {
    res.locals.discordAuth = discordAuth;
    return next();
  }

  // Non-browser / API callers get a JSON 401 so they can handle it programmatically
  const acceptsHtml = req.headers.accept?.includes('text/html') ?? false;
  if (!acceptsHtml) {
    res.status(401).json({ error: 'Discord authentication required' });
    return;
  }

  // Save the originally requested URL so we can bounce back after login
  req.session.discordReturnTo = req.originalUrl;
  res.redirect('/auth/login');
}
