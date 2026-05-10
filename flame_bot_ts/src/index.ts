import {
  ChatInputCommandInteraction,
  Client,
  ComponentType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GatewayIntentBits,
  Guild,
  GuildMember,
  Interaction,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { createServer, Server } from 'http';

import {
  API_KEY,
  API_PORT,
  ADMIN_DISCORD_IDS,
  BAR3_CLIENT_ROLE_ID,
  BAR3_SERVER_ROLE_ID,
  DISCORD_TOKEN,
  DISCORD_ENABLE_GUILD_MEMBERS_INTENT,
  GUILD_ID,
  LOG_LEVEL,
  MONGODB_URI,
  PNW_API_KEY,
  PNW_TEST_API_KEY,
  PW_SCAN_API_KEY,
  VERIFIED_ROLE_ID,
} from './config';
import { createApp } from './api';
import { Database } from './database';
import {
  PNW_TEST_REST_URL,
  PnWClient,
  PnWSubscriptionClient,
  Nation,
  AllianceInfo,
  NationCreateDetail,
  NationWar,
  WarDetail,
  GameInfo,
  City,
  MAX_SOLDIERS_PER_CITY,
  MAX_TANKS_PER_CITY,
  MAX_AIRCRAFT_PER_CITY,
  MAX_SHIPS_PER_CITY,
  MAX_DEFENSIVE_SLOTS,
  WAR_RANGE_MIN_RATIO,
  WAR_RANGE_MAX_RATIO,
  calculateInfraCost,
  calculateCityCost,
  computeNationRevenue,
} from './pnw_api';
import { renderCommandHelp } from './commandDocs';

let primaryGuild: Guild | null = null;

const FUN_QUOTES: string[] = [
  `no bot will send
locutus has been faulty for some time

-# glaernischbot may hallucinate. please always refer to official sources`,
  `glaernischbot mention
try out the new / slash commands



over time, gasoline and alu might get more expensive, but so will all rss except steel, which is high already. uranium shows no signs of dropping, but raws might start hopping`,
  `fastreply glaernischbot: bool back online

-# please now reffer to official sources`,
  `nobody is real. everything is probably fake, becuz of your f****** senses`,
  `to confuse the enemy, you must first confuse yourself
    -sun zoo
-# -sirius`,
  `we wish you a merry christmas, and a happy ~~new year~~ lump of coal`,
];

const RECRUIT_DELAY_SECONDS = 5 * 60;
const DEFAULT_WELCOME_MESSAGE = 'Welcome !(user)! !(status)';
const DISCORD_COMMAND_COOLDOWN_SECONDS = 2.0;
const INVITE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DEBUG_ENABLED = LOG_LEVEL === 'DEBUG';
const logInfo = (...args: unknown[]): void => console.log(...args);
const logWarn = (...args: unknown[]): void => console.warn(...args);
const logError = (...args: unknown[]): void => console.error(...args);
const logDebug = (...args: unknown[]): void => {
  if (DEBUG_ENABLED) console.debug(...args);
};

type CanonicalCommandName =
  | 'welcome_set'
  | 'welcome_channel_set'
  | 'welcome_enable'
  | 'welcome_disable'
  | 'welcome_show'
  | 'admin_sync_commands'
  | 'admin_clear_guild_commands';
type LegacyCommandAlias =
  | 'admin_welcome_set_message'
  | 'admin_welcome_set_channel'
  | 'admin_welcome_enable'
  | 'admin_welcome_disable'
  | 'admin_welcome_show'
  | 'admin_sync'
  | 'admin_clear';
const LEGACY_COMMAND_ALIASES: Record<LegacyCommandAlias, CanonicalCommandName> = {
  admin_welcome_set_message: 'welcome_set',
  admin_welcome_set_channel: 'welcome_channel_set',
  admin_welcome_enable: 'welcome_enable',
  admin_welcome_disable: 'welcome_disable',
  admin_welcome_show: 'welcome_show',
  admin_sync: 'admin_sync_commands',
  admin_clear: 'admin_clear_guild_commands',
};

function resolveCanonicalCommandName(name: string): string {
  return (LEGACY_COMMAND_ALIASES as Partial<Record<string, CanonicalCommandName>>)[name] ?? name;
}

function resolveCanonicalCommandNameFromInteraction(i: ChatInputCommandInteraction): string {
  const commandName = resolveCanonicalCommandName(i.commandName);
  if (commandName !== i.commandName) return commandName;

  const group = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand(false);

  if (i.commandName === 'alliance') {
    if (sub === 'info') return 'alliance_info';
    if (sub === 'members') return 'alliance_members';
  }
  if (i.commandName === 'test') {
    if (sub === 'whois') return 'test_whois';
    if (group === 'alliance' && sub === 'info') return 'test_alliance_info';
  }
  if (i.commandName === 'config' && group === 'slots') {
    if (sub === 'set') return 'config_slots_set';
    if (sub === 'show') return 'config_slots_show';
    if (sub === 'clear') return 'config_slots_clear';
  }
  if (i.commandName === 'setup') {
    if (sub === 'grant_channel') return 'setup_grant_channel';
    if (group === 'war_alerts' && sub === 'add') return 'setup_war_alerts_add';
    if (group === 'war_alerts' && sub === 'remove') return 'setup_war_alerts_remove';
    if (group === 'war_alerts' && sub === 'list') return 'setup_war_alerts_list';
    if (group === 'recruiter' && sub === 'add') return 'setup_recruiter_add';
    if (group === 'recruiter' && sub === 'remove') return 'setup_recruiter_remove';
    if (group === 'recruiter' && sub === 'list') return 'setup_recruiter_list';
  }
  if (i.commandName === 'request' && sub === 'grant') return 'request_grant';
  if (i.commandName === 'roles') {
    if (sub === 'setup') return 'roles_setup';
    if (sub === 'show') return 'roles_show';
  }
  if (i.commandName === 'fun' && sub === 'quote') return 'fun_quote';
  if (i.commandName === 'damage' && sub === 'leaderboard') return 'damage_leaderboard';
  if (i.commandName === 'spy' && group === 'target' && sub === 'find') return 'spy_target_find';
  if (i.commandName === 'missile' && group === 'targets' && sub === 'find') return 'missile_targets_find';
  if (i.commandName === 'war' && group === 'range' && sub === 'targets') return 'war_range_targets';
  if (i.commandName === 'city' && sub === 'cost') return 'city_cost';
  if (i.commandName === 'admin') {
    if (group === 'alliance' && sub === 'set') return 'admin_alliance_set';
    if (group === 'alliance' && sub === 'show') return 'admin_alliance_show';
    if (group === 'api_key' && sub === 'set') return 'admin_api_key_set';
    if (sub === 'sync') return 'admin_sync_commands';
    if (sub === 'clear_guild_commands') return 'admin_clear_guild_commands';
    if (group === 'welcome' && sub === 'set_message') return 'welcome_set';
    if (group === 'welcome' && sub === 'set_channel') return 'welcome_channel_set';
    if (group === 'welcome' && sub === 'show') return 'welcome_show';
    if (group === 'welcome' && sub === 'toggle') {
      const enabled = i.options.getBoolean('enabled');
      return enabled ? 'welcome_enable' : 'welcome_disable';
    }
  }

  return commandName;
}

function getPrimaryGuild(client: Client): Guild | null {
  if (primaryGuild) return primaryGuild;
  if (GUILD_ID !== null) {
    const byId = client.guilds.cache.get(String(GUILD_ID));
    if (byId) return (primaryGuild = byId);
  }
  return (primaryGuild = client.guilds.cache.first() ?? null);
}

function buildTierCountsWithEmptyInterior(rows: Array<[number, number]>): Array<[number, number]> {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  const minEntry = sorted[0];
  const maxEntry = sorted[sorted.length - 1];
  if (!minEntry || !maxEntry) return [];
  const minTier = minEntry[0];
  const maxTier = maxEntry[0];
  const byTier = new Map<number, number>(sorted);
  const fullRange: Array<[number, number]> = [];
  for (let tier = minTier; tier <= maxTier; tier += 1) {
    fullRange.push([tier, byTier.get(tier) ?? 0]);
  }
  return fullRange;
}

function buildCityTierQuickChartUrl(rows: Array<[number, number]>): string {
  const fullRows = buildTierCountsWithEmptyInterior(rows);
  const labels = fullRows.map(([tier]) => String(tier));
  const data = fullRows.map(([, count]) => count);
  const chartFont = { weight: 'bold' as const };
  const chartConfig = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Members',
        data,
        backgroundColor: '#5865F2',
        borderColor: '#FFFFFF',
        borderWidth: 1,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: {
            color: '#FFFFFF',
            fontColor: '#FFFFFF',
            font: chartFont,
          },
          grid: {
            color: 'rgba(255,255,255,0.20)',
            borderColor: '#FFFFFF',
          },
          title: {
            display: true,
            text: 'City Tier',
            color: '#FFFFFF',
            fontColor: '#FFFFFF',
            font: chartFont,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: '#FFFFFF',
            fontColor: '#FFFFFF',
            font: chartFont,
          },
          grid: {
            color: 'rgba(255,255,255,0.20)',
            borderColor: '#FFFFFF',
          },
          title: {
            display: true,
            text: 'Members',
            color: '#FFFFFF',
            fontColor: '#FFFFFF',
            font: chartFont,
          },
        },
      },
    },
  };
  const params = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: '900',
    height: '420',
    format: 'png',
    backgroundColor: 'transparent',
  });
  return `https://quickchart.io/chart?${params.toString()}`;
}

type AllianceScoreHistoryPoint = {
  fetchDate: string;
  allianceId: number;
  score: number;
  rank: number;
  members: number;
};

const ALLIANCE_SCORE_HISTORY_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1ERfHN5vVorODEPHOnIxyWgq__RltTPQiOa0C5YHX1_k/gviz/tq?tqx=out:csv';
const ALLIANCE_SCORE_HISTORY_FETCH_TIMEOUT_MS = 15_000;
const ALLIANCE_SCORE_HISTORY_SHEET_ID = '1ERfHN5vVorODEPHOnIxyWgq__RltTPQiOa0C5YHX1_k';

function getAllianceScoreHistorySheetCsvUrl(year: number): string {
  const sheet = `alliances_${year}`;
  return `https://docs.google.com/spreadsheets/d/${ALLIANCE_SCORE_HISTORY_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeHistoryDate(raw: string): string {
  const trimmed = raw.trim();
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return direct?.[1] ?? trimmed;
}

function normalizeHistoryHeaderName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

type AllianceScoreHistoryHeaderIndexes = {
  fetchDateIdx: number;
  allianceIdIdx: number;
  scoreIdx: number;
  rankIdx: number;
  membersIdx: number;
};

function resolveAllianceScoreHistoryHeaderIndexes(header: string[]): AllianceScoreHistoryHeaderIndexes | null {
  const normalized = header.map(normalizeHistoryHeaderName);
  const findIndex = (...aliases: string[]): number => normalized.findIndex((h) => aliases.includes(h));
  const fetchDateIdx = findIndex('fetch_date', 'fetchdate', 'date', 'timestamp', 'fetched_at');
  const allianceIdIdx = findIndex('alliance_id', 'allianceid', 'id');
  const scoreIdx = findIndex('score', 'alliance_score');
  const rankIdx = findIndex('rank');
  const membersIdx = findIndex('members', 'member_count', 'membercount');
  if ([fetchDateIdx, allianceIdIdx, scoreIdx, rankIdx, membersIdx].some((idx) => idx < 0)) return null;
  return { fetchDateIdx, allianceIdIdx, scoreIdx, rankIdx, membersIdx };
}

function parseHistoryNumber(raw: string | undefined): number {
  const cleaned = (raw ?? '').trim().replace(/,/g, '');
  if (!cleaned) return 0;
  const direct = Number(cleaned);
  if (Number.isFinite(direct)) return direct;
  const match = /-?\d+(?:\.\d+)?/.exec(cleaned);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAllianceIdCell(raw: string | undefined): number | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const direct = Number(trimmed.replace(/,/g, ''));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const urlMatch = /alliance\/id=(\d+)/i.exec(trimmed);
  if (urlMatch?.[1]) {
    const parsed = Number(urlMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const anyNumber = /(\d+)/.exec(trimmed);
  if (!anyNumber?.[1]) return null;
  const parsed = Number(anyNumber[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseAllianceScoreHistoryCsv(csv: string, allianceId: number): AllianceScoreHistoryPoint[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (!lines.length) return [];
  let indexes: AllianceScoreHistoryHeaderIndexes | null = null;
  const byDate = new Map<string, AllianceScoreHistoryPoint>();
  for (const line of lines) {
    const row = parseCsvLine(line);
    const maybeHeader = resolveAllianceScoreHistoryHeaderIndexes(row);
    if (maybeHeader) {
      indexes = maybeHeader;
      continue;
    }
    if (!indexes) continue;
    const rowAllianceId = parseAllianceIdCell(row[indexes.allianceIdIdx]);
    if (rowAllianceId == null || rowAllianceId !== allianceId) continue;
    const fetchDateRaw = row[indexes.fetchDateIdx] ?? '';
    const fetchDate = normalizeHistoryDate(fetchDateRaw);
    if (!fetchDate) continue;
    const point: AllianceScoreHistoryPoint = {
      fetchDate,
      allianceId: rowAllianceId,
      score: parseHistoryNumber(row[indexes.scoreIdx]),
      rank: parseHistoryNumber(row[indexes.rankIdx]),
      members: parseHistoryNumber(row[indexes.membersIdx]),
    };
    byDate.set(fetchDate, point);
  }
  return [...byDate.values()].sort((a, b) => a.fetchDate.localeCompare(b.fetchDate));
}

async function fetchAllianceScoreHistory(allianceId: number): Promise<AllianceScoreHistoryPoint[]> {
  const currentYear = new Date().getUTCFullYear();
  const urls = [getAllianceScoreHistorySheetCsvUrl(currentYear), ALLIANCE_SCORE_HISTORY_SHEET_CSV_URL];
  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(ALLIANCE_SCORE_HISTORY_FETCH_TIMEOUT_MS) });
      if (!resp.ok) throw new Error(`sheet HTTP error: ${resp.status} ${resp.statusText}`);
      const csv = await resp.text();
      const parsed = parseAllianceScoreHistoryCsv(csv, allianceId);
      if (parsed.length > 0) return parsed;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

function renderAllianceScoreHistoryTable(points: AllianceScoreHistoryPoint[], maxRows = 20): string {
  if (!points.length) return 'No data available.';
  const dateWidth = 10;
  const rows = points.slice(-maxRows).map((p) => ({
    fetchDate: p.fetchDate,
    score: Math.round(p.score).toLocaleString(),
    rank: Math.round(p.rank).toLocaleString(),
    members: Math.round(p.members).toLocaleString(),
  }));
  const scoreWidth = Math.max(5, ...rows.map((p) => p.score.length));
  const rankWidth = Math.max(4, ...rows.map((p) => p.rank.length));
  const memberWidth = Math.max(7, ...rows.map((p) => p.members.length));
  const header = `${'Date'.padEnd(dateWidth, ' ')} ${'Score'.padStart(scoreWidth)} ${'Rank'.padStart(rankWidth)} ${'Members'.padStart(memberWidth)}`;
  const body = rows.map((p) => {
    const score = p.score.padStart(scoreWidth);
    const rank = p.rank.padStart(rankWidth);
    const members = p.members.padStart(memberWidth);
    return `${p.fetchDate.padEnd(dateWidth, ' ')} ${score} ${rank} ${members}`;
  });
  const truncationMessage = points.length > rows.length ? `\n... showing last ${rows.length} of ${points.length} entries` : '';
  return `\`\`\`\n${header}\n${body.join('\n')}${truncationMessage}\n\`\`\``;
}

type AllianceScoreHistoryChartPoint = {
  fetchDate: string;
  score: number | null;
};

