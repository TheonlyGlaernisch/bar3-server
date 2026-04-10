import express, { Request, Response } from 'express';
import { requirePwSession } from '../../middleware/pwAuth'; // ✅ Middleware to set req.pwAccount
import { AutomationSettings } from '../../../interfaces/schemas/AutomationSettingsSchema'; // <--- Use the correct model
import { MessageTemplate } from '../../../interfaces/schemas/MessageTemplateSchema';
import { getDecryptedApiKeyForAccount } from '../../../services/pwAccountService';
import messagesService from '../../../services/messages';
import { injectTrackingIntoHtml } from '../../../services/v2Analytics';
import { combineHtmlAndCss } from '../../../utilities/combineHtmlAndCss';
import superagent from 'superagent';
import { NationAPICall } from '../../../interfaces/types';
// import AutomationState from '../../../models/AutomationState'; // (Not used here, fine to remove if not needed)

const router = express.Router();
router.use(express.json());

function parseLastActive(lastActive: string): number {
  const parsed = Date.parse(lastActive);
  if (Number.isFinite(parsed)) return parsed;

  const withUtc = Date.parse(`${lastActive} UTC`);
  if (Number.isFinite(withUtc)) return withUtc;

  return NaN;
}

function hasDiscordValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

interface CandidateFilters {
  minCities?: number;
  maxCities?: number;
}

interface GraphqlNationLike {
  nation_id?: number;
  id?: number;
  nation?: string;
  nation_name?: string;
  leader?: string;
  leader_name?: string;
  cities?: number;
  num_cities?: number;
  alliance_id?: number;
  alliance_position?: number;
  last_active?: string;
  discord?: string;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toV2NationShape(node: GraphqlNationLike): NationAPICall.Nation | null {
  const nationId = parseOptionalNumber(node.nation_id ?? node.id);
  const nationName = typeof node.nation === 'string' ? node.nation : node.nation_name;
  const leaderName = typeof node.leader === 'string' ? node.leader : node.leader_name;
  const cities = parseOptionalNumber(node.cities ?? node.num_cities);
  const allianceId = parseOptionalNumber(node.alliance_id) ?? 0;
  const alliancePosition = parseOptionalNumber(node.alliance_position) ?? 0;
  const lastActive = typeof node.last_active === 'string' ? node.last_active : '';

  if (!nationId || !nationName || !leaderName || typeof cities !== 'number') return null;

  return {
    nation_id: nationId,
    nation: nationName,
    leader: leaderName,
    continent: 0,
    war_policy: 0,
    domestic_policy: 0,
    color: 0,
    alliance_id: allianceId,
    alliance: '',
    alliance_position: alliancePosition,
    cities,
    offensive_wars: 0,
    defensive_wars: 0,
    score: 0,
    v_mode: false,
    v_mode_turns: 0,
    beige_turns: 0,
    last_active: lastActive,
    discord: typeof node.discord === 'string' ? node.discord : '',
    founded: '',
    soldiers: 0,
    tanks: 0,
    aircraft: 0,
    ships: 0,
    missiles: 0,
    nukes: 0,
  };
}

async function getActiveUnalliedCandidatesGraphql(
  apiKey: string,
  filters?: CandidateFilters
): Promise<NationAPICall.Nation[] | null> {
  const endpoint = (process.env.PW_GRAPHQL_URL || 'https://api.politicsandwar.com/graphql').trim();
  const queries = [
    `
      query Nations {
        nations(alliance_position: 0) {
          id
          nation_name
          leader_name
          alliance_id
          alliance_position
          num_cities
          last_active
          discord
        }
      }
    `,
    `
      query Nations {
        nations {
          id
          nation_name
          leader_name
          alliance_id
          alliance_position
          num_cities
          last_active
          discord
        }
      }
    `,
    `
      query Nations {
        nations(first: 500, page: 1) {
          data {
            id
            nation_name
            leader_name
            alliance_id
            alliance_position
            num_cities
            last_active
            discord
          }
        }
      }
    `,
    `
      query Nations {
        nations(first: 500) {
          data {
            id
            nation_name
            leader_name
            alliance_id
            alliance_position
            num_cities
            last_active
            discord
          }
        }
      }
    `,
    `
      query Nations {
        nations(alliancePosition: 0) {
          id
          nation_name
          leader_name
          alliance_id
          alliance_position
          num_cities
          last_active
          discord
        }
      }
    `,
  ];

  const authModes: Array<(req: superagent.SuperAgentRequest) => superagent.SuperAgentRequest> = [
    (req) => req.query({api_key: apiKey}),
    (req) => req.set('Authorization', `Bearer ${apiKey}`),
    (req) => req.set('X-Api-Key', apiKey),
  ];

  let nations: NationAPICall.Nation[] | null = null;
  for (const query of queries) {
    for (const applyAuth of authModes) {
      const request = applyAuth(superagent.post(endpoint))
        .accept('json')
        .send({query})
        .ok(() => true);

      const response = await request.catch(() => undefined);
      const body = response?.body as {
        data?: { nations?: GraphqlNationLike[] };
        errors?: Array<{ message?: string }>;
      } | undefined;

      if (!body) continue;
      const nationNodes = Array.isArray((body.data as any)?.nations)
        ? (body.data as any).nations
        : Array.isArray((body.data as any)?.nations?.data)
          ? (body.data as any).nations.data
          : Array.isArray((body.data as any)?.nations?.edges)
            ? (body.data as any).nations.edges.map((edge: any) => edge?.node).filter(Boolean)
            : undefined;

      if (Array.isArray(nationNodes)) {
        nations = nationNodes
          .map((node) => toV2NationShape(node))
          .filter((nation): nation is NationAPICall.Nation => nation !== null);
        break;
      }
    }
    if (nations) break;
  }

  if (!nations) return null;

  const now = Date.now();
  const activeSince = now - (24 * 60 * 60 * 1000);
  return nations
    .filter((nation) => nation.alliance_id === 0 || nation.alliance_position === 0)
    .filter((nation) => {
      const ts = parseLastActive(nation.last_active);
      return Number.isFinite(ts) && ts >= activeSince;
    })
    .filter((nation) => {
      if (typeof filters?.minCities === 'number' && nation.cities < filters.minCities) return false;
      if (typeof filters?.maxCities === 'number' && nation.cities > filters.maxCities) return false;
      return true;
    });
}

async function getActiveUnalliedCandidates(
  apiKey: string,
  filters?: CandidateFilters
): Promise<NationAPICall.Nation[] | null> {
  return getActiveUnalliedCandidatesGraphql(apiKey, filters);
}

// GET automation state
router.get('/state', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const settings = await AutomationSettings.findOne({ accountId }).exec();
  return res.status(200).json({
    enabled: settings?.enabled || false,
  });
});

