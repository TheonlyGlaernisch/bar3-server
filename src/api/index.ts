import { Express, Router } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { Config, Message } from '../interfaces/types';
import state from '../services/state';
import messages from '../services/messages';
import dLog from '../utilities/debugLog';
import analyticsRouter from './routers/analytics';

const legacyApiRouter = Router();

const getDefaultSessionKey = () => '__legacy_default__';

const ensureSession = (apiKey?: string) => {
  const sessionKey = apiKey || getDefaultSessionKey();

  if (!state.userKeys[sessionKey]) {
    const sessionConfig = new Config();

    if (apiKey) {
      sessionConfig.apiKey = apiKey;
    }

    state.userKeys[sessionKey] = {
      sentMessages: [],
      config: sessionConfig,
    };
  }

  return state.userKeys[sessionKey];
};

const resolveApiKey = (req: any): string | undefined => {
  const keyFromBody = req.body?.apiKey;
  const keyFromQuery = req.query?.apiKey;
  const keyFromHeader = req.headers?.['x-api-key'];

  const key = keyFromBody || keyFromQuery || keyFromHeader;
  return typeof key === 'string' ? key.trim() : undefined;
};

const getScopedConfig = (apiKey?: string): Config => {
  const scopedSession = ensureSession(apiKey);
  return scopedSession.config;
};

const getScopedSentMessages = (apiKey?: string): Message[] => {
  const scopedSession = ensureSession(apiKey);
  return scopedSession.sentMessages as Message[];
};

legacyApiRouter.post('/setApiKey', async (req, res) => {
  const apiKey = resolveApiKey(req);

  if (!apiKey) {
    return res.status(400).send('No API key provided');
  }

  const scopedSession = ensureSession(apiKey);
  scopedSession.config.apiKey = apiKey;

  state.config.apiKey = apiKey;

  dLog(`API key registered for legacy session: ${apiKey}`);

  return res.status(200).end();
});

legacyApiRouter.post('/sendMessage', async (req, res) => {
  const apiKey = resolveApiKey(req);
  const scopedConfig = getScopedConfig(apiKey);

  if (!scopedConfig.apiKey) {
    return res.status(400).send('API key not set or unknown');
  }

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

  const previousConfig = state.config;
  state.config = scopedConfig;

  dLog(`Sending message for legacy session ${apiKey || getDefaultSessionKey()}`);

  const message = await messages.sendMessage({
    nation_id: nationID,
    nation: nationName,
    leader: leaderName,
  });

  state.config = previousConfig;

  if (!message.successful) {
    dLog(`Failed to send message for legacy session ${apiKey || getDefaultSessionKey()}`);
    return res.status(400).end();
  }

  getScopedSentMessages(apiKey).push(message);
  dLog(`Message sent successfully for legacy session ${apiKey || getDefaultSessionKey()}`);

  return res.status(204).end();
});

legacyApiRouter.get('/appData', async (req, res) => {
  const apiKey = resolveApiKey(req);

  return res.status(200).json({
    applicationOn: state.isApplicationOn,
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
  const apiKey = resolveApiKey(req);
  dLog(`Sending config for legacy session ${apiKey || getDefaultSessionKey()}`);
  return res.status(200).json(getScopedConfig(apiKey));
});

legacyApiRouter.post('/setConfig', async (req, res) => {
  const apiKey = resolveApiKey(req);

  const scopedConfig = getScopedConfig(apiKey);
  const mergedConfig = Object.assign(scopedConfig, req.body.config);

  if (typeof mergedConfig.apiKey === 'string' && mergedConfig.apiKey.trim()) {
    ensureSession(mergedConfig.apiKey).config = mergedConfig;
  }

  if (apiKey) {
    ensureSession(apiKey).config = mergedConfig;
  }

  state.writeConfig(mergedConfig);

  dLog('Updated config: ' + JSON.stringify(req.body.config));
  return res.status(204).end();
});

legacyApiRouter.post('/setApplicationState', async (req, res) => {
  state.setApplicationOn(req.body.applicationOn);
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