function buildAllianceScoreHistoryChartPoints(points: AllianceScoreHistoryPoint[], maxSourcePoints = 120): AllianceScoreHistoryChartPoint[] {
  if (!points.length) return [];
  const source = points.slice(-maxSourcePoints);
  if (!source.length) return [];
  const byDate = new Map<string, AllianceScoreHistoryPoint>(source.map((p) => [p.fetchDate, p]));
  const firstPoint = source[0];
  const lastPoint = source[source.length - 1];
  const startDateRaw = firstPoint?.fetchDate;
  const endDateRaw = lastPoint?.fetchDate;
  if (!startDateRaw || !endDateRaw) return [];
  const start = new Date(`${startDateRaw}T00:00:00Z`);
  const end = new Date(`${endDateRaw}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getTime() > end.getTime()) {
    return source.map((p) => ({ fetchDate: p.fetchDate, score: p.score }));
  }

  const out: AllianceScoreHistoryChartPoint[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let ts = start.getTime(); ts <= end.getTime(); ts += dayMs) {
    const cur = new Date(ts);
    const key = cur.toISOString().slice(0, 10);
    const point = byDate.get(key);
    out.push({
      fetchDate: key,
      score: point ? point.score : null,
    });
  }
  return out;
}

function buildAllianceScoreHistoryQuickChartUrl(points: AllianceScoreHistoryPoint[]): string {
  const chartPoints = buildAllianceScoreHistoryChartPoints(points);
  const labels = chartPoints.map((p) => p.fetchDate.slice(5));
  const data = chartPoints.map((p) => (p.score == null ? null : Math.round(p.score)));
  const chartFont = { weight: 'bold' as const };
  const chartConfig = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Score',
        data,
        borderColor: '#FFFFFF',
        backgroundColor: 'rgba(15,118,110,0.20)',
        fill: true,
        spanGaps: false,
        pointRadius: 0,
        tension: 0.2,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: {
            color: '#FFFFFF',
            fontColor: '#FFFFFF',
            font: chartFont,
          },
          grid: {
            color: 'rgba(255,255,255,0.20)',
            borderColor: '#FFFFFF',
          },
          title: {
            display: true,
            text: 'Date (MM-DD)',
            color: '#FFFFFF',
            fontColor: '#FFFFFF',
            font: chartFont,
          },
        },
        y: {
          ticks: {
            color: '#FFFFFF',
            fontColor: '#FFFFFF',
            font: chartFont,
          },
          grid: {
            color: 'rgba(255,255,255,0.20)',
            borderColor: '#FFFFFF',
          },
          title: {
            display: true,
            text: 'Score',
            color: '#FFFFFF',
            fontColor: '#FFFFFF',
            font: chartFont,
          },
        },
      },
    },
  };
  const params = new URLSearchParams({
    c: JSON.stringify(chartConfig),
    width: '900',
    height: '420',
    format: 'png',
    backgroundColor: 'transparent',
  });
  return `https://quickchart.io/chart?${params.toString()}`;
}





const PNW_BASE_URL = 'https://politicsandwar.com';
const PNW_TEST_BASE_URL = 'https://test.politicsandwar.com';

function nationUrl(nationId: number, baseUrl = PNW_BASE_URL): string {
  return `${baseUrl}/nation/id=${nationId}/`;
}

function allianceUrl(allianceId: number, baseUrl = PNW_BASE_URL): string {
  return `${baseUrl}/alliance/id=${allianceId}`;
}

function warUrl(warId: number, baseUrl = PNW_BASE_URL): string {
  return `${baseUrl}/nation/war/timeline/war=${warId}`;
}

function hasRole(i: ChatInputCommandInteraction, roleId: string | null): boolean {
  if (!roleId || !i.inGuild() || !i.member) return false;
  const member = i.member as any;
  if (member?.roles?.cache) return member.roles.cache.has(roleId);
  if (Array.isArray(member?.roles)) return member.roles.includes(roleId);
  return false;
}

function hasBar3ClientAccess(i: ChatInputCommandInteraction): boolean {
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  return hasRole(i, BAR3_CLIENT_ROLE_ID);
}

type GovRoleKey = 'milcom' | 'milcom_gov' | 'econ' | 'econ_gov' | 'ia' | 'ia_asst' | 'gov' | 'leader' | '2ic' | 'member';

async function hasGovAccess(i: ChatInputCommandInteraction, db: Database, roleKeys: GovRoleKey[] = ['milcom']): Promise<boolean> {
  if (!i.inGuild() || !i.guildId || !i.member) return false;
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  const member = i.member;
  if ('permissions' in member && typeof member.permissions !== 'string' && member.permissions.has('Administrator')) return true;
  const cfg = await db.getGovRoles(BigInt(i.guildId));
  if (!('roles' in member) || !member.roles) return false;
  const roleSet = new Set((member.roles as { cache?: Map<string, unknown> }).cache ? Array.from((member.roles as any).cache.keys()) : (member.roles as any));
  for (const key of roleKeys) {
    const rid = (cfg as any)[key];
    if (rid != null && roleSet.has(String(rid))) return true;
  }
  return false;
}

function hasAdminCommandAccess(i: ChatInputCommandInteraction): boolean {
  if (!i.inGuild() || !i.member) return false;
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  const member = i.member;
  return 'permissions' in member && typeof member.permissions !== 'string' && member.permissions.has('Administrator');
}

/** Check whether the caller may use member-gated commands.
 * Passes if admin, the configured "member" role is unset, caller holds the
 * "member" role, or caller holds any gov role. */
async function hasMemberAccess(i: ChatInputCommandInteraction, db: Database): Promise<boolean> {
  if (!i.inGuild() || !i.guildId || !i.member) return false;
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  const member = i.member;
  if ('permissions' in member && typeof member.permissions !== 'string' && member.permissions.has('Administrator')) return true;
  const cfg = await db.getGovRoles(BigInt(i.guildId));
  const memberRoleId = (cfg as any)['member'];
  if (!memberRoleId) return true; // not configured — no restriction
  const roleSet = new Set(
    (member.roles as any)?.cache ? Array.from((member.roles as any).cache.keys()) : (member.roles as any) ?? [],
  );
  if (roleSet.has(String(memberRoleId))) return true;
  const govKeys: GovRoleKey[] = ['leader', '2ic', 'econ', 'econ_gov', 'milcom', 'milcom_gov', 'ia', 'ia_asst', 'gov'];
  for (const key of govKeys) {
    const rid = (cfg as any)[key];
    if (rid != null && roleSet.has(String(rid))) return true;
  }
  return false;
}

/** Render a welcome-message template into final message content. */
function renderWelcomeMessage(
  template: string,
  memberMention: string,
  memberName: string,
  isRegistered: boolean,
  welcomeChannelMention: string | null,
): string {
  const statusText = isRegistered
    ? `hmm, we seems to have met before ${memberName}, you have already been registered. GGs and cya`
    : 'alas, you dont seem registered with me. would you kindly run /register {nation id}?';
  return template
    .replace(/!\(user\)/g, memberMention)
    .replace(/!\(mention\)/g, memberMention)
    .replace(/!\(status\)/g, statusText)
    .replace(/!\(channel\)/g, welcomeChannelMention ?? '#unknown-channel');
}

/** Rich nation embed matching Python's _nation_embed. */
function nationEmbed(n: Nation, registeredDiscord?: string | null, note?: string | null, baseUrl = PNW_BASE_URL): EmbedBuilder {
  const DAILY_BUY_SOLDIERS_PER_CITY = 5_000;
  const DAILY_BUY_TANKS_PER_CITY = 250;
  const DAILY_BUY_AIRCRAFT_PER_CITY = 15;
  const DAILY_BUY_SHIPS_PER_CITY = 3;
  const embed = new EmbedBuilder()
    .setTitle(n.nationName)
    .setURL(nationUrl(n.nationId, baseUrl))
    .setColor(0x3498DB);

  embed.addFields({ name: 'ID', value: String(n.nationId), inline: true });
  embed.addFields({ name: 'Leader', value: n.leaderName || '—', inline: true });

  // Alliance — hyperlinked with position and seniority
  let allianceVal: string;
  if (n.allianceId) {
    const label = n.allianceName || String(n.allianceId);
    allianceVal = `[${label}](${allianceUrl(n.allianceId, baseUrl)})`;
    const pos = n.alliancePosition;
    if (pos && pos !== 'NOALLIANCE') {
      const posTitle = pos.charAt(0).toUpperCase() + pos.slice(1).toLowerCase();
      let posLine = posTitle;
      if (n.allianceSeniority > 0) posLine += ` • ${Math.floor(n.allianceSeniority)}d`;
      allianceVal += `\n${posLine}`;
    }
  } else {
    allianceVal = 'None';
  }
  embed.addFields({ name: 'Alliance', value: allianceVal, inline: true });

  embed.addFields({ name: 'Score', value: n.score.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), inline: true });
  embed.addFields({ name: 'Cities', value: String(n.numCities), inline: true });
  if (n.rank) embed.addFields({ name: 'Rank', value: `#${n.rank.toLocaleString()}`, inline: true });
  if (n.continent) embed.addFields({ name: 'Continent', value: n.continent, inline: true });
  if (n.warPolicy) embed.addFields({ name: 'War Policy', value: n.warPolicy, inline: true });
  if (n.color) embed.addFields({ name: 'Color', value: n.color.charAt(0).toUpperCase() + n.color.slice(1).toLowerCase(), inline: true });
  if (n.beigeTurns > 0) embed.addFields({ name: 'Beige Turns', value: String(n.beigeTurns), inline: true });

  if (n.offensiveWars || n.defensiveWars) {
    embed.addFields({ name: 'Wars', value: `⚔️ ${n.offensiveWars} off / 🛡️ ${n.defensiveWars} def`, inline: true });
  }
  embed.addFields({ name: 'War Record', value: `🏆 ${n.warsWon.toLocaleString()} won / 💀 ${n.warsLost.toLocaleString()} lost`, inline: true });

  const projectsValue = n.projectsBuilt.length ? `${n.numProjects} — ${n.projectsBuilt.join(', ')}` : '0';
  embed.addFields({ name: 'Projects', value: projectsValue, inline: false });

  // Average infrastructure estimate from score formula
  if (n.numCities > 0) {
    const militaryScore = n.soldiers * 0.0004 + n.tanks * 0.025 + n.aircraft * 0.3 + n.ships * 1.0 + n.missiles * 5.0 + n.nukes * 15.0;
    const infraScore = n.score - (n.numCities - 1) * 100 - 10 - n.numProjects * 20 - militaryScore;
    const avgInfra = infraScore * 40 / n.numCities;
    embed.addFields({ name: 'Avg Infra', value: avgInfra.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), inline: true });
  }

  if (n.lastActiveUnix) {
    embed.addFields({ name: 'Last Active', value: `<t:${n.lastActiveUnix}:R>`, inline: true });
  } else if (n.lastActive) {
    embed.addFields({ name: 'Last Active', value: n.lastActive, inline: true });
  }

  // Military capacity percentages
  if (n.numCities > 0) {
    const maxSol = MAX_SOLDIERS_PER_CITY * n.numCities;
    const maxTan = MAX_TANKS_PER_CITY * n.numCities;
    const maxAir = MAX_AIRCRAFT_PER_CITY * n.numCities;
    const maxShi = MAX_SHIPS_PER_CITY * n.numCities;
    const hasPropagandaBureau = n.projectsBuilt.includes('PB');
    const dailyBuyMultiplier = hasPropagandaBureau ? 1.1 : 1.0;
    const dailyCapSol = Math.floor(DAILY_BUY_SOLDIERS_PER_CITY * n.numCities * dailyBuyMultiplier);
    const dailyCapTan = Math.floor(DAILY_BUY_TANKS_PER_CITY * n.numCities * dailyBuyMultiplier);
    const dailyCapAir = Math.floor(DAILY_BUY_AIRCRAFT_PER_CITY * n.numCities * dailyBuyMultiplier);
    const dailyCapShi = Math.floor(DAILY_BUY_SHIPS_PER_CITY * n.numCities * dailyBuyMultiplier);
    const hasSpaceProgram = n.projectsBuilt.includes('SP');
    const hasMissileLaunchPad = n.projectsBuilt.includes('MLP');
    const hasNuclearLaunchFacility = n.projectsBuilt.includes('NLF');
    const hasNuclearResearchFacility = n.projectsBuilt.includes('NRF');
    const hasSpySatellite = n.projectsBuilt.includes('SS');
    const hasCentralIntelligenceAgency = n.projectsBuilt.includes('IA');
    const dailyCapMissiles = hasSpaceProgram ? 3 : (hasMissileLaunchPad ? 2 : 0);
    const dailyCapNukes = hasNuclearLaunchFacility ? 2 : (hasNuclearResearchFacility ? 1 : 0);
    const dailyCapSpies = hasSpySatellite ? 3 : (hasCentralIntelligenceAgency ? 2 : 1);
    const remSol = Math.max(0, dailyCapSol - n.soldiersToday);
    const remTan = Math.max(0, dailyCapTan - n.tanksToday);
    const remAir = Math.max(0, dailyCapAir - n.aircraftToday);
    const remShi = Math.max(0, dailyCapShi - n.shipsToday);
    const remMissiles = Math.max(0, dailyCapMissiles - n.missilesToday);
    const remNukes = Math.max(0, dailyCapNukes - n.nukesToday);
    const remSpies = Math.max(0, dailyCapSpies - n.spiesToday);
    const pct = (val: number, cap: number) =>
      cap === 0 ? `${val.toLocaleString()} (—)` : `${val.toLocaleString()} (${((val / cap) * 100).toFixed(1)}%)`;
    const militaryText = [
      `🪖 Soldiers: ${pct(n.soldiers, maxSol)}`,
      `⚔️ Tanks:    ${pct(n.tanks, maxTan)}`,
      `✈️ Aircraft: ${pct(n.aircraft, maxAir)}`,
      `🚢 Ships:    ${pct(n.ships, maxShi)}`,
      `🚀 Missiles: ${n.missiles.toLocaleString()}`,
      `☢️ Nukes:    ${n.nukes.toLocaleString()}`,
    ].join('\n');
    embed.addFields({ name: 'Military', value: militaryText, inline: false });
    const remainingBuysText = [
      `🪖 Soldiers: ${remSol.toLocaleString()} left (${n.soldiersToday.toLocaleString()}/${dailyCapSol.toLocaleString()} used)`,
      `⚔️ Tanks:    ${remTan.toLocaleString()} left (${n.tanksToday.toLocaleString()}/${dailyCapTan.toLocaleString()} used)`,
      `✈️ Aircraft: ${remAir.toLocaleString()} left (${n.aircraftToday.toLocaleString()}/${dailyCapAir.toLocaleString()} used)`,
      `🚢 Ships:    ${remShi.toLocaleString()} left (${n.shipsToday.toLocaleString()}/${dailyCapShi.toLocaleString()} used)`,
      `🚀 Missiles: ${remMissiles.toLocaleString()} left (${n.missilesToday.toLocaleString()}/${dailyCapMissiles.toLocaleString()} used)`,
      `☢️ Nukes:    ${remNukes.toLocaleString()} left (${n.nukesToday.toLocaleString()}/${dailyCapNukes.toLocaleString()} used)`,
      `🕵️ Spies:    ${remSpies.toLocaleString()} left (${n.spiesToday.toLocaleString()}/${dailyCapSpies.toLocaleString()} used)`,
    ].join('\n');
    embed.addFields({ name: 'Remaining Buys (Today)', value: remainingBuysText, inline: false });
  }

  if (registeredDiscord) {
    embed.addFields({ name: 'Discord', value: registeredDiscord, inline: true });
  } else if (n.discordTag) {
    embed.addFields({ name: 'PnW Discord', value: `\`${n.discordTag}\``, inline: true });
  }

  if (note) embed.setFooter({ text: note });

  return embed;
}

/** Rich alliance embed matching Python's _alliance_embed. */
function allianceEmbed(info: AllianceInfo, baseUrl = PNW_BASE_URL): EmbedBuilder {
  const title = info.acronym ? `${info.name} (${info.acronym})` : info.name;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(allianceUrl(info.allianceId, baseUrl))
    .setColor(0xF1C40F);

  if (info.flag) embed.setThumbnail(info.flag);

  embed.addFields({ name: 'ID', value: String(info.allianceId), inline: true });
  embed.addFields({ name: 'Score', value: info.score.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), inline: true });
  embed.addFields({ name: 'Avg Score', value: info.averageScore.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), inline: true });
  embed.addFields({ name: 'Color', value: info.color ? info.color.charAt(0).toUpperCase() + info.color.slice(1).toLowerCase() : '—', inline: true });
  embed.addFields({ name: 'Members', value: String(info.numMembers), inline: true });
  embed.addFields({ name: 'Applicants', value: String(info.numApplicants), inline: true });
  if (info.rank) embed.addFields({ name: 'Rank', value: `#${info.rank}`, inline: true });
  if (info.totalCities) embed.addFields({ name: 'Total Cities', value: String(info.totalCities), inline: true });
  embed.addFields({ name: 'Avg Cities', value: info.avgCities.toFixed(1), inline: true });
  if (info.discordLink) embed.addFields({ name: 'Discord', value: `[Join Server](${info.discordLink})`, inline: true });

  return embed;
}

/** Build an active-wars embed for /whois "Show Wars" button. */
function buildActiveWarsEmbed(nation: Nation, wars: NationWar[], baseUrl = PNW_BASE_URL): EmbedBuilder {
  const lines: string[] = [];
  for (let i = 0; i < wars.length; i++) {
    const w = wars[i]!;
    const isAttacker = w.attackerId === nation.nationId;
    const oppId = isAttacker ? w.defenderId : w.attackerId;
    const oppName = isAttacker ? w.defenderName : w.attackerName;
    const side = isAttacker ? 'Attacking' : 'Defending';
    lines.push(`\`${String(i + 1).padStart(2)}\`. [${oppName}](${nationUrl(oppId, baseUrl)}) — ${side} · [War #${w.warId}](${warUrl(w.warId, baseUrl)})`);
  }
  return new EmbedBuilder()
    .setTitle(`⚔️ Active Wars — ${nation.nationName}`)
    .setDescription(lines.join('\n') || '*(no active wars)*')
    .setColor(0xE67E22)
    .setFooter({ text: `${wars.length} active war(s)` });
}

async function handleRegister(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient): Promise<void> {
  await i.deferReply();
  const nationId = i.options.getInteger('nation_id', true);
  if (nationId <= 0) {
    await i.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Please provide a valid positive nation ID.').setColor(0xE74C3C)] });
    return;
  }

  // Check if this nation is already registered to a different user
  const existingByNation = await db.getByNationId(nationId);
  if (existingByNation && BigInt(existingByNation.discord_id) !== BigInt(i.user.id)) {
    await i.followUp({ embeds: [new EmbedBuilder().setDescription('❌ That nation is already registered to a different Discord account.').setColor(0xE74C3C)] });
    return;
  }

  let nation: Nation | null;
  try {
    nation = await pnw.getNation(nationId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await i.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
    return;
  }

  if (!nation) {
    await i.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Nation with ID **${nationId}** was not found.`).setColor(0xE74C3C)] });
    return;
  }

  const discordName = i.user.username;
  if (!PnWClient.discordMatches(nation.discordTag, discordName)) {
    await i.followUp({
      embeds: [new EmbedBuilder().setDescription(
        `❌ Verification failed.\n\nNation **${nation.nationName}** (leader: ${nation.leaderName}) ` +
        `has \`${nation.discordTag || '(empty)'}\` as its Discord handle, ` +
        `but your Discord username is \`${discordName}\`.\n\n` +
        `Please set your Discord handle on your nation's edit page to \`${discordName}\` and try again.`
      ).setColor(0xE74C3C)],
    });
    return;
  }

  await db.register(BigInt(i.user.id), nationId, discordName);

  // Assign VERIFIED_ROLE_ID if configured
  const roleMentions: string[] = [];
  if (i.guild && VERIFIED_ROLE_ID) {
    const member = i.guild.members.cache.get(i.user.id) as GuildMember | undefined;
    if (member) {
      const role = i.guild.roles.cache.get(String(VERIFIED_ROLE_ID));
      if (role && !member.roles.cache.has(String(VERIFIED_ROLE_ID))) {
        try {
          await member.roles.add(role, 'flame_bot: /register');
          roleMentions.push(role.toString());
        } catch { /* missing permissions — ignore */ }
      }
    }
  }

  const rolesText = roleMentions.length ? `\n\nYou have been given: ${roleMentions.join(', ')}` : '';
  await i.followUp({
    embeds: [new EmbedBuilder().setDescription(
      `✅ Successfully registered!\nNation: **${nation.nationName}** (ID: \`${nationId}\`, leader: ${nation.leaderName})${rolesText}`
    ).setColor(0x2ECC71)],
  });
}

/** Try to resolve a mentioned Discord user to a PnW Nation via Discord tag matching. */
async function resolveMentionedNationViaApi(
  i: ChatInputCommandInteraction,
  pnw: PnWClient,
  discordId: string,
): Promise<Nation | null> {
  let member: GuildMember | null = null;
  if (i.guild) {
    member = i.guild.members.cache.get(discordId) ?? null;
    if (!member) {
      try { member = await i.guild.members.fetch(discordId); } catch { member = null; }
    }
  }
  if (!member) return null;

  const candidateTags: string[] = [member.user.username, member.displayName];
  if (member.user.globalName) candidateTags.push(member.user.globalName);
  if (member.user.discriminator && member.user.discriminator !== '0') {
    candidateTags.push(`${member.user.username}#${member.user.discriminator}`);
  }

  for (const tag of candidateTags) {
    const candidate = tag.trim();
    if (!candidate) continue;
    const nation = await pnw.getNationByDiscordTag(candidate);
    if (nation && PnWClient.discordMatches(nation.discordTag, candidate)) return nation;
  }
  return null;
}

