import { Express, Router } from 'express';
import express from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { Config, Message } from '../interfaces/types';
import state from '../services/state';
import messages from '../services/messages';
import dLog from '../utilities/debugLog';
import * as userService from '../services/userService';
import * as messageService from '../services/messageService';
import analyticsRouter from './routers/v2/analytics';

const legacyApiRouter = Router();
const app = express();

const ensureSession = (apiKey: string) => {
  if (!state.userKeys[apiKey]) {
    const sessionConfig = new Config();
    sessionConfig.apiKey = apiKey;

    state.userKeys[apiKey] = {
      sentMessages: [],
      config: sessionConfig,
      applicationOn: false,
    };
  }

  return state.userKeys[apiKey];
};

const resolveApiKey = (req: any): string | undefined => {
  const keyFromBody = req.body?.apiKey;
  const keyFromQuery = req.query?.apiKey;
  const keyFromHeader = req.headers?.['x-api-key'];
  const key = keyFromBody || keyFromQuery || keyFromHeader;
  return typeof key === 'string' ? key.trim() : undefined;
};

const requireApiKey = (req: any, res: any): string | undefined => {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    res.status(400).send('API key required');
    return undefined;
  }
  return apiKey;
};

const getScopedConfig = (apiKey: string): Config => ensureSession(apiKey).config;
const getScopedSentMessages = (apiKey: string): Message[] => ensureSession(apiKey).sentMessages as Message[];

const getValidatedUserIdFromApiKey = async (apiKey: string): Promise<string | null> => {
  const validation = await userService.validateApiKey(apiKey).catch(() => null);
  if (!validation || !validation.isValid) return null;
  return validation.userId;
};

legacyApiRouter.post('/setApiKey', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;

  const scopedSession = ensureSession(apiKey);
  scopedSession.config.apiKey = apiKey;

  dLog(`API key registered for legacy session: ${apiKey}`);
  return res.status(200).end();
});

legacyApiRouter.post('/sendMessage', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;

  const scopedConfig = getScopedConfig(apiKey);

  const messageHTML = req.body.messageHTML;
  if (typeof messageHTML === 'string') {
    scopedConfig.messageHTML = messageHTML;
  }

  const messageSubject = req.body.messageSubject;
  if (typeof messageSubject === 'string') {
    scopedConfig.messageSubject = messageSubject;
  }

  const nationID = parseInt(req.body.nationID, 10);
  const nationName = req.body.nationName;
  const leaderName = req.body.leaderName;

  if (!Number.isFinite(nationID) || !nationName || !leaderName) {
    return res.status(400).send('Missing nation data');
  }

  dLog(`Sending message for legacy session ${apiKey}`);

  const message = await messages.sendMessageWithConfig(scopedConfig, {
    nation_id: nationID,
    nation: nationName,
    leader: leaderName,
  });

  if (!message.successful) {
    dLog(`Failed to send message for legacy session ${apiKey}`);
    return res.status(400).end();
  }

  getScopedSentMessages(apiKey).push(message);
  dLog(`Message sent successfully for legacy session ${apiKey}`);

  return res.status(204).end();
});

legacyApiRouter.get('/appData', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;

  const scopedSession = ensureSession(apiKey);

  return res.status(200).json({
    applicationOn: scopedSession.applicationOn,
    isSetup: state.isSetup,
    sentMessages: getScopedSentMessages(apiKey),
    apiDetails: {
      used: state.requestsUsed,
      max: state.requestsMax,
    },
    serverVersion: state.serverVersion,
  });
});

legacyApiRouter.get('/config', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;

  const scopedConfig = getScopedConfig(apiKey);

  // Load latest editor message from Mongo per user (if this api key belongs to a User account).
  const userId = await getValidatedUserIdFromApiKey(apiKey);
  if (userId) {
    const userMessages = await messageService.getUserMessages(userId).catch(() => []);
    if (userMessages.length > 0 && typeof userMessages[0].content === 'string') {
      scopedConfig.messageHTML = userMessages[0].content;
    }
  }

  dLog(`Sending config for legacy session ${apiKey}`);
  return res.status(200).json(scopedConfig);
});

legacyApiRouter.post('/setConfig', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;

  const scopedConfig = getScopedConfig(apiKey);
  const mergedConfig = Object.assign(scopedConfig, req.body.config || {});
  ensureSession(apiKey).config = mergedConfig;

  // Persist editor message to Mongo for the authenticated api-key user.
  const userId = await getValidatedUserIdFromApiKey(apiKey);
  if (userId && typeof mergedConfig.messageHTML === 'string' && mergedConfig.messageHTML.trim()) {
    await messageService.saveMessage(userId, mergedConfig.messageHTML, {
      source: 'legacy-editor',
      subject: mergedConfig.messageSubject || '',
      currentEditor: mergedConfig.currentEditor,
    }).catch(() => undefined);
  }

  dLog('Updated config: ' + JSON.stringify(req.body.config));
  return res.status(204).end();
});
app.use('/api/v2/analytics', analyticsRouter);

legacyApiRouter.post('/setApplicationState', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;

  ensureSession(apiKey).applicationOn = !!req.body.applicationOn;
  return res.status(204).end();
});

export const mountLegacyUiAndApi = (app: Express) => {
  app.use('/api', legacyApiRouter);
  app.use('/analytics', analyticsRouter);

  const indexPath = join(__dirname, '../../..', 'public/index.html');

  app.get('*', async (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/analytics')) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!existsSync(indexPath)) {
      return res.status(404).json({
        error: 'UI build not found',
        hint: 'Deploy the client separately or include public/index.html in this service',
      });
    }

    return res.sendFile(indexPath);
  });
};

export default legacyApiRouter;
