import {  Router , Request, Response } from 'express';
import express from 'express';
import { Express } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { Config, Message } from '../interfaces/types';
import state from '../services/state';
import messages from '../services/messages';
import dLog from '../utilities/debugLog';
import * as userService from '../services/userService';
import * as messageService from '../services/messageService';
import analyticsRouterV2 from './routers/v2/analytics';
import analyticsRouter from './routers/analytics';
import superagent from 'superagent';
import { sha256Hex } from '../utilities/cryptoBox';
import { sanitizeTemplateCss, sanitizeTemplateHtml } from '../utilities/sanitizeTemplateContent';
import { PwAccount } from '../interfaces/schemas/PwAccountSchema';
import { MessageTemplate } from '../interfaces/schemas/MessageTemplateSchema';

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
      apiDetails: { used: 0, max: 0 },
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
const PW_API_BASE_URL = (process.env.PW_API_BASE_URL || 'https://politicsandwar.com/api/v2').replace(/\/$/, '');

type PwCollectionName = 'nations' | 'alliances';

function buildPwQuery(req: Request): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key.toLowerCase() === 'apikey') continue;
    if (typeof value === 'string' && value.trim()) {
      query[key] = value.trim();
      continue;
    }
    if (Array.isArray(value)) {
      const flattened = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (flattened.length > 0) {
        query[key] = flattened.join(',');
      }
    }
  }
  return query;
}

async function fetchPwCollection(req: Request, collection: PwCollectionName) {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return { error: { status: 400, body: { error: 'API key required' } } };
  }

  const endpoint = `${PW_API_BASE_URL}/${collection}/${encodeURIComponent(apiKey)}/`;
  try {
    const response = await superagent
      .get(endpoint)
      .query(buildPwQuery(req))
      .timeout({ response: 10000, deadline: 15000 });
    return { response };
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 502;
    const body = err?.response?.body || { error: `Failed to fetch ${collection}` };
    return { error: { status, body } };
  }
}

function extractPwCollectionRows(rawBody: any): any[] {
  if (Array.isArray(rawBody?.data)) return rawBody.data;
  if (Array.isArray(rawBody)) return rawBody;
  return [];
}

function pickSingleEntity(rows: any[], query: Record<string, unknown>, idKeys: string[], nameKeys: string[]): any | null {
  const normalizedIdQueryValues = idKeys
    .map((key) => query[key])
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (normalizedIdQueryValues.length > 0) {
    const byId = rows.find((row: any) => {
      const candidateIds = [
        row?.id,
        row?.nation_id,
        row?.alliance_id,
      ].map((value) => String(value ?? '').trim());
      return normalizedIdQueryValues.some((wantedId) => candidateIds.includes(wantedId));
    });
    if (byId) return byId;
  }

  const normalizedNameQueryValues = nameKeys
    .map((key) => query[key])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (normalizedNameQueryValues.length > 0) {
    const byName = rows.find((row: any) => {
      const candidateNames = [
        row?.nation,
        row?.nation_name,
        row?.name,
        row?.alliance,
        row?.alliance_name,
        row?.leader,
        row?.leader_name,
      ].filter((value): value is string => typeof value === 'string')
        .map((value) => value.toLowerCase());
      return normalizedNameQueryValues.some((wantedName) => candidateNames.includes(wantedName));
    });
    if (byName) return byName;
  }

  return rows[0] ?? null;
}

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
    scopedConfig.messageHTML = sanitizeTemplateHtml(messageHTML);
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
    apiDetails: scopedSession.apiDetails ?? { used: state.requestsUsed, max: state.requestsMax },
    serverVersion: state.serverVersion,
  });
});

