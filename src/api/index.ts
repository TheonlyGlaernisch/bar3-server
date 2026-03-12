import { Express, Router } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import state from '../services/state';
import messages from '../services/messages';
import dLog from '../utilities/debugLog';
import analyticsRouter from './routers/analytics';

const legacyApiRouter = Router();

// --- Initialize per-user API key storage ---
if (!state.userKeys) {
  state.userKeys = {}; // { [apiKey: string]: { sentMessages: any[] } }
}

// 1️⃣ Set API key for a user
legacyApiRouter.post('/setApiKey', async (req, res) => {
  const apiKey = req.body.apiKey;
  if (!apiKey) return res.status(400).send('No API key provided');

  if (!state.userKeys[apiKey]) {
    state.userKeys[apiKey] = { sentMessages: [] }; // new user/session
    dLog(`New API key registered: ${apiKey}`);
  } else {
    dLog(`Existing API key used: ${apiKey}`);
  }

  return res.status(200).end();
});

// 2️⃣ Send a message (per API key)
legacyApiRouter.post('/sendMessage', async (req, res) => {
  const apiKey = req.body.apiKey;
  if (!apiKey || !state.userKeys[apiKey]) {
    return res.status(400).send('API key not set or unknown');
  }

  const messageHTML = req.body.messageHTML;
  const nationID = parseInt(req.body.nationID, 10);
  const nationName = req.body.nationName;
  const leaderName = req.body.leaderName;

  dLog(`Sending message for API key ${apiKey}: ${messageHTML}`);

  const message = await messages.sendMessage({
    nation_id: nationID,
    nation: nationName,
    leader: leaderName,
  });

  if (!message.successful) {
    dLog(`Failed to send message for API key ${apiKey}`);
    return res.status(400).end();
  }

  state.userKeys[apiKey].sentMessages.push(message);
  dLog(`Message sent successfully for API key ${apiKey}`);

  return res.status(204).end();
});

// 3️⃣ Get application data (per API key)
legacyApiRouter.get('/appData', async (req, res) => {
  const apiKey = req.query.apiKey as string;
  if (!apiKey || !state.userKeys[apiKey]) {
    return res.status(400).send('API key not set or unknown');
  }

  return res.status(200).json({
    applicationOn: state.isApplicationOn,
    isSetup: state.isSetup,
    sentMessages: state.userKeys[apiKey].sentMessages,
    apiDetails: {
      used: state.requestsUsed,
      max: state.requestsMax,
    },
    serverVersion: state.serverVersion,
  });
});

// 4️⃣ Existing config endpoints
legacyApiRouter.get('/config', async (_, res) => {
  dLog('Sending config.');
  return res.status(200).json(state.config);
});

legacyApiRouter.post('/setConfig', async (req, res) => {
  const mergedConfig = Object.assign(state.config, req.body.config);
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