// POST automation state
router.post('/state', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id;
  const enabled = !!req.body?.enabled;
  await AutomationSettings.findOneAndUpdate(
    { accountId },
    { enabled, lastScanAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
  return res.status(204).end();
});

// Send to nations active in the past 24h and not in an alliance.
router.post('/send-active-unallied', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id.toString();
  const dryRun = req.body?.dryRun === true;
  const minCities = parseOptionalNumber(req.body?.minCities);
  const maxCities = parseOptionalNumber(req.body?.maxCities);

  if (typeof minCities === 'number' && minCities < 0) {
    return res.status(400).json({ error: 'minCities must be >= 0' });
  }
  if (typeof maxCities === 'number' && maxCities < 0) {
    return res.status(400).json({ error: 'maxCities must be >= 0' });
  }
  if (typeof minCities === 'number' && typeof maxCities === 'number' && minCities > maxCities) {
    return res.status(400).json({ error: 'minCities cannot be greater than maxCities' });
  }

  const template = await MessageTemplate.findOne({ accountId }).sort({ updatedAt: -1 }).exec();
  if (!template) return res.status(400).json({ error: 'No saved template found for this user' });

  const pwKey = await getDecryptedApiKeyForAccount(accountId).catch(() => '');
  if (!pwKey) return res.status(500).json({ error: 'Could not decrypt user API key' });

  const candidates = await getActiveUnalliedCandidates(pwKey, { minCities, maxCities });
  if (!candidates) {
    return res.status(502).json({ error: 'Failed to fetch target nations from Politics & War API' });
  }

  if (dryRun) {
    return res.status(200).json({
      success: true,
      dryRun: true,
      filters: { minCities, maxCities },
      totalCandidates: candidates.length,
      preview: candidates.slice(0, 25).map((nation) => ({
        nationId: nation.nation_id,
        nation: nation.nation,
        leader: nation.leader,
        lastActive: nation.last_active,
        cities: nation.cities,
      })),
    });
  }

  const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '')
    .trim()
    .replace(/\/$/, '');

  const configLike = {
    apiKey: pwKey,
    messageHTML: combineHtmlAndCss(template.bodyHtml || template.bodyText || '', template.bodyCss),
    messageSubject: template.subject || '',
    analyticsEnabled: false,
  } as any;
  const originalHtml = configLike.messageHTML;

  let sent = 0;
  const failed: Array<{ nationId: number; nation: string; error: string }> = [];

  for (const nation of candidates) {
    if (baseUrl) {
      const messageId = `${accountId}-${nation.nation_id}-${Date.now()}`;
      const injected = await injectTrackingIntoHtml({
        baseUrl,
        accountId,
        messageId,
        html: originalHtml,
        trackLinks: true,
      });
      configLike.messageHTML = injected;
    } else {
      configLike.messageHTML = originalHtml;
    }

    const result = await messagesService.sendMessageWithConfig(configLike, {
      nation_id: nation.nation_id,
      nation: nation.nation,
      leader: nation.leader,
    } as any).catch(() => undefined);

    if (result?.successful) {
      sent += 1;
      continue;
    }

    failed.push({
      nationId: nation.nation_id,
      nation: nation.nation,
      error: result?.error || 'Send failed',
    });
  }

  return res.status(200).json({
    success: true,
    filters: { minCities, maxCities },
    attempted: candidates.length,
    sent,
    failed: failed.length,
    failures: failed.slice(0, 50),
  });
});

