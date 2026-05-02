import express, {Request, Response} from 'express';
import {timingSafeEqual} from 'crypto';
import mongoose from 'mongoose';
import {requireAdminAuth} from '../../middleware/adminAuth';

const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

/**
 * Timing-safe password comparison. Returns false immediately when ADMIN_PASSWORD
 * is not set so the admin panel is effectively disabled until it is configured.
 * @param {string} candidate - Password candidate to check
 * @return {boolean} Whether the password matches
 */
const checkAdminPassword = (candidate: string): boolean => {
  if (!ADMIN_PASSWORD) return false;
  if (!candidate) return false;
  try {
    const a = Buffer.from(ADMIN_PASSWORD, 'utf8');
    const b = Buffer.from(candidate, 'utf8');
    // timingSafeEqual requires buffers of equal length
    if (a.length !== b.length) {
      // Still run a dummy comparison to avoid timing leaks on length
      timingSafeEqual(a, a);
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const COMMON_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d1117;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #c9d1d9;
    min-height: 100vh;
  }
  a { color: #58a6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #30363d; padding: 8px 12px; text-align: left; font-size: 0.875rem; }
  th { background: #161b22; font-weight: 600; color: #8b949e; }
  tr:nth-child(even) { background: #161b22; }
  tr:hover { background: #1c2129; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge-green { background: #1a3a2a; color: #3fb950; border: 1px solid #238636; }
  .badge-red   { background: #3d1515; color: #ff8080; border: 1px solid #8b2121; }
  .badge-gray  { background: #21262d; color: #8b949e; border: 1px solid #30363d; }
  .empty { color: #8b949e; font-style: italic; font-size: 0.875rem; }
`;

const NAV_HTML = `
  <nav style="background:#161b22;border-bottom:1px solid #30363d;padding:12px 24px;display:flex;align-items:center;gap:24px;">
    <span style="font-weight:700;font-size:1rem;color:#e6edf3;">🔥 flame_bot Admin</span>
    <a href="/admin">Dashboard</a>
    <a href="/admin/guilds">Guilds</a>
    <a href="/admin/war-alerts">War Alerts</a>
    <a href="/admin/configs">Configs</a>
    <span style="flex:1"></span>
    <form method="POST" action="/admin/logout" style="display:inline;">
      <button type="submit" style="background:none;border:1px solid #30363d;color:#8b949e;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;">Logout</button>
    </form>
  </nav>
`;

/** Renders a full admin HTML page with navigation.
 * @param {string} title - Page title
 * @param {string} body - HTML body content
 * @return {string} Full HTML page
 */
const page = (title: string, body: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — flame_bot Admin</title>
  <style>${COMMON_STYLES}
    .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h2 { font-size: 1.25rem; color: #e6edf3; margin-bottom: 16px; }
    .section { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .section h3 { font-size: 1rem; color: #e6edf3; margin-bottom: 12px; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
  </style>
</head>
<body>
  ${NAV_HTML}
  <div class="container">${body}</div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Login page
// ---------------------------------------------------------------------------

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>flame_bot Admin — Login</title>
  <style>${COMMON_STYLES}
    body { display:flex;align-items:center;justify-content:center;min-height:100vh; }
    .card {
      background:#161b22;border:1px solid #30363d;border-radius:12px;
      padding:40px;max-width:380px;width:100%;text-align:center;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
    }
    h1 { font-size:1.5rem;margin-bottom:8px;color:#e6edf3; }
    p { color:#8b949e;margin-bottom:24px;font-size:0.9rem; }
    input[type=password] {
      width:100%;padding:10px 14px;border-radius:6px;
      border:1px solid #30363d;background:#0d1117;color:#c9d1d9;
      font-size:1rem;margin-bottom:16px;outline:none;
    }
    input[type=password]:focus { border-color:#58a6ff; }
    button {
      width:100%;padding:10px;border-radius:6px;border:none;
      background:#238636;color:#fff;font-size:1rem;font-weight:600;cursor:pointer;
    }
    button:hover { background:#2ea043; }
    .error {
      background:#3d1515;border:1px solid #8b2121;border-radius:6px;
      padding:10px 14px;margin-bottom:16px;color:#ff8080;font-size:0.875rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔥 flame_bot Admin</h1>
    <p>Enter the admin password to continue.</p>
    {{ERROR_BLOCK}}
    <form method="POST" action="/admin/login">
      <input type="password" name="password" placeholder="Admin password" autofocus/>
      <button type="submit">Login</button>
    </form>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Database helpers — read from the flame_bot's "TRF" database
// ---------------------------------------------------------------------------

const getTrfDb = () => mongoose.connection.useDb('TRF', {useCache: true});

const getGuilds = async (): Promise<Record<string, unknown>[]> => {
  const db = getTrfDb();
  return db.collection('guilds').find({}).sort({updated_at: -1}).toArray();
};

const getWarAlertSubscriptions = async (): Promise<Record<string, unknown>[]> => {
  const db = getTrfDb();
  return db.collection('war_alert_subscriptions').find({}).toArray();
};

const getGuildConfigs = async (): Promise<Record<string, unknown>[]> => {
  const db = getTrfDb();
  return db.collection('guild_config').find({}).toArray();
};

const getRecruiterSubscriptions = async (): Promise<Record<string, unknown>[]> => {
  const db = getTrfDb();
  return db.collection('recruiter_subscriptions').find({}).toArray();
};

// ---------------------------------------------------------------------------
// Routes — public (no auth required)
// ---------------------------------------------------------------------------

/** GET /admin/login */
router.get('/login', (req: Request, res: Response) => {
  if (!ADMIN_PASSWORD) {
    res.setHeader('Content-Type', 'text/html');
    return res.send(
        LOGIN_PAGE.replace(
            '{{ERROR_BLOCK}}',
            '<div class="error">ADMIN_PASSWORD is not configured on this server. Set it in your .env file.</div>',
        ),
    );
  }
  const errorParam = typeof req.query.error === 'string' ? req.query.error : null;
  const errorBlock =
    errorParam === 'wrong' ?
      '<div class="error">Incorrect password. Please try again.</div>' :
      '';
  res.setHeader('Content-Type', 'text/html');
  return res.send(LOGIN_PAGE.replace('{{ERROR_BLOCK}}', errorBlock));
});

/** POST /admin/login */
router.post('/login', (req: Request, res: Response) => {
  const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!checkAdminPassword(candidate)) {
    return res.redirect('/admin/login?error=wrong');
  }
  req.session.adminAuthenticated = true;
  req.session.save((err) => {
    if (err) {
      console.error('[Admin Auth] Session save error:', err);
      return res.redirect('/admin/login?error=wrong');
    }
    return res.redirect('/admin');
  });
});

/** POST /admin/logout */
router.post('/logout', (req: Request, res: Response) => {
  req.session.adminAuthenticated = false;
  req.session.save(() => res.redirect('/admin/login'));
});

// ---------------------------------------------------------------------------
// All routes below this point require admin authentication
// ---------------------------------------------------------------------------

router.use(requireAdminAuth);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get('/', async (_req: Request, res: Response) => {
  let guildsCount = 0;
  let warAlertsCount = 0;
  let recruiterCount = 0;
  let dbError: string | null = null;

  try {
    const [guilds, warAlerts, recruiters] = await Promise.all([
      getGuilds(),
      getWarAlertSubscriptions(),
      getRecruiterSubscriptions(),
    ]);
    guildsCount = guilds.length;
    warAlertsCount = warAlerts.length;
    recruiterCount = recruiters.length;
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : 'Unknown error reading bot database';
  }

  const body = `
    <h2>Dashboard</h2>
    ${dbError ? `<div style="background:#3d1515;border:1px solid #8b2121;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#ff8080;">⚠️ Database error: ${dbError}</div>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
      <div class="section" style="text-align:center;">
        <div style="font-size:2rem;font-weight:700;color:#58a6ff;">${guildsCount}</div>
        <div style="color:#8b949e;margin-top:4px;">Guilds</div>
      </div>
      <div class="section" style="text-align:center;">
        <div style="font-size:2rem;font-weight:700;color:#3fb950;">${warAlertsCount}</div>
        <div style="color:#8b949e;margin-top:4px;">War Alert Subscriptions</div>
      </div>
      <div class="section" style="text-align:center;">
        <div style="font-size:2rem;font-weight:700;color:#d29922;">${recruiterCount}</div>
        <div style="color:#8b949e;margin-top:4px;">Recruiter Subscriptions</div>
      </div>
    </div>
    <div class="section">
      <h3>Quick Links</h3>
      <ul style="list-style:none;display:flex;flex-direction:column;gap:8px;">
        <li><a href="/admin/guilds">→ View all guilds</a></li>
        <li><a href="/admin/war-alerts">→ View war alert subscriptions</a></li>
        <li><a href="/admin/configs">→ View guild configurations</a></li>
      </ul>
    </div>
    <div class="section">
      <h3>War Alert Status</h3>
      <p style="color:#8b949e;font-size:0.875rem;line-height:1.6;">
        War alerts are delivered via the PnW <code>warCreate</code> WebSocket subscription.
        The bot listens for new war declarations and fans them out to all configured channels.<br/><br/>
        <strong>Offensives or defensives not showing?</strong> Ensure:
        <ol style="padding-left:1.5em;margin-top:4px;">
          <li><code>/admin alliance set &lt;alliance_id&gt;</code> has been run in the Discord server.</li>
          <li><code>/setup war_alerts add &lt;#channel&gt;</code> has been run to configure a channel.</li>
          <li>The PnW API key is valid and the bot is connected (check bot logs).</li>
          <li>The guild's configured <strong>alliance_id</strong> exactly matches the PnW alliance ID of your member.</li>
          <li>Set <code>LOG_LEVEL=DEBUG</code> in the bot's .env to see per-war dispatch decisions in the logs.</li>
        </ol>
      </p>
    </div>
  `;
  res.setHeader('Content-Type', 'text/html');
  return res.send(page('Dashboard', body));
});

// ---------------------------------------------------------------------------
// Guilds page
// ---------------------------------------------------------------------------

router.get('/guilds', async (_req: Request, res: Response) => {
  let guilds: Record<string, unknown>[] = [];
  let dbError: string | null = null;
  try {
    guilds = await getGuilds();
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : 'Unknown error';
  }

  const rows = guilds.length ?
    guilds
        .map(
            (g) => `
        <tr>
          <td style="font-family:monospace;">${g.guild_id || '—'}</td>
          <td>${g.guild_name || '—'}</td>
          <td>${g.invite_link ? `<a href="${g.invite_link}" target="_blank">${g.invite_link}</a>` : '<span class="empty">none</span>'}</td>
          <td style="color:#8b949e;font-size:0.8rem;">${g.updated_at || '—'}</td>
        </tr>`,
        )
        .join('') :
    `<tr><td colspan="4" class="empty">No guilds found.</td></tr>`;

  const body = `
    <h2>Guilds (${guilds.length})</h2>
    ${dbError ? `<div style="background:#3d1515;border:1px solid #8b2121;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#ff8080;">⚠️ ${dbError}</div>` : ''}
    <div class="section">
      <table>
        <thead><tr><th>Guild ID</th><th>Name</th><th>Invite Link</th><th>Updated</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  res.setHeader('Content-Type', 'text/html');
  return res.send(page('Guilds', body));
});

// ---------------------------------------------------------------------------
// War alerts page
// ---------------------------------------------------------------------------

router.get('/war-alerts', async (_req: Request, res: Response) => {
  let subs: Record<string, unknown>[] = [];
  let configs: Record<string, unknown>[] = [];
  let guilds: Record<string, unknown>[] = [];
  let dbError: string | null = null;
  try {
    [subs, configs, guilds] = await Promise.all([
      getWarAlertSubscriptions(),
      getGuildConfigs(),
      getGuilds(),
    ]);
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : 'Unknown error';
  }

  const guildNames: Record<string, string> = {};
  for (const g of guilds) {
    if (g.guild_id) guildNames[String(g.guild_id)] = String(g.guild_name || g.guild_id);
  }
  const allianceIds: Record<string, string> = {};
  for (const c of configs) {
    if (c.guild_id && c.alliance_id) allianceIds[String(c.guild_id)] = String(c.alliance_id);
  }

  const rows = subs.length ?
    subs
        .map((s) => {
          const gid = String(s.guild_id || '');
          const name = guildNames[gid] || gid || '—';
          const alliance = allianceIds[gid] || '<span class="badge badge-red">⚠ Not set</span>';
          const minC = s.min_cities != null ? s.min_cities : '—';
          const maxC = s.max_cities != null ? s.max_cities : '—';
          return `
          <tr>
            <td>${name}</td>
            <td style="font-family:monospace;">${gid || '—'}</td>
            <td>${alliance}</td>
            <td style="font-family:monospace;">${s.channel_id || '—'}</td>
            <td>${minC}</td>
            <td>${maxC}</td>
          </tr>`;
        })
        .join('') :
    `<tr><td colspan="6" class="empty">No war alert subscriptions found. Use /setup war_alerts add in Discord to add one.</td></tr>`;

  const body = `
    <h2>War Alert Subscriptions (${subs.length})</h2>
    ${dbError ? `<div style="background:#3d1515;border:1px solid #8b2121;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#ff8080;">⚠️ ${dbError}</div>` : ''}
    <div class="section">
      <h3>ℹ️ Troubleshooting</h3>
      <p style="color:#8b949e;font-size:0.875rem;line-height:1.6;">
        Each subscription needs a valid <strong>Alliance ID</strong> configured
        (via <code>/admin alliance set</code> in Discord). Without it, no alerts fire.<br/>
        Offensives are shown when <code>att_alliance_id</code> from PnW matches the guild's alliance ID.<br/>
        Defensives are shown when <code>def_alliance_id</code> from PnW matches.
      </p>
    </div>
    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Guild Name</th>
            <th>Guild ID</th>
            <th>Alliance ID</th>
            <th>Channel ID</th>
            <th>Min Cities</th>
            <th>Max Cities</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  res.setHeader('Content-Type', 'text/html');
  return res.send(page('War Alerts', body));
});

// ---------------------------------------------------------------------------
// Guild configs page
// ---------------------------------------------------------------------------

router.get('/configs', async (_req: Request, res: Response) => {
  let configs: Record<string, unknown>[] = [];
  let guilds: Record<string, unknown>[] = [];
  let dbError: string | null = null;
  try {
    [configs, guilds] = await Promise.all([getGuildConfigs(), getGuilds()]);
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : 'Unknown error';
  }

  const guildNames: Record<string, string> = {};
  for (const g of guilds) {
    if (g.guild_id) guildNames[String(g.guild_id)] = String(g.guild_name || g.guild_id);
  }

  const rows = configs.length ?
    configs
        .map((c) => {
          const gid = String(c.guild_id || '');
          const name = guildNames[gid] || gid || '—';
          const alliance = c.alliance_id ?
            `<span class="badge badge-green">${c.alliance_id}</span>` :
            '<span class="badge badge-gray">not set</span>';
          const slots = Array.isArray(c.slots_alliances) && c.slots_alliances.length ?
            c.slots_alliances.join(', ') :
            '<span class="empty">none</span>';
          const grantCh = c.grant_channel_id ?
            `<span style="font-family:monospace;">${c.grant_channel_id}</span>` :
            '<span class="empty">none</span>';
          const welcomeEnabled = c.welcome_enabled ?
            '<span class="badge badge-green">on</span>' :
            '<span class="badge badge-gray">off</span>';
          return `
          <tr>
            <td>${name}</td>
            <td style="font-family:monospace;">${gid || '—'}</td>
            <td>${alliance}</td>
            <td>${slots}</td>
            <td>${grantCh}</td>
            <td>${welcomeEnabled}</td>
          </tr>`;
        })
        .join('') :
    `<tr><td colspan="6" class="empty">No guild configurations found.</td></tr>`;

  const body = `
    <h2>Guild Configurations (${configs.length})</h2>
    ${dbError ? `<div style="background:#3d1515;border:1px solid #8b2121;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#ff8080;">⚠️ ${dbError}</div>` : ''}
    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Guild Name</th>
            <th>Guild ID</th>
            <th>Primary Alliance</th>
            <th>/slots Alliances</th>
            <th>Grant Channel</th>
            <th>Welcome</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  res.setHeader('Content-Type', 'text/html');
  return res.send(page('Guild Configs', body));
});

// ---------------------------------------------------------------------------
// JSON API endpoints (for programmatic access)
// ---------------------------------------------------------------------------

router.get('/api/guilds', async (_req: Request, res: Response) => {
  try {
    const guilds = await getGuilds();
    return res.json(guilds);
  } catch (e: unknown) {
    return res.status(500).json({error: e instanceof Error ? e.message : 'Failed to fetch guilds'});
  }
});

router.get('/api/war-alerts', async (_req: Request, res: Response) => {
  try {
    const subs = await getWarAlertSubscriptions();
    return res.json(subs);
  } catch (e: unknown) {
    return res.status(500).json({error: e instanceof Error ? e.message : 'Failed to fetch war alerts'});
  }
});

router.get('/api/configs', async (_req: Request, res: Response) => {
  try {
    const configs = await getGuildConfigs();
    return res.json(configs);
  } catch (e: unknown) {
    return res.status(500).json({error: e instanceof Error ? e.message : 'Failed to fetch guild configs'});
  }
});

export default router;