legacyApiRouter.get('/config', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;

  const scopedConfig = getScopedConfig(apiKey);

  // Load latest template from MongoDB for the PwAccount that owns this API key.
  // This is the canonical store for subject, bodyHtml, bodyCss saved via the v2 editor.
  const pwApiKeyHash = sha256Hex(apiKey);
  const pwAccount = await PwAccount.findOne({ pwApiKeyHash }).exec().catch(() => null);
  if (pwAccount) {
    const template = await MessageTemplate.findOne({ accountId: pwAccount._id })
      .sort({ updatedAt: -1 })
      .exec()
      .catch(() => null);
    if (template) {
      if (template.subject) scopedConfig.messageSubject = template.subject;
      if (template.bodyHtml) {
        const safeBodyHtml = sanitizeTemplateHtml(template.bodyHtml);
        scopedConfig.messageHTML = safeBodyHtml;
        scopedConfig.advancedRaw.html = safeBodyHtml;
      }
      if (template.bodyCss) {
        scopedConfig.advancedRaw.css = sanitizeTemplateCss(template.bodyCss);
      }
      // Restore the editor tab the user was last using.
      if (typeof template.currentEditor === 'number') {
        scopedConfig.currentEditor = template.currentEditor;
      }
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
  if (typeof mergedConfig.messageHTML === 'string') {
    mergedConfig.messageHTML = sanitizeTemplateHtml(mergedConfig.messageHTML);
  }
  if (mergedConfig.advancedRaw && typeof mergedConfig.advancedRaw === 'object') {
    if (typeof mergedConfig.advancedRaw.html === 'string') {
      mergedConfig.advancedRaw.html = sanitizeTemplateHtml(mergedConfig.advancedRaw.html);
    }
    if (typeof mergedConfig.advancedRaw.css === 'string') {
      mergedConfig.advancedRaw.css = sanitizeTemplateCss(mergedConfig.advancedRaw.css);
    }
  }
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

legacyApiRouter.post('/setApplicationState', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;

  ensureSession(apiKey).applicationOn = !!req.body.applicationOn;
  return res.status(204).end();
});

const handleNations = async (req: Request, res: Response) => {
  const result = await fetchPwCollection(req, 'nations');
  if (result.error) {
    return res.status(result.error.status).json(result.error.body);
  }
  return res.status(result.response.status).json(result.response.body);
};

const handleNation = async (req: Request, res: Response) => {
  const result = await fetchPwCollection(req, 'nations');
  if (result.error) {
    return res.status(result.error.status).json(result.error.body);
  }
  const rows = extractPwCollectionRows(result.response.body);
  const selected = pickSingleEntity(
    rows,
    req.query as Record<string, unknown>,
    ['id', 'nationId', 'nation_id', 'nationID'],
    ['nation', 'nationName', 'nation_name', 'leader', 'leaderName']
  );
  if (!selected) {
    return res.status(404).json({ error: 'Nation not found' });
  }
  return res.status(200).json(selected);
};

const handleAlliances = async (req: Request, res: Response) => {
  const result = await fetchPwCollection(req, 'alliances');
  if (result.error) {
    return res.status(result.error.status).json(result.error.body);
  }
  return res.status(result.response.status).json(result.response.body);
};

const handleAlliance = async (req: Request, res: Response) => {
  const result = await fetchPwCollection(req, 'alliances');
  if (result.error) {
    return res.status(result.error.status).json(result.error.body);
  }
  const rows = extractPwCollectionRows(result.response.body);
  const selected = pickSingleEntity(
    rows,
    req.query as Record<string, unknown>,
    ['id', 'allianceId', 'alliance_id', 'allianceID'],
    ['alliance', 'allianceName', 'alliance_name', 'name']
  );
  if (!selected) {
    return res.status(404).json({ error: 'Alliance not found' });
  }
  return res.status(200).json(selected);
};

legacyApiRouter.get('/nations', handleNations);
legacyApiRouter.get('/nation', handleNation);
legacyApiRouter.get('/alliances', handleAlliances);
legacyApiRouter.get('/alliance', handleAlliance);

const compatibilityAliasRouter = Router();
compatibilityAliasRouter.get('/nations', handleNations);
compatibilityAliasRouter.get('/nation', handleNation);
compatibilityAliasRouter.get('/alliances', handleAlliances);
compatibilityAliasRouter.get('/alliance', handleAlliance);

export const mountLegacyUiAndApi = (app: Express ) => {
  app.use('/api', legacyApiRouter);
  app.use(compatibilityAliasRouter);
  app.use('/analytics', analyticsRouter);
  app.use('/analytics/v2', analyticsRouterV2);

  const indexPath = join(__dirname, '../../..', 'bar3-client/dist/index.html');

  app.get('*', async (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/analytics')) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!existsSync(indexPath)) {
      return res.status(503).json({
        error: 'bar3-client UI build not found',
        hint: 'Build bar3-client and deploy its dist assets with bar3-server',
      });
    }

    return res.sendFile(indexPath);
  });
};

export default legacyApiRouter;