// Send to nations active in the past 24h, not in an alliance, and filtered by discord filled state.
router.post('/send-active-unallied-discord', requirePwSession, async (req: Request, res: Response) => {
  const accountId = req.pwAccount!._id.toString();
  const dryRun = req.body?.dryRun === true;
  const hasDiscord = req.body?.hasDiscord;
  const minCities = parseOptionalNumber(req.body?.minCities);
  const maxCities = parseOptionalNumber(req.body?.maxCities);

  if (typeof hasDiscord !== 'boolean') {
    return res.status(400).json({ error: 'hasDiscord (boolean) is required' });
  }
  if (typeof minCities === 'number' && minCities < 0) {
    return res.status(400).json({ error: 'minCities must be >= 0' });
  }
  if (typeof maxCities === 'number' && maxCities < 0) {
    return res.status(400).json({ error: 'maxCities must be >= 0' });
  }
  if (typeof minCities === 'number' && typeof maxCities === 'number' && minCities > maxCities) {
    return res.status(400).json({ error: 'minCities cannot be greater than maxCities' });
  }

  const template = await MessageTemplate.findOne({ accountId }).sort({ updatedAt: -1 }).exec();
  if (!template) return res.status(400).json({ error: 'No saved template found for this user' });

  const pwKey = await getDecryptedApiKeyForAccount(accountId).catch(() => '');
  if (!pwKey) return res.status(500).json({ error: 'Could not decrypt user API key' });

  const candidates = await getActiveUnalliedCandidates(pwKey, { minCities, maxCities });
  if (!candidates) {
    return res.status(502).json({ error: 'Failed to fetch target nations from Politics & War API' });
  }

  const filtered = candidates.filter((nation) => hasDiscordValue((nation as any).discord) === hasDiscord);

  if (dryRun) {
    return res.status(200).json({
      success: true,
      dryRun: true,
      hasDiscord,
      filters: { minCities, maxCities },
      totalCandidates: filtered.length,
      preview: filtered.slice(0, 25).map((nation) => ({
        nationId: nation.nation_id,
        nation: nation.nation,
        leader: nation.leader,
        lastActive: nation.last_active,
        cities: nation.cities,
        discord: (nation as any).discord || '',
      })),
    });
  }

  const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '')
    .trim()
    .replace(/\/$/, '');

  const configLike = {
    apiKey: pwKey,
    messageHTML: combineHtmlAndCss(template.bodyHtml || template.bodyText || '', template.bodyCss),
    messageSubject: template.subject || '',
    analyticsEnabled: false,
  } as any;
  const originalHtml = configLike.messageHTML;

  let sent = 0;
  const failed: Array<{ nationId: number; nation: string; error: string }> = [];

  for (const nation of filtered) {
    if (baseUrl) {
      const messageId = `${accountId}-${nation.nation_id}-${Date.now()}`;
      const injected = await injectTrackingIntoHtml({
        baseUrl,
        accountId,
        messageId,
        html: originalHtml,
        trackLinks: true,
      });
      configLike.messageHTML = injected;
    } else {
      configLike.messageHTML = originalHtml;
    }

    const result = await messagesService.sendMessageWithConfig(configLike, {
      nation_id: nation.nation_id,
      nation: nation.nation,
      leader: nation.leader,
    } as any).catch(() => undefined);

    if (result?.successful) {
      sent += 1;
      continue;
    }

    failed.push({
      nationId: nation.nation_id,
      nation: nation.nation,
      error: result?.error || 'Send failed',
    });
  }

  return res.status(200).json({
    success: true,
    hasDiscord,
    filters: { minCities, maxCities },
    attempted: filtered.length,
    sent,
    failed: failed.length,
    failures: failed.slice(0, 50),
  });
});

export default router;
