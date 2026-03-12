// server/index.ts (or main backend file)
import express from 'express';
import cors from 'cors';
import state from '../services/state';
import messages from '../services/messages';
import dLog from '../utilities/debugLog';
import { join } from 'path';



const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(join(__dirname, '../../..', 'public')));

// --- Initialize per-user API key storage ---
if (!state.userKeys) {
  state.userKeys = {}; // { [apiKey: string]: { sentMessages: any[] } }
}

// --------------------
// Endpoints
// --------------------

// 1️⃣ Set API key for a user
app.post('/api/setApiKey', async (req, res) => {
  const apiKey = req.body.apiKey;
  if (!apiKey) return res.status(400).send("No API key provided");

  if (!state.userKeys[apiKey]) {
    state.userKeys[apiKey] = { sentMessages: [] }; // new user/session
    dLog(`New API key registered: ${apiKey}`);
  } else {
    dLog(`Existing API key used: ${apiKey}`);
  }

  res.status(200).end();
});

// 2️⃣ Send a message (per API key)
app.post('/api/sendMessage', async (req, res) => {
  const apiKey = req.body.apiKey;
  if (!apiKey || !state.userKeys[apiKey]) {
    return res.status(400).send("API key not set or unknown");
  }

  const messageHTML = req.body.messageHTML;
  const nationID = parseInt(req.body.nationID);
  const nationName = req.body.nationName;
  const leaderName = req.body.leaderName;

  dLog(`Sending message for API key ${apiKey}: ${messageHTML}`);

  // Pass the user-specific API key to messages module
  const message = await messages.sendMessage({
    nation_id: nationID,
    nation: nationName,
    leader: leaderName,
  });

  if (!message.successful) {
    dLog(`Failed to send message for API key ${apiKey}`);
    return res.status(400).end();
  }

  // Store message for this API key
  state.userKeys[apiKey].sentMessages.push(message);
  dLog(`Message sent successfully for API key ${apiKey}`);

  res.status(204).end();
});

// 3️⃣ Get application data (per API key)
app.get('/api/appData', async (req, res) => {
  const apiKey = req.query.apiKey as string;
  if (!apiKey || !state.userKeys[apiKey]) {
    return res.status(400).send("API key not set or unknown");
  }

  res.status(200).json({
    applicationOn: state.isApplicationOn,
    isSetup: state.isSetup,
    sentMessages: state.userKeys[apiKey].sentMessages,
    apiDetails: {
      used: state.requestsUsed,
      max: state.requestsMax,
    },
    serverVersion: state.serverVersion,
  });

  dLog(`Sending application data for API key ${apiKey}`);
});

// 4️⃣ Existing config endpoints (unchanged)
app.get('/api/config', async (req, res) => {
  res.status(200).json(state.config);
  dLog('Sending config.');
});

app.post('/api/setConfig', async (req, res) => {
  const mergedConfig = Object.assign(state.config, req.body.config);
  state.writeConfig(mergedConfig);
  dLog('Updated config: ' + JSON.stringify(req.body.config));
  res.status(204).end();
});

app.post('/api/setApplicationState', async (req, res) => {
  state.setApplicationOn(req.body.applicationOn);
  res.status(204).end();
});

import analyticsRouter from './routers/analytics';
app.use('/analytics', analyticsRouter);

// SPA fallback
app.get('*', async (req, res) => {
  res.sendFile(join(__dirname, '../../..', 'public/index.html'));
});

app.listen(state.port, () => {
  console.log(`Server running on port ${state.port}`);
});
