/**
 * flame_bot – HTTP API server for bar3 integration.
 *
 * bar3 (the website) calls this API after a user logs in via Discord OAuth to
 * decide whether the user should be granted access.
 *
 * Endpoints
 * ---------
 * GET /
 *     Returns "would you kindly begone" (200 OK).
 *
 * GET /health
 *     Returns {"status": "ok"} (200 OK).
 *
 * GET /ping
 *     Returns {"ping": "pong", "sigma": true, "skibidi": "toilet"} (200 OK).
 *
 * GET /glaernisch
 *     Returns {"touch": "grass"} (200 OK).
 *
 * GET /egg
 *     Returns an egg-themed SVG image (200 OK).
 *
 * GET /api/roles/:discord_id
 *     Returns the bar3 role status for the given Discord user ID.
 *     Requires the X-API-Key request header.
 *
 * GET /api/bot/servers
 *     Returns the list of Discord servers the bot is currently in.
 *     Requires the X-API-Key request header.
 *
 * GET /api/bot/commands/usage
 *     Returns a ranked list of slash-command usage counts (highest first).
 *     Requires the X-API-Key request header.
 *
 * POST /api/bot/send
 *     Send a message to the configured welcome channel of every server the bot is in.
 *     Requires the X-API-Key request header.
 *
 * Discord OAuth2 auth flow (requires DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_REDIRECT_URI):
 * GET /auth/login
 *     Show the HTML login page. Accepts optional ?returnTo= and ?error= query params.
 *
 * GET /auth/discord
 *     Redirect the browser to Discord's OAuth2 authorization endpoint.
 *     Accepts optional ?returnTo= and ?mobile=1 query params.
 *
 * GET /auth/discord/callback
 *     Handle the OAuth2 callback: exchange the code, fetch the user identity,
 *     check bar3 roles via the bot's guild membership cache, and either:
 *       - Issue an in-memory session token (mobile flow: ?state=mobile) and
 *         redirect to CLIENT_APP_URL?mobileToken=<token>, or
 *       - Issue an in-memory session token and redirect to CLIENT_APP_URL/dashboard
 *         (or CLIENT_APP_URL alone when CLIENT_APP_URL is unset, redirects to /).
 *
 * GET /auth/session?token=<token>
 *     Return session info for a token issued by the callback.
 *     Returns 200 { authenticated, user, roles, isAdmin } on success,
 *     or 401 { authenticated: false } when the token is unknown or expired.
 *
 * POST /auth/logout
 *     Body: { token: string }
 *     Revoke a session token and return { ok: true }.
 *
 * GET /auth/mobile-session?token=<token>
 *     Alias for GET /auth/session (kept for bar3-client compatibility).
 */
import express, { Application, NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Guild, GuildMember } from 'discord.js';
import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  CLIENT_APP_URL,
  ADMIN_DISCORD_IDS,
} from './config';

export interface RoleConfig {
  verifiedRoleId?: bigint | null;
  bar3ClientRoleId?: bigint | null;
  bar3ServerRoleId?: bigint | null;
}

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
  member_count: number | null;
}

export type GuildGetter = () => Guild | null;
export type GuildsGetter = () => Guild[];
export type SendToWelcomeFn = (message: string) => Promise<{ sent: number; skipped: number }>;
export type CommandUsageGetter = () => Record<string, number>;

export interface CreateAppOptions {
  guildGetter: GuildGetter;
  apiKey: string;
  roleConfig?: RoleConfig;
  guildsGetter?: GuildsGetter;
  sendToWelcomeFn?: SendToWelcomeFn;
  commandUsageGetter?: CommandUsageGetter;
  adminIds?: Set<bigint>;
}

function checkApiKey(req: Request, apiKey: string): boolean {
  return req.headers['x-api-key'] === apiKey;
}

// ---------------------------------------------------------------------------
// Auth session store — lightweight in-memory token map (no external deps)
// ---------------------------------------------------------------------------

