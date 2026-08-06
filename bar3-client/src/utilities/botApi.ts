import { AUTH_BASE_URL } from '@/utilities/serverUrls';

async function botFetch(path: string, init: RequestInit = {}, body?: unknown) {
  const existingHeaders = init.headers;
  const extraHeaders: Record<string, string> = {};

  if (existingHeaders instanceof Headers) {
    existingHeaders.forEach((value, key) => { extraHeaders[key] = value; });
  } else if (Array.isArray(existingHeaders)) {
    for (const [key, value] of existingHeaders) extraHeaders[key] = value;
  } else if (existingHeaders) {
    Object.assign(extraHeaders, existingHeaders);
  }

  if (body !== undefined) extraHeaders['Content-Type'] = 'application/json';
  return fetch(`${AUTH_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: extraHeaders,
    body: body !== undefined ? JSON.stringify(body) : init.body,
  });
}



export interface BotServer {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

export interface BotCommand {
  name: string;
  usageCount: number;
  description: string;
}

export interface BotBankingEnabledState {
  enabled?: boolean;
  enabledByGuild?: Record<string, boolean>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.error === 'string' && data.error) return data.error;
  } catch {
    // ignore
  }
  return fallback;
}

export const botApi = {
  /**
   * Fetch the list of Discord servers the bot is currently a member of.
   * Backend: GET /api/bot/servers
   */
  async getServers(): Promise<BotServer[]> {
    const res = await botFetch('/api/bot/servers');
    if (!res.ok) throw new Error(await readError(res, 'Failed to load bot servers'));
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      id: String(row?.id || ''),
      name: String(row?.name || 'Unknown server'),
      icon: typeof row?.icon === 'string' ? row.icon : null,
      memberCount: Number(row?.memberCount ?? row?.member_count ?? 0),
    }));
  },

  /**
   * Fetch the most-used bot commands sorted by usage count descending.
   * Backend: GET /api/bot/commands/usage
   */
  async getCommandUsage(): Promise<BotCommand[]> {
    const res = await botFetch('/api/bot/commands/usage');
    if (!res.ok) throw new Error(await readError(res, 'Failed to load command usage'));
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
      name: String(row?.name || row?.command || 'unknown'),
      usageCount: Number(row?.usageCount ?? row?.count ?? 0),
      description: String(row?.description || ''),
    }));
  },

  /**
   * Fetch whether Discord-bot banking automation is enabled.
   * Backend: GET /api/bot/banking/enabled
   */
  async getBankingEnabled(): Promise<BotBankingEnabledState> {
    const res = await botFetch('/api/bot/banking/enabled');
    if (!res.ok) throw new Error(await readError(res, 'Failed to load banking status'));
    const data = await res.json();
    const state: BotBankingEnabledState = {};
    if (typeof data?.enabled === 'boolean') state.enabled = data.enabled;
    if (data?.enabledByGuild && typeof data.enabledByGuild === 'object') {
      state.enabledByGuild = Object.fromEntries(
        Object.entries(data.enabledByGuild).map(([guildId, enabled]) => [String(guildId), enabled === true])
      );
    }
    return state;
  },

  /**
   * Enable or disable Discord-bot banking automation.
   * Backend: POST /api/bot/banking/enabled  { enabled }
   */
  async setBankingEnabled(enabled: boolean): Promise<BotBankingEnabledState> {
    const res = await botFetch('/api/bot/banking/enabled', { method: 'POST' }, { enabled });
    if (!res.ok) throw new Error(await readError(res, 'Failed to update banking status'));
    const data = await res.json();
    const state: BotBankingEnabledState = {};
    if (typeof data?.enabled === 'boolean') state.enabled = data.enabled;
    if (data?.enabledByGuild && typeof data.enabledByGuild === 'object') {
      state.enabledByGuild = Object.fromEntries(
        Object.entries(data.enabledByGuild).map(([guildId, guildEnabled]) => [String(guildId), guildEnabled === true])
      );
    }
    return state;
  },

  /**
   * Send a message through the bot (distinct from the Politics & War mailer).
   * Backend: POST /api/bot/send  { message }
   */
  async sendMessage(content: string): Promise<void> {
    const res = await botFetch('/api/bot/send', { method: 'POST' }, { message: content });
    if (!res.ok) {
      throw new Error(await readError(res, 'Failed to send bot message'));
    }
  },
};
