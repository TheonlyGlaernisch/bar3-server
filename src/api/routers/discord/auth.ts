import express, { Request, Response } from 'express';
import superagent from 'superagent';

const router = express.Router();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI =
  process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';

// flame_bot HTTP API — used to check whether the user holds the bar3_server role.
// Set FLAME_BOT_API_URL to the base URL of the running flame_bot (e.g. http://localhost:8080)
// and FLAME_BOT_API_KEY to the same secret configured in flame_bot's API_KEY env var.
const FLAME_BOT_API_URL = (process.env.FLAME_BOT_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const FLAME_BOT_API_KEY = process.env.FLAME_BOT_API_KEY || '';

// After a successful OAuth2 login the browser is redirected here.
// Set CLIENT_APP_URL to the root URL of the bar3-client SPA
// (e.g. https://bar3-client.onrender.com).  When unset, the server redirects
// to the relative path saved in the session (discordReturnTo) or '/' as a fallback.
const CLIENT_APP_URL = (process.env.CLIENT_APP_URL || '').replace(/\/$/, '');

/**
 * Return true only for safe relative-path redirects (no protocol or host).
 * Rejects protocol-relative URLs (//evil.com) and absolute URLs.
 */
function isSafeReturnTo(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');
}

const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bar3 — Login</title>
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
      border: 1px solid #0f3460;
      border-radius: 12px;
      padding: 48px 40px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    h1 { font-size: 1.8rem; margin-bottom: 8px; color: #e0e0e0; }
    p { color: #a0a0b0; margin-bottom: 32px; font-size: 0.95rem; }
    .btn-discord {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: #5865F2;
      color: #fff;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      transition: background 0.2s;
    }
    .btn-discord:hover { background: #4752c4; }
    .btn-discord svg { width: 22px; height: 22px; fill: #fff; }
    .error {
      background: #3d1515;
      border: 1px solid #8b2121;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      color: #ff8080;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Bar3</h1>
    <p>Sign in with Discord to continue.<br/>You must be a member of the Bar3 server.</p>
    {{ERROR_BLOCK}}
    <a href="/auth/discord" class="btn-discord">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
      Login with Discord
    </a>
  </div>
</body>
</html>`;

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
  const error = typeof req.query.error === 'string' ? req.query.error : null;
  let errorBlock = '';
  if (error === 'no_role') {
    errorBlock = '<div class="error">You do not have the required role in the Bar3 Discord server.</div>';
  } else if (error === 'auth_failed') {
    errorBlock = '<div class="error">Discord authentication failed. Please try again.</div>';
  } else if (error === 'no_code') {
    errorBlock = '<div class="error">No authorization code received from Discord. Please try again.</div>';
  } else if (error === 'role_check_failed') {
    errorBlock = '<div class="error">Role verification is temporarily unavailable. Please try again in a moment.</div>';
  }
  const html = LOGIN_PAGE_HTML.replace('{{ERROR_BLOCK}}', errorBlock);
  res.setHeader('Content-Type', 'text/html');
  return res.send(html);
});

/** GET /auth/discord — redirect to Discord OAuth2 authorization */
router.get('/discord', (req: Request, res: Response) => {
  if (!DISCORD_CLIENT_ID) {
    return res.status(500).send('DISCORD_CLIENT_ID is not configured on this server.');
  }
  // If the SPA passes a ?returnTo= param (its current client-side route), save it in
  // the session so the callback can append it to CLIENT_APP_URL after a successful login.
  // This lets the SPA navigate the user back to where they were before the auth wall.
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null;
  if (returnTo && isSafeReturnTo(returnTo)) {
    req.session.discordReturnTo = returnTo;
  }
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    // Only 'identify' is needed — role verification is delegated to flame_bot.
    scope: 'identify',
  });
  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

/** GET /auth/discord/callback — handle OAuth2 callback */
router.get('/discord/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    return res.redirect('/auth/login?error=no_code');
  }

  try {
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
      });

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

    // Grant access to users holding verified, bar3_client, or bar3_server role.
    const hasAccess: boolean =
      flameBotRoles.verified === true ||
      flameBotRoles.bar3_client === true ||
      flameBotRoles.bar3_server === true;

    if (!hasAccess) {
      return res.send(ACCESS_DENIED_HTML);
    }

    // Determine where to send the browser after a successful login.
    // Priority: CLIENT_APP_URL env var > validated discordReturnTo > '/'
    // Read discordReturnTo into a local variable now, before session
    // regeneration destroys the old session data.
    const savedReturnTo = req.session.discordReturnTo;

    let destination: string;
    if (CLIENT_APP_URL) {
      // When redirecting to the client SPA, append the saved returnTo path as a
      // query param so the SPA can navigate the user back to their original route.
      // The SPA should read window.location.search for ?returnTo= on startup.
      destination = isSafeReturnTo(savedReturnTo)
        ? `${CLIENT_APP_URL}?returnTo=${encodeURIComponent(savedReturnTo)}`
        : CLIENT_APP_URL;
    } else if (isSafeReturnTo(savedReturnTo)) {
      destination = savedReturnTo;
    } else {
      destination = '/';
    }

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
      req.session.discordRoles = {
        verified: flameBotRoles.verified === true,
        bar3_client: flameBotRoles.bar3_client === true,
        bar3_server: flameBotRoles.bar3_server === true,
      };

      // Save session before redirecting so the cookie is persisted before the
      // browser follows the redirect and the next request arrives.
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[Discord Auth] Session save error:', saveErr);
          return res.redirect('/auth/login?error=auth_failed');
        }
        return res.redirect(destination);
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
router.get('/session', (req: Request, res: Response) => {
  if (req.session?.discordAuthenticated === true) {
    return res.json({
      authenticated: true,
      user: {
        id: req.session.discordUserId,
        username: req.session.discordUsername,
      },
      roles: req.session.discordRoles,
    });
  }
  return res.status(401).json({ authenticated: false });
});

/** POST /auth/logout — destroy the server-side session and clear the cookie. */
router.post('/logout', (req: Request, res: Response) => {
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
});

export default router;
