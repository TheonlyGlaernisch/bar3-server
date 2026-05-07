import superagent from 'superagent';
import { Config, NationAPICall } from '../interfaces/types';
import { AutomationSettings } from '../interfaces/schemas/AutomationSettingsSchema';
import { MessageTemplate } from '../interfaces/schemas/MessageTemplateSchema';
import { getDecryptedApiKeyForAccount } from './pwAccountService';
import messagesService from './messages';
import { injectTrackingIntoHtml } from './v2Analytics';
import { combineHtmlAndCss } from '../utilities/combineHtmlAndCss';
import state from './state';
import { NationCreateEvent, PnWNationSubscriptionClient } from './pwNationSubscription';

function getBaseUrlFromEnv(): string {
  // Used for analytics links/pixel in outgoing messages
  return (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
}

function clampSeen(list: number[], max = 2000): number[] {
  if (list.length <= max) return list;
  return list.slice(list.length - max);
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function eventNationToV2Nation(event: NationCreateEvent): NationAPICall.Nation {
  return {
    nation_id: event.nationId,
    nation: event.nationName || String(event.nationId),
    leader: event.leaderName || '',
    continent: 0,
    war_policy: 0,
    domestic_policy: 0,
    color: 0,
    alliance_id: event.allianceId,
    alliance: '',
    alliance_position: event.alliancePosition,
    cities: event.cities,
    offensive_wars: 0,
    defensive_wars: 0,
    score: event.score,
    v_mode: false,
    v_mode_turns: 0,
    beige_turns: 0,
    last_active: '',
    discord: '',
    founded: event.founded.toISOString(),
    soldiers: 0,
    tanks: 0,
    aircraft: 0,
    ships: 0,
    missiles: 0,
    nukes: 0,
  };
}

async function fetchNationByIdGraphql(apiKey: string, nationId: number): Promise<NationAPICall.Nation | null> {
  const safeNationId = Math.trunc(nationId);
  if (!Number.isFinite(safeNationId) || safeNationId <= 0) return null;

  const endpoint = (process.env.PW_GRAPHQL_URL || 'https://api.politicsandwar.com/graphql').trim();
  const query = `
    query NationById($nationId: Int!) {
      nations(id: [$nationId], first: 1, page: 1) {
        data {
          id
          nation_name
          leader_name
          alliance_id
          alliance_position
          num_cities
          score
          founded
          last_active
          discord
        }
      }
    }
  `;

  const authModes: Array<(req: superagent.SuperAgentRequest) => superagent.SuperAgentRequest> = [
    (req) => req.query({ api_key: apiKey }),
    (req) => req.set('Authorization', `Bearer ${apiKey}`),
    (req) => req.set('X-Api-Key', apiKey),
  ];

  for (const applyAuth of authModes) {
    const response = await applyAuth(superagent.post(endpoint))
      .accept('json')
      .send({ query, variables: { nationId: safeNationId } })
      .ok(() => true)
      .catch(() => undefined);
    const data = ((response?.body as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined);
    const nations = (((data?.nations as Record<string, unknown> | undefined)?.data) as Record<string, unknown>[] | undefined);
    const nation = Array.isArray(nations) ? nations[0] : undefined;
    if (!nation) continue;

    const resolvedId = asNumber(nation.id);
    const nationName = asString(nation.nation_name);
    const leaderName = asString(nation.leader_name);
    if (!resolvedId || !nationName || !leaderName) continue;

    return {
      nation_id: resolvedId,
      nation: nationName,
      leader: leaderName,
      continent: 0,
      war_policy: 0,
      domestic_policy: 0,
      color: 0,
      alliance_id: asNumber(nation.alliance_id),
      alliance: '',
      alliance_position: asNumber(nation.alliance_position),
      cities: asNumber(nation.num_cities),
      offensive_wars: 0,
      defensive_wars: 0,
      score: asNumber(nation.score),
      v_mode: false,
      v_mode_turns: 0,
      beige_turns: 0,
      last_active: asString(nation.last_active),
      discord: asString(nation.discord),
      founded: asString(nation.founded),
      soldiers: 0,
      tanks: 0,
      aircraft: 0,
      ships: 0,
      missiles: 0,
      nukes: 0,
    };
  }

  return null;
}

async function dispatchNationToEnabledAccounts(nation: NationAPICall.Nation): Promise<void> {
  const enabled = await AutomationSettings.find({ enabled: true }).exec();
  if (enabled.length === 0) return;

  const baseUrl = getBaseUrlFromEnv();
  const maxPerTick = Number(process.env.AUTOMATION_MAX_SENDS_PER_ACCOUNT_PER_TICK || 25);
  if (!Number.isFinite(maxPerTick) || maxPerTick <= 0) {
    console.warn('Skipping automation dispatch: AUTOMATION_MAX_SENDS_PER_ACCOUNT_PER_TICK is invalid.');
    return;
  }

  // For each enabled account: send to nation if it hasn't been seen.
  for (const setting of enabled) {
    const accountId = setting.accountId.toString();

    const template = await MessageTemplate.findOne({ accountId }).sort({ updatedAt: -1 }).exec();
    if (!template) continue;

    const pwKey = await getDecryptedApiKeyForAccount(accountId).catch(() => '');
    if (!pwKey) continue;

    const seen = new Set<number>(setting.seenNationIds || []);
    if (seen.has(nation.nation_id)) continue;

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
    if (sentMessage) {
      if (!state.userKeys[pwKey]) {
        const sessionConfig = new Config();
        sessionConfig.apiKey = pwKey;
        state.userKeys[pwKey] = { sentMessages: [], config: sessionConfig, applicationOn: false, apiDetails: { used: 0, max: 0 } };
      }
      state.userKeys[pwKey].sentMessages.push(sentMessage);
    }
    seen.add(nation.nation_id);

    setting.seenNationIds = clampSeen(Array.from(seen));
    setting.lastScanAt = new Date();
    await setting.save().catch(() => undefined);
  }
}

export async function runAutomationTick(): Promise<void> {
  // Kept for backward compatibility; automation now runs from subscription events.
}

let subscriptionStarted = false;

export function startAutomationLoop(): void {
  if (subscriptionStarted) return;
  subscriptionStarted = true;

  const scanningKey = (process.env.PW_SCAN_API_KEY || '').trim();
  if (!scanningKey) return;

  const httpApiKey = (process.env.PNW_API_KEY || '').trim() || scanningKey;
  const subscriptionClient = new PnWNationSubscriptionClient(scanningKey);

  (async () => {
    for await (const event of subscriptionClient.iterNationCreates()) {
      let enrichedNation: NationAPICall.Nation | null = null;
      try {
        enrichedNation = await fetchNationByIdGraphql(httpApiKey, event.nationId);
      } catch (err) {
        console.warn(`Automation enrichment failed for nation ${event.nationId}; using subscription payload.`, err);
      }
      const nation = enrichedNation || eventNationToV2Nation(event);
      await dispatchNationToEnabledAccounts(nation).catch(() => undefined);
    }
  })().catch((err) => {
    subscriptionStarted = false;
    console.error('automation nation subscription loop failed', err);
  });
}
