import express, { Express, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { join } from 'path';
import { existsSync } from 'fs';
import session from 'express-session';
import accountRoutes from './api/AccountRoutes';
import { mountLegacyUiAndApi } from './api';
import v2AuthRouter from './api/routers/v2/auth';
import v2TemplatesRouter from './api/routers/v2/templates';
import v2AutomationRouter from './api/routers/v2/automation';
import v2AnalyticsRouter from './api/routers/v2/analytics';
import v2SendTestRouter from './api/routers/v2/sendTest';
import discordAuthRouter from './api/routers/discord/auth';
import adminRouter from './api/routers/admin';
import { requireDiscordAuth } from './api/middleware/discordAuth';
import { startAutomationLoop } from './services/v2AutomationRunner';
import superagent from 'superagent';
// Extend express-session SessionData with Discord fields
import './interfaces/session';

mongoose.set('strictQuery', true);

const app: Express = express();
const ADMIN_DISCORD_IDS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);
const BOT_ROUTE_WINDOW_MS = 60 * 1000;
const BOT_ROUTE_MAX_REQUESTS = 30;
const BOT_ROUTE_LIMIT_CLEANUP_THRESHOLD = 1000;
const botRouteRateLimit = new Map<string, { count: number; resetAt: number }>();

// Trust the first hop from a reverse proxy (Render, Heroku, nginx, etc.) so
// that req.protocol is 'https' and secure session cookies are sent correctly.
app.set('trust proxy', 1);