async function handleWhois(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient, pnwTest: PnWClient, useTest = false): Promise<void> {
  await i.deferReply();
  const query = i.options.getString('query', true).trim();
  const client = useTest ? pnwTest : pnw;
  const baseUrl = useTest ? PNW_TEST_BASE_URL : PNW_BASE_URL;
  const MENTION_RE = /^<@!?(\d+)>$/;
  const mentionMatch = MENTION_RE.exec(query);

  if (mentionMatch) {
    const targetId = mentionMatch[1]!;
    const row = await db.getByDiscordId(BigInt(targetId));
    if (!row) {
      // Not locally registered — try PnW Discord tag lookup
      const nation = await resolveMentionedNationViaApi(i, client, targetId);
      if (nation) {
        const embed = nationEmbed(nation, `<@${targetId}>`, 'ℹ️ Found via PnW discord field (not locally registered).', baseUrl);
        const warsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`wars:${nation.nationId}`).setLabel('Show Wars').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'),
        );
        const msg = await i.editReply({ embeds: [embed], components: [warsRow] });
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
        collector.on('collect', async (btn) => {
          await btn.deferReply({ flags: MessageFlags.Ephemeral });
          try {
            const wars = await client.getActiveWarsForNation(nation.nationId);
            wars.sort((a, b) => b.warId - a.warId);
            await btn.editReply({ embeds: [buildActiveWarsEmbed(nation, wars, baseUrl)] });
          } catch (err) {
            const msg2 = err instanceof Error ? err.message : String(err);
            await btn.editReply({ content: `❌ Could not fetch wars: ${msg2}` });
          }
        });
      } else {
        await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ <@${targetId}> has not registered yet and no matching PnW nation was found.`).setColor(0x3498DB)] });
      }
      return;
    }
    let nation: Nation | null = null;
    try { nation = await client.getNation(Number(row.nation_id)); } catch { nation = null; }
    if (nation) {
      const embed = nationEmbed(nation, `<@${targetId}>`, null, baseUrl);
      const warsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`wars:${nation.nationId}`).setLabel('Show Wars').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'),
      );
      const msg = await i.editReply({ embeds: [embed], components: [warsRow] });
      const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
      collector.on('collect', async (btn) => {
        await btn.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const wars = await client.getActiveWarsForNation(nation!.nationId);
          wars.sort((a, b) => b.warId - a.warId);
          await btn.editReply({ embeds: [buildActiveWarsEmbed(nation!, wars, baseUrl)] });
        } catch (err) {
          const msg2 = err instanceof Error ? err.message : String(err);
          await btn.editReply({ content: `❌ Could not fetch wars: ${msg2}` });
        }
      });
    } else {
      await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ <@${targetId}> is registered with nation ID \`${row.nation_id}\` (nation details unavailable).`).setColor(0x3498DB)] });
    }
    return;
  }

  // Numeric query
  if (/^\d+$/.test(query)) {
    const nationId = parseInt(query, 10);
    if (nationId <= 0) {
      await i.editReply({ embeds: [new EmbedBuilder().setDescription('❌ Please provide a valid positive nation ID.').setColor(0xE74C3C)] });
      return;
    }
    let nation: Nation | null = null;
    try { nation = await client.getNation(nationId); } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await i.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
      return;
    }
    if (!nation) {
      await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No nation with ID \`${nationId}\` was found.`).setColor(0x3498DB)] });
      return;
    }
    const row = await db.getByNationId(nationId);
    const discordUser = row ? `\`${row.discord_username || row.discord_id}\`` : null;
    const embed = nationEmbed(nation, discordUser, null, baseUrl);
    const warsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`wars:${nation.nationId}`).setLabel('Show Wars').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'),
    );
    const msg = await i.editReply({ embeds: [embed], components: [warsRow] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
    collector.on('collect', async (btn) => {
      await btn.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const wars = await client.getActiveWarsForNation(nation!.nationId);
        wars.sort((a, b) => b.warId - a.warId);
        await btn.editReply({ embeds: [buildActiveWarsEmbed(nation!, wars, baseUrl)] });
      } catch (err) {
        const msg2 = err instanceof Error ? err.message : String(err);
        await btn.editReply({ content: `❌ Could not fetch wars: ${msg2}` });
      }
    });
    return;
  }

  // Text query — try nation name, then discord username
  let nation: Nation | null = null;
  try { nation = await client.getNationByName(query); } catch { nation = null; }
  if (nation) {
    const row = await db.getByNationId(nation.nationId);
    const discordUser = row ? `\`${row.discord_username || row.discord_id}\`` : null;
    const embed = nationEmbed(nation, discordUser, null, baseUrl);
    const warsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`wars:${nation.nationId}`).setLabel('Show Wars').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'),
    );
    const msg = await i.editReply({ embeds: [embed], components: [warsRow] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
    collector.on('collect', async (btn) => {
      await btn.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const wars = await client.getActiveWarsForNation(nation!.nationId);
        wars.sort((a, b) => b.warId - a.warId);
        await btn.editReply({ embeds: [buildActiveWarsEmbed(nation!, wars, baseUrl)] });
      } catch (err) {
        const msg2 = err instanceof Error ? err.message : String(err);
        await btn.editReply({ content: `❌ Could not fetch wars: ${msg2}` });
      }
    });
    return;
  }

  const row = await db.getByDiscordUsername(query);
  if (!row) {
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No nation or Discord user found for \`${query}\`.`).setColor(0x3498DB)] });
    return;
  }
  const storedName = row.discord_username || String(row.discord_id);
  try { nation = await client.getNation(Number(row.nation_id)); } catch { nation = null; }
  if (nation) {
    const embed = nationEmbed(nation, `\`${storedName}\``, null, baseUrl);
    const warsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`wars:${nation.nationId}`).setLabel('Show Wars').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'),
    );
    const msg = await i.editReply({ embeds: [embed], components: [warsRow] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
    collector.on('collect', async (btn) => {
      await btn.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const wars = await client.getActiveWarsForNation(nation!.nationId);
        wars.sort((a, b) => b.warId - a.warId);
        await btn.editReply({ embeds: [buildActiveWarsEmbed(nation!, wars, baseUrl)] });
      } catch (err) {
        const msg2 = err instanceof Error ? err.message : String(err);
        await btn.editReply({ content: `❌ Could not fetch wars: ${msg2}` });
      }
    });
  } else {
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ **${storedName}** is registered with nation ID \`${row.nation_id}\` (nation details unavailable).`).setColor(0x3498DB)] });
  }
}

async function handleAllianceInfo(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient, useTest = false): Promise<void> {
  await i.deferReply();
  const query = i.options.getString('query', true).trim();
  const client = useTest ? new PnWClient(PNW_TEST_API_KEY, { restUrl: PNW_TEST_REST_URL }) : pnw;
  const baseUrl = useTest ? PNW_TEST_BASE_URL : PNW_BASE_URL;
  const MENTION_RE = /^<@!?(\d+)>$/;
  const mentionMatch = MENTION_RE.exec(query);

  let alliance: AllianceInfo | null = null;
  try {
    if (mentionMatch) {
      const targetId = mentionMatch[1]!;
      // Try local DB first, then PnW tag lookup
      const row = await db.getByDiscordId(BigInt(targetId));
      let nation: Nation | null = null;
      if (row) {
        try { nation = await client.getNation(Number(row.nation_id)); } catch { nation = null; }
      }
      if (!nation) nation = await resolveMentionedNationViaApi(i, client, targetId);
      if (!nation) {
        await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ Could not resolve <@${targetId}> via registration or the PnW Discord field.`).setColor(0x3498DB)] });
        return;
      }
      if (!nation.allianceId) {
        await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ [${nation.nationName}](${nationUrl(nation.nationId, baseUrl)}) is not currently in an alliance.`).setColor(0x3498DB)] });
        return;
      }
      alliance = await client.getAllianceById(nation.allianceId);
    } else if (/^\d+$/.test(query)) {
      alliance = await client.getAllianceById(parseInt(query, 10));
    } else {
      alliance = await client.getAllianceByName(query);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
    return;
  }

  if (!alliance) {
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No alliance found for \`${query}\`.`).setColor(0x3498DB)] });
    return;
  }
  await i.editReply({ embeds: [allianceEmbed(alliance, baseUrl)] });
}



const MEMBERS_PAGE_SIZE = 10;
const POS_ICON: Record<string, string> = {
  LEADER: '👑',
  HEIR: '⚔️',
  OFFICER: '🌟',
  MEMBER: '👤',
  APPLICANT: '📝',
};

function buildAllianceMembersPage(members: Nation[], alliance: AllianceInfo, page: number, baseUrl = PNW_BASE_URL): EmbedBuilder {
  const total = members.length;
  const totalPages = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const start = safePage * MEMBERS_PAGE_SIZE;
  const chunk = members.slice(start, start + MEMBERS_PAGE_SIZE);
  const title = alliance.acronym
    ? `${alliance.name} (${alliance.acronym}) — Members`
    : `${alliance.name} — Members`;
  const lines = chunk.map((m, idx) => {
    const icon = POS_ICON[m.alliancePosition ?? ''] ?? '👤';
    return `\`${String(start + idx + 1).padStart(3)}\` ${icon} [${m.nationName}](${nationUrl(m.nationId, baseUrl)}) — 🏙️ ${m.numCities} | ⭐ ${Math.round(m.score).toLocaleString()}`;
  });
  return new EmbedBuilder()
    .setTitle(title)
    .setURL(allianceUrl(alliance.allianceId, baseUrl))
    .setDescription(lines.join('\n') || '*(no members)*')
    .setColor(0xFFD700)
    .setFooter({ text: `Page ${safePage + 1}/${totalPages} • ${total} members total` });
}

