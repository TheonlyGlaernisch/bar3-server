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
import { requireDiscordAuth } from './api/middleware/discordAuth';
import { startAutomationLoop } from './services/v2AutomationRunner';
// Extend express-session SessionData with Discord fields
import './interfaces/session';

mongoose.set('strictQuery', true);

const app: Express = express();

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
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Discord OAuth routes — must be mounted BEFORE the auth guard so the login
// page and callback are reachable without an existing session.
app.use('/auth', discordAuthRouter);

// Discord authentication guard — protects every subsequent route and static file.
app.use(requireDiscordAuth);

app.use(express.static(join(__dirname, '../..', 'public')));

// CORS (if needed for frontend communication)
app.use((req: Request, res: Response, next: NextFunction) => {
  // For production you might want to restrict this to your actual frontend domain
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, x-api-key, Authorization'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});
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