// Session middleware — must come before any route that reads req.session
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === 'bar3-change-me-in-production') {
  console.warn(
    '[Warning] SESSION_SECRET is not set or is using the default value. ' +
    'Set a strong random secret in your .env file before deploying to production.'
  );
}
app.use(
  session({
    secret: sessionSecret || 'bar3-change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Use secure cookies in production (requires HTTPS)
      secure: process.env.NODE_ENV === 'production',
      // 'none' is required for cross-origin requests (client on a different
      // domain) to send the session cookie.  Must be paired with secure:true.
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — must come before the Discord auth guard so that ALL responses
// (including 401s) carry the correct Access-Control-* headers and preflight
// OPTIONS requests are never blocked by the auth middleware.
//
// CLIENT_APP_URL is automatically included as an allowed origin (see below).
// Set CLIENT_ORIGIN to any additional comma-separated origins that also need
// credentialled cross-origin access.  If neither is set the middleware falls
// back to wildcard (*) which is suitable for local development but
// incompatible with credentialled requests.
// CLIENT_ORIGIN entries can be exact origins (https://host), wildcard prefixes
// (app://*), or app:// prefixes for packaged Electron renderers.
type OriginMatcher = (origin: string) => boolean;
type OriginRule = { raw: string; matches: OriginMatcher };

const normalizeOriginString = (value: string): string => value.trim().replace(/\/$/, '');
const buildOriginRule = (value: string): OriginRule => {
  const normalized = normalizeOriginString(value);
  if (normalized.endsWith('*')) {
    const prefix = normalized.slice(0, -1);
    return { raw: normalized, matches: (origin: string) => origin.startsWith(prefix) };
  }
  // Convenience for Electron packaged apps where origins look like app://...
  if (normalized === 'app://' || normalized === 'app://*') {
    return { raw: 'app://*', matches: (origin: string) => origin.startsWith('app://') };
  }
  if (normalized.startsWith('app://')) {
    return { raw: normalized, matches: (origin: string) => origin.startsWith(normalized) };
  }
  return { raw: normalized, matches: (origin: string) => origin === normalized };
};

const CLIENT_APP_URL = process.env.CLIENT_APP_URL?.replace(/\/$/, '');
const ALLOWED_ORIGIN_RULES: OriginRule[] = [];
const addAllowedOriginRule = (value: string): void => {
  const normalized = normalizeOriginString(value);
  if (!normalized) return;
  if (ALLOWED_ORIGIN_RULES.some((rule) => rule.raw === normalized)) return;
  ALLOWED_ORIGIN_RULES.push(buildOriginRule(normalized));
};
(process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
  .forEach(addAllowedOriginRule);
// If CLIENT_APP_URL is set, that origin must always be allowed so that the
// client SPA can make credentialled cross-origin requests (e.g. /auth/session).
// This means you only need to set CLIENT_APP_URL; setting CLIENT_ORIGIN
// separately is optional and additive.
if (CLIENT_APP_URL) {
  addAllowedOriginRule(CLIENT_APP_URL);
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const originAllowed = typeof origin === 'string' &&
    ALLOWED_ORIGIN_RULES.some((rule) => rule.matches(origin));
  if (originAllowed && origin) {
    // Reflect the exact origin back and allow credentials (cookies/auth headers)
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  } else if (ALLOWED_ORIGIN_RULES.length === 0) {
    // No explicit allow-list configured — permissive fallback for development.
    // Note: wildcard is incompatible with credentials; fine for non-credentialled dev use.
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, x-api-key, Authorization'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Basic response hardening headers.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Suppress browser favicon 404s — there is no icon file to serve.
app.get('/favicon.ico', (_req: Request, res: Response) => res.status(204).end());

// Liveness and health endpoints must remain public for platform uptime checks.
app.get('/ping', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', sigma: true, skibidi: 'toilet' });
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'Server is running' });
});

// Bot API fallback proxy: when this service and flame_bot share one Render
// service, only one public port is exposed. Proxy bot endpoints to the local
// flame_bot API listener so callers can use the same base URL.
const FLAME_BOT_INTERNAL_URL = (process.env.FLAME_BOT_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const FLAME_BOT_API_KEY = process.env.FLAME_BOT_API_KEY || '';
const getRateLimitKey = (req: Request): string => req.ip || 'unknown-ip';
const cleanupBotRouteRateLimitEntries = (now: number): void => {
  for (const [key, value] of botRouteRateLimit) {
    if (value.resetAt <= now) {
      botRouteRateLimit.delete(key);
    }
  }
};
const botRouteLimiter = (req: Request, res: Response, next: NextFunction) => {
  const key = getRateLimitKey(req);
  const now = Date.now();
  if (botRouteRateLimit.size > BOT_ROUTE_LIMIT_CLEANUP_THRESHOLD) {
    cleanupBotRouteRateLimitEntries(now);
  }
  const current = botRouteRateLimit.get(key);
  if (!current || current.resetAt <= now) {
    botRouteRateLimit.set(key, { count: 1, resetAt: now + BOT_ROUTE_WINDOW_MS });
    next();
    return;
  }
  current.count += 1;
  if (current.count > BOT_ROUTE_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({
      error: `Too many bot API requests. Please retry after ${retryAfterSeconds} seconds.`,
    });
    return;
  }
  botRouteRateLimit.set(key, current);
  next();
};
const requireDiscordAdmin = (req: Request, res: Response, next: NextFunction) => {
  const authDiscordId = (res.locals.discordAuth as { discordUserId?: string } | undefined)?.discordUserId;
  const sessionDiscordId = req.session?.discordUserId || authDiscordId;
  if (!sessionDiscordId || !ADMIN_DISCORD_IDS.has(sessionDiscordId)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
};
const proxyBotApi = async (req: Request, res: Response, method: 'get' | 'post', path: string) => {
  try {
    let requestBuilder = method === 'get'
      ? superagent.get(`${FLAME_BOT_INTERNAL_URL}${path}`)
      : superagent.post(`${FLAME_BOT_INTERNAL_URL}${path}`);
    const apiKey = req.header('X-API-Key') || FLAME_BOT_API_KEY;
    if (apiKey) requestBuilder = requestBuilder.set('X-API-Key', apiKey);
    if (method === 'post') {
      const payload: Record<string, unknown> = { ...(req.body ?? {}) };
      if (path === '/api/bot/send') {
        const authDiscordId = (res.locals.discordAuth as { discordUserId?: string } | undefined)?.discordUserId;
        const sessionDiscordId = req.session?.discordUserId || authDiscordId;
        // Always use the authenticated Discord ID and ignore any caller-provided discord_id.
        payload.discord_id = typeof sessionDiscordId === 'string' ? sessionDiscordId.trim() : '';
        if (!payload.message) {
          const fallbackMessage = payload.content ?? payload.text;
          if (typeof fallbackMessage === 'string') {
            payload.message = fallbackMessage;
          }
        }
      }
      requestBuilder = requestBuilder.send(payload);
    }
    const upstream = await requestBuilder.timeout({ response: 10000, deadline: 15000 });
    res.status(upstream.status).json(upstream.body);
  } catch (err: any) {
    const status = err?.status;
    const body = err?.response?.body;
    if (status && body) {
      return res.status(status).json(body);
    }
    return res.status(503).json({
      error: 'Bot API unavailable',
      hint: 'flame_bot may not be reachable on its internal API port',
    });
  }
};

app.get('/api/bot/servers', botRouteLimiter, requireDiscordAuth, requireDiscordAdmin, async (req: Request, res: Response) =>
  proxyBotApi(req, res, 'get', '/api/bot/servers'));
app.get('/api/bot/commands/usage', botRouteLimiter, requireDiscordAuth, requireDiscordAdmin, async (req: Request, res: Response) =>
  proxyBotApi(req, res, 'get', '/api/bot/commands/usage'));
app.post('/api/bot/send', botRouteLimiter, requireDiscordAuth, requireDiscordAdmin, async (req: Request, res: Response) =>
  proxyBotApi(req, res, 'post', '/api/bot/send'));

// Discord OAuth routes — must be mounted BEFORE the auth guard so the login
// page and callback are reachable without an existing session.
app.use('/auth', discordAuthRouter);

// Admin panel — mounted before the Discord auth guard so the admin login page
// is reachable without a Discord session.  The admin router enforces its own
// ADMIN_PASSWORD check for all routes except /admin/login.
app.use('/admin', adminRouter);

// Discord authentication guard — protects every subsequent route and static file.
app.use(requireDiscordAuth);

const clientUiPath = join(__dirname, '../..', 'bar3-client', 'dist');
if (!existsSync(clientUiPath)) {
  console.warn(`[Warning] bar3-client build output not found at ${clientUiPath}. UI routes may return 503 until the client is built.`);
}
app.use(express.static(clientUiPath));

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bar3';
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Initialize Database
connectDB();

// Routes
app.use('/api', accountRoutes);
app.use('/api/v2/auth', v2AuthRouter);
app.use('/api/v2/templates', v2TemplatesRouter);
app.use('/api/v2/automation', v2AutomationRouter);
app.use('/api/v2/send-test', v2SendTestRouter);
app.use('/api/v2/analytics', v2AnalyticsRouter);
// Mount legacy UI + wildcard route after API routes so it doesn't intercept /api/v2/* GET requests.
mountLegacyUiAndApi(app);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Start v2 multi-user automation loop (non-breaking for legacy Bar3)
startAutomationLoop();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});