async function handleAllianceMembers(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient, useTest = false): Promise<void> {
  await i.deferReply();
  const query = i.options.getString('query', true).trim();
  const client = useTest ? new PnWClient(PNW_TEST_API_KEY, { restUrl: PNW_TEST_REST_URL }) : pnw;
  const baseUrl = useTest ? PNW_TEST_BASE_URL : PNW_BASE_URL;
  const MENTION_RE = /^<@!?(\d+)>$/;
  const mentionMatch = MENTION_RE.exec(query);

  let alliance: AllianceInfo | null = null;
  try {
    if (mentionMatch) {
      const targetId = mentionMatch[1]!;
      const row = await db.getByDiscordId(BigInt(targetId));
      let nation: Nation | null = null;
      if (row) { try { nation = await client.getNation(Number(row.nation_id)); } catch { nation = null; } }
      if (!nation) nation = await resolveMentionedNationViaApi(i, client, targetId);
      if (!nation || !nation.allianceId) {
        await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ Could not resolve <@${targetId}> to an alliance.`).setColor(0x3498DB)] });
        return;
      }
      alliance = await client.getAllianceById(nation.allianceId);
    } else if (/^\d+$/.test(query)) {
      alliance = await client.getAllianceById(parseInt(query, 10));
    } else {
      alliance = await client.getAllianceByName(query);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
    return;
  }
  if (!alliance) {
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No alliance found for \`${query}\`.`).setColor(0x3498DB)] });
    return;
  }

  let members: Nation[];
  try {
    members = await client.getAllianceMembers([alliance.allianceId]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ Could not fetch alliance members: ${msg}`).setColor(0xE74C3C)] });
    return;
  }
  members.sort((a, b) => b.score - a.score);

  const totalPages = Math.max(1, Math.ceil(members.length / MEMBERS_PAGE_SIZE));
  let page = 0;
  const allianceCopy = alliance;

  const row = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );

  const msg = await i.editReply({ embeds: [buildAllianceMembersPage(members, allianceCopy, page, baseUrl)], components: totalPages > 1 ? [row()] : [] });
  if (totalPages <= 1) return;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
  collector.on('collect', async (btn) => {
    if (btn.user.id !== i.user.id) {
      await btn.reply({ content: 'Only the command caller can paginate this view.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (btn.customId === 'prev' && page > 0) page -= 1;
    if (btn.customId === 'next' && page < totalPages - 1) page += 1;
    await btn.update({ embeds: [buildAllianceMembersPage(members, allianceCopy, page, baseUrl)], components: [row()] });
  });
  collector.on('end', async () => {
    try { await i.editReply({ components: [] }); } catch { /**/ }
  });
}

const SLOTS_PAGE_SIZE = 15;

function buildSlotsPage(
  members: Nation[],
  warCounts: Map<number, number>,
  page: number,
  sortKey: 'slots' | 'score',
  scoreRange: [number, number] | null,
): EmbedBuilder {
  const sortedMembers = [...members].sort((a, b) => {
    if (sortKey === 'slots') {
      const slotsA = MAX_DEFENSIVE_SLOTS - (warCounts.get(a.nationId) ?? 0);
      const slotsB = MAX_DEFENSIVE_SLOTS - (warCounts.get(b.nationId) ?? 0);
      if (slotsB !== slotsA) return slotsB - slotsA;
      return b.score - a.score;
    }
    return b.score - a.score;
  });
  const total = sortedMembers.length;
  const totalPages = Math.max(1, Math.ceil(total / SLOTS_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const chunk = sortedMembers.slice(safePage * SLOTS_PAGE_SIZE, (safePage + 1) * SLOTS_PAGE_SIZE);
  const totalOpen = members.reduce((s, m) => s + MAX_DEFENSIVE_SLOTS - (warCounts.get(m.nationId) ?? 0), 0);

  const lines = chunk.map((m) => {
    const openSlots = MAX_DEFENSIVE_SLOTS - (warCounts.get(m.nationId) ?? 0);
    const aa = m.allianceName || (m.allianceId ? `AA:${m.allianceId}` : 'None');
    let line = `[${m.nationName}](${nationUrl(m.nationId)}) (${aa}) — 🏙️ ${m.numCities} | ⭐ ${Math.round(m.score).toLocaleString()} | 🛡️ ${openSlots}/${MAX_DEFENSIVE_SLOTS}`;
    if (scoreRange && m.score >= scoreRange[0] && m.score <= scoreRange[1]) line += ' | 🎯 In range';
    if (m.beigeTurns > 0) line += ` | 🟡 ${m.beigeTurns} beige turns`;
    return line;
  });

  const sortLabel = sortKey === 'slots' ? 'Open Slots' : 'Score';
  const embed = new EmbedBuilder()
    .setTitle(`Defensive Slots — Sorted by ${sortLabel}`)
    .setDescription(lines.join('\n') || '*(no members)*')
    .setColor(0x2ECC71)
    .setFooter({ text: `Page ${safePage + 1}/${totalPages} · ${total} members total · ${totalOpen} open slots total` });
  if (scoreRange) {
    embed.addFields({ name: 'Your Target Range', value: `🎯 ${Math.round(scoreRange[0]).toLocaleString()} – ${Math.round(scoreRange[1]).toLocaleString()} score`, inline: false });
  }
  return embed;
}

async function handleSlots(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient): Promise<void> {
  if (!i.guildId) return void i.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
  await i.deferReply();
  const allianceIds = await db.getSlotsAlliances(BigInt(i.guildId));
  if (!allianceIds.length) {
    await i.editReply({ embeds: [new EmbedBuilder().setDescription('ℹ️ No alliances configured. An admin can use `/config_slots_set` to set them up.').setColor(0x3498DB)] });
    return;
  }
  let members: Nation[];
  try {
    members = await pnw.getAllianceMembers(allianceIds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
    return;
  }
  if (!members.length) {
    await i.editReply({ embeds: [new EmbedBuilder().setDescription('ℹ️ No active members found for the configured alliance(s).').setColor(0x3498DB)] });
    return;
  }

  // Get actual defensive war counts
  const nationIds = members.map((m) => m.nationId);
  let warCounts: Map<number, number>;
  try {
    warCounts = await pnw.getActiveWarCounts(nationIds);
  } catch {
    warCounts = new Map();
  }

  // Try to get invoker's score range from their registered nation
  let scoreRange: [number, number] | null = null;
  const reg = await db.getByDiscordId(BigInt(i.user.id));
  if (reg) {
    try {
      const myNation = await pnw.getNation(Number(reg.nation_id));
      if (myNation) scoreRange = [myNation.score * 0.75, myNation.score * 2.5];
    } catch { /* ignore */ }
  }

  let page = 0;
  let sortKey: 'slots' | 'score' = 'slots';

  const buildRow = () => {
    const totalPages = Math.max(1, Math.ceil(members.length / SLOTS_PAGE_SIZE));
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('sort_slots').setLabel('Sort: Open Slots').setStyle(sortKey === 'slots' ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji('🛡️'),
      new ButtonBuilder().setCustomId('sort_score').setLabel('Sort: Score').setStyle(sortKey === 'score' ? ButtonStyle.Primary : ButtonStyle.Secondary).setEmoji('⭐'),
      new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    );
  };

  const msg = await i.editReply({ embeds: [buildSlotsPage(members, warCounts, page, sortKey, scoreRange)], components: [buildRow()] });
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
  collector.on('collect', async (btn) => {
    if (btn.user.id !== i.user.id) {
      await btn.reply({ content: 'Only the command caller can use these buttons.', flags: MessageFlags.Ephemeral });
      return;
    }
    const totalPages = Math.max(1, Math.ceil(members.length / SLOTS_PAGE_SIZE));
    if (btn.customId === 'prev' && page > 0) page -= 1;
    else if (btn.customId === 'next' && page < totalPages - 1) page += 1;
    else if (btn.customId === 'sort_slots') { sortKey = 'slots'; page = 0; }
    else if (btn.customId === 'sort_score') { sortKey = 'score'; page = 0; }
    await btn.update({ embeds: [buildSlotsPage(members, warCounts, page, sortKey, scoreRange)], components: [buildRow()] });
  });
  collector.on('end', async () => {
    try { await i.editReply({ components: [] }); } catch { /**/ }
  });
}



function buildWarAlertEmbed(war: WarDetail, watchedAllianceId: number): EmbedBuilder {
  const isOffensive = war.attackerAllianceId === watchedAllianceId;

  const WAR_TYPE_LABELS: Record<string, string> = {
    ORDINARY: 'Standard War',
    RAID: 'Raid',
    ATTRITION: 'Attrition War',
  };
  const warTypeLabel = WAR_TYPE_LABELS[war.warType] ?? war.warType;

  const title = isOffensive
    ? `⚔️ Offensive ${warTypeLabel} Declared`
    : `🛡️ Defensive ${warTypeLabel} Declared`;
  const color = isOffensive ? 0xff3b30 : 0xff9500;

  const mil = (soldiers: number, tanks: number, aircraft: number, ships: number, missiles: number, nukes: number): string => {
    const parts = [
      `👥 ${soldiers.toLocaleString()}`,
      `🪖 ${tanks.toLocaleString()}`,
      `✈️ ${aircraft.toLocaleString()}`,
      `🚢 ${ships.toLocaleString()}`,
    ];
    if (missiles) parts.push(`🚀 ${missiles.toLocaleString()}`);
    if (nukes) parts.push(`☢️ ${nukes.toLocaleString()}`);
    return parts.join('  ');
  };

  const record = (won: number, lost: number) => `W ${won} / L ${lost}`;

  const attUrl = nationUrl(war.attackerId);
  const defUrl = nationUrl(war.defenderId);

  const embed = new EmbedBuilder().setTitle(title).setColor(color);
  embed.addFields({
    name: `⚔️ Attacker — [${war.attackerName}](${attUrl})`,
    value: [
      `**Leader:** ${war.attackerLeader || '—'}`,
      `**Alliance:** ${war.attackerAllianceName || 'None'}`,
      `**Cities:** 🏙️ ${war.attackerCities}  **Score:** ${war.attackerScore.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `**Military:** ${mil(war.attackerSoldiers, war.attackerTanks, war.attackerAircraft, war.attackerShips, war.attackerMissiles, war.attackerNukes)}`,
      `**War record:** ${record(war.attackerWarsWon, war.attackerWarsLost)}`,
    ].join('\n'),
    inline: false,
  });
  embed.addFields({
    name: `🛡️ Defender — [${war.defenderName}](${defUrl})`,
    value: [
      `**Leader:** ${war.defenderLeader || '—'}`,
      `**Alliance:** ${war.defenderAllianceName || 'None'}`,
      `**Cities:** 🏙️ ${war.defenderCities}  **Score:** ${war.defenderScore.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `**Military:** ${mil(war.defenderSoldiers, war.defenderTanks, war.defenderAircraft, war.defenderShips, war.defenderMissiles, war.defenderNukes)}`,
      `**War record:** ${record(war.defenderWarsWon, war.defenderWarsLost)}`,
    ].join('\n'),
    inline: false,
  });
  embed.addFields({
    name: 'War link',
    value: `[View war](${warUrl(war.warId)})`,
    inline: false,
  });
  const legend = '👥 soldiers  🪖 tanks  ✈️ aircraft  🚢 ships  🚀 missiles  ☢️ nukes';
  const dateStr = war.date instanceof Date
    ? war.date.toISOString().replace('T', ' ').substring(0, 16) + ' UTC'
    : String(war.date);
  embed.setFooter({ text: `War ID ${war.warId} · ${dateStr}  ·  ${legend}` });
  return embed;
}

function buildRecruiterEmbed(nation: NationCreateDetail): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🌍 New Nation: ${nation.nationName}`)
    .setURL(nationUrl(nation.nationId))
    .setColor(0x2ECC71)
    .addFields(
      { name: 'Nation ID', value: String(nation.nationId), inline: true },
      { name: 'Leader', value: nation.leaderName || '—', inline: true },
      { name: 'Cities', value: String(nation.cities), inline: true },
    );
  if (nation.score > 0) {
    embed.addFields({
      name: 'Score',
      value: nation.score.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      inline: true,
    });
  }
  if (nation.allianceId) {
    embed.addFields({
      name: 'Alliance',
      value: `[${nation.allianceId}](${allianceUrl(nation.allianceId)})`,
      inline: true,
    });
  }
  const foundedStr = nation.founded instanceof Date
    ? nation.founded.toISOString().replace('T', ' ').substring(0, 16) + ' UTC'
    : String(nation.founded);
  embed.setFooter({ text: `Founded ${foundedStr} · Recruit now!` });
  return embed;
}

async function main(): Promise<void> {
  logInfo('[startup] flame_bot_ts boot sequence started.');
  logInfo(`[startup] Environment: LOG_LEVEL=${LOG_LEVEL}, API_PORT=${API_PORT}, API_KEY=${API_KEY ? 'set' : 'unset'}, GUILD_ID=${GUILD_ID ?? 'auto'}`);

  const db = new Database(MONGODB_URI);
  logInfo('[startup] Connecting to database...');
  await db.connect();
  logInfo('[startup] Database connected.');
  const overriddenPnwApiKey = await db.getPnwApiKey();
  const effectivePnwApiKey = overriddenPnwApiKey || PNW_API_KEY;
  if (overriddenPnwApiKey) logInfo('Loaded overridden PnW API key from database.');
  logDebug(`LOG_LEVEL=${LOG_LEVEL}`);
  const pnw = new PnWClient(effectivePnwApiKey);
  const pnwTest = new PnWClient(PNW_TEST_API_KEY, { restUrl: PNW_TEST_REST_URL });

  const intents = [GatewayIntentBits.Guilds];
  if (DISCORD_ENABLE_GUILD_MEMBERS_INTENT) intents.push(GatewayIntentBits.GuildMembers);
  const client = new Client({ intents });
  logInfo(
    `[startup] Discord intents: Guilds${DISCORD_ENABLE_GUILD_MEMBERS_INTENT ? ', GuildMembers' : ''}`
  );
  if (!DISCORD_ENABLE_GUILD_MEMBERS_INTENT) {
    logInfo(
      '[startup] GuildMembers intent disabled. Set DISCORD_ENABLE_GUILD_MEMBERS_INTENT=true if you need guildMemberAdd events.'
    );
  }
  client.on('error', (err) => {
    logError('[discord] client error', err);
  });
  client.on('shardError', (err) => {
    logError('[discord] shard error', err);
  });
  client.on('shardDisconnect', (event, shardId) => {
    logWarn(`[discord] shard ${shardId} disconnected (code=${event.code}, reason=${event.reason || 'n/a'}).`);
    if (event.code === 4013 || event.code === 4014) {
      logWarn(
        '[discord] Gateway rejected configured intents. Check Developer Portal privileged intents and/or DISCORD_ENABLE_GUILD_MEMBERS_INTENT.'
      );
    }
  });
  const commandUsage = new Map<string, number>();
  const commandCooldowns = new Map<string, number>();
  // Python grouped command parity matrix (legacy path -> canonical TS command).
  // /admin welcome set_message -> /welcome_set (alias: /admin_welcome_set_message)
  // /admin welcome set_channel -> /welcome_channel_set (alias: /admin_welcome_set_channel)
  // /admin welcome toggle true|false -> /welcome_enable | /welcome_disable (aliases: /admin_welcome_enable, /admin_welcome_disable)
  // /admin welcome show -> /welcome_show (alias: /admin_welcome_show)
  // /admin sync -> /admin_sync_commands (alias: /admin_sync)
  // /admin clear_guild_commands -> /admin_clear_guild_commands (alias: /admin_clear)
  const commands = [
    new SlashCommandBuilder().setName('register').setDescription('Register your nation').addIntegerOption(o => o.setName('nation_id').setDescription('Nation ID').setRequired(true)),
    new SlashCommandBuilder().setName('unregister').setDescription('Unregister your nation'),
    new SlashCommandBuilder().setName('whois').setDescription('Lookup nation by id/name/@mention').addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true)),
    new SlashCommandBuilder().setName('test_whois').setDescription('Lookup nation on test API').addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true)),
    new SlashCommandBuilder().setName('alliance_info').setDescription('Lookup alliance').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('test_alliance_info').setDescription('Lookup alliance on test API').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('alliance_members').setDescription('List alliance members').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('test_alliance_members').setDescription('List alliance members (test API)').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('config_slots_set').setDescription('Set slot alliance IDs (comma-separated)').addStringOption(o => o.setName('alliance_ids').setDescription('e.g. 790,1234').setRequired(true)),
    new SlashCommandBuilder().setName('config_slots_show').setDescription('Show configured slot alliance IDs'),
    new SlashCommandBuilder().setName('config_slots_clear').setDescription('Clear configured slot alliance IDs'),
    new SlashCommandBuilder().setName('slots').setDescription('Show open defensive slots for configured alliances'),
    new SlashCommandBuilder().setName('setup_war_alerts_add').setDescription('Add war alerts subscription').addChannelOption(o => o.setName('channel').setDescription('Target text channel').setRequired(true)).addIntegerOption(o => o.setName('min_cities').setDescription('Minimum cities')).addIntegerOption(o => o.setName('max_cities').setDescription('Maximum cities')),
    new SlashCommandBuilder().setName('setup_war_alerts_remove').setDescription('Remove war alerts subscription').addChannelOption(o => o.setName('channel').setDescription('Target text channel').setRequired(true)),
    new SlashCommandBuilder().setName('setup_war_alerts_list').setDescription('List war alerts subscriptions'),
    new SlashCommandBuilder().setName('send').setDescription('Compose transfer command').addStringOption(o => o.setName('receiver').setDescription('Nation ID or @mention').setRequired(true)).addStringOption(o => o.setName('sender').setDescription('Optional sender nation ID')).addStringOption(o => o.setName('bank_note').setDescription('Bank note')).addNumberOption(o => o.setName('money').setDescription('Money amount')).addNumberOption(o => o.setName('food').setDescription('Food amount')).addNumberOption(o => o.setName('coal').setDescription('Coal amount')).addNumberOption(o => o.setName('oil').setDescription('Oil amount')).addNumberOption(o => o.setName('uranium').setDescription('Uranium amount')).addNumberOption(o => o.setName('iron').setDescription('Iron amount')).addNumberOption(o => o.setName('bauxite').setDescription('Bauxite amount')).addNumberOption(o => o.setName('lead').setDescription('Lead amount')).addNumberOption(o => o.setName('gasoline').setDescription('Gasoline amount')).addNumberOption(o => o.setName('munitions').setDescription('Munitions amount')).addNumberOption(o => o.setName('steel').setDescription('Steel amount')).addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')),
    new SlashCommandBuilder().setName('suggestion').setDescription('Send suggestion to dev').addStringOption(o => o.setName('content').setDescription('Suggestion text').setRequired(true)),
    new SlashCommandBuilder().setName('roles_show').setDescription('Show configured gov role mappings'),
    new SlashCommandBuilder().setName('roles_setup').setDescription('Configure gov roles')
      .addRoleOption(o => o.setName('leader').setDescription('Leader role'))
      .addRoleOption(o => o.setName('two_ic').setDescription('Second in command role'))
      .addRoleOption(o => o.setName('econ').setDescription('Economics role'))
      .addRoleOption(o => o.setName('econ_gov').setDescription('Economics Gov role'))
      .addRoleOption(o => o.setName('milcom').setDescription('Military command role'))
      .addRoleOption(o => o.setName('milcom_gov').setDescription('Military command Gov role'))
      .addRoleOption(o => o.setName('ia').setDescription('Internal affairs role'))
      .addRoleOption(o => o.setName('ia_asst').setDescription('Internal affairs assistant role'))
      .addRoleOption(o => o.setName('gov').setDescription('Basic gov role'))
      .addRoleOption(o => o.setName('member').setDescription('Member role (required to use most commands)')),
    new SlashCommandBuilder().setName('gov').setDescription('List members in configured gov departments'),
    new SlashCommandBuilder().setName('setup_grant_channel').setDescription('Set grant request channel').addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)),
    new SlashCommandBuilder().setName('request_grant').setDescription('Request a grant').addStringOption(o => o.setName('note').setDescription('Grant reason').setRequired(true)).addNumberOption(o => o.setName('money').setDescription('Requested money')).addNumberOption(o => o.setName('food').setDescription('Food amount')).addNumberOption(o => o.setName('coal').setDescription('Coal amount')).addNumberOption(o => o.setName('oil').setDescription('Oil amount')).addNumberOption(o => o.setName('uranium').setDescription('Uranium amount')).addNumberOption(o => o.setName('iron').setDescription('Iron amount')).addNumberOption(o => o.setName('bauxite').setDescription('Bauxite amount')).addNumberOption(o => o.setName('lead').setDescription('Lead amount')).addNumberOption(o => o.setName('gasoline').setDescription('Gasoline amount')).addNumberOption(o => o.setName('munitions').setDescription('Munitions amount')).addNumberOption(o => o.setName('steel').setDescription('Steel amount')).addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')),
    new SlashCommandBuilder().setName('admin_alliance_set').setDescription('Set guild primary alliance ID').addIntegerOption(o => o.setName('alliance_id').setDescription('Alliance ID').setRequired(true)),
    new SlashCommandBuilder().setName('admin_alliance_show').setDescription('Show guild primary alliance ID'),
    new SlashCommandBuilder().setName('color').setDescription('Check alliance color compliance'),
    new SlashCommandBuilder().setName('damage_leaderboard').setDescription('Show 7-day alliance damage leaderboard'),
    new SlashCommandBuilder().setName('alliance_lots_of_info').setDescription('Detailed alliance briefing').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('test_alliance_lots_of_info').setDescription('Detailed alliance briefing (test API)').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)),
    new SlashCommandBuilder().setName('fun_quote').setDescription('Get a random quote'),

    new SlashCommandBuilder().setName('welcome_set').setDescription('Set welcome message text').addStringOption(o => o.setName('message').setDescription('Welcome template').setRequired(true)),
    new SlashCommandBuilder().setName('welcome_channel_set').setDescription('Set welcome channel').addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true)),
    new SlashCommandBuilder().setName('welcome_enable').setDescription('Enable welcome messages'),
    new SlashCommandBuilder().setName('welcome_disable').setDescription('Disable welcome messages'),
    new SlashCommandBuilder().setName('welcome_show').setDescription('Show welcome config'),
    new SlashCommandBuilder().setName('admin_welcome_set_message').setDescription('Compatibility alias for /welcome_set').addStringOption(o => o.setName('message').setDescription('Welcome template').setRequired(true)),
    new SlashCommandBuilder().setName('admin_welcome_set_channel').setDescription('Compatibility alias for /welcome_channel_set').addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true)),
    new SlashCommandBuilder().setName('admin_welcome_enable').setDescription('Compatibility alias for /welcome_enable'),
    new SlashCommandBuilder().setName('admin_welcome_disable').setDescription('Compatibility alias for /welcome_disable'),
    new SlashCommandBuilder().setName('admin_welcome_show').setDescription('Compatibility alias for /welcome_show'),
    new SlashCommandBuilder().setName('setup_recruiter_add').setDescription('Add recruiter subscription channel').addChannelOption(o => o.setName('channel').setDescription('Text channel').setRequired(true)),
    new SlashCommandBuilder().setName('setup_recruiter_remove').setDescription('Remove recruiter subscription channel').addChannelOption(o => o.setName('channel').setDescription('Text channel').setRequired(true)),
    new SlashCommandBuilder().setName('setup_recruiter_list').setDescription('List recruiter subscription channels'),
    new SlashCommandBuilder().setName('admin_api_key_set').setDescription('Set runtime PnW API key').addStringOption(o => o.setName('api_key').setDescription('PnW API key').setRequired(true)),
    new SlashCommandBuilder().setName('help').setDescription('Show bot command help'),
    new SlashCommandBuilder().setName('infra').setDescription('Calculate infra purchase cost')
      .addNumberOption(o => o.setName('from').setDescription('Current infra level per city').setRequired(true))
      .addNumberOption(o => o.setName('to').setDescription('Target infra level per city').setRequired(true))
      .addIntegerOption(o => o.setName('cities').setDescription('Number of cities (default: 1)').setMinValue(1))
      .addBooleanOption(o => o.setName('urban_planning').setDescription('Urban Planning project? (−5% cost)'))
      .addBooleanOption(o => o.setName('advanced_urban_planning').setDescription('Advanced Urban Planning? (−10% cost, stacks with UP)')),
    new SlashCommandBuilder().setName('city_cost').setDescription('Calculate city purchase cost using the live dynamic formula')
      .addIntegerOption(o => o.setName('current').setDescription('Current number of cities').setRequired(true).setMinValue(0))
      .addIntegerOption(o => o.setName('target').setDescription('Target number of cities (defaults to current + 1)').setMinValue(1))
      .addBooleanOption(o => o.setName('manifest_destiny').setDescription('Is the nation\'s domestic policy Manifest Destiny? (−5% cost)'))
      .addBooleanOption(o => o.setName('government_support_agency').setDescription('Does the nation have Government Support Agency? (additional −2.5%)')),
    new SlashCommandBuilder().setName('revenue').setDescription('Show estimated gross daily revenue for a nation (or your own if omitted)').addStringOption(o => o.setName('query').setDescription('Optional: a nation ID, @mention, nation name, or Discord username')),
    new SlashCommandBuilder().setName('war_range_targets').setDescription('Show nations in your war range with open defensive slots')
      .addUserOption(o => o.setName('user').setDescription('Discord user to look up (defaults to yourself)')),
    new SlashCommandBuilder().setName('spy_target_find').setDescription('Find spy targets in given alliances by city count')
      .addStringOption(o => o.setName('alliances').setDescription('Comma-separated alliance names or IDs (e.g. Rose, Camelot)').setRequired(true))
      .addBooleanOption(o => o.setName('ignore_score_range').setDescription('If true, do not mark nations in your personal spy range')),
    new SlashCommandBuilder().setName('missile_targets_find').setDescription('Top 20 nations in /slots alliances with open defensive slots, sorted by avg infra')
      .addBooleanOption(o => o.setName('ignore_score_range').setDescription('If true, do not mark nations in your personal score range')),
    new SlashCommandBuilder().setName('admin_sync_commands').setDescription('Sync slash commands now'),
    new SlashCommandBuilder().setName('admin_sync').setDescription('Compatibility alias for /admin_sync_commands'),
    new SlashCommandBuilder().setName('admin_clear_guild_commands').setDescription('Clear guild-scoped commands'),
    new SlashCommandBuilder().setName('admin_clear').setDescription('Compatibility alias for /admin_clear_guild_commands'),

    // Legacy grouped command compatibility paths (Python-style).
    new SlashCommandBuilder().setName('alliance').setDescription('Politics and War alliance commands')
      .addSubcommand(sc => sc.setName('info').setDescription('Lookup alliance').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)))
      .addSubcommand(sc => sc.setName('members').setDescription('List alliance members').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true))),
    new SlashCommandBuilder().setName('test').setDescription('Test-API lookup commands')
      .addSubcommand(sc => sc.setName('whois').setDescription('Lookup nation on test API').addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true)))
      .addSubcommandGroup(g => g.setName('alliance').setDescription('Test alliance commands')
        .addSubcommand(sc => sc.setName('info').setDescription('Lookup alliance on test API').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)))),
    new SlashCommandBuilder().setName('config').setDescription('Bot configuration commands')
      .addSubcommandGroup(g => g.setName('slots').setDescription('Configure slot alliance IDs')
        .addSubcommand(sc => sc.setName('set').setDescription('Set slot alliance IDs').addStringOption(o => o.setName('alliance_ids').setDescription('e.g. 790,1234').setRequired(true)))
        .addSubcommand(sc => sc.setName('show').setDescription('Show slot alliance IDs'))
        .addSubcommand(sc => sc.setName('clear').setDescription('Clear slot alliance IDs'))),
    new SlashCommandBuilder().setName('setup').setDescription('Setup commands')
      .addSubcommand(sc => sc.setName('grant_channel').setDescription('Set grant request channel').addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)))
      .addSubcommandGroup(g => g.setName('war_alerts').setDescription('Configure war alerts')
        .addSubcommand(sc => sc.setName('add').setDescription('Add war alerts subscription')
          .addChannelOption(o => o.setName('channel').setDescription('Target text channel').setRequired(true))
          .addIntegerOption(o => o.setName('min_cities').setDescription('Minimum cities'))
          .addIntegerOption(o => o.setName('max_cities').setDescription('Maximum cities')))
        .addSubcommand(sc => sc.setName('remove').setDescription('Remove war alerts subscription')
          .addChannelOption(o => o.setName('channel').setDescription('Target text channel').setRequired(true)))
        .addSubcommand(sc => sc.setName('list').setDescription('List war alerts subscriptions')))
      .addSubcommandGroup(g => g.setName('recruiter').setDescription('Configure recruiter alerts')
        .addSubcommand(sc => sc.setName('add').setDescription('Add recruiter subscription channel')
          .addChannelOption(o => o.setName('channel').setDescription('Text channel').setRequired(true)))
        .addSubcommand(sc => sc.setName('remove').setDescription('Remove recruiter subscription channel')
          .addChannelOption(o => o.setName('channel').setDescription('Text channel').setRequired(true)))
        .addSubcommand(sc => sc.setName('list').setDescription('List recruiter subscription channels'))),
    new SlashCommandBuilder().setName('request').setDescription('Request commands')
      .addSubcommand(sc => sc.setName('grant').setDescription('Request a grant')
        .addStringOption(o => o.setName('note').setDescription('Grant reason').setRequired(true))
        .addNumberOption(o => o.setName('money').setDescription('Requested money'))
        .addNumberOption(o => o.setName('food').setDescription('Food amount'))
        .addNumberOption(o => o.setName('coal').setDescription('Coal amount'))
        .addNumberOption(o => o.setName('oil').setDescription('Oil amount'))
        .addNumberOption(o => o.setName('uranium').setDescription('Uranium amount'))
        .addNumberOption(o => o.setName('iron').setDescription('Iron amount'))
        .addNumberOption(o => o.setName('bauxite').setDescription('Bauxite amount'))
        .addNumberOption(o => o.setName('lead').setDescription('Lead amount'))
        .addNumberOption(o => o.setName('gasoline').setDescription('Gasoline amount'))
        .addNumberOption(o => o.setName('munitions').setDescription('Munitions amount'))
        .addNumberOption(o => o.setName('steel').setDescription('Steel amount'))
        .addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount'))),
    new SlashCommandBuilder().setName('roles').setDescription('Government role configuration')
      .addSubcommand(sc => sc.setName('setup').setDescription('Configure gov roles')
        .addRoleOption(o => o.setName('leader').setDescription('Leader role'))
        .addRoleOption(o => o.setName('two_ic').setDescription('Second in command role'))
        .addRoleOption(o => o.setName('econ').setDescription('Economics role'))
        .addRoleOption(o => o.setName('econ_gov').setDescription('Economics Gov role'))
        .addRoleOption(o => o.setName('milcom').setDescription('Military command role'))
        .addRoleOption(o => o.setName('milcom_gov').setDescription('Military command Gov role'))
        .addRoleOption(o => o.setName('ia').setDescription('Internal affairs role'))
        .addRoleOption(o => o.setName('ia_asst').setDescription('Internal affairs assistant role'))
        .addRoleOption(o => o.setName('gov').setDescription('Basic gov role'))
        .addRoleOption(o => o.setName('member').setDescription('Member role (required to use most commands)')))
      .addSubcommand(sc => sc.setName('show').setDescription('Show configured gov role mappings')),
    new SlashCommandBuilder().setName('admin').setDescription('Bot administration commands')
      .addSubcommandGroup(g => g.setName('alliance').setDescription('Alliance administration')
        .addSubcommand(sc => sc.setName('set').setDescription('Set guild primary alliance ID')
          .addIntegerOption(o => o.setName('alliance_id').setDescription('Alliance ID').setRequired(true)))
        .addSubcommand(sc => sc.setName('show').setDescription('Show guild primary alliance ID')))
      .addSubcommandGroup(g => g.setName('api_key').setDescription('API key administration')
        .addSubcommand(sc => sc.setName('set').setDescription('Set runtime PnW API key')
          .addStringOption(o => o.setName('api_key').setDescription('PnW API key').setRequired(true))))
      .addSubcommandGroup(g => g.setName('welcome').setDescription('Welcome automation')
        .addSubcommand(sc => sc.setName('set_message').setDescription('Set welcome message text')
          .addStringOption(o => o.setName('message').setDescription('Welcome template').setRequired(true)))
        .addSubcommand(sc => sc.setName('set_channel').setDescription('Set welcome channel')
          .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true)))
        .addSubcommand(sc => sc.setName('toggle').setDescription('Enable or disable welcome messages')
          .addBooleanOption(o => o.setName('enabled').setDescription('Enable welcome messages').setRequired(true)))
        .addSubcommand(sc => sc.setName('show').setDescription('Show welcome config')))
      .addSubcommand(sc => sc.setName('sync').setDescription('Sync slash commands now'))
      .addSubcommand(sc => sc.setName('clear_guild_commands').setDescription('Clear guild-scoped commands')),
    new SlashCommandBuilder().setName('fun').setDescription('Fun commands')
      .addSubcommand(sc => sc.setName('quote').setDescription('Get a random quote')),
    new SlashCommandBuilder().setName('damage').setDescription('Damage commands')
      .addSubcommand(sc => sc.setName('leaderboard').setDescription('Show 7-day alliance damage leaderboard')),
    new SlashCommandBuilder().setName('spy').setDescription('Spy commands')
      .addSubcommandGroup(g => g.setName('target').setDescription('Spy targets')
        .addSubcommand(sc => sc.setName('find').setDescription('Find spy targets in given alliances by city count')
          .addStringOption(o => o.setName('alliances').setDescription('Comma-separated alliance names or IDs (e.g. Rose, Camelot)').setRequired(true))
          .addBooleanOption(o => o.setName('ignore_score_range').setDescription('If true, do not mark nations in your personal spy range')))),
    new SlashCommandBuilder().setName('missile').setDescription('Missile commands')
      .addSubcommandGroup(g => g.setName('targets').setDescription('Missile targets')
        .addSubcommand(sc => sc.setName('find').setDescription('Top 20 nations in /slots alliances with open defensive slots, sorted by avg infra')
          .addBooleanOption(o => o.setName('ignore_score_range').setDescription('If true, do not mark nations in your personal score range')))),
    new SlashCommandBuilder().setName('war').setDescription('War commands')
      .addSubcommandGroup(g => g.setName('range').setDescription('War range commands')
        .addSubcommand(sc => sc.setName('targets').setDescription('Show nations in your war range with open defensive slots')
          .addUserOption(o => o.setName('user').setDescription('Discord user to look up (defaults to yourself)')))),
    new SlashCommandBuilder().setName('city').setDescription('City commands')
      .addSubcommand(sc => sc.setName('cost').setDescription('Calculate city purchase cost using the live dynamic formula')
        .addIntegerOption(o => o.setName('current').setDescription('Current number of cities').setRequired(true).setMinValue(0))
        .addIntegerOption(o => o.setName('target').setDescription('Target number of cities (defaults to current + 1)').setMinValue(1))
        .addBooleanOption(o => o.setName('manifest_destiny').setDescription('Is the nation\'s domestic policy Manifest Destiny? (−5% cost)'))
        .addBooleanOption(o => o.setName('government_support_agency').setDescription('Does the nation have Government Support Agency? (additional −2.5%)'))),

  ].map(c => c.toJSON());

  const createGuildInvite = async (guild: Guild): Promise<string | null> => {
    const me = guild.members.me;
    if (!me) return null;
    const candidates: TextChannel[] = [];
    if (guild.systemChannel instanceof TextChannel) candidates.push(guild.systemChannel);
    for (const channel of guild.channels.cache.values()) {
      if (channel instanceof TextChannel) candidates.push(channel);
    }
    const seen = new Set<string>();
    for (const channel of candidates) {
      if (seen.has(channel.id)) continue;
      seen.add(channel.id);
      if (!channel.permissionsFor(me).has(PermissionFlagsBits.CreateInstantInvite)) continue;
      try {
        const invite = await channel.createInvite({
          maxAge: 0,
          maxUses: 0,
          unique: true,
          reason: 'Persist guild invite link for flame_bot metadata.',
        });
        return invite.url;
      } catch {
        // ignore and continue trying other channels
      }
    }
    return null;
  };

  const persistGuildMetadata = async (guild: Guild): Promise<void> => {
    try {
      const inviteLink = await createGuildInvite(guild);
      await db.upsertGuild(BigInt(guild.id), guild.name, inviteLink);
    } catch (err) {
      logWarn(`Failed to persist guild metadata for ${guild.id}:`, err);
    }
  };

  const inviteExists = async (inviteLink: string): Promise<boolean> => {
    try {
      await client.fetchInvite(inviteLink);
      return true;
    } catch {
      return false;
    }
  };

  const refreshDeletedGuildInvitesOnce = async (): Promise<void> => {
    const docs = await db.getAllGuilds();
    for (const doc of docs) {
      const guild = client.guilds.cache.get(String(doc.guild_id));
      if (!guild) continue;
      if (doc.invite_link && await inviteExists(doc.invite_link)) continue;
      await persistGuildMetadata(guild);
      logInfo(`Refreshed deleted/missing invite for guild ${guild.name} (${guild.id}).`);
    }
  };

  const sendToAllWelcomeChannels = async (message: string): Promise<{ sent: number; skipped: number }> => {
    let sent = 0;
    let skipped = 0;
    for (const guild of client.guilds.cache.values()) {
      const cfg = await db.getWelcomeConfig(BigInt(guild.id));
      const channelId = cfg.channel_id;
      let channel: TextChannel | null = null;
      if (channelId != null) {
        const configured = guild.channels.cache.get(String(channelId));
        if (configured instanceof TextChannel) channel = configured;
      }
      if (!channel && guild.systemChannel instanceof TextChannel) channel = guild.systemChannel;
      if (!channel) {
        channel = guild.channels.cache.find((c): c is TextChannel => c instanceof TextChannel) ?? null;
      }
      if (!channel) {
        skipped += 1;
        continue;
      }
      try {
        await channel.send(message);
        sent += 1;
      } catch {
        skipped += 1;
      }
    }
    return { sent, skipped };
  };

  let inviteRefreshTimer: NodeJS.Timeout | null = null;

  client.once('ready', async () => {
    logInfo(`Logged in as ${client.user?.tag ?? 'unknown'}`);
    const appId = client.application?.id;
    if (!appId) return;
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    if (GUILD_ID !== null) {
      await rest.put(Routes.applicationGuildCommands(appId, String(GUILD_ID)), { body: commands });
    } else {
      await rest.put(Routes.applicationCommands(appId), { body: commands });
    }
    for (const guild of client.guilds.cache.values()) {
      await persistGuildMetadata(guild);
    }
    await refreshDeletedGuildInvitesOnce();
    if (!inviteRefreshTimer) {
      inviteRefreshTimer = setInterval(() => {
        void refreshDeletedGuildInvitesOnce();
      }, INVITE_REFRESH_INTERVAL_MS);
    }
    logInfo('Slash commands synced.');
  });

  client.on('guildCreate', async (guild) => {
    await persistGuildMetadata(guild);
  });

  client.on('guildUpdate', async (before, after) => {
    if (before.name !== after.name) {
      await persistGuildMetadata(after);
    }
  });

  client.on('guildMemberAdd', async (member) => {
    try {
      const cfg = await db.getWelcomeConfig(BigInt(member.guild.id));
      if (!cfg.enabled) return;
      if (cfg.channel_id == null) return;
      const channel = member.guild.channels.cache.get(String(cfg.channel_id));
      if (!(channel instanceof TextChannel)) return;
      const template = String(cfg.message || DEFAULT_WELCOME_MESSAGE);
      const isRegistered = (await db.getByDiscordId(BigInt(member.id))) !== null;
      const message = renderWelcomeMessage(
        template,
        member.toString(),
        member.user.username,
        isRegistered,
        channel.toString(),
      );
      await channel.send(message);
    } catch (err) {
      console.warn('Failed to send welcome message:', err);
    }
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const now = Date.now() / 1000;
    const lastUsed = commandCooldowns.get(interaction.user.id);
    if (lastUsed != null && now - lastUsed < DISCORD_COMMAND_COOLDOWN_SECONDS) {
      const retryAfter = Math.max(0, DISCORD_COMMAND_COOLDOWN_SECONDS - (now - lastUsed));
      return void interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`⏳ You're sending commands too quickly. Please wait **${retryAfter.toFixed(1)}s** and try again.`).setColor(0xE74C3C)],
        flags: MessageFlags.Ephemeral,
      });
    }
    commandCooldowns.set(interaction.user.id, now);
    const commandName = resolveCanonicalCommandNameFromInteraction(interaction);
    commandUsage.set(commandName, (commandUsage.get(commandName) ?? 0) + 1);
    try {
      const replyEphemeral = async (content: string) => {
        if (interaction.deferred) return await interaction.editReply({ content });
        if (interaction.replied) return await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        return await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      };

      if (commandName === 'register') {
        return await handleRegister(interaction, db, pnw);
      }
      if (commandName === 'unregister') {
        const deleted = await db.delete(BigInt(interaction.user.id));
        return void interaction.reply({ content: deleted ? 'Unregistered.' : 'No registration found.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'whois') return await handleWhois(interaction, db, pnw, pnwTest, false);
      if (commandName === 'test_whois') return await handleWhois(interaction, db, pnw, pnwTest, true);
      if (commandName === 'alliance_info') return await handleAllianceInfo(interaction, db, pnw, false);
      if (commandName === 'test_alliance_info') return await handleAllianceInfo(interaction, db, pnw, true);
      if (commandName === 'alliance_members') return await handleAllianceMembers(interaction, db, pnw, false);
      if (commandName === 'test_alliance_members') return await handleAllianceMembers(interaction, db, pnw, true);
      if (commandName === 'slots') return await handleSlots(interaction, db, pnw);

      if (commandName === 'config_slots_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['milcom','milcom_gov'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const raw = interaction.options.getString('alliance_ids', true);
        const ids = raw.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
        if (!ids.length) return void interaction.reply({ content: 'No valid alliance IDs provided.', flags: MessageFlags.Ephemeral });
        await db.setSlotsAlliances(BigInt(interaction.guildId), ids);
        return void interaction.reply({ content: `Configured slots alliances: ${ids.join(', ')}` });
      }
      if (commandName === 'config_slots_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const ids = await db.getSlotsAlliances(BigInt(interaction.guildId));
        return void interaction.reply({ content: ids.length ? `Configured slots alliances: ${ids.join(', ')}` : 'No slot alliances configured.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'config_slots_clear') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['milcom','milcom_gov'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        await db.setSlotsAlliances(BigInt(interaction.guildId), []);
        return void interaction.reply({ content: 'Cleared slot alliances.' });
      }

      if (commandName === 'setup_war_alerts_add') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['milcom','milcom_gov'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const channel = interaction.options.getChannel('channel', true);
        const minCities = interaction.options.getInteger('min_cities');
        const maxCities = interaction.options.getInteger('max_cities');
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        if (!allianceId) {
          return void interaction.reply({ content: 'No primary alliance configured for this server. An admin must run `/admin_alliance_set` first.', flags: MessageFlags.Ephemeral });
        }
        if (minCities != null && minCities < 1) {
          return void interaction.reply({ content: 'min_cities must be at least 1.', flags: MessageFlags.Ephemeral });
        }
        if (maxCities != null && maxCities < 1) {
          return void interaction.reply({ content: 'max_cities must be at least 1.', flags: MessageFlags.Ephemeral });
        }
        if (minCities != null && maxCities != null && minCities > maxCities) {
          return void interaction.reply({ content: 'min_cities must be ≤ max_cities.', flags: MessageFlags.Ephemeral });
        }
        await db.addWarAlertSubscription(BigInt(interaction.guildId), BigInt(channel.id), minCities, maxCities);
        return void interaction.reply({ content: `War alerts enabled for <#${channel.id}> (${minCities ?? 'any'}-${maxCities ?? 'any'} cities).` });
      }
      if (commandName === 'setup_war_alerts_remove') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['milcom','milcom_gov'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const channel = interaction.options.getChannel('channel', true);
        const removed = await db.removeWarAlertSubscription(BigInt(interaction.guildId), BigInt(channel.id));
        return void interaction.reply({ content: removed ? `War alerts removed from <#${channel.id}>.` : `No subscription found for <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'setup_war_alerts_list') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        const subs = await db.getWarAlertSubscriptions(BigInt(interaction.guildId));
        const lines = subs.map((row) => `• <#${row.channel_id}> cities ${row.min_cities ?? 'any'}-${row.max_cities ?? 'any'}`);
        return void interaction.reply({ content: lines.length ? lines.join('\n') : 'No war alert subscriptions configured.', flags: MessageFlags.Ephemeral });
      }

      if (commandName === 'send') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ You need the **Member** role to use this command.').setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        }
        const isAdmin = (() => {
          const m = interaction.member as any;
          return ADMIN_DISCORD_IDS.has(BigInt(interaction.user.id)) ||
            (m?.permissions && typeof m.permissions !== 'string' && m.permissions.has('Administrator'));
        })();
        if (!isAdmin && !await hasGovAccess(interaction, db, ['econ', 'econ_gov'])) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ You need the **Economics** role to use this command.').setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        }
        const receiverRaw = interaction.options.getString('receiver', true).trim();
        const sender = interaction.options.getString('sender')?.trim() ?? '';
        const bankNoteInput = interaction.options.getString('bank_note') ?? '#grant';
        const bankNote = bankNoteInput.startsWith('#') ? bankNoteInput : `#${bankNoteInput}`;

        // Resolve receiver: try registered nation by mention, else use raw string
        let receiver = receiverRaw;
        const mentionMatch = /^<@!?(\d+)>$/.exec(receiverRaw);
        if (mentionMatch) {
          const row = await db.getByDiscordId(BigInt(mentionMatch[1]!));
          if (row) receiver = String(row.nation_id);
        }

        const fmtAmt = (v: number) => (v === Math.trunc(v) ? String(Math.trunc(v)) : String(v));
        const resources: Record<string, number> = {};
        for (const key of ['money','food','coal','oil','uranium','iron','bauxite','lead','gasoline','munitions','steel','aluminum']) {
          const v = interaction.options.getNumber(key) ?? 0;
          if (v > 0) resources[key] = v;
        }
        if (!Object.keys(resources).length) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Please provide at least one resource amount greater than zero.').setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        }
        const transferJson = '{' + Object.entries(resources).map(([k, v]) => `${k}:${fmtAmt(v)}`).join(',') + '}';
        const locutusCmd = `/transfer resources receiver:${receiver} transfer:${transferJson} bank_note:${bankNote}`;

        const embed = new EmbedBuilder().setTitle('💸 Resource Transfer Request').setColor(0x2ECC71);
        if (sender) embed.addFields({ name: 'From', value: sender, inline: true });
        embed.addFields(
          { name: 'To', value: receiver, inline: true },
          { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Bank note', value: bankNote, inline: true },
          { name: 'Resources', value: Object.entries(resources).map(([k, v]) => `**${k.charAt(0).toUpperCase() + k.slice(1)}:** ${fmtAmt(v)}`).join('\n'), inline: false },
          { name: 'Locutus Command', value: `\`\`\`${locutusCmd}\`\`\``, inline: false },
        );
        return void interaction.followUp({ embeds: [embed] });
      }

      if (commandName === 'suggestion') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ You need the **Member** role to use this command.').setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        }
        const content = interaction.options.getString('content', true).trim();
        if (!content) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Suggestion content cannot be empty.').setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        if (content.length > 1800) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Suggestion is too long. Please keep it under 1800 characters.').setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        const SUGGESTION_DM_USERNAMES = ['glaernisch', 'glaernischtheonly'];
        const dmMessage = `📬 **New /suggestion submission**\nFrom: ${interaction.user} (ID: ${interaction.user.id})\nGuild: ${interaction.guild?.name ?? 'DM/Unknown'}\nContent:\n${content}`;
        const sentTo: string[] = [];
        const missing: string[] = [];
        const wanted = new Set(SUGGESTION_DM_USERNAMES.map((u) => u.toLowerCase()));
        const found = new Map<string, GuildMember>();
        for (const guild of client.guilds.cache.values()) {
          for (const member of guild.members.cache.values()) {
            for (const handle of [member.user.username.toLowerCase(), member.displayName.toLowerCase(), (member.user.globalName ?? '').toLowerCase()]) {
              if (handle && wanted.has(handle) && !found.has(handle)) found.set(handle, member);
            }
          }
        }
        for (const username of SUGGESTION_DM_USERNAMES) {
          const userObj = found.get(username.toLowerCase());
          if (!userObj) { missing.push(username); continue; }
          try { await userObj.send(dmMessage); sentTo.push(username); } catch { missing.push(username); }
        }
        const statusLines: string[] = [];
        statusLines.push(sentTo.length
          ? `✅ DMs sent to: ${sentTo.map((u) => `\`${u}\``).join(', ')}.`
          : '⚠️ No suggestion DMs were delivered.');
        if (missing.length) statusLines.push(`ℹ️ Could not DM: ${missing.map((u) => `\`${u}\``).join(', ')}.`);
        console.log(`Suggestion from ${interaction.user.id}: ${content}`);
        return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(statusLines.join('\n')).setColor(0x2ECC71)], flags: MessageFlags.Ephemeral });
      }


      if (commandName === 'roles_setup') {
        if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const current = await db.getGovRoles(BigInt(interaction.guildId));
        const fields: Array<[string, string]> = [
          ['leader','leader'], ['two_ic','2ic'], ['econ','econ'], ['econ_gov','econ_gov'],
          ['milcom','milcom'], ['milcom_gov','milcom_gov'], ['ia','ia'], ['ia_asst','ia_asst'],
          ['gov','gov'], ['member','member'],
        ];
        for (const [optName, dbKey] of fields) {
          const role = interaction.options.getRole(optName);
          if (role) (current as Record<string, number | null>)[dbKey] = Number(role.id);
        }
        await db.setGovRoles(BigInt(interaction.guildId), current as any);
        const GOV_DEPT_LABELS: Record<string, string> = {
          leader: 'Leader', '2ic': 'Second in Command', econ: 'Economics', econ_gov: 'Economics Gov',
          milcom: 'Military Command', milcom_gov: 'Military Command Gov', ia: 'Internal Affairs',
          ia_asst: 'Internal Affairs Assistant', gov: 'Basic Gov', member: 'Member',
        };
        const lines: string[] = ['✅ Government role configuration updated:'];
        for (const [key, label] of Object.entries(GOV_DEPT_LABELS)) {
          const rid = (current as Record<string, number | null>)[key];
          if (rid && interaction.guild) {
            const role = interaction.guild.roles.cache.get(String(rid));
            lines.push(`**${label}:** ${role ? role.toString() : `<@&${rid}>`}`);
          } else {
            lines.push(`**${label}:** *(not set)*`);
          }
        }
        return void interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'gov') {
        if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const cfg = await db.getGovRoles(BigInt(interaction.guildId));
        const GOV_DEPT_LABELS: Record<string, string> = {
          leader: 'Leader', '2ic': 'Second in Command', econ: 'Economics', econ_gov: 'Economics Gov',
          milcom: 'Military Command', milcom_gov: 'Military Command Gov', ia: 'Internal Affairs',
          ia_asst: 'Internal Affairs Assistant',
        };
        const GOV_DEPT_EMOJI: Record<string, string> = {
          leader: '👑', '2ic': '🥈', econ: '💰', econ_gov: '📊',
          milcom: '⚔️', milcom_gov: '🛡️', ia: '🤝', ia_asst: '📋',
        };
        const embed = new EmbedBuilder().setTitle('Government').setColor(0x5865F2);
        const guildRoles = new Map(interaction.guild.roles.cache.map((r) => [r.id, r]));
        let total = 0;
        for (const [key, label] of Object.entries(GOV_DEPT_LABELS)) {
          const rid = (cfg as Record<string, number | null>)[key];
          if (!rid) continue;
          const role = guildRoles.get(String(rid));
          if (!role) {
            embed.addFields({ name: `${GOV_DEPT_EMOJI[key] ?? ''} ${label}`, value: '*(role not found)*', inline: false });
            continue;
          }
          const membersWithRole = role.members.filter((m) => !m.user.bot);
          total += membersWithRole.size;
          const value = membersWithRole.size
            ? [...membersWithRole.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)).map((m) => `<@${m.id}>`).join(' ')
            : '*(no members)*';
          embed.addFields({ name: `${GOV_DEPT_EMOJI[key] ?? ''} ${label} (${membersWithRole.size})`, value, inline: false });
        }
        embed.setFooter({ text: `${total} government member(s) total` });
        return void interaction.reply({ embeds: [embed] });
      }

      if (commandName === 'roles_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const roles = await db.getGovRoles(BigInt(interaction.guildId));
        const text = Object.entries(roles).map(([k,v]) => `• ${k}: ${v ? `<@&${v}>` : 'not set'}`).join('\n');
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('Configured gov roles').setDescription(text)] , flags: MessageFlags.Ephemeral});
      }
      if (commandName === 'setup_grant_channel') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['econ','econ_gov','ia','ia_asst'])) return void interaction.reply({ content: 'You need Economics or Internal Affairs gov access to use this command.', flags: MessageFlags.Ephemeral });
        const ch = interaction.options.getChannel('channel', true);
        await db.setGrantChannel(BigInt(interaction.guildId), Number(ch.id));
        return void interaction.reply({ content: `Grant channel set to <#${ch.id}>.` });
      }
      if (commandName === 'request_grant') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const note = interaction.options.getString('note', true);
        const resources: Record<string, number> = {
          money: interaction.options.getNumber('money') ?? 0,
          food: interaction.options.getNumber('food') ?? 0,
          coal: interaction.options.getNumber('coal') ?? 0,
          oil: interaction.options.getNumber('oil') ?? 0,
          uranium: interaction.options.getNumber('uranium') ?? 0,
          iron: interaction.options.getNumber('iron') ?? 0,
          bauxite: interaction.options.getNumber('bauxite') ?? 0,
          lead: interaction.options.getNumber('lead') ?? 0,
          gasoline: interaction.options.getNumber('gasoline') ?? 0,
          munitions: interaction.options.getNumber('munitions') ?? 0,
          steel: interaction.options.getNumber('steel') ?? 0,
          aluminum: interaction.options.getNumber('aluminum') ?? 0,
        };
        const grantChannelId = await db.getGrantChannel(BigInt(interaction.guildId));
        if (!grantChannelId) return void interaction.reply({ content: 'Grant channel is not configured.', flags: MessageFlags.Ephemeral });
        const guild = interaction.guild;
        const ch = guild?.channels.cache.get(String(grantChannelId)) as TextChannel | undefined;
        if (!ch) return void interaction.reply({ content: 'Configured grant channel not found.', flags: MessageFlags.Ephemeral });
        const govRoles = await db.getGovRoles(BigInt(interaction.guildId));
        const pingRole = govRoles.econ_gov ?? govRoles.econ;
        const bankNote = note.startsWith('#') ? note : `#${note.replace(/\s+/g,'_')}`;
        const transferItems = Object.entries(resources)
          .filter(([,v]) => v && v > 0)
          .map(([k,v]) => `${k}:${Math.trunc(v)}`)
          .join(', ');
        const reg = await db.getByDiscordId(BigInt(interaction.user.id));
        const receiver = reg ? String(reg.nation_id) : `<@${interaction.user.id}>`;
        const transferCmd = `/transfer resources receiver:${receiver} transfer:{ ${transferItems || 'money:0'} } bank_note:${bankNote}`;
        const resourceLines = Object.entries(resources).filter(([,v]) => v && v > 0).map(([k,v]) => `${k}: ${Math.trunc(v).toLocaleString()}`).join('\n') || 'No resources specified';
        await ch.send({
          content: pingRole ? `<@&${pingRole}>` : undefined,
          embeds: [new EmbedBuilder().setTitle('Grant request').setDescription(`From: <@${interaction.user.id}>
Reason: ${note}

${resourceLines}

\`\`\`${transferCmd}\`\`\``)],
        });
        return void interaction.reply({ content: `Grant request submitted in <#${grantChannelId}>.`, flags: MessageFlags.Ephemeral });
      }

      if (commandName === 'admin_alliance_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const allianceId = interaction.options.getInteger('alliance_id', true);
        await db.setAllianceId(BigInt(interaction.guildId), allianceId);
        return void interaction.reply({ content: `Primary alliance set to ${allianceId}.` });
      }
      if (commandName === 'admin_alliance_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        return void interaction.reply({ content: allianceId ? `Primary alliance: ${allianceId}` : 'No primary alliance configured.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'admin_api_key_set') {
        if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const apiKey = interaction.options.getString('api_key', true).trim();
        if (apiKey.length === 0) return void interaction.reply({ content: 'API key cannot be empty.', flags: MessageFlags.Ephemeral });
        await db.setPnwApiKey(apiKey);
        pnw.apiKey = apiKey;
        return void interaction.reply({ content: 'PnW API key updated successfully.', flags: MessageFlags.Ephemeral });
      }



      if (commandName === 'alliance_lots_of_info' || commandName === 'test_alliance_lots_of_info') {
        await interaction.deferReply();
        const query = interaction.options.getString('query', true).trim();
        const useTestApi = commandName === 'test_alliance_lots_of_info';
        const apiClient = useTestApi ? new PnWClient(PNW_TEST_API_KEY, { restUrl: PNW_TEST_REST_URL }) : pnw;
        const baseUrl = useTestApi ? PNW_TEST_BASE_URL : PNW_BASE_URL;
        const MENTION_RE = /^<@!?(\d+)>$/;
        const mentionMatch = MENTION_RE.exec(query);
        let alliance: AllianceInfo | null;
        let lotsMembers: Nation[];
        try {
          if (mentionMatch) {
            const targetId = query.replace(/^<@!?|>$/g, '');
            const row = await db.getByDiscordId(BigInt(targetId));
            let nation: Nation | null = null;
            if (row) {
              try {
                nation = await apiClient.getNation(Number(row.nation_id));
              } catch (err) {
                nation = null;
                logWarn(`alliance_lots_of_info failed to load registered nation ${row.nation_id}`, err);
              }
            }
            if (!nation) nation = await resolveMentionedNationViaApi(interaction, apiClient, targetId);
            if (!nation || !nation.allianceId) {
              await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ Could not resolve <@${targetId}> to an alliance.`).setColor(0x3498DB)] });
              return;
            }
            alliance = await apiClient.getAllianceById(nation.allianceId);
          } else {
            alliance = /^\d+$/.test(query)
              ? await apiClient.getAllianceById(parseInt(query, 10))
              : await apiClient.getAllianceByName(query);
          }
          if (!alliance) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No alliance found for \`${query}\`.`).setColor(0x3498DB)] });
            return;
          }
          lotsMembers = await apiClient.getAllianceMembers([alliance.allianceId]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
          return;
        }

        // Build pages
        const pages: EmbedBuilder[] = [];

        // Page 1: alliance info + militarization
        const infoEmbed = allianceEmbed(alliance, baseUrl);
        const totalCities = lotsMembers.reduce((s, n) => s + n.numCities, 0);
        if (totalCities > 0) {
          const avgMil = [
            `🪖 Soldiers: ${(lotsMembers.reduce((s,n)=>s+n.soldiers,0)/(totalCities*MAX_SOLDIERS_PER_CITY)*100).toFixed(1)}%`,
            `⚔️ Tanks: ${(lotsMembers.reduce((s,n)=>s+n.tanks,0)/(totalCities*MAX_TANKS_PER_CITY)*100).toFixed(1)}%`,
            `✈️ Aircraft: ${(lotsMembers.reduce((s,n)=>s+n.aircraft,0)/(totalCities*MAX_AIRCRAFT_PER_CITY)*100).toFixed(1)}%`,
            `🚢 Ships: ${(lotsMembers.reduce((s,n)=>s+n.ships,0)/(totalCities*MAX_SHIPS_PER_CITY)*100).toFixed(1)}%`,
          ].join('\n');
          infoEmbed.addFields({ name: 'Avg Militarization', value: avgMil, inline: false });
        }
        infoEmbed.setFooter({ text: 'Page 1 · Alliance info' });
        pages.push(infoEmbed);

        // Page 2: city tier graph
        const cityCounts = new Map<number, number>();
        for (const m of lotsMembers) cityCounts.set(m.numCities, (cityCounts.get(m.numCities) ?? 0) + 1);
        const cityRows = [...cityCounts.entries()].sort((a,b)=>a[0]-b[0]);
        const cityRowsWithGaps = buildTierCountsWithEmptyInterior(cityRows);
        const firstCityTier = cityRowsWithGaps[0]?.[0];
        const lastCityTier = cityRowsWithGaps[cityRowsWithGaps.length - 1]?.[0];
        const cityLegend = cityRowsWithGaps.length
          ? cityRowsWithGaps.map(([city, count]) => `\`${String(city).padStart(2)}c\` ${count}`).join(' · ')
          : '';
        const cityEmbed = new EmbedBuilder()
          .setTitle(`${alliance.name} — City Tier Graph`)
          .setURL(allianceUrl(alliance.allianceId, baseUrl))
          .setDescription(firstCityTier != null && lastCityTier != null
            ? `QuickChart bar graph with full tier range (${firstCityTier}-${lastCityTier}).\n${cityLegend}`
            : '*(no member data)*')
          .setColor(0x5865F2)
          .setFooter({ text: 'Page 2 · City tier graph' });
        if (cityRows.length) cityEmbed.setImage(buildCityTierQuickChartUrl(cityRows));
        pages.push(cityEmbed);

        // Page 3: score history table
        let historyPoints: AllianceScoreHistoryPoint[] = [];
        try {
          historyPoints = await fetchAllianceScoreHistory(alliance.allianceId);
        } catch (err) {
          logWarn(`alliance score history fetch failed for alliance ${alliance.allianceId}`, err);
        }
        const historyChartPoints = buildAllianceScoreHistoryChartPoints(historyPoints);
        const scoreDevEmbed = new EmbedBuilder()
          .setTitle(`${alliance.name} — Score History`)
          .setURL(allianceUrl(alliance.allianceId, baseUrl))
          .setColor(0x0F766E)
          .setFooter({ text: 'Page 3 · Alliance score history' });
        if (!historyChartPoints.length) scoreDevEmbed.setDescription('*(no score history data)*');
        if (historyChartPoints.length) scoreDevEmbed.setImage(buildAllianceScoreHistoryQuickChartUrl(historyPoints));
        pages.push(scoreDevEmbed);

        // Pages 4+: extended member list (10 per page)
        const extSorted = [...lotsMembers].sort((a,b)=>b.score-a.score);
        const extPageSize = 10;
        const extTotalPages = Math.max(1, Math.ceil(extSorted.length/extPageSize));
        for (let p = 0; p < extTotalPages; p++) {
          const chunk = extSorted.slice(p*extPageSize, (p+1)*extPageSize);
          const lines = chunk.map((n, idx) => {
            const beige = n.beigeTurns > 0 ? '🟨' : '✅';
            const ageStr = `${Math.max(0, Math.round(n.allianceSeniority ?? 0))}d`;
            return `\`${String(p*extPageSize+idx+1).padStart(3)}.\` [${n.nationName}](${nationUrl(n.nationId, baseUrl)}) — ⭐ ${Math.round(n.score).toLocaleString()} | 🏙️ ${n.numCities} | ${beige} | ⏳ ${ageStr}`;
          });
          const extEmbed = new EmbedBuilder()
            .setTitle(`${alliance.name} — Members (Extended)`)
            .setURL(allianceUrl(alliance.allianceId, baseUrl))
            .setDescription(lines.join('\n') || '*(no members)*')
            .setColor(0xFFD700)
            .setFooter({ text: `Page ${p+4} · Members page ${p+1}/${extTotalPages} · ${extSorted.length} total` });
          pages.push(extEmbed);
        }

        // Paginated view
        let curPage = 0;
        const navRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('lots_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(curPage <= 0),
          new ButtonBuilder().setCustomId('lots_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(curPage >= pages.length - 1),
        );
        const msg = await interaction.editReply({ embeds: [pages[0]!], components: pages.length > 1 ? [navRow()] : [] });
        if (pages.length <= 1) return;
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
        collector.on('collect', async (btn) => {
          if (btn.customId === 'lots_prev' && curPage > 0) curPage -= 1;
          else if (btn.customId === 'lots_next' && curPage < pages.length - 1) curPage += 1;
          await btn.update({ embeds: [pages[curPage]!], components: [navRow()] });
        });
        collector.on('end', async () => {
          try { await interaction.editReply({ components: [] }); } catch { /**/ }
        });
        return;
      }
      if (commandName === 'fun_quote') {
        const quote = FUN_QUOTES[Math.floor(Math.random() * FUN_QUOTES.length)] ?? 'No quote found.';
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('Quote').setDescription(quote)] });
      }

      if (commandName === 'color') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: '❌ You need the **Member** role to use this command.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply();
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        if (!allianceId) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ No primary alliance configured. An admin can use `/admin_alliance_set` to set one.').setColor(0x3498DB)] });
        let alliance: import('./pnw_api').AllianceInfo | null;
        let members: Nation[];
        try {
          [alliance, members] = await Promise.all([
            pnw.getAllianceById(allianceId),
            pnw.getAllianceMembers([allianceId]),
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
        }
        if (!alliance) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Alliance **${allianceId}** not found on Politics and War.`).setColor(0xE74C3C)] });
        if (!members.length) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ No active members found for the configured alliance.').setColor(0x3498DB)] });
        const expected = (alliance.color || '').trim().toLowerCase();
        const wrong = members.filter((m) => {
          const col = (m.color || '').trim().toLowerCase();
          return col !== 'beige' && col !== expected;
        });
        if (!wrong.length) {
          const embed = new EmbedBuilder()
            .setTitle('✅ Color Check')
            .setDescription(`All active members of **${alliance.name}** are on the correct color (**${expected.charAt(0).toUpperCase() + expected.slice(1)}**).`)
            .setColor(0x2ECC71)
            .setFooter({ text: `${members.length} members checked` });
          return void interaction.followUp({ embeds: [embed] });
        }
        const lines = wrong.map((m) =>
          `[${m.nationName}](${nationUrl(m.nationId)}) — 🎨 **${(m.color || 'none').charAt(0).toUpperCase() + (m.color || 'none').slice(1)}** (expected **${expected.charAt(0).toUpperCase() + expected.slice(1)}**)`
        );
        const embed = new EmbedBuilder()
          .setTitle(`⚠️ Color Check — ${alliance.name}`)
          .setDescription(lines.join('\n'))
          .setColor(0xFF9500)
          .setFooter({ text: `${wrong.length} member(s) on wrong color · ${members.length} total checked · expected: ${expected.charAt(0).toUpperCase() + expected.slice(1)}` });
        return void interaction.followUp({ embeds: [embed] });
      }
      if (commandName === 'damage_leaderboard') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        if (!allianceId) return void interaction.reply({ content: 'Primary alliance is not configured.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply();
        const after = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        let damageData: Map<number, Record<string, unknown>>;
        let prices: import('./pnw_api').TradePrice;
        let allMembers: Nation[];
        try {
          [damageData, prices, allMembers] = await Promise.all([
            pnw.getAllianceDamage(allianceId, after),
            pnw.getTradePrices().catch(() => ({ gasoline: 2000, munitions: 1800, aluminum: 3200, steel: 4000 })),
            pnw.getAllianceMembers([allianceId]).catch(() => [] as Nation[]),
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
        }
        // Include all current members (even zero-damage ones)
        for (const member of allMembers) {
          if (!damageData.has(member.nationId)) {
            damageData.set(member.nationId, {
              nation_name: member.nationName, num_cities: member.numCities,
              infra_value: 0, money_looted: 0, gas_looted: 0, mun_looted: 0,
              alum_looted: 0, steel_looted: 0, def_gas_used: 0, def_mun_used: 0,
              def_alum_used: 0, def_steel_used: 0, def_soldiers_killed: 0,
              def_tanks_killed: 0, def_aircraft_killed: 0, def_ships_sunk: 0,
            });
          }
        }
        if (!damageData.size) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ No members found for the configured alliance.').setColor(0x3498DB)] });

        const fmtK = (v: number) => {
          if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
          if (Math.abs(v) >= 10_000) return `$${(v / 1_000).toFixed(0)}K`;
          return `$${v.toFixed(0)}`;
        };
        const calcMetrics = (e: Record<string, unknown>) => {
          const n = (x: unknown) => Number(x ?? 0);
          const infra = n(e['infra_value']);
          const resDmg =
            (n(e['def_gas_used']) + n(e['gas_looted'])) * prices.gasoline +
            (n(e['def_mun_used']) + n(e['mun_looted'])) * prices.munitions +
            (n(e['def_alum_used']) + n(e['alum_looted'])) * prices.aluminum +
            (n(e['def_steel_used']) + n(e['steel_looted'])) * prices.steel +
            n(e['def_soldiers_killed']) * 5.0 +
            n(e['def_tanks_killed']) * (60.0 + 0.5 * prices.steel) +
            n(e['def_aircraft_killed']) * (4_000.0 + 10.0 * prices.aluminum) +
            n(e['def_ships_sunk']) * (50_000.0 + 30.0 * prices.steel);
          const loot = n(e['money_looted']) +
            n(e['gas_looted']) * prices.gasoline + n(e['mun_looted']) * prices.munitions +
            n(e['alum_looted']) * prices.aluminum + n(e['steel_looted']) * prices.steel;
          const total = infra + resDmg;
          const cities = Math.max(1, n(e['num_cities']));
          return { infra, resDmg, loot, total, dmgCity: total / cities };
        };

        const SORT_MODES = ['total', 'loot', 'dmg_city', 'infra', 'res_dmg'] as const;
        type SortMode = typeof SORT_MODES[number];
        const SORT_LABELS: Record<SortMode, string> = { total: '📊 Total', loot: '💰 Loot', dmg_city: '💥 /City', infra: '🏗️ Infra', res_dmg: '💥 Res Dmg' };
        const LB_PAGE_SIZE = 10;

        const allNations = Array.from(damageData.entries());
        let sortMode: SortMode = 'total';
        let lbPage = 0;

        const getSorted = () => [...allNations].sort((a, b) => {
          const ma = calcMetrics(a[1]);
          const mb = calcMetrics(b[1]);
          return mb[sortMode === 'dmg_city' ? 'dmgCity' : sortMode === 'res_dmg' ? 'resDmg' : sortMode as 'total'|'loot'|'infra'] -
                 ma[sortMode === 'dmg_city' ? 'dmgCity' : sortMode === 'res_dmg' ? 'resDmg' : sortMode as 'total'|'loot'|'infra'];
        });

        const buildLbEmbed = (sorted: [number, Record<string, unknown>][], pg: number, sm: SortMode) => {
          const total = sorted.length;
          const totalPages = Math.max(1, Math.ceil(total / LB_PAGE_SIZE));
          const safePg = Math.max(0, Math.min(pg, totalPages - 1));
          const chunk = sorted.slice(safePg * LB_PAGE_SIZE, (safePg + 1) * LB_PAGE_SIZE);
          const lines = chunk.map(([nationId, e], idx) => {
            const rank = safePg * LB_PAGE_SIZE + idx + 1;
            const m = calcMetrics(e);
            const cities = Math.max(1, Number(e['num_cities'] ?? 1));
            const name = String(e['nation_name'] ?? nationId);
            const bold = (s: string, active: boolean) => active ? `**${s}**` : s;
            const stats = [
              bold(`📊 ${fmtK(m.total)} (${fmtK(m.total / cities)}/c)`, sm === 'total' || sm === 'dmg_city'),
              bold(`🏗️ ${fmtK(m.infra)}`, sm === 'infra'),
              bold(`💥 ${fmtK(m.resDmg)}`, sm === 'res_dmg'),
              bold(`💰 ${fmtK(m.loot)}`, sm === 'loot'),
            ].join('  ');
            return `**${rank}.** [${name}](${nationUrl(nationId)})  ·  ${cities}🏙️\n${stats}`;
          });
          const footerParts = [`Sorted: ${SORT_LABELS[sm]}`, `Page ${safePg + 1}/${totalPages}`, `${total} members`, `g:${Math.round(prices.gasoline)} m:${Math.round(prices.munitions)} a:${Math.round(prices.aluminum)} s:${Math.round(prices.steel)} ppu`];
          return new EmbedBuilder()
            .setTitle(`⚔️ War Leaderboard — Past 7 Days`)
            .setDescription(lines.join('\n\n') || '*No data.*')
            .setColor(0xF1C40F)
            .setFooter({ text: footerParts.join('  ·  ') });
        };

        const buildLbRow = (sorted: [number, Record<string, unknown>][], pg: number, sm: SortMode) => {
          const totalPages = Math.max(1, Math.ceil(sorted.length / LB_PAGE_SIZE));
          const sortRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...SORT_MODES.map(mode =>
              new ButtonBuilder().setCustomId(`lb_sort_${mode}`).setLabel(SORT_LABELS[mode]).setStyle(mode === sm ? ButtonStyle.Primary : ButtonStyle.Secondary)
            )
          );
          const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('lb_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(pg === 0),
            new ButtonBuilder().setCustomId('lb_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(pg >= totalPages - 1),
          );
          return totalPages > 1 ? [sortRow, navRow] : [sortRow];
        };

        let sorted = getSorted();
        const lbMsg = await interaction.followUp({ embeds: [buildLbEmbed(sorted, lbPage, sortMode)], components: buildLbRow(sorted, lbPage, sortMode) });
        const lbCollector = lbMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
        lbCollector.on('collect', async (btn) => {
          if (btn.user.id !== interaction.user.id) { await btn.reply({ content: 'Only the command caller can use these buttons.', flags: MessageFlags.Ephemeral }); return; }
          if (btn.customId.startsWith('lb_sort_')) {
            sortMode = btn.customId.replace('lb_sort_', '') as SortMode;
            lbPage = 0;
            sorted = getSorted();
          } else if (btn.customId === 'lb_prev' && lbPage > 0) { lbPage -= 1; }
          else if (btn.customId === 'lb_next') { lbPage += 1; }
          await btn.update({ embeds: [buildLbEmbed(sorted, lbPage, sortMode)], components: buildLbRow(sorted, lbPage, sortMode) });
        });
        lbCollector.on('end', async () => { try { await interaction.editReply({ components: [] }); } catch { /**/ } });
        return;
      }


      if (commandName === 'welcome_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const message = interaction.options.getString('message', true);
        await db.setWelcomeConfig(BigInt(interaction.guildId), { message });
        return void interaction.reply({ content: 'Welcome message updated.' });
      }
      if (commandName === 'welcome_channel_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const ch = interaction.options.getChannel('channel', true);
        await db.setWelcomeConfig(BigInt(interaction.guildId), { channelId: Number(ch.id) });
        return void interaction.reply({ content: `Welcome channel set to <#${ch.id}>.` });
      }
      if (commandName === 'welcome_enable') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        await db.setWelcomeConfig(BigInt(interaction.guildId), { enabled: true });
        return void interaction.reply({ content: 'Welcome messages enabled.' });
      }
      if (commandName === 'welcome_disable') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        await db.setWelcomeConfig(BigInt(interaction.guildId), { enabled: false });
        return void interaction.reply({ content: 'Welcome messages disabled.' });
      }
      if (commandName === 'welcome_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const cfg = await db.getWelcomeConfig(BigInt(interaction.guildId));
        return void interaction.reply({
          embeds: [new EmbedBuilder().setTitle('Welcome config').setDescription(`Enabled: **${cfg.enabled ? 'yes' : 'no'}**
Channel: ${cfg.channel_id ? `<#${cfg.channel_id}>` : 'not set'}
Message: ${cfg.message}`)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (commandName === 'setup_recruiter_add') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['milcom','milcom_gov','ia','ia_asst'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const ch = interaction.options.getChannel('channel', true);
        await db.addRecruiterSubscription(BigInt(interaction.guildId), BigInt(ch.id));
        return void interaction.reply({ content: `Recruiter subscription added for <#${ch.id}>.` });
      }
      if (commandName === 'setup_recruiter_remove') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['milcom','milcom_gov','ia','ia_asst'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const ch = interaction.options.getChannel('channel', true);
        const removed = await db.removeRecruiterSubscription(BigInt(interaction.guildId), BigInt(ch.id));
        return void interaction.reply({ content: removed ? `Recruiter subscription removed from <#${ch.id}>.` : `No recruiter subscription found for <#${ch.id}>.` , flags: MessageFlags.Ephemeral});
      }
      if (commandName === 'setup_recruiter_list') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        const subs = await db.getRecruiterSubscriptions(BigInt(interaction.guildId));
        const text = subs.map((r) => `• <#${r.channel_id}>`).join('\n');
        return void interaction.reply({ content: text || 'No recruiter subscriptions configured.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'infra') {
        const from = interaction.options.getNumber('from', true);
        const to = interaction.options.getNumber('to', true);
        const cities = interaction.options.getInteger('cities') ?? 1;
        const urbanPlanning = interaction.options.getBoolean('urban_planning') ?? false;
        const advancedUrbanPlanning = interaction.options.getBoolean('advanced_urban_planning') ?? false;
        if (to <= from) return void interaction.reply({ content: 'Target infra must be greater than current infra.', flags: MessageFlags.Ephemeral });
        if (from < 0 || to > 100_000) return void interaction.reply({ content: 'Infrastructure values must be between 0 and 100,000.', flags: MessageFlags.Ephemeral });
        if (cities < 1) return void interaction.reply({ content: 'Number of cities must be at least 1.', flags: MessageFlags.Ephemeral });
        const baseCostPerCity = calculateInfraCost(from, to);
        let discount = 0.0;
        const discountParts: string[] = [];
        if (urbanPlanning) { discount += 0.05; discountParts.push('Urban Planning (−5%)'); }
        if (advancedUrbanPlanning) { discount += 0.10; discountParts.push('Advanced Urban Planning (−10%)'); }
        const discountedCostPerCity = baseCostPerCity * (1.0 - discount);
        const total = discountedCostPerCity * cities;
        const embed = new EmbedBuilder().setTitle('🏗️ Infrastructure Cost Calculator').setColor(0x3498DB);
        embed.addFields(
          { name: 'From', value: from.toFixed(2), inline: true },
          { name: 'To', value: to.toFixed(2), inline: true },
          { name: 'Amount', value: `+${(to - from).toFixed(2)}`, inline: true },
          { name: 'Cost per City', value: `$${Math.round(discountedCostPerCity).toLocaleString()}`, inline: true },
          { name: 'Cities', value: String(cities), inline: true },
          { name: 'Total Cost', value: `**$${Math.round(total).toLocaleString()}**`, inline: true },
          { name: discountParts.length ? `Discounts (−${Math.round(discount * 100)}% total)` : 'Discounts', value: discountParts.length ? discountParts.join('\n') : 'None', inline: false },
        );
        if (discount > 0) {
          embed.setFooter({ text: `Base cost per city: $${Math.round(baseCostPerCity).toLocaleString()}  ·  Savings: $${Math.round((baseCostPerCity - discountedCostPerCity) * cities).toLocaleString()}` });
        }
        return void interaction.reply({ embeds: [embed] });
      }
      if (commandName === 'city_cost') {
        await interaction.deferReply();
        const current = interaction.options.getInteger('current', true);
        const rawTarget = interaction.options.getInteger('target');
        const manifestDestiny = interaction.options.getBoolean('manifest_destiny') ?? false;
        const governmentSupportAgency = interaction.options.getBoolean('government_support_agency') ?? false;

        if (!await hasMemberAccess(interaction, db)) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ You need the **Member** role to use this command.').setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        }
        if (current < 0) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Current city count must be 0 or greater.').setColor(0xE74C3C)] });
        }
        const target = rawTarget ?? current + 1;
        if (target <= current) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Target city count must be greater than current.').setColor(0xE74C3C)] });
        }
        if (target - current > 50) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Range too large — maximum 50 cities at a time.').setColor(0xE74C3C)] });
        }
        let gameInfo: GameInfo;
        try {
          gameInfo = await pnw.getGameInfo();
        } catch {
          gameInfo = GameInfo.create();
        }
        const cityAvg = gameInfo.cityAverage;
        let totalCost = 0;
        const rows: string[] = [];
        for (let c = current; c < target; c += 1) {
          const cost = calculateCityCost(c, { cityAverage: cityAvg, manifestDestiny, governmentSupportAgency });
          totalCost += cost;
          rows.push(`City **${c}→${c + 1}**: $${Math.round(cost).toLocaleString()}`);
        }
        const embed = new EmbedBuilder().setTitle('🏙️ City Cost Calculator').setColor(0x2ECC71);
        if (rows.length === 1) {
          embed.setDescription(rows[0]!);
        } else {
          embed.setDescription(rows.length <= 20 ? rows.join('\n') : `*Buying ${rows.length} cities (${current}→${target})*`);
          embed.addFields({ name: 'Total Cost', value: `**$${Math.round(totalCost).toLocaleString()}**`, inline: false });
        }
        const discountNotes: string[] = [];
        if (manifestDestiny) {
          const pct = governmentSupportAgency ? 7.5 : 5.0;
          discountNotes.push(`Manifest Destiny${governmentSupportAgency ? ' + GSA' : ''} (−${pct.toFixed(1)}%)`);
        }
        embed.addFields({ name: 'Discounts', value: discountNotes.length ? discountNotes.join('\n') : 'None', inline: true });
        embed.setFooter({ text: `City average used: ${cityAvg.toFixed(2)}  ·  Formula: Locutus dynamic` });
        return void interaction.followUp({ embeds: [embed] });
      }
      if (commandName === 'revenue') {
        await interaction.deferReply();
        const rawQuery = (interaction.options.getString('query') ?? '').trim();
        const MENTION_RE = /^<@!?(\d+)>$/;
        let nationId: number | null = null;

        if (!rawQuery) {
          const row = await db.getByDiscordId(BigInt(interaction.user.id));
          if (!row) {
            return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ You are not registered. Use `/register <nation_id>` or provide a query to `/revenue`.').setColor(0x3498DB)] });
          }
          nationId = row.nation_id;
        } else {
          const mentionMatch = MENTION_RE.exec(rawQuery);
          if (mentionMatch) {
            const targetId = mentionMatch[1]!;
            const row = await db.getByDiscordId(BigInt(targetId));
            if (row) {
              nationId = row.nation_id;
            } else {
              const nation = await resolveMentionedNationViaApi(interaction, pnw, targetId);
              if (nation) {
                nationId = nation.nationId;
              } else {
                return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`ℹ️ <@${targetId}> has no registered nation.`).setColor(0x3498DB)] });
              }
            }
          } else if (/^\d+$/.test(rawQuery)) {
            const parsed = parseInt(rawQuery, 10);
            if (parsed <= 0) {
              return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('❌ Invalid nation ID — must be a positive integer.').setColor(0xE74C3C)] });
            }
            nationId = parsed;
          } else {
            try {
              const n = await pnw.getNationByName(rawQuery);
              if (n) nationId = n.nationId;
            } catch { /* ignore */ }
            if (nationId === null) {
              const row = await db.getByDiscordUsername(rawQuery);
              if (row) nationId = row.nation_id;
            }
            if (nationId === null) {
              return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No nation found for \`${rawQuery}\`.`).setColor(0x3498DB)] });
            }
          }
        }

        if (nationId === null) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ Could not resolve a nation from the provided query.').setColor(0x3498DB)] });
        }
        let loadedRevenue: [Nation, City[]] | null;
        try {
          loadedRevenue = await pnw.getNationWithCities(nationId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
        }
        if (!loadedRevenue) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No nation with ID \`${nationId}\` was found.`).setColor(0x3498DB)] });
        }
        const [revNation, revCities] = loadedRevenue;
        let revGameInfo: GameInfo;
        try {
          revGameInfo = await pnw.getGameInfo();
        } catch {
          revGameInfo = GameInfo.create();
        }
        const rev = computeNationRevenue(revNation, revCities, revGameInfo);

        const revEmbed = new EmbedBuilder()
          .setTitle(`💰 Revenue — ${revNation.nationName}`)
          .setURL(nationUrl(revNation.nationId))
          .setColor(0xF1C40F);
        revEmbed.addFields(
          { name: '🏙️ Cities', value: String(revNation.numCities), inline: true },
          { name: '🛒 Avg Commerce', value: `${rev.avgCommerce.toFixed(1)}%`, inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          { name: '💵 Money/day', value: `$${Math.round(rev.money).toLocaleString()}`, inline: true },
          { name: '🌾 Food/day (net)', value: `${rev.food >= 0 ? '+' : ''}${rev.food.toFixed(2)}`, inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
        );
        const sign = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
        const rawLines = [
          `⛏️ **Coal**: ${sign(rev.coal)}/day`,
          `🛢️ **Oil**: ${sign(rev.oil)}/day`,
          `☢️ **Uranium**: ${sign(rev.uranium)}/day`,
          `🔩 **Iron**: ${sign(rev.iron)}/day`,
          `🪨 **Bauxite**: ${sign(rev.bauxite)}/day`,
          `🔦 **Lead**: ${sign(rev.lead)}/day`,
        ];
        const mfgLines = [
          `⛽ **Gasoline**: ${sign(rev.gasoline)}/day`,
          `💣 **Munitions**: ${sign(rev.munitions)}/day`,
          `🔧 **Steel**: ${sign(rev.steel)}/day`,
          `🪟 **Aluminum**: ${sign(rev.aluminum)}/day`,
        ];
        revEmbed.addFields(
          { name: 'Raw Resources', value: rawLines.join('\n') || '*none*', inline: true },
          { name: 'Manufactured', value: mfgLines.join('\n') || '*none*', inline: true },
        );
        revEmbed.setFooter({ text: `Food: ${rev.foodProduction.toFixed(2)} prod − ${rev.foodConsumption.toFixed(2)} use  ·  Season month: ${revGameInfo.gameMonth}  ·  Money net of improvement upkeep, before military upkeep & tax` });
        return void interaction.followUp({ embeds: [revEmbed] });
      }
      if (commandName === 'war_range_targets') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') ?? interaction.user;
        let me: Nation | null = null;
        const reg = await db.getByDiscordId(BigInt(targetUser.id));
        if (reg) {
          try { me = await pnw.getNation(reg.nation_id); } catch { /**/ }
        }
        if (!me) {
          try { me = await pnw.getNationByDiscordTag(targetUser.username); } catch { /**/ }
        }
        if (!me) {
          const mention = targetUser.id !== interaction.user.id ? targetUser.toString() : 'You';
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`ℹ️ ${mention} ${targetUser.id !== interaction.user.id ? 'is' : 'are'} not registered. Use \`/register <nation_id>\` to link your Discord account.`).setColor(0x3498DB)] });
        }
        const allianceIds = await db.getSlotsAlliances(BigInt(interaction.guildId));
        if (!allianceIds.length) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ No alliances configured. An admin can use `/config_slots_set` to set them up.').setColor(0x3498DB)] });
        let members: Nation[];
        let warCountMap: Map<number, number>;
        try {
          [members, warCountMap] = await Promise.all([
            pnw.getAllianceMembers(allianceIds),
            pnw.getActiveDefWarCountsByAlliance(allianceIds),
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
        }
        const minScore = me.score * WAR_RANGE_MIN_RATIO;
        const maxScore = me.score * WAR_RANGE_MAX_RATIO;
        const wrTargets: [Nation, number][] = members
          .filter(n => n.score >= minScore && n.score <= maxScore && (warCountMap.get(n.nationId) ?? 0) < MAX_DEFENSIVE_SLOTS)
          .map(n => [n, warCountMap.get(n.nationId) ?? 0]);
        wrTargets.sort((a, b) => b[0].numCities - a[0].numCities);
        if (!wrTargets.length) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No nations from the configured alliance(s) are in your war range (${minScore.toFixed(0)}–${maxScore.toFixed(0)} score) with open defensive slots.`).setColor(0x3498DB)] });
        const WR_PAGE_SIZE = 15;
        const multiAlliance = new Set(wrTargets.map(([n]) => n.allianceId)).size > 1;
        let wrPage = 0;
        const buildWrEmbed = (pg: number) => {
          const totalPages = Math.max(1, Math.ceil(wrTargets.length / WR_PAGE_SIZE));
          const safePg = Math.max(0, Math.min(pg, totalPages - 1));
          const chunk = wrTargets.slice(safePg * WR_PAGE_SIZE, (safePg + 1) * WR_PAGE_SIZE);
          const lines = chunk.map(([t, defWars], idx) => {
            const rank = safePg * WR_PAGE_SIZE + idx + 1;
            const beige = t.beigeTurns > 0 ? ' 🔵' : '';
            const aaTag = multiAlliance && t.allianceName ? ` [${t.allianceName}]` : '';
            const openSlots = MAX_DEFENSIVE_SLOTS - defWars;
            return `\`${String(rank).padStart(3, ' ')}.\` [${t.nationName}](${nationUrl(t.nationId)})${beige}${aaTag} — 🏙️ ${t.numCities} · 📊 ${t.score.toFixed(0)} | 🛡️ ${openSlots}/${MAX_DEFENSIVE_SLOTS} slots`;
          });
          const footer = [`${wrTargets.length} target(s) in range`, `Page ${safePg + 1}/${totalPages}`, 'open def slots only · 🔵 = beiged'].join('  ·  ');
          return new EmbedBuilder()
            .setTitle(`⚔️ War Range Targets for ${me!.nationName}`)
            .setDescription(lines.join('\n') || '*(no targets found)*')
            .setColor(0xFF9500)
            .addFields(
              { name: 'Your Score', value: me!.score.toFixed(2), inline: true },
              { name: 'Min Target', value: minScore.toFixed(2), inline: true },
              { name: 'Max Target', value: maxScore.toFixed(2), inline: true },
            )
            .setFooter({ text: footer });
        };
        const buildWrRow = (pg: number) => {
          const totalPages = Math.max(1, Math.ceil(wrTargets.length / WR_PAGE_SIZE));
          return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('wr_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(pg === 0),
            new ButtonBuilder().setCustomId('wr_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(pg >= totalPages - 1),
          );
        };
        const totalWrPages = Math.max(1, Math.ceil(wrTargets.length / WR_PAGE_SIZE));
        const wrMsg = await interaction.followUp({ embeds: [buildWrEmbed(wrPage)], components: totalWrPages > 1 ? [buildWrRow(wrPage)] : [] });
        if (totalWrPages <= 1) return;
        const wrCollector = wrMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300_000 });
        wrCollector.on('collect', async (btn) => {
          if (btn.user.id !== interaction.user.id) { await btn.reply({ content: 'Only the command caller can use these buttons.', flags: MessageFlags.Ephemeral }); return; }
          if (btn.customId === 'wr_prev' && wrPage > 0) wrPage -= 1;
          else if (btn.customId === 'wr_next' && wrPage < totalWrPages - 1) wrPage += 1;
          await btn.update({ embeds: [buildWrEmbed(wrPage)], components: [buildWrRow(wrPage)] });
        });
        wrCollector.on('end', async () => { try { await interaction.editReply({ components: [] }); } catch { /**/ } });
        return;
      }

      if (commandName === 'spy_target_find') {
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        const alliancesRaw = interaction.options.getString('alliances', true);
        const ignoreRange = interaction.options.getBoolean('ignore_score_range') ?? false;
        const names = alliancesRaw.split(',').map(s => s.trim()).filter(Boolean);
        if (!names.length) return void interaction.reply({ content: 'Please provide at least one alliance name or ID.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply();
        const allianceIds: number[] = [];
        const allianceNames: string[] = [];
        const notFound: string[] = [];
        for (const name of names) {
          let info: AllianceInfo | null = null;
          try { info = /^\d+$/.test(name) ? await pnw.getAllianceById(parseInt(name, 10)) : await pnw.getAllianceByName(name); } catch { /**/ }
          if (!info) { notFound.push(name); } else if (!allianceIds.includes(info.allianceId)) { allianceIds.push(info.allianceId); allianceNames.push(info.name); }
        }
        if (notFound.length) {
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Alliance${notFound.length > 1 ? 's' : ''} not found: ${notFound.map(n => `**${n}**`).join(', ')}`).setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        }
        let spyMembers: Nation[];
        try { spyMembers = await pnw.getAllianceMembers(allianceIds); } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
        }
        spyMembers = spyMembers.filter(m => !['APPLICANT', 'NOALLIANCE', ''].includes(m.alliancePosition));
        spyMembers.sort((a, b) => b.numCities - a.numCities);
        if (!spyMembers.length) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ No active members found in the given alliances.').setColor(0x3498DB)], flags: MessageFlags.Ephemeral });
        let spyRange: [number, number] | null = null;
        if (!ignoreRange) {
          const reg = await db.getByDiscordId(BigInt(interaction.user.id));
          if (reg) { try { const myN = await pnw.getNation(reg.nation_id); if (myN) spyRange = [myN.score * 0.4, myN.score * 2.5]; } catch { /**/ } }
        }
        const SPY_PAGE_SIZE = 15;
        const multiSpy = allianceIds.length > 1;
        const spyTitle = `🕵️ Spy Targets — ${allianceNames.join(', ')}`;
        let spyPage = 0;
        const buildSpyEmbed = (pg: number) => {
          const total = spyMembers.length;
          const totalPages = Math.max(1, Math.ceil(total / SPY_PAGE_SIZE));
          const safePg = Math.max(0, Math.min(pg, totalPages - 1));
          const chunk = spyMembers.slice(safePg * SPY_PAGE_SIZE, (safePg + 1) * SPY_PAGE_SIZE);
          const lines = chunk.map((n, idx) => {
            const rank = safePg * SPY_PAGE_SIZE + idx + 1;
            const beige = n.beigeTurns > 0 ? ' 🔵' : '';
            const aaTag = multiSpy && n.allianceName ? ` [${n.allianceName}]` : '';
            const spyStr = n.spies >= 0 ? ` | 🕵️ ${n.spies}` : ' | 🕵️ ?';
            let line = `\`${String(rank).padStart(3, ' ')}.\` [${n.nationName}](${nationUrl(n.nationId)})${beige}${aaTag} — 🏙️ ${n.numCities} | ⭐ ${n.score.toFixed(0)}${spyStr}`;
            if (spyRange && n.score >= spyRange[0] && n.score <= spyRange[1]) line += ' | 🎯 In range';
            return line;
          });
          const embed = new EmbedBuilder().setTitle(spyTitle).setDescription(lines.join('\n') || '*(no targets found)*').setColor(0x607D8B);
          if (spyRange) embed.addFields({ name: 'Your Spy Range', value: `🎯 ${spyRange[0].toFixed(0)} – ${spyRange[1].toFixed(0)} score`, inline: false });
          embed.setFooter({ text: `Page ${safePg + 1}/${totalPages} · ${total} nations · sorted by cities desc · 🔵 = beiged` });
          return embed;
        };
        const totalSpyPages = Math.max(1, Math.ceil(spyMembers.length / SPY_PAGE_SIZE));
        const buildSpyRow = (pg: number) => new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('spy_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(pg === 0),
          new ButtonBuilder().setCustomId('spy_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(pg >= totalSpyPages - 1),
        );
        const spyMsg = await interaction.followUp({ embeds: [buildSpyEmbed(spyPage)], components: totalSpyPages > 1 ? [buildSpyRow(spyPage)] : [] });
        if (totalSpyPages <= 1) return;
        const spyCollector = spyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
        spyCollector.on('collect', async (btn) => {
          if (btn.user.id !== interaction.user.id) { await btn.reply({ content: 'Only the command caller can use these buttons.', flags: MessageFlags.Ephemeral }); return; }
          if (btn.customId === 'spy_prev' && spyPage > 0) spyPage -= 1;
          else if (btn.customId === 'spy_next' && spyPage < totalSpyPages - 1) spyPage += 1;
          await btn.update({ embeds: [buildSpyEmbed(spyPage)], components: [buildSpyRow(spyPage)] });
        });
        spyCollector.on('end', async () => { try { await interaction.editReply({ components: [] }); } catch { /**/ } });
        return;
      }

      if (commandName === 'missile_targets_find') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        const ignoreRange = interaction.options.getBoolean('ignore_score_range') ?? false;
        await interaction.deferReply();
        const allianceIds = await db.getSlotsAlliances(BigInt(interaction.guildId));
        if (!allianceIds.length) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ No alliances configured. An admin can use `/config_slots_set` to set them up.').setColor(0x3498DB)] });
        let missileMembers: Nation[];
        let missileWarCounts: Map<number, number>;
        try {
          [missileMembers, missileWarCounts] = await Promise.all([
            pnw.getAllianceMembers(allianceIds),
            pnw.getActiveDefWarCountsByAlliance(allianceIds),
          ]);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not reach the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
        }
        if (!missileMembers.length) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ No active members found for the configured alliance(s).').setColor(0x3498DB)] });
        const estimateAvgInfra = (n: Nation): number => {
          if (n.numCities <= 0) return 0;
          const milScore = n.soldiers * 0.0004 + n.tanks * 0.025 + n.aircraft * 0.3 + n.ships * 1.0 + n.missiles * 5.0 + n.nukes * 15.0;
          const infraScore = n.score - (n.numCities - 1) * 100 - 10 - n.numProjects * 20 - milScore;
          return Math.max(0, (infraScore * 40) / n.numCities);
        };
        const openSlotNations = missileMembers.filter(n => (missileWarCounts.get(n.nationId) ?? 0) < MAX_DEFENSIVE_SLOTS);
        if (!openSlotNations.length) return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription('ℹ️ All nations in the configured alliances currently have full defensive slots.').setColor(0x3498DB)] });
        const avgInfraMap = new Map(openSlotNations.map(n => [n.nationId, estimateAvgInfra(n)]));
        openSlotNations.sort((a, b) => (avgInfraMap.get(b.nationId) ?? 0) - (avgInfraMap.get(a.nationId) ?? 0) || b.numCities - a.numCities);
        const MISSILE_TOP_N = 20;
        const topNations = openSlotNations.slice(0, MISSILE_TOP_N);
        const seenAa = new Set<number>();
        const missileAllianceNames: string[] = [];
        for (const n of topNations) { if (!seenAa.has(n.allianceId)) { seenAa.add(n.allianceId); if (n.allianceName) missileAllianceNames.push(n.allianceName); } }
        if (!missileAllianceNames.length) missileAllianceNames.push(...allianceIds.map(String));
        let missileRange: [number, number] | null = null;
        if (!ignoreRange) {
          const reg = await db.getByDiscordId(BigInt(interaction.user.id));
          if (reg) { try { const myN = await pnw.getNation(reg.nation_id); if (myN) missileRange = [myN.score * 0.75, myN.score * 2.5]; } catch { /**/ } }
        }
        const lines = topNations.map((n, idx) => {
          const defWars = missileWarCounts.get(n.nationId) ?? 0;
          const avgInfra = avgInfraMap.get(n.nationId) ?? 0;
          const beige = n.beigeTurns > 0 ? ' 🔵' : '';
          const infraStr = avgInfra > 0 ? ` | 🏗️ ${avgInfra.toFixed(0)} avg infra` : '';
          let line = `\`${String(idx + 1).padStart(3, ' ')}.\` [${n.nationName}](${nationUrl(n.nationId)})${beige} — 🏙️ ${n.numCities}${infraStr} | 🛡️ ${defWars}/${MAX_DEFENSIVE_SLOTS} def`;
          if (missileRange && n.score >= missileRange[0] && n.score <= missileRange[1]) line += ' | 🎯 In range';
          return line;
        });
        const missileEmbed = new EmbedBuilder()
          .setTitle(`🚀 Missile Targets — ${missileAllianceNames.join(', ')}`)
          .setDescription(lines.join('\n') || '*(no targets found)*')
          .setColor(0xE74C3C)
          .setFooter({ text: `Top ${topNations.length} · sorted by avg infra desc · open def slots only · 🔵 = beiged` });
        if (missileRange) missileEmbed.addFields({ name: 'Your Missile/War Range', value: `🎯 ${missileRange[0].toFixed(0)} – ${missileRange[1].toFixed(0)} score`, inline: false });
        return void interaction.followUp({ embeds: [missileEmbed] });
      }


      if (commandName === 'admin_sync_commands') {
        if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const appId = client.application?.id;
        if (!appId) return void interaction.reply({ content: 'Application not ready.', flags: MessageFlags.Ephemeral });
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        if (interaction.guildId) {
          await rest.put(Routes.applicationGuildCommands(appId, interaction.guildId), { body: commands });
          return void (await replyEphemeral('Guild commands synced.'));
        }
        await rest.put(Routes.applicationCommands(appId), { body: commands });
        return void (await replyEphemeral('Global commands synced.'));
      }
      if (commandName === 'admin_clear_guild_commands') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const appId = client.application?.id;
        if (!appId) return void interaction.reply({ content: 'Application not ready.', flags: MessageFlags.Ephemeral });
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        await rest.put(Routes.applicationGuildCommands(appId, interaction.guildId), { body: [] });
        return void (await replyEphemeral('Cleared guild commands for this server.'));
      }

      if (commandName === 'help') {
        if (Math.floor(Math.random() * 3) === 0) {
          return void interaction.reply({ content: 'bot is striking for its rights' });
        }
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('flame_bot commands').setDescription(renderCommandHelp())], flags: MessageFlags.Ephemeral });
      }

      logWarn(`[commands] Unhandled slash command: ${commandName} (raw: ${interaction.commandName})`);
      return void interaction.reply({
        content: `This command is not handled yet (\`${commandName}\`). Please run \`/admin_sync_commands\` and try again.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
      else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
  });

  let httpServer: Server | null = null;
  if (API_KEY) {
    const app = createApp({
      guildGetter: () => getPrimaryGuild(client),
      apiKey: API_KEY,
      roleConfig: {
        verifiedRoleId: VERIFIED_ROLE_ID,
        bar3ClientRoleId: BAR3_CLIENT_ROLE_ID,
        bar3ServerRoleId: BAR3_SERVER_ROLE_ID,
      },
      guildsGetter: () => [...client.guilds.cache.values()],
      sendToWelcomeFn: sendToAllWelcomeChannels,
      commandUsageGetter: () => Object.fromEntries(commandUsage.entries()),
      adminIds: ADMIN_DISCORD_IDS,
    });
    httpServer = createServer(app);
    httpServer.listen(API_PORT, () => logInfo(`API listening on :${API_PORT}`));
  }

  logInfo('[startup] Attempting Discord client login...');
  await client.login(DISCORD_TOKEN);
  logInfo('[startup] Discord client login call resolved; waiting for ready event.');

  const subscriptionApiKey = PW_SCAN_API_KEY || effectivePnwApiKey;
  const warSubClient = new PnWSubscriptionClient(subscriptionApiKey);
  const recruiterSubClient = new PnWSubscriptionClient(subscriptionApiKey);
  const alertHttpClient = new PnWClient(effectivePnwApiKey);
  let warLoopStopped = false;
  let recruiterLoopStopped = false;
  const enrichWarFromApi = async (war: WarDetail): Promise<WarDetail> => {
    try {
      const full = await alertHttpClient.getWarDetail(war.warId);
      if (full) return full;
    } catch (err) {
      logWarn(`war alert detail fetch failed for war ${war.warId}`, err);
    }
    try {
      const [attackerNation, defenderNation, attackerAlliance, defenderAlliance] = await Promise.all([
        war.attackerId > 0 ? alertHttpClient.getNation(war.attackerId) : Promise.resolve(null),
        war.defenderId > 0 ? alertHttpClient.getNation(war.defenderId) : Promise.resolve(null),
        war.attackerAllianceId > 0 ? alertHttpClient.getAllianceById(war.attackerAllianceId) : Promise.resolve(null),
        war.defenderAllianceId > 0 ? alertHttpClient.getAllianceById(war.defenderAllianceId) : Promise.resolve(null),
      ]);
      return {
        ...war,
        attackerName: attackerNation?.nationName || war.attackerName,
        attackerLeader: attackerNation?.leaderName || war.attackerLeader,
        attackerAllianceId: attackerNation?.allianceId || war.attackerAllianceId,
        attackerAllianceName: attackerAlliance?.name || attackerNation?.allianceName || war.attackerAllianceName,
        attackerCities: attackerNation?.numCities ?? war.attackerCities,
        attackerScore: attackerNation?.score ?? war.attackerScore,
        attackerSoldiers: attackerNation?.soldiers ?? war.attackerSoldiers,
        attackerTanks: attackerNation?.tanks ?? war.attackerTanks,
        attackerAircraft: attackerNation?.aircraft ?? war.attackerAircraft,
        attackerShips: attackerNation?.ships ?? war.attackerShips,
        attackerMissiles: attackerNation?.missiles ?? war.attackerMissiles,
        attackerNukes: attackerNation?.nukes ?? war.attackerNukes,
        attackerWarsWon: attackerNation?.warsWon ?? war.attackerWarsWon,
        attackerWarsLost: attackerNation?.warsLost ?? war.attackerWarsLost,
        defenderName: defenderNation?.nationName || war.defenderName,
        defenderLeader: defenderNation?.leaderName || war.defenderLeader,
        defenderAllianceId: defenderNation?.allianceId || war.defenderAllianceId,
        defenderAllianceName: defenderAlliance?.name || defenderNation?.allianceName || war.defenderAllianceName,
        defenderCities: defenderNation?.numCities ?? war.defenderCities,
        defenderScore: defenderNation?.score ?? war.defenderScore,
        defenderSoldiers: defenderNation?.soldiers ?? war.defenderSoldiers,
        defenderTanks: defenderNation?.tanks ?? war.defenderTanks,
        defenderAircraft: defenderNation?.aircraft ?? war.defenderAircraft,
        defenderShips: defenderNation?.ships ?? war.defenderShips,
        defenderMissiles: defenderNation?.missiles ?? war.defenderMissiles,
        defenderNukes: defenderNation?.nukes ?? war.defenderNukes,
        defenderWarsWon: defenderNation?.warsWon ?? war.defenderWarsWon,
        defenderWarsLost: defenderNation?.warsLost ?? war.defenderWarsLost,
      };
    } catch (err) {
      logWarn(`war alert fallback enrichment failed for war ${war.warId}`, err);
      return war;
    }
  };
  const enrichNationFromApi = async (nation: NationCreateDetail): Promise<NationCreateDetail> => {
    try {
      const full = await alertHttpClient.getNation(nation.nationId);
      if (!full) return nation;
      return {
        nationId: nation.nationId,
        nationName: full.nationName || nation.nationName,
        leaderName: full.leaderName || nation.leaderName,
        founded: nation.founded,
        allianceId: full.allianceId,
        cities: full.numCities,
        score: full.score,
      };
    } catch (err) {
      logWarn(`nation enrichment failed for nation ${nation.nationId}`, err);
      return nation;
    }
  };
  const getRelevantWarAlertAllianceIds = async (): Promise<number[]> => {
    const subs = await db.getAllWarAlertSubscriptions();
    if (!subs.length) return [];
    const ids = new Set<number>();
    const seenGuilds = new Set<string>();
    for (const sub of subs) {
      if (seenGuilds.has(sub.guild_id)) continue;
      seenGuilds.add(sub.guild_id);
      let guildId: bigint;
      try {
        guildId = BigInt(sub.guild_id);
      } catch {
        continue;
      }
      const allianceId = await db.getAllianceId(guildId);
      if (allianceId && allianceId > 0) ids.add(allianceId);
    }
    return [...ids];
  };
  const warLoopTask = (async () => {
    for await (const war of warSubClient.iterWarCreates({ getAllianceIds: getRelevantWarAlertAllianceIds, idleDelaySeconds: 60 })) {
      if (warLoopStopped) break;
      try {
        const fullWar = await enrichWarFromApi(war);
        const subs = await db.getAllWarAlertSubscriptions();
        const allianceByGuild = new Map<string, number | null>();
        for (const sub of subs) {
          let allianceId = allianceByGuild.get(sub.guild_id);
          if (allianceId === undefined) {
            try {
              allianceId = await db.getAllianceId(BigInt(sub.guild_id));
            } catch {
              allianceId = null;
            }
            allianceByGuild.set(sub.guild_id, allianceId);
          }
          if (!allianceId) continue;
          const involvesAlliance = fullWar.attackerAllianceId === allianceId || fullWar.defenderAllianceId === allianceId;
          if (!involvesAlliance) continue;
          const ownCities = fullWar.attackerAllianceId === allianceId ? fullWar.attackerCities : fullWar.defenderCities;
          if (sub.min_cities != null && ownCities < sub.min_cities) continue;
          if (sub.max_cities != null && ownCities > sub.max_cities) continue;
          const guild = client.guilds.cache.get(sub.guild_id);
          const ch = guild?.channels.cache.get(sub.channel_id) as TextChannel | undefined;
          if (!ch) continue;
          await ch.send({ embeds: [buildWarAlertEmbed(fullWar, allianceId)] });
        }
      } catch (e) {
        logError('war alert dispatch error', e);
      }
    }
  })();

  const dispatchRecruiterNation = async (nation: NationCreateDetail): Promise<void> => {
    const foundedMs = nation.founded instanceof Date && !Number.isNaN(nation.founded.getTime())
      ? nation.founded.getTime()
      : Date.now();
    const ageSeconds = (Date.now() - foundedMs) / 1000;
    const remaining = Math.max(0, RECRUIT_DELAY_SECONDS - ageSeconds);
    if (remaining > 0) {
      await new Promise((r) => setTimeout(r, remaining * 1000));
    }
    const subs = await db.getAllRecruiterSubscriptions();
    if (!subs.length) return;
    const embed = buildRecruiterEmbed(nation);
    for (const sub of subs) {
      const guild = client.guilds.cache.get(String(sub.guild_id));
      const channel = guild?.channels.cache.get(String(sub.channel_id));
      if (!(channel instanceof TextChannel)) continue;
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        logError('recruiter alert send error', err);
      }
    }
  };

  const recruiterLoopTask = (async () => {
    for await (const nation of recruiterSubClient.iterNationCreates()) {
      if (recruiterLoopStopped) break;
      try {
        const fullNation = await enrichNationFromApi(nation);
        // Fire-and-forget to avoid blocking the subscription stream during delay windows.
        void dispatchRecruiterNation(fullNation);
      } catch (e) {
        logError('recruiter alert dispatch error', e);
      }
    }
  })();

  const shutdown = async () => {
    if (httpServer) await new Promise<void>((resolve, reject) => httpServer?.close((e) => (e ? reject(e) : resolve())));
    if (inviteRefreshTimer) {
      clearInterval(inviteRefreshTimer);
      inviteRefreshTimer = null;
    }
    warLoopStopped = true;
    recruiterLoopStopped = true;
    await db.close();
    await Promise.race([warLoopTask, new Promise((r) => setTimeout(r, 1500))]);
    await Promise.race([recruiterLoopTask, new Promise((r) => setTimeout(r, 1500))]);
    client.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

void main();
