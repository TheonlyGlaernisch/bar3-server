import express, { NextFunction, Request, Response } from 'express';
import superagent from 'superagent';
import crypto from 'crypto';

const router = express.Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';
const CLIENT_APP_URL = (process.env.CLIENT_APP_URL || '').trim().replace(/\/$/, '');

type AllowedReturnToUrl = {
  origin: string;
  pathPrefix: string;
};

function normalizePathPrefix(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '');
}

function parseAllowedReturnToUrl(value: string): AllowedReturnToUrl | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return {
      origin: parsed.origin,
      pathPrefix: normalizePathPrefix(parsed.pathname),
    };
  } catch {
    return null;
  }
}

function parseConfiguredReturnToAllowlist(): AllowedReturnToUrl[] {
  const raw = (process.env.DISCORD_RETURN_TO_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (CLIENT_APP_URL) {
    raw.push(CLIENT_APP_URL);
  }

  const seen = new Set<string>();
  const allowed: AllowedReturnToUrl[] = [];
  for (const candidate of raw) {
    const parsed = parseAllowedReturnToUrl(candidate);
    if (!parsed) continue;
    const key = `${parsed.origin}${parsed.pathPrefix}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allowed.push(parsed);
  }
  return allowed;
}

const ALLOWED_ABSOLUTE_RETURN_TO = parseConfiguredReturnToAllowlist();

// flame_bot HTTP API — used to check whether the user holds the bar3_server role.
// Set FLAME_BOT_API_URL to the base URL of the running flame_bot (e.g. http://localhost:8080)
// and FLAME_BOT_API_KEY to the same secret configured in flame_bot's API_KEY env var.
const FLAME_BOT_API_URL = (process.env.FLAME_BOT_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const FLAME_BOT_API_KEY = process.env.FLAME_BOT_API_KEY || '';

// After a successful OAuth2 login the browser redirects to either:
// - a validated relative path (same-origin), or
// - an explicitly allow-listed absolute URL.

// Comma-separated Discord user IDs that bypass all command role requirements in
// flame_bot (ADMIN_DISCORD_IDS).  When a logged-in user's Discord ID appears in
// this list, the /auth/session response includes isAdmin:true so the bar3-client
// can show admin-only UI (e.g. the bot management tab).
// Set to the same value as ADMIN_DISCORD_IDS in the flame_bot .env.
// Example: ADMIN_DISCORD_IDS=123456789012345678,987654321098765432
const ADMIN_DISCORD_IDS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

const AUTH_CHECK_WINDOW_MS = 60 * 1000;
const AUTH_CHECK_MAX_REQUESTS = 20;
const RATE_LIMIT_MAP_CLEANUP_THRESHOLD = 1000;
const authCheckRateLimit = new Map<string, { count: number; resetAt: number }>();

export type DiscordAuthContext = {
  discordUserId: string;
  discordUsername: string;
  discordRoles: {
    verified: boolean;
    bar3_client: boolean;
    bar3_server: boolean;
    member_guild: boolean;
  };
};

function toBase64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = toBase64Url(crypto.randomBytes(32));
  const codeChallenge = toBase64Url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function resolveDiscordAuth(req: Request): DiscordAuthContext | null {
  if (req.session?.discordAuthenticated === true && req.session.discordUserId) {
    return {
      discordUserId: req.session.discordUserId,
      discordUsername: req.session.discordUsername || '',
      discordRoles: {
        verified: req.session.discordRoles?.verified === true,
        bar3_client: req.session.discordRoles?.bar3_client === true,
        bar3_server: req.session.discordRoles?.bar3_server === true,
        member_guild: req.session.discordRoles?.member_guild === true,
      },
    };
  }
  return null;
}

function buildDiscordRoles(flameBotRoles: Record<string, unknown>): DiscordAuthContext['discordRoles'] {
  return {
    verified: flameBotRoles.verified === true,
    bar3_client: flameBotRoles.bar3_client === true,
    bar3_server: flameBotRoles.bar3_server === true,
    member_guild: flameBotRoles.member_guild === true,
  };
}

function buildSessionRoleNames(discordRoles: DiscordAuthContext['discordRoles'], isAdmin: boolean): string[] {
  const roleNames: string[] = [];
  if (discordRoles.bar3_client || discordRoles.bar3_server) {
    roleNames.push('user');
  }
  if (discordRoles.member_guild) {
    roleNames.push('member');
  }
  if (isAdmin) {
    roleNames.push('admin');
  }
  return roleNames;
}

function getRateLimitKey(req: Request): string {
  // app.set('trust proxy', 1) is configured in src/index.ts, so req.ip reflects
  // the client IP from the trusted upstream proxy.
  return req.ip || 'unknown-ip';
}

function cleanupRateLimitEntries(now: number): void {
  for (const [key, value] of authCheckRateLimit) {
    if (value.resetAt <= now) {
      authCheckRateLimit.delete(key);
    }
  }
}

function authCheckLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = getRateLimitKey(req);
  const now = Date.now();
  if (authCheckRateLimit.size > RATE_LIMIT_MAP_CLEANUP_THRESHOLD) {
    cleanupRateLimitEntries(now);
  }
  const current = authCheckRateLimit.get(key);
  if (!current || current.resetAt <= now) {
    authCheckRateLimit.set(key, { count: 1, resetAt: now + AUTH_CHECK_WINDOW_MS });
    next();
    return;
  }

  current.count += 1;
  if (current.count > AUTH_CHECK_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({
      error: `Too many authentication checks. Please retry after ${retryAfterSeconds} seconds.`,
    });
    return;
  }

  authCheckRateLimit.set(key, current);
  next();
}

/**
 * Return true only for safe relative-path redirects (no protocol or host).
 * Rejects protocol-relative URLs (//evil.com) and absolute URLs.
 */
function isSafeReturnTo(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}

function isAllowedAbsoluteReturnTo(url: URL): boolean {
  return ALLOWED_ABSOLUTE_RETURN_TO.some((allowed) => {
    if (url.origin !== allowed.origin) return false;
    const normalizedPath = normalizePathPrefix(url.pathname);
    if (allowed.pathPrefix === '/') return true;
    return normalizedPath === allowed.pathPrefix || normalizedPath.startsWith(`${allowed.pathPrefix}/`);
  });
}

function normalizeReturnTo(input: unknown): string | null {
  if (typeof input !== 'string' || !input) return null;

  let current = input;
  // Some clients nest/encode return paths multiple times. Try to decode a few times.
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }

  // If the incoming path is itself an auth/login URL with redirect/returnTo,
  // unwrap to the final destination.
  if (current.startsWith('/auth/login?') || current.startsWith('/login?')) {
    const query = current.split('?', 2)[1] || '';
    const params = new URLSearchParams(query);
    const nested = params.get('redirect') || params.get('returnTo');
    if (nested) {
      const normalizedNested = normalizeReturnTo(nested);
      if (normalizedNested) return normalizedNested;
    }
  }

  if (isSafeReturnTo(current)) {
    return current;
  }

  try {
    const absolute = new URL(current);
    return isAllowedAbsoluteReturnTo(absolute) ? absolute.toString() : null;
  } catch {
    return null;
  }
}


const ACCESS_DENIED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bar3 — Access Denied</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #1a1a2e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e0e0e0;
    }
    .card {
      background: #16213e;
      border: 1px solid #3d1515;
      border-radius: 12px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    h1 { font-size: 1.8rem; margin-bottom: 16px; color: #ff8080; }
    p { color: #a0a0b0; margin-bottom: 28px; font-size: 0.95rem; line-height: 1.6; }
    a { color: #5865F2; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Access Denied</h1>
    <p>You do not have the required role in the Bar3 Discord server to access this application.</p>
    <p><a href="/auth/login">← Back to login</a></p>
  </div>
</body>
</html>`;

/** GET /auth/login — show the login page */
router.get('/login', (req: Request, res: Response) => {
  const error = typeof req.query.error === 'string' ? req.query.error : '';
  const loginReturnTo = normalizeReturnTo(req.query.returnTo);
  if (loginReturnTo) {
    req.session.discordReturnTo = loginReturnTo;
  }

  let destination = '/discord-login';
  if (loginReturnTo) {
    destination = `${destination}?returnTo=${encodeURIComponent(loginReturnTo)}`;
  }
  if (error) {
    const separator = destination.includes('?') ? '&' : '?';
    destination = `${destination}${separator}error=${encodeURIComponent(error)}`;
  }
  return res.redirect(destination);
});

/** GET /auth/discord — redirect to Discord OAuth2 authorization */
router.get('/discord', (req: Request, res: Response) => {
  if (!DISCORD_CLIENT_ID) {
    return res.status(500).send('DISCORD_CLIENT_ID is not configured on this server.');
  }
  // If the SPA passes a ?returnTo= param (its current client-side route), save it in
  // the session so the callback can return the user to that path on this same origin.
  const returnTo = normalizeReturnTo(req.query.returnTo);
  if (returnTo) {
    req.session.discordReturnTo = returnTo;
  }
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    // Only 'identify' is needed — role verification is delegated to flame_bot.
    scope: 'identify',
  });
  const { codeVerifier, codeChallenge } = buildPkcePair();
  req.session.discordCodeVerifier = codeVerifier;
  params.set('code_challenge', codeChallenge);
  params.set('code_challenge_method', 'S256');
  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

/** GET /auth/discord/callback — handle OAuth2 callback */
router.get('/discord/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    return res.redirect('/auth/login?error=no_code');
  }

  try {
    const codeVerifier = req.session.discordCodeVerifier;
    if (!codeVerifier) {
      console.error('[Discord Auth] Missing PKCE code_verifier in session during callback.');
      return res.redirect('/auth/login?error=auth_failed');
    }

    // Exchange authorization code for access token
    const tokenRes = await superagent
      .post('https://discord.com/api/oauth2/token')
      .type('form')
      .send({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
        code_verifier: codeVerifier,
      });
    delete req.session.discordCodeVerifier;

    const accessToken: string = tokenRes.body.access_token;

    // Fetch the user's own Discord profile (requires only 'identify' scope).
    const meRes = await superagent
      .get('https://discord.com/api/users/@me')
      .set('Authorization', `Bearer ${accessToken}`);

    const discordId: string = meRes.body.id;
    const discordUsername: string = meRes.body.username;

    if (!discordId) {
      return res.redirect('/auth/login?error=auth_failed');
    }

    // Ask flame_bot whether this Discord user holds bar3 roles.
    // flame_bot keeps guild membership up-to-date via the Discord gateway, so
    // we do not need the guilds.members.read scope on the user's token.
    // Timeouts: 10 s to receive the first response byte, 15 s total deadline,
    // so the callback never hangs if flame_bot is temporarily unreachable.
    let flameBotRoles: Record<string, unknown> = {};
    try {
      const rolesRes = await superagent
        .get(`${FLAME_BOT_API_URL}/api/roles/${discordId}`)
        .set('X-API-Key', FLAME_BOT_API_KEY)
        .timeout({ response: 10000, deadline: 15000 });
      flameBotRoles = (rolesRes.body?.roles ?? {}) as Record<string, unknown>;
    } catch (roleErr: unknown) {
      console.error(
        '[Discord Auth] flame_bot role check failed:',
        (roleErr as any)?.response?.body || (roleErr as any)?.message || roleErr,
      );
      return res.redirect('/auth/login?error=role_check_failed');
    }

    // Grant access to users with bar3_client, bar3_server, or configured member-guild role.
    const discordRoles = buildDiscordRoles(flameBotRoles);
    const hasAccess: boolean =
      discordRoles.bar3_client || discordRoles.bar3_server || discordRoles.member_guild;

    if (!hasAccess) {
      return res.send(ACCESS_DENIED_HTML);
    }

    // Determine where to send the browser after a successful login.
    // Always stay on this same origin: validated discordReturnTo > '/'
    // Read discordReturnTo into a local variable now, before session
    // regeneration destroys the old session data.
    const savedReturnTo = normalizeReturnTo(req.session.discordReturnTo);

    const destination: string = savedReturnTo || '/';

    // Regenerate the session before writing auth data to prevent session
    // fixation attacks and to ensure a fresh session is always issued after
    // a successful login.
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('[Discord Auth] Session regeneration error:', regenErr);
        return res.redirect('/auth/login?error=auth_failed');
      }

      // Mark this browser session as Discord-authenticated
      req.session.discordAuthenticated = true;
      req.session.discordUserId = discordId;
      req.session.discordUsername = discordUsername;
      req.session.discordRoles = discordRoles;

      // Save session before redirecting so the cookie is persisted before the
      // browser follows the redirect and the next request arrives.
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[Discord Auth] Session save error:', saveErr);
          return res.redirect('/auth/login?error=auth_failed');
        }
        sendPostAuthBridge(res, destination);
        return;
      });
    });
    return;
  } catch (err: unknown) {
    console.error('[Discord Auth] OAuth callback error:', (err as any)?.response?.body || (err as any)?.message || err);
    return res.redirect('/auth/login?error=auth_failed');
  }
});