export interface AuthSession {
  expiresAt: number;
  discordUserId: string;
  discordUsername: string;
  discordRoles: {
    verified: boolean;
    bar3_client: boolean;
    bar3_server: boolean;
  };
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const _sessions = new Map<string, AuthSession>();
type DiscordRoles = AuthSession['discordRoles'];

function _issueToken(data: Omit<AuthSession, 'expiresAt'>): string {
  const token = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  _sessions.set(token, { ...data, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function _getSession(token: string): AuthSession | null {
  const s = _sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { _sessions.delete(token); return null; }
  return s;
}

function _revokeToken(token: string): void {
  _sessions.delete(token);
}

function _emptyDiscordRoles(): DiscordRoles {
  return {
    verified: false,
    bar3_client: false,
    bar3_server: false,
  };
}

async function _resolveDiscordRoles(
  discordId: string,
  guildGetter: GuildGetter,
  roleConfig: RoleConfig
): Promise<DiscordRoles> {
  const roles = _emptyDiscordRoles();
  if (!/^\d+$/.test(discordId)) return roles;
  const guild = guildGetter();
  if (!guild) return roles;

  let member: GuildMember | null = guild.members.cache.get(discordId) ?? null;
  if (!member) {
    try {
      member = await guild.members.fetch(discordId);
    } catch {
      member = null;
    }
  }
  if (!member) return roles;

  const memberRoleIds = new Set(member.roles.cache.keys());
  if (roleConfig.verifiedRoleId && memberRoleIds.has(roleConfig.verifiedRoleId.toString())) {
    roles.verified = true;
  }
  if (roleConfig.bar3ClientRoleId && memberRoleIds.has(roleConfig.bar3ClientRoleId.toString())) {
    roles.bar3_client = true;
  }
  if (roleConfig.bar3ServerRoleId && memberRoleIds.has(roleConfig.bar3ServerRoleId.toString())) {
    roles.bar3_server = true;
  }

  return roles;
}

/** Purge expired sessions (call periodically or inline). */
function _purgeExpired(): void {
  const now = Date.now();
  for (const [k, v] of _sessions) {
    if (v.expiresAt < now) _sessions.delete(k);
  }
}

// ---------------------------------------------------------------------------
// Auth HTML pages
// ---------------------------------------------------------------------------

const _LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Bar3 — Login</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e0e0e0}
    .card{background:#16213e;border:1px solid #0f3460;border-radius:12px;padding:48px 40px;max-width:400px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.4)}
    h1{font-size:1.8rem;margin-bottom:8px;color:#e0e0e0}
    p{color:#a0a0b0;margin-bottom:32px;font-size:.95rem}
    .btn-discord{display:inline-flex;align-items:center;gap:12px;background:#5865F2;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:1rem;font-weight:600;transition:background .2s}
    .btn-discord:hover{background:#4752c4}
    .btn-discord svg{width:22px;height:22px;fill:#fff}
    .error{background:#3d1515;border:1px solid #8b2121;border-radius:8px;padding:12px 16px;margin-bottom:24px;color:#ff8080;font-size:.9rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>Bar3</h1>
    <p>Sign in with Discord to continue.<br/>You must be a member of the Bar3 server.</p>
    {{ERROR_BLOCK}}
    <a href="{{DISCORD_LOGIN_HREF}}" class="btn-discord">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
      Login with Discord
    </a>
  </div>
</body>
</html>`;

const _ACCESS_DENIED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Bar3 — Access Denied</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e0e0e0}
    .card{background:#16213e;border:1px solid #3d1515;border-radius:12px;padding:48px 40px;max-width:420px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.4)}
    h1{font-size:1.8rem;margin-bottom:16px;color:#ff8080}
    p{color:#a0a0b0;margin-bottom:28px;font-size:.95rem;line-height:1.6}
    a{color:#5865F2;text-decoration:none}
    a:hover{text-decoration:underline}
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

// ---------------------------------------------------------------------------
// OAuth2 helpers — uses native fetch (Node 18+)
// ---------------------------------------------------------------------------

interface DiscordTokenResponse { access_token: string; token_type: string; }
interface DiscordUser { id: string; username: string; }

async function _discordExchangeCode(code: string): Promise<DiscordTokenResponse | null> {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
  });
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return null;
  return res.json() as Promise<DiscordTokenResponse>;
}

async function _discordGetMe(accessToken: string): Promise<DiscordUser | null> {
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<DiscordUser>;
}

const EGG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">
  <rect width="320" height="420" fill="#8bcf6b"/>
  <ellipse cx="160" cy="300" rx="110" ry="95" fill="#f8de57"/>
  <circle cx="160" cy="180" r="55" fill="#f7d84d"/>
  <ellipse cx="135" cy="165" rx="8" ry="10" fill="#111"/>
  <ellipse cx="185" cy="165" rx="8" ry="10" fill="#111"/>
  <polygon points="160,178 140,195 180,195" fill="#ea9f2d"/>
  <ellipse cx="120" cy="95" rx="22" ry="48" fill="#f4d9df" transform="rotate(-18 120 95)"/>
  <ellipse cx="200" cy="95" rx="22" ry="48" fill="#f4d9df" transform="rotate(18 200 95)"/>
  <ellipse cx="120" cy="95" rx="16" ry="40" fill="#fff7fb" transform="rotate(-18 120 95)"/>
  <ellipse cx="200" cy="95" rx="16" ry="40" fill="#fff7fb" transform="rotate(18 200 95)"/>
  <path d="M120 215 C80 220, 70 250, 95 265" stroke="#f8de57" stroke-width="18" fill="none" stroke-linecap="round"/>
  <path d="M200 215 C240 220, 250 250, 225 265" stroke="#f8de57" stroke-width="18" fill="none" stroke-linecap="round"/>
  <path d="M145 390 L130 415 L152 408 Z" fill="#d9872a"/>
  <path d="M180 390 L200 415 L170 410 Z" fill="#d9872a"/>
</svg>`;

export function createApp(options: CreateAppOptions): Application {
  const {
    guildGetter,
    apiKey,
    roleConfig = {},
    guildsGetter,
    sendToWelcomeFn,
    commandUsageGetter,
    adminIds = new Set<bigint>(),
  } = options;

  const app = express();
  app.use(express.json());
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in (err as object)) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    next(err);
  });
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get('/', (_req: Request, res: Response) => {
    res.status(200).send('would you kindly begone');
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/ping', (_req: Request, res: Response) => {
    res.status(200).json({ ping: 'pong', sigma: true, skibidi: 'toilet' });
  });

  app.get('/glaernisch', (_req: Request, res: Response) => {
    res.status(200).json({ touch: 'grass' });
  });

  app.get('/egg', (_req: Request, res: Response) => {
    res.status(200).type('image/svg+xml').send(EGG_SVG);
  });

  app.get('/api/roles/:discord_id', async (req: Request, res: Response) => {
    if (!checkApiKey(req, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const discordIdStr = req.params['discord_id'] ?? '';
    if (!/^\d+$/.test(discordIdStr)) {
      res.status(400).json({ error: 'Invalid discord_id' });
      return;
    }

    if (!guildGetter()) {
      res.status(503).json({ error: 'Bot not ready' });
      return;
    }
    const roles = await _resolveDiscordRoles(discordIdStr, guildGetter, roleConfig);

    res.status(200).json({ discord_id: discordIdStr, roles });
  });

  app.get('/api/bot/servers', (_req: Request, res: Response) => {
    if (!checkApiKey(_req, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!guildsGetter) {
      res.status(503).json({ error: 'Bot not ready' });
      return;
    }
    const guilds = guildsGetter();
    const result: GuildInfo[] = guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL() ?? null,
      member_count: g.memberCount,
    }));
    res.status(200).json(result);
  });

  app.get('/api/bot/commands/usage', (_req: Request, res: Response) => {
    if (!checkApiKey(_req, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const usage = commandUsageGetter ? commandUsageGetter() : {};
    const ranked = Object.entries(usage)
      .sort(([, a], [, b]) => b - a)
      .map(([command, count]) => ({ command, count }));
    res.status(200).json(ranked);
  });

  app.post('/api/bot/send', async (req: Request, res: Response) => {
    if (!checkApiKey(req, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const discordIdStr = String(body['discord_id'] ?? '').trim();
    if (!/^\d+$/.test(discordIdStr)) {
      res.status(400).json({ error: 'Missing or invalid discord_id' });
      return;
    }
    const discordId = BigInt(discordIdStr);

    const message = String(body['message'] ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }

    if (!adminIds.has(discordId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (!sendToWelcomeFn) {
      res.status(503).json({ error: 'Bot not ready' });
      return;
    }

    const result = await sendToWelcomeFn(message);
    res.status(200).json(result);
  });

  // -------------------------------------------------------------------------
  // Discord OAuth2 auth flow
  // -------------------------------------------------------------------------

  /** GET /auth/login — show the HTML login page */
  app.get('/auth/login', (req: Request, res: Response) => {
    const error = typeof req.query['error'] === 'string' ? req.query['error'] : null;
    let errorBlock = '';
    if (error === 'no_role') {
      errorBlock = '<div class="error">You do not have the required role in the Bar3 Discord server.</div>';
    } else if (error === 'auth_failed') {
      errorBlock = '<div class="error">Discord authentication failed. Please try again.</div>';
    } else if (error === 'no_code') {
      errorBlock = '<div class="error">No authorization code received from Discord. Please try again.</div>';
    } else if (error === 'not_configured') {
      errorBlock = '<div class="error">Discord OAuth2 is not configured on this server.</div>';
    }
    const discordLoginHref = '/auth/discord';
    const html = _LOGIN_HTML
      .replace('{{ERROR_BLOCK}}', errorBlock)
      .replace('{{DISCORD_LOGIN_HREF}}', discordLoginHref);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  /** GET /auth/discord — redirect to Discord OAuth2 authorization */
  app.get('/auth/discord', authLimiter, (req: Request, res: Response) => {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      res.redirect('/auth/login?error=not_configured');
      return;
    }
    const mobile = req.query['mobile'] === '1';
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
    });
    if (mobile) params.set('state', 'mobile');
    res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  });

  /** GET /auth/discord/callback — handle OAuth2 callback */
  app.get('/auth/discord/callback', authLimiter, async (req: Request, res: Response) => {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      res.redirect('/auth/login?error=not_configured');
      return;
    }
    const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
    if (!code) {
      res.redirect('/auth/login?error=no_code');
      return;
    }

    _purgeExpired();

    try {
      const tokenData = await _discordExchangeCode(code);
      if (!tokenData?.access_token) {
        res.redirect('/auth/login?error=auth_failed');
        return;
      }

      const me = await _discordGetMe(tokenData.access_token);
      if (!me?.id) {
        res.redirect('/auth/login?error=auth_failed');
        return;
      }

      // Check roles via bot's guild membership cache
      const discordRoles = await _resolveDiscordRoles(me.id, guildGetter, roleConfig);

      const hasAccess = discordRoles.bar3_client || discordRoles.bar3_server;
      if (!hasAccess) {
        res.send(_ACCESS_DENIED_HTML);
        return;
      }

      const token = _issueToken({ discordUserId: me.id, discordUsername: me.username, discordRoles });

      const state = typeof req.query['state'] === 'string' ? req.query['state'] : '';
      const isMobile = state === 'mobile';

      if (isMobile) {
        const destination = CLIENT_APP_URL || '/';
        const sep = destination.includes('?') ? '&' : '?';
        res.redirect(`${destination}${sep}mobileToken=${encodeURIComponent(token)}`);
        return;
      }

      const destination = CLIENT_APP_URL ? `${CLIENT_APP_URL}/dashboard` : '/';
      // Append the token to the destination so the SPA can store it
      const sep = destination.includes('?') ? '&' : '?';
      res.redirect(`${destination}${sep}token=${encodeURIComponent(token)}`);
    } catch (err) {
      console.error('[Auth] OAuth callback error:', (err as Error).message ?? err);
      res.redirect('/auth/login?error=auth_failed');
    }
  });

  /** Shared handler for /auth/session and /auth/mobile-session token validation. */
  const _respondWithAuthSession = (req: Request, res: Response): void => {
    const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';
    if (!token) {
      res.status(400).json({ error: 'Missing token' });
      return;
    }
    const session = _getSession(token);
    if (!session) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.status(200).json({
      authenticated: true,
      user: { id: session.discordUserId, username: session.discordUsername },
      roles: session.discordRoles,
      isAdmin: ADMIN_DISCORD_IDS.has(BigInt(session.discordUserId)),
    });
  };

  /** GET /auth/session?token=<token> — check session validity */
  app.get('/auth/session', _respondWithAuthSession);

  /** GET /auth/mobile-session?token=<token> — alias kept for bar3-client compatibility */
  app.get('/auth/mobile-session', _respondWithAuthSession);

  /** POST /auth/logout — revoke a session token */
  app.post('/auth/logout', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const token = typeof body['token'] === 'string' ? body['token'] : '';
    if (token) _revokeToken(token);
    res.status(200).json({ ok: true });
  });

  return app;
}
