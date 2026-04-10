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

async function getActiveUnalliedCandidates(apiKey: string): Promise<NationAPICall.Nation[] | null> {
  const nationLookupApiKey = (process.env.NATION_CHECK_API_KEY || '').trim() || apiKey;
  const response = await superagent
    .get(`https://politicsandwar.com/api/v2/nations/${nationLookupApiKey}/&alliance_position=0`)
    .ok(() => true)
    .catch(() => undefined);

  if (!response?.body?.success || !Array.isArray(response.body?.data)) return null;

  const now = Date.now();
  const activeSince = now - (24 * 60 * 60 * 1000);
  return (response.body.data as NationAPICall.Nation[])
    .filter((nation) => nation.alliance_id === 0 || nation.alliance_position === 0)
    .filter((nation) => {
      const ts = parseLastActive(nation.last_active);
      return Number.isFinite(ts) && ts >= activeSince;
    });
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

  const template = await MessageTemplate.findOne({ accountId }).sort({ updatedAt: -1 }).exec();
  if (!template) return res.status(400).json({ error: 'No saved template found for this user' });

  const pwKey = await getDecryptedApiKeyForAccount(accountId).catch(() => '');
  if (!pwKey) return res.status(500).json({ error: 'Could not decrypt user API key' });

  const candidates = await getActiveUnalliedCandidates(pwKey);
  if (!candidates) {
    return res.status(502).json({ error: 'Failed to fetch target nations from Politics & War API' });
  }

  if (dryRun) {
    return res.status(200).json({
      success: true,
      dryRun: true,
      totalCandidates: candidates.length,
      preview: candidates.slice(0, 25).map((nation) => ({
        nationId: nation.nation_id,
        nation: nation.nation,
        leader: nation.leader,
        lastActive: nation.last_active,
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

  if (typeof hasDiscord !== 'boolean') {
    return res.status(400).json({ error: 'hasDiscord (boolean) is required' });
  }

  const template = await MessageTemplate.findOne({ accountId }).sort({ updatedAt: -1 }).exec();
  if (!template) return res.status(400).json({ error: 'No saved template found for this user' });

  const pwKey = await getDecryptedApiKeyForAccount(accountId).catch(() => '');
  if (!pwKey) return res.status(500).json({ error: 'Could not decrypt user API key' });

  const candidates = await getActiveUnalliedCandidates(pwKey);
  if (!candidates) {
    return res.status(502).json({ error: 'Failed to fetch target nations from Politics & War API' });
  }

  const filtered = candidates.filter((nation) => hasDiscordValue((nation as any).discord) === hasDiscord);

  if (dryRun) {
    return res.status(200).json({
      success: true,
      dryRun: true,
      hasDiscord,
      totalCandidates: filtered.length,
      preview: filtered.slice(0, 25).map((nation) => ({
        nationId: nation.nation_id,
        nation: nation.nation,
        leader: nation.leader,
        lastActive: nation.last_active,
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
    attempted: filtered.length,
    sent,
    failed: failed.length,
    failures: failed.slice(0, 50),
  });
});

export default router;