/** GET /auth/session — lightweight session introspection for SPA router guards.
 *  Returns 200 with authenticated=true when a valid session exists.
 *  Returns 401 with authenticated=false when no valid session exists so that
 *  clients can use response.ok to gate access without parsing the body. */
router.get('/session', authCheckLimiter, (req: Request, res: Response) => {
  const auth = resolveDiscordAuth(req);
  if (auth) {
    const userId = auth.discordUserId;
    const isAdmin = ADMIN_DISCORD_IDS.has(userId);
    return res.json({
      authenticated: true,
      user: {
        id: userId,
        username: auth.discordUsername,
      },
      roles: buildSessionRoleNames(auth.discordRoles, isAdmin),
      discordRoles: auth.discordRoles,
      isAdmin,
    });
  }
  return res.status(401).json({ authenticated: false });
});

const destroySession = (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Discord Auth] Session destroy error:', err);
      return res.status(500).json({ error: 'Failed to destroy session' });
    }
    // 'connect.sid' is the default express-session cookie name.
    // If you set the `name` option in the session middleware, change this to match.
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
};

/** POST /auth/logout — destroy the server-side session and clear the cookie. */
router.post('/logout', destroySession);

/** GET /auth/logout — compatibility with clients that navigate to this URL. */
router.get('/logout', destroySession);


router.get('/mobile-session', authCheckLimiter, (req: Request, res: Response) => {
  const auth = resolveDiscordAuth(req);
  if (!auth) return res.status(401).json({ authenticated: false });
  const isAdmin = ADMIN_DISCORD_IDS.has(auth.discordUserId);
  return res.json({
    authenticated: true,
    user: { id: auth.discordUserId, username: auth.discordUsername },
    roles: buildSessionRoleNames(auth.discordRoles, isAdmin),
    discordRoles: auth.discordRoles,
    isAdmin,
  });
});

export default router;

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendPostAuthBridge(res: Response, destination: string): void {
  const escaped = escapeHtmlAttr(destination);
  res.status(200).send(`<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${escaped}"></head>
<body><script>window.location.replace(${JSON.stringify(destination)});</script></body></html>`);
}
