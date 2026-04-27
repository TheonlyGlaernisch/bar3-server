import superagent from 'superagent';
import { Config, NationAPICall } from '../interfaces/types';
import { AutomationSettings } from '../interfaces/schemas/AutomationSettingsSchema';
import { MessageTemplate } from '../interfaces/schemas/MessageTemplateSchema';
import { getDecryptedApiKeyForAccount } from './pwAccountService';
import messagesService from './messages';
import { injectTrackingIntoHtml } from './v2Analytics';
import { combineHtmlAndCss } from '../utilities/combineHtmlAndCss';
import state from './state';

function getBaseUrlFromEnv(): string {
  // Used for analytics links/pixel in outgoing messages
  return (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
}

async function fetchNewNationsAnyKey(apiKey: string): Promise<NationAPICall.Nation[]> {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');

  const res = await superagent
    .get(`https://politicsandwar.com/api/v2/nations/${apiKey}/&max_score=50&alliance_position=0&date_created=${y}${m}${d}`)
    .accept('json')
    .then();

  const body = res.body as NationAPICall.RootObject;
  if (!body?.api_request?.success) return [];
  return body.data || [];
}

function clampSeen(list: number[], max = 2000): number[] {
  if (list.length <= max) return list;
  return list.slice(list.length - max);
}

export async function runAutomationTick(): Promise<void> {
  const scanningKey = (process.env.PW_SCAN_API_KEY || '').trim();
  if (!scanningKey) {
    // Without a scanning key we can't discover new players reliably.
    return;
  }

  const enabled = await AutomationSettings.find({ enabled: true }).exec();
  if (enabled.length === 0) return;

  const nations = await fetchNewNationsAnyKey(scanningKey).catch(() => []);
  if (nations.length === 0) return;

  const baseUrl = getBaseUrlFromEnv();
  const maxPerTick = Number(process.env.AUTOMATION_MAX_SENDS_PER_ACCOUNT_PER_TICK || 25);

  // For each enabled account: send to nations it hasn't seen yet.
  for (const setting of enabled) {
    const accountId = setting.accountId.toString();

    const template = await MessageTemplate.findOne({ accountId }).sort({ updatedAt: -1 }).exec();
    if (!template) continue;

    const pwKey = await getDecryptedApiKeyForAccount(accountId).catch(() => '');
    if (!pwKey) continue;

    const seen = new Set<number>(setting.seenNationIds || []);
    let sentThisTick = 0;

    for (const nation of nations) {
      if (seen.has(nation.nation_id)) continue;
      if (Number.isFinite(maxPerTick) && sentThisTick >= maxPerTick) break;

      const configLike = {
        apiKey: pwKey,
        messageHTML: combineHtmlAndCss(template.bodyHtml || template.bodyText || '', template.bodyCss),
        messageSubject: template.subject || '',
        analyticsEnabled: false,
      } as any;

      // If we have a baseUrl, do per-user analytics. Otherwise still send without tracking.
      if (baseUrl) {
        const messageId = `${accountId}-${nation.nation_id}-${Date.now()}`;
        const injected = await injectTrackingIntoHtml({
          baseUrl,
          accountId,
          messageId,
          html: configLike.messageHTML,
          trackLinks: true,
        });
        configLike.messageHTML = injected;
      }

      const sentMessage = await messagesService.sendMessageWithConfig(configLike, nation).catch(() => undefined);
      if (sentMessage?.successful) {
        if (!state.userKeys[pwKey]) {
          const sessionConfig = new Config();
          sessionConfig.apiKey = pwKey;
          state.userKeys[pwKey] = { sentMessages: [], config: sessionConfig, applicationOn: false, apiDetails: { used: 0, max: 0 } };
        }
        state.userKeys[pwKey].sentMessages.push(sentMessage);
      }
      seen.add(nation.nation_id);
      sentThisTick++;
    }

    setting.seenNationIds = clampSeen(Array.from(seen));
    setting.lastScanAt = new Date();
    await setting.save().catch(() => undefined);
  }
}

export function startAutomationLoop(): void {
  const intervalMs = Number(process.env.AUTOMATION_TICK_MS || 60000);
  if (!Number.isFinite(intervalMs) || intervalMs < 15000) return;

  setInterval(() => {
    runAutomationTick().catch(() => undefined);
  }, intervalMs);
}

