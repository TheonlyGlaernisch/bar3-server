import express, { Express, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { join } from 'path';
import session from 'express-session';
import accountRoutes from './api/AccountRoutes';
import { mountLegacyUiAndApi } from './api';
import v2AuthRouter from './api/routers/v2/auth';
import v2TemplatesRouter from './api/routers/v2/templates';
import v2AutomationRouter from './api/routers/v2/automation';
import v2AnalyticsRouter from './api/routers/v2/analytics';
import v2SendTestRouter from './api/routers/v2/sendTest';
import discordAuthRouter from './api/routers/discord/auth';
import rolesRouter from './api/routers/discord/roles';
import { requireDiscordAuth } from './api/middleware/discordAuth';
import { startAutomationLoop } from './services/v2AutomationRunner';
// Extend express-session SessionData with Discord fields
import './interfaces/session';

mongoose.set('strictQuery', true);

const app: Express = express();

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
const CLIENT_APP_URL = process.env.CLIENT_APP_URL;
const ALLOWED_ORIGINS: Set<string> = new Set(
  (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);
// If CLIENT_APP_URL is set, that origin must always be allowed so that the
// client SPA can make credentialled cross-origin requests (e.g. /auth/session).
// This means you only need to set CLIENT_APP_URL; setting CLIENT_ORIGIN
// separately is optional and additive.
if (CLIENT_APP_URL) {
  ALLOWED_ORIGINS.add(CLIENT_APP_URL);
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    // Reflect the exact origin back and allow credentials (cookies/auth headers)
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  } else if (ALLOWED_ORIGINS.size === 0) {
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

// Suppress browser favicon 404s — there is no icon file to serve.
app.get('/favicon.ico', (_req: Request, res: Response) => res.status(204).end());

// Discord OAuth routes — must be mounted BEFORE the auth guard so the login
// page and callback are reachable without an existing session.
app.use('/auth', discordAuthRouter);

// Discord authentication guard — protects every subsequent route and static file.
app.use(requireDiscordAuth);

app.use(express.static(join(__dirname, '../..', 'public')));

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
app.use('/api/roles', rolesRouter);
app.use('/api/v2/auth', v2AuthRouter);
app.use('/api/v2/templates', v2TemplatesRouter);
app.use('/api/v2/automation', v2AutomationRouter);
app.use('/api/v2/send-test', v2SendTestRouter);
app.use('/api/v2/analytics', v2AnalyticsRouter);
// Mount legacy UI + wildcard route after API routes so it doesn't intercept /api/v2/* GET requests.
mountLegacyUiAndApi(app);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'Server is running' });
});

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

