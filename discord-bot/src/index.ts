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
  Message,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  APIEmbedField,
} from 'discord.js';
import { createServer, Server } from 'http';

import {
  API_KEY,
  API_PORT,
  ALLIANCE_BANK_ALLIANCE_ID,
  ALLIANCE_BANK_API_KEY_REF,
  ADMIN_DISCORD_IDS,
  BANKING_DEPOSIT_REQUIRED_WORDS,
  BANKING_ENABLED,
  BANKING_SYNC_INTERVAL_SECONDS,
  BANKING_SYNC_FETCH_LIMIT,
  BAR3_CLIENT_ROLE_ID,
  BAR3_SERVER_ROLE_ID,
  BOT_KEY,
  DISCORD_TOKEN,
  DISCORD_ENABLE_GUILD_MEMBERS_INTENT,
  GUILD_ID,
  LOG_LEVEL,
  MEMBER_GUILD_ID,
  MEMBER_ROLE_ID,
  MONGODB_URI,
  OFFSHORE_ALLIANCE_ID,
  OFFSHORE_API_KEY_REF,
  PNW_API_KEY,
  PNW_TEST_API_KEY,
  PW_SCAN_API_KEY,
  VERIFIED_ROLE_ID,
  WINLOG_POST_SECRET,
} from './config';
import { handleWinlogPayload } from './winlog';
import { createApp } from './api';
import { BANKING_RESOURCE_KEYS, BankingLedgerDoc, BankingResourceBalance, BankingResourceKey, Database } from './database';
import { BankingService, balanceToNote } from './banking';
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
  LOOT_RESOURCE_KEYS,
  LootResources,
  BankTransactionRecord,
} from './pnw_api';
import { renderCommandHelpSections } from './commandDocs';
import { translateBetweenEnglishAndCroatian } from './translation';
import {
  TERRITORIAL_COMMANDS,
  handleTerritorialCommand,
} from './territorial_commands';

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
function resolveCanonicalCommandNameFromInteraction(i: ChatInputCommandInteraction): string {
  const group = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand(false);

  if (i.commandName === 'alliance') {
    if (sub === 'info') return 'alliance_info';
    if (sub === 'members') return 'alliance_members';
    if (sub === 'lots_of_info') return 'alliance_lots_of_info';
  }
  if (i.commandName === 'test') {
    if (sub === 'whois') return 'test_whois';
    if (group === 'alliance' && sub === 'info') return 'test_alliance_info';
    if (group === 'alliance' && sub === 'members') return 'test_alliance_members';
    if (group === 'alliance' && sub === 'lots_of_info') return 'test_alliance_lots_of_info';
  }
  if (i.commandName === 'config' && group === 'slots') {
    if (sub === 'set') return 'config_slots_set';
    if (sub === 'show') return 'config_slots_show';
    if (sub === 'clear') return 'config_slots_clear';
  }
  if (i.commandName === 'chanel_set') {
    {
      const channelType = i.options.getString('type');
      const action = i.options.getString('action');
      if (channelType === 'counter') {
        if (action === 'set') return 'counter_request_channel_set';
        if (action === 'show') return 'counter_request_channel_show';
        if (action === 'clear') return 'counter_request_channel_clear';
      }
      if (channelType === 'grant') {
        if (action === 'set') return 'setup_grant_channel';
        if (action === 'show') return 'setup_grant_channel_show';
        if (action === 'clear') return 'setup_grant_channel_clear';
      }
      if (channelType === 'welcome') {
        if (action === 'set') return 'welcome_channel_set';
        if (action === 'show') return 'welcome_show';
        if (action === 'clear') return 'setup_welcome_channel_clear';
      }
    }
  }
  if (i.commandName === 'setup') {
    if (group === 'war_alerts' && sub === 'add') return 'setup_war_alerts_add';
    if (group === 'war_alerts' && sub === 'remove') return 'setup_war_alerts_remove';
    if (group === 'war_alerts' && sub === 'list') return 'setup_war_alerts_list';
    if (group === 'recruiter' && sub === 'add') return 'setup_recruiter_add';
    if (group === 'recruiter' && sub === 'remove') return 'setup_recruiter_remove';
    if (group === 'recruiter' && sub === 'list') return 'setup_recruiter_list';
  }
  if (i.commandName === 'translation' && sub === 'enable') return 'translation_enable';
  if (i.commandName === 'set') {
    const field = i.options.getString('field');
    if (field === 'alliance_id') return 'admin_alliance_set';
    if (field === 'api_key') return 'admin_api_key_set';
  }
  if (i.commandName === 'request' && sub === 'grant') return 'request_grant';
  if (i.commandName === 'banking') {
    if (sub === 'withdraw') return 'banking_withdraw';
    if (sub === 'transfer') return 'banking_transfer';
    if (sub === 'balance') return 'banking_balance';
    if (sub === 'alliance_balance') return 'banking_alliance_balance';
    if (sub === 'user_balances') return 'banking_user_balances';
    if (sub === 'manual_offshore') return 'banking_manual_offshore';
    if (sub === 'alliance_pool_withdraw') return 'banking_alliance_pool_withdraw';
    if (sub === 'set_api_keys') return 'banking_set_api_keys';
    if (sub === 'set_offshore') return 'banking_set_offshore';
    if (sub === 'show_offshore') return 'banking_show_offshore';
  }
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
    if (sub === 'alliance_show') return 'admin_alliance_show';
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

  return i.commandName;
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
          },
          grid: {
            color: 'rgba(255,255,255,0.20)',
            borderColor: '#FFFFFF',
          },
          title: {
            display: true,
            text: 'City Tier',
            color: '#FFFFFF',
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: '#FFFFFF',
          },
          grid: {
            color: 'rgba(255,255,255,0.20)',
            borderColor: '#FFFFFF',
          },
          title: {
            display: true,
            text: 'Members',
            color: '#FFFFFF',
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

function buildAllianceScoreHistoryChartPoints(
  points: AllianceScoreHistoryPoint[],
  maxSourcePoints = 365,
  maxChartPoints = 160,
): AllianceScoreHistoryChartPoint[] {
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
  const totalDays = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
  const dayStride = Math.max(1, Math.ceil(totalDays / maxChartPoints));
  for (let dayOffset = 0; dayOffset < totalDays; dayOffset += dayStride) {
    const ts = start.getTime() + dayOffset * dayMs;
    const cur = new Date(ts);
    const key = cur.toISOString().slice(0, 10);
    const point = byDate.get(key);
    out.push({
      fetchDate: key,
      score: point ? point.score : null,
    });
  }
  const lastKey = lastPoint.fetchDate;
  if (lastKey && out[out.length - 1]?.fetchDate !== lastKey) {
    const point = byDate.get(lastKey);
    out.push({ fetchDate: lastKey, score: point ? point.score : null });
  }
  return out;
}

function buildAllianceScoreHistoryQuickChartUrl(points: AllianceScoreHistoryPoint[]): string {
  const chartPoints = buildAllianceScoreHistoryChartPoints(points);
  const labels = chartPoints.map((p) => p.fetchDate.slice(5));
  const data = chartPoints.map((p) => (p.score == null ? null : Math.round(p.score)));
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
          },
          grid: {
            color: 'rgba(255,255,255,0.20)',
            borderColor: '#FFFFFF',
          },
          title: {
            display: true,
            text: 'Date (MM-DD)',
            color: '#FFFFFF',
          },
        },
        y: {
          ticks: {
            color: '#FFFFFF',
          },
          grid: {
            color: 'rgba(255,255,255,0.20)',
            borderColor: '#FFFFFF',
          },
          title: {
            display: true,
            text: 'Score',
            color: '#FFFFFF',
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
const ALLIANCE_VERIFY_TTL_MS = 30 * 60 * 1000;
const MAX_PNW_MESSAGE_SUBJECT_LENGTH = 50;
const PNW_SUBJECT_ELLIPSIS = '...';
const PNW_SUBJECT_TRUNCATE_AT = MAX_PNW_MESSAGE_SUBJECT_LENGTH - PNW_SUBJECT_ELLIPSIS.length;
const pendingAllianceVerifications = new Map<string, { code: string; createdAt: number; createdBy: string }>();
const pendingAllianceVerificationDispatch = new Map<string, { code: string; createdAt: number; createdBy: string; allianceId: number; allianceName: string; guildName: string; leaders: Array<{ nationId: number; leaderName: string }> }>();


type PnwMessageSendResult = { ok: true } | { ok: false; error: string };
const PNW_ERROR_FIELDS = ['general_message', 'error_msg', 'message', 'error'] as const;

const isPnwSuccessValue = (value: unknown): boolean => value === true
  || value === 1
  || value === '1'
  || String(value ?? '').toLowerCase() === 'true';

const coercePnwErrorValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => coercePnwErrorValue(entry))
      .filter((entry): entry is string => !!entry);
    return parts.length ? parts.join('; ') : undefined;
  }
  if (value && typeof value === 'object') {
    const maybeMessage = coercePnwErrorValue((value as Record<string, unknown>).message);
    if (maybeMessage) return maybeMessage;
    const maybeError = coercePnwErrorValue((value as Record<string, unknown>).error);
    if (maybeError) return maybeError;
    const maybeErrors = coercePnwErrorValue((value as Record<string, unknown>).errors);
    if (maybeErrors) return maybeErrors;
    try {
      const stringified = JSON.stringify(value);
      return stringified && stringified !== '{}' ? stringified : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

function getPnwMessageSendApiKey(): string {
  return (PW_SCAN_API_KEY || PNW_API_KEY || '').trim();
}

async function sendPnwMessageToNation(nationId: number, subject: string, message: string): Promise<PnwMessageSendResult> {
  const apiKey = getPnwMessageSendApiKey();
  if (!apiKey) return { ok: false, error: 'PnW message-send API key is not configured.' };

  const body = new URLSearchParams({
    key: apiKey,
    to: String(nationId),
    subject,
    message,
  });

  const response = await fetch('https://politicsandwar.com/api/send-message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
  }).catch(() => null);

  if (!response) return { ok: false, error: 'No response from PnW message endpoint.' };

  const raw = (await response.text().catch(() => '')).trim();
  const lowered = raw.toLowerCase();
  if (lowered === '1' || lowered === 'true') return { ok: true };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isPnwSuccessValue(parsed)) return { ok: true };
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: raw || `PnW API returned status ${response.status}.` };
    }
    const parsedObject = parsed as { success?: unknown; error?: unknown };
    const success = parsedObject?.success;
    if (isPnwSuccessValue(success)) return { ok: true };
    let error = 'Unknown PnW API error.';
    for (const field of PNW_ERROR_FIELDS) {
      const value = coercePnwErrorValue((parsedObject as Record<string, unknown>)[field]);
      if (value) {
        error = value;
        break;
      }
    }
    if (error === 'Unknown PnW API error.') {
      const nested = coercePnwErrorValue((parsedObject as Record<string, unknown>).errors);
      if (nested) error = nested;
    }
    return { ok: false, error };
  } catch {
    return { ok: false, error: raw || `PnW API returned status ${response.status}.` };
  }
}

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

function isSnowflakeId(value: string): boolean {
  return /^\d+$/.test(value);
}

async function hasGovAccess(i: ChatInputCommandInteraction, db: Database, roleKeys: GovRoleKey[] = ['milcom']): Promise<boolean> {
  if (!i.inGuild() || !i.guildId || !i.member) return false;
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  const cfg = await db.getGovRoles(BigInt(i.guildId));
  const member = i.member;
  if ('permissions' in member && typeof member.permissions !== 'string' && member.permissions.has('Administrator')) return true;
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

function parseDiscordUserLookupId(query: string): string | null {
  const trimmed = query.trim();
  const mentionMatch = /^<@!?(\d+)>$/.exec(trimmed);
  if (mentionMatch?.[1]) return mentionMatch[1];
  // Let users paste/copy a raw Discord snowflake when slash-command string
  // mention parsing is awkward; PnW alliance IDs are far shorter in practice.
  if (/^\d{17,20}$/.test(trimmed)) return trimmed;
  return null;
}

/** Check whether the caller may use member-gated commands.
 * Passes if admin, the configured "member" role is unset, caller holds the
 * "member" role, or caller holds any gov role. */
async function hasMemberAccess(i: ChatInputCommandInteraction, _db: Database): Promise<boolean> {
  if (!i.inGuild() || !i.guildId || !i.member) return false;
  if (ADMIN_DISCORD_IDS.has(BigInt(i.user.id))) return true;
  const member = i.member;
  if ('permissions' in member && typeof member.permissions !== 'string' && member.permissions.has('Administrator')) return true;
  const cfg = await _db.getGovRoles(BigInt(i.guildId));
  const memberRoleId = (cfg.member ?? MEMBER_ROLE_ID ?? '').trim();
  if (!memberRoleId) return true; // not configured — no restriction
  const roleSet = new Set(
    (member.roles as any)?.cache ? Array.from((member.roles as any).cache.keys()) : (member.roles as any) ?? [],
  );
  if (isSnowflakeId(memberRoleId) && roleSet.has(memberRoleId)) return true;
  for (const key of ['leader', '2ic', 'econ', 'econ_gov', 'milcom', 'milcom_gov', 'ia', 'ia_asst', 'gov'] as const) {
    const roleId = (cfg[key] ?? '').trim();
    if (isSnowflakeId(roleId) && roleSet.has(roleId)) return true;
  }
  return false;
}

function getResourceOptionsFromInteraction(i: ChatInputCommandInteraction): BankingResourceBalance {
  const resources = {} as BankingResourceBalance;
  for (const key of BANKING_RESOURCE_KEYS) {
    const value = i.options.getNumber(key) ?? 0;
    resources[key] = value > 0 ? value : 0;
  }
  return resources;
}

function hasPositiveResourceInput(resources: BankingResourceBalance): boolean {
  return BANKING_RESOURCE_KEYS.some((key) => resources[key] > 0);
}

function formatResourceSummary(resources: BankingResourceBalance): string {
  const lines = BANKING_RESOURCE_KEYS
    .filter((key) => resources[key] > 0)
    .map((key) => `${key}: ${Math.trunc(resources[key]).toLocaleString()}`);
  return lines.join('\n') || 'none';
}

function summarizeBalanceLine(resources: BankingResourceBalance): string {
  return BANKING_RESOURCE_KEYS
    .filter((key) => resources[key] > 0)
    .map((key) => `${key}:${Math.trunc(resources[key]).toLocaleString()}`)
    .join(', ') || 'none';
}

const RESOURCE_EMOJI: Record<BankingResourceKey, string> = {
  money: '💰',
  food: '🍞',
  coal: '⚫',
  oil: '🛢️',
  uranium: '☢️',
  iron: '⛏️',
  bauxite: '🧱',
  lead: '🔘',
  gasoline: '⛽',
  munitions: '💣',
  steel: '🔩',
  aluminum: '✈️',
};

function capitalizeResourceKey(key: BankingResourceKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function formatBalanceAmount(key: BankingResourceKey, value: number): string {
  const rounded = Math.trunc(value);
  return key === 'money' ? `$${rounded.toLocaleString()}` : rounded.toLocaleString();
}

/** Builds a grid of inline embed fields (one per resource, including zero balances) for balance displays. */
function buildResourceFields(resources: BankingResourceBalance): APIEmbedField[] {
  return BANKING_RESOURCE_KEYS.map((key) => ({
    name: `${RESOURCE_EMOJI[key]} ${capitalizeResourceKey(key)}`,
    value: formatBalanceAmount(key, resources[key]),
    inline: true,
  }));
}

function hasAnyPositiveBalance(resources: BankingResourceBalance): boolean {
  return BANKING_RESOURCE_KEYS.some((key) => resources[key] > 0);
}

function formatMentionsForEmbed(memberIds: string[]): string {
  if (!memberIds.length) return '\u200B';
  const maxLen = 1024;
  const suffixForRemaining = (count: number): string => ` … (+${count} more)`;
  let value = '';
  for (let i = 0; i < memberIds.length; i += 1) {
    const mention = `<@${memberIds[i]}>`;
    const candidate = value ? `${value} ${mention}` : mention;
    const remaining = memberIds.length - i - 1;
    const suffix = remaining > 0 ? suffixForRemaining(remaining) : '';
    if ((candidate + suffix).length > maxLen) {
      if (!value) return '\u200B';
      return value + suffix;
    }
    value = candidate;
  }
  return value || '\u200B';
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
function buildActiveWarsEmbed(
  nation: Nation,
  wars: NationWar[],
  baseUrl = PNW_BASE_URL,
  title = `⚔️ Active Wars — ${nation.nationName}`,
  footerText = `${wars.length} active war(s)`,
): EmbedBuilder {
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
    .setTitle(title)
    .setDescription(lines.join('\n') || '*(no active wars)*')
    .setColor(0xE67E22)
    .setFooter({ text: footerText });
}

function isActiveWithinLast48Hours(nation: Nation): boolean {
  if (nation.lastActiveUnix > 0) {
    return nation.lastActiveUnix >= Math.floor(Date.now() / 1000) - (48 * 60 * 60);
  }
  if (nation.minutesSinceActive >= 0) {
    return nation.minutesSinceActive <= (48 * 60);
  }
  return false;
}

async function filterWarsByOpponentRecentActivity(
  client: PnWClient,
  nationId: number,
  wars: NationWar[],
): Promise<NationWar[]> {
  const opponentIds = Array.from(new Set(
    wars.map((war) => (war.attackerId === nationId ? war.defenderId : war.attackerId)).filter((id) => id > 0),
  ));
  const activeOpponentIds = new Set<number>();
  await Promise.all(opponentIds.map(async (opponentId) => {
    try {
      const opponent = await client.getNation(opponentId);
      if (opponent && isActiveWithinLast48Hours(opponent)) activeOpponentIds.add(opponentId);
    } catch {
      // Ignore lookup failures for individual opponents.
    }
  }));
  return wars.filter((war) => {
    const opponentId = war.attackerId === nationId ? war.defenderId : war.attackerId;
    return activeOpponentIds.has(opponentId);
  });
}

function buildWhoisWarsRow(nationId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`wars:${nationId}`).setLabel('Show Wars').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'),
    new ButtonBuilder().setCustomId(`wars_actives:${nationId}`).setLabel('actives').setStyle(ButtonStyle.Secondary).setEmoji('🟢'),
  );
}

async function editWhoisReplyWithWarsButtons(
  i: ChatInputCommandInteraction,
  embed: EmbedBuilder,
  nation: Nation,
  client: PnWClient,
  baseUrl: string,
): Promise<void> {
  const msg = await i.editReply({ embeds: [embed], components: [buildWhoisWarsRow(nation.nationId)] });
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600_000 });
  collector.on('collect', async (btn) => {
    if (btn.customId !== `wars:${nation.nationId}` && btn.customId !== `wars_actives:${nation.nationId}`) return;
    await btn.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const wars = await client.getActiveWarsForNation(nation.nationId);
      wars.sort((a, b) => b.warId - a.warId);
      if (btn.customId === `wars_actives:${nation.nationId}`) {
        const filteredWars = await filterWarsByOpponentRecentActivity(client, nation.nationId, wars);
        await btn.editReply({
          embeds: [
            buildActiveWarsEmbed(
              nation,
              filteredWars,
              baseUrl,
              `⚔️ Active Wars (Opp. active ≤48h) — ${nation.nationName}`,
              `${filteredWars.length} active war(s) vs nations active in last 48h`,
            ),
          ],
        });
        return;
      }
      await btn.editReply({ embeds: [buildActiveWarsEmbed(nation, wars, baseUrl)] });
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : String(err);
      await btn.editReply({ content: `❌ Could not fetch wars: ${msg2}` });
    }
  });
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

  let user = member?.user ?? null;
  if (!user) {
    try { user = await i.client.users.fetch(discordId); } catch { user = null; }
  }
  if (!user) return null;

  const candidateTags: string[] = [user.username];
  if (member?.displayName) candidateTags.push(member.displayName);
  if (user.globalName) candidateTags.push(user.globalName);
  if (user.discriminator && user.discriminator !== '0') {
    candidateTags.push(`${user.username}#${user.discriminator}`);
  }

  for (const tag of candidateTags) {
    const candidate = tag.trim();
    if (!candidate) continue;
    const nation = await pnw.getNationByDiscordTag(candidate);
    if (nation && PnWClient.discordMatches(nation.discordTag, candidate)) return nation;
  }
  return null;
}

async function resolveNationQuery(
  i: ChatInputCommandInteraction,
  db: Database,
  pnw: PnWClient,
  query: string,
): Promise<Nation | null> {
  const trimmed = query.trim();
  const mentionMatch = /^<@!?(\d+)>$/.exec(trimmed);
  if (mentionMatch) {
    const targetId = mentionMatch[1]!;
    const row = await db.getByDiscordId(BigInt(targetId));
    if (row) {
      const nation = await pnw.getNation(row.nation_id);
      if (nation) return nation;
    }
    return resolveMentionedNationViaApi(i, pnw, targetId);
  }
  if (/^\d+$/.test(trimmed)) {
    const parsed = parseInt(trimmed, 10);
    return parsed > 0 ? pnw.getNation(parsed) : null;
  }
  let nation: Nation | null = null;
  try { nation = await pnw.getNationByName(trimmed); } catch { nation = null; }
  if (nation) return nation;
  const row = await db.getByDiscordUsername(trimmed);
  return row ? pnw.getNation(row.nation_id) : null;
}

function formatLootAmount(value: number, key: string): string {
  if (key === 'money') return `$${Math.round(value).toLocaleString()}`;
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatLootResourceLines(resources: LootResources): string {
  const labels: Record<string, string> = {
    money: '💵 Money', food: '🌾 Food', coal: '⛏️ Coal', oil: '🛢️ Oil', uranium: '☢️ Uranium',
    iron: '🔩 Iron', bauxite: '🪨 Bauxite', lead: '🔦 Lead', gasoline: '⛽ Gasoline',
    munitions: '💣 Munitions', steel: '🔧 Steel', aluminum: '🪟 Aluminum',
  };
  const lines = LOOT_RESOURCE_KEYS
    .filter((key) => Math.abs(resources[key]) > 0.000001)
    .map((key) => `${labels[key] ?? key}: **${formatLootAmount(resources[key], key)}**`);
  return lines.length ? lines.join('\n') : '*No loot found.*';
}

function compactLootSummary(resources: LootResources): string {
  const parts = LOOT_RESOURCE_KEYS
    .filter((key) => Math.abs(resources[key]) > 0.000001)
    .map((key) => `${key === 'money' ? '$' : ''}${formatLootAmount(resources[key], key).replace(/^\$/, '')} ${key}`);
  return parts.length ? parts.join(', ') : 'no loot';
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
        await editWhoisReplyWithWarsButtons(i, embed, nation, client, baseUrl);
      } else {
        await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ <@${targetId}> has not registered yet and no matching PnW nation was found.`).setColor(0x3498DB)] });
      }
      return;
    }
    let nation: Nation | null = null;
    try { nation = await client.getNation(Number(row.nation_id)); } catch { nation = null; }
    if (nation) {
      const embed = nationEmbed(nation, `<@${targetId}>`, null, baseUrl);
      await editWhoisReplyWithWarsButtons(i, embed, nation, client, baseUrl);
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
    await editWhoisReplyWithWarsButtons(i, embed, nation, client, baseUrl);
    return;
  }

  // Text query — try nation name, then discord username
  let nation: Nation | null = null;
  try { nation = await client.getNationByName(query); } catch { nation = null; }
  if (nation) {
    const row = await db.getByNationId(nation.nationId);
    const discordUser = row ? `\`${row.discord_username || row.discord_id}\`` : null;
    const embed = nationEmbed(nation, discordUser, null, baseUrl);
    await editWhoisReplyWithWarsButtons(i, embed, nation, client, baseUrl);
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
    await editWhoisReplyWithWarsButtons(i, embed, nation, client, baseUrl);
  } else {
    await i.editReply({ embeds: [new EmbedBuilder().setDescription(`ℹ️ **${storedName}** is registered with nation ID \`${row.nation_id}\` (nation details unavailable).`).setColor(0x3498DB)] });
  }
}

async function handleAllianceInfo(i: ChatInputCommandInteraction, db: Database, pnw: PnWClient, useTest = false): Promise<void> {
  await i.deferReply();
  const query = i.options.getString('query', true).trim();
  const client = useTest ? new PnWClient(PNW_TEST_API_KEY, { restUrl: PNW_TEST_REST_URL }) : pnw;
  const baseUrl = useTest ? PNW_TEST_BASE_URL : PNW_BASE_URL;
  const discordLookupId = parseDiscordUserLookupId(query);

  let alliance: AllianceInfo | null = null;
  try {
    if (discordLookupId) {
      const targetId = discordLookupId;
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
  const discordLookupId = parseDiscordUserLookupId(query);

  let alliance: AllianceInfo | null = null;
  try {
    if (discordLookupId) {
      const targetId = discordLookupId;
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
  const banking = new BankingService(
    db,
    {
      enabled: BANKING_ENABLED,
      offshoreAllianceId: OFFSHORE_ALLIANCE_ID,
      allianceBankAllianceId: ALLIANCE_BANK_ALLIANCE_ID,
      allianceBankApiKeyRef: ALLIANCE_BANK_API_KEY_REF,
      offshoreApiKeyRef: OFFSHORE_API_KEY_REF,
      botKey: BOT_KEY,
      depositRequiredWords: BANKING_DEPOSIT_REQUIRED_WORDS,
      syncFetchLimit: BANKING_SYNC_FETCH_LIMIT,
    },
    effectivePnwApiKey
  );

  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent];
  if (DISCORD_ENABLE_GUILD_MEMBERS_INTENT) intents.push(GatewayIntentBits.GuildMembers);
  const client = new Client({ intents });
  logInfo(
    `[startup] Discord intents: Guilds, GuildMessages, MessageContent${DISCORD_ENABLE_GUILD_MEMBERS_INTENT ? ', GuildMembers' : ''}`
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
  const commandUsage = new Map<string, number>([
    ['verify_alliance_server', 0],
  ]);
  const commandCooldowns = new Map<string, number>();
  const commands = [
    new SlashCommandBuilder().setName('register').setDescription('Register your nation').addIntegerOption(o => o.setName('nation_id').setDescription('Nation ID').setRequired(true)),
    new SlashCommandBuilder().setName('unregister').setDescription('Unregister your nation'),
    new SlashCommandBuilder().setName('whois').setDescription('Lookup nation by id/name/@mention').addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true)),
    new SlashCommandBuilder().setName('slots').setDescription('Show open defensive slots for configured alliances'),
    new SlashCommandBuilder().setName('send').setDescription('Compose transfer command').addStringOption(o => o.setName('receiver').setDescription('Nation ID or @mention').setRequired(true)).addStringOption(o => o.setName('sender').setDescription('Optional sender nation ID')).addStringOption(o => o.setName('bank_note').setDescription('Bank note')).addNumberOption(o => o.setName('money').setDescription('Money amount')).addNumberOption(o => o.setName('food').setDescription('Food amount')).addNumberOption(o => o.setName('coal').setDescription('Coal amount')).addNumberOption(o => o.setName('oil').setDescription('Oil amount')).addNumberOption(o => o.setName('uranium').setDescription('Uranium amount')).addNumberOption(o => o.setName('iron').setDescription('Iron amount')).addNumberOption(o => o.setName('bauxite').setDescription('Bauxite amount')).addNumberOption(o => o.setName('lead').setDescription('Lead amount')).addNumberOption(o => o.setName('gasoline').setDescription('Gasoline amount')).addNumberOption(o => o.setName('munitions').setDescription('Munitions amount')).addNumberOption(o => o.setName('steel').setDescription('Steel amount')).addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')),
    new SlashCommandBuilder().setName('suggestion').setDescription('Send suggestion to dev').addStringOption(o => o.setName('content').setDescription('Suggestion text').setRequired(true)),
    new SlashCommandBuilder().setName('gov').setDescription('Show server members who hold a configured government role.'),
    new SlashCommandBuilder().setName('verify_alliance_server').setDescription('Create an in-game verification message for the configured alliance leader'),
    new SlashCommandBuilder().setName('verify_alliance_server_confirm').setDescription('Open a popup to confirm alliance verification code'),
    new SlashCommandBuilder().setName('color').setDescription('Check alliance color compliance'),

    new SlashCommandBuilder().setName('help').setDescription('Show bot command help'),
    new SlashCommandBuilder().setName('infra').setDescription('Calculate infra purchase cost')
      .addNumberOption(o => o.setName('from').setDescription('Current infra level per city').setRequired(true))
      .addNumberOption(o => o.setName('to').setDescription('Target infra level per city').setRequired(true))
      .addIntegerOption(o => o.setName('cities').setDescription('Number of cities (default: 1)').setMinValue(1))
      .addBooleanOption(o => o.setName('urbanization').setDescription('Urbanization project? (−5% cost)'))
      .addBooleanOption(o => o.setName('center_for_civil_engineering').setDescription('Center for Civil Engineering? (−5% cost)'))
      .addBooleanOption(o => o.setName('advanced_engineering_corps').setDescription('Advanced Engineering Corps? (−5% cost)'))
      .addBooleanOption(o => o.setName('government_support_agency').setDescription('GSA with Urbanization? (additional −2.5%)'))
      .addBooleanOption(o => o.setName('bureau_domestic_affairs').setDescription('BDA with Urbanization? (additional −1.25%)')),
    new SlashCommandBuilder().setName('revenue').setDescription('Show estimated gross daily revenue for a nation (or your own if omitted)').addStringOption(o => o.setName('query').setDescription('Optional: a nation ID, @mention, nation name, or Discord username')),
    new SlashCommandBuilder().setName('loot').setDescription("Summarize ground and victory loot from a nation's wars in the last N days")
      .addIntegerOption(o => o.setName('days').setDescription('Days to search back (1-365)').setRequired(true).setMinValue(1).setMaxValue(365))
      .addStringOption(o => o.setName('nation').setDescription('Nation ID, @mention, nation name, or Discord username').setRequired(true)),
    // Grouped commands keep slash command count lower than legacy flat aliases.
    new SlashCommandBuilder().setName('alliance').setDescription('Politics and War alliance commands')
      .addSubcommand(sc => sc.setName('info').setDescription('Lookup alliance').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)))
      .addSubcommand(sc => sc.setName('members').setDescription('List alliance members').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)))
      .addSubcommand(sc => sc.setName('lots_of_info').setDescription('Detailed alliance briefing').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true))),
    new SlashCommandBuilder().setName('test').setDescription('Test-API lookup commands')
      .addSubcommand(sc => sc.setName('whois').setDescription('Lookup nation on test API').addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true)))
      .addSubcommandGroup(g => g.setName('alliance').setDescription('Test alliance commands')
        .addSubcommand(sc => sc.setName('info').setDescription('Lookup alliance on test API').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)))
        .addSubcommand(sc => sc.setName('members').setDescription('List alliance members on test API').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)))
        .addSubcommand(sc => sc.setName('lots_of_info').setDescription('Detailed alliance briefing on test API').addStringOption(o => o.setName('query').setDescription('Alliance ID or name').setRequired(true)))),
    new SlashCommandBuilder().setName('config').setDescription('Bot configuration commands')
      .addSubcommandGroup(g => g.setName('slots').setDescription('Configure slot alliance IDs')
        .addSubcommand(sc => sc.setName('set').setDescription('Set slot alliance IDs').addStringOption(o => o.setName('alliance_ids').setDescription('e.g. 790,1234').setRequired(true)))
        .addSubcommand(sc => sc.setName('show').setDescription('Show slot alliance IDs'))
        .addSubcommand(sc => sc.setName('clear').setDescription('Clear slot alliance IDs'))),
    new SlashCommandBuilder().setName('setup').setDescription('Setup commands')
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
    new SlashCommandBuilder().setName('chanel_set').setDescription('Set, clear, or show configured channels')
      .addStringOption(o => o.setName('type').setDescription('Which channel config to manage').setRequired(true)
        .addChoices({ name: 'counter', value: 'counter' }, { name: 'grant', value: 'grant' }, { name: 'welcome', value: 'welcome' }))
      .addStringOption(o => o.setName('action').setDescription('Action to perform').setRequired(true)
        .addChoices({ name: 'set', value: 'set' }, { name: 'clear', value: 'clear' }, { name: 'show', value: 'show' }))
      .addChannelOption(o => o.setName('channel').setDescription('Required when action is set')),
    new SlashCommandBuilder().setName('set').setDescription('Set alliance id or api key')
      .addStringOption(o => o.setName('field').setDescription('Field to set').setRequired(true)
        .addChoices({ name: 'alliance_id', value: 'alliance_id' }, { name: 'api_key', value: 'api_key' }))
      .addStringOption(o => o.setName('value').setDescription('Value for the selected field').setRequired(true))
      .addBooleanOption(o => o.setName('show').setDescription('Show the resulting value in the response (default false)')),
    new SlashCommandBuilder().setName('translation').setDescription('Translation commands')
      .addSubcommand(sc => sc.setName('enable').setDescription('Enable channel translation (English ↔ Croatian)')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to enable translation for').setRequired(true))),
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
    new SlashCommandBuilder().setName('banking').setDescription('Banking commands')
      .addSubcommand(sc => sc.setName('balance').setDescription('View your registered nation deposit balance'))
      .addSubcommand(sc => sc.setName('alliance_balance').setDescription('View alliance-held/unregistered deposit balance (leaders/admins only)'))
      .addSubcommand(sc => sc.setName('user_balances').setDescription('View every tracked nation deposit balance (ADMIN_DISCORD_IDS only)'))
      .addSubcommand(sc => sc.setName('withdraw').setDescription('Withdraw from offshore to your nation balance')
        .addIntegerOption(o => o.setName('nation_id').setDescription('Send to a different nation ID instead of your own (still debits your balance)'))
        .addNumberOption(o => o.setName('money').setDescription('Money amount'))
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
        .addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')))
      .addSubcommand(sc => sc.setName('transfer').setDescription('Transfer tracked balance to another registered nation (internal, no PnW transfer)')
        .addIntegerOption(o => o.setName('nation_id').setDescription('Destination nation ID').setRequired(true).setMinValue(1))
        .addNumberOption(o => o.setName('money').setDescription('Money amount'))
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
        .addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')))
      .addSubcommand(sc => sc.setName('manual_offshore').setDescription('Manually send alliance-bank funds to offshore')
        .addStringOption(o => o.setName('note').setDescription('Optional transfer note'))
        .addNumberOption(o => o.setName('money').setDescription('Money amount'))
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
        .addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')))
      .addSubcommand(sc => sc.setName('alliance_pool_withdraw').setDescription('Withdraw from the alliance (unassigned) pool balance to a nation (leaders/econ only)')
        .addIntegerOption(o => o.setName('nation_id').setDescription('Nation ID to send the funds to').setRequired(true).setMinValue(1))
        .addNumberOption(o => o.setName('money').setDescription('Money amount'))
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
        .addNumberOption(o => o.setName('aluminum').setDescription('Aluminum amount')))
      .addSubcommand(sc => sc.setName('set_api_keys').setDescription('Set alliance-bank and offshore API keys (ADMIN_DISCORD_IDS only)')
        .addStringOption(o => o.setName('alliance_bank_api_key').setDescription('Alliance bank API key or env:VAR reference').setRequired(true))
        .addStringOption(o => o.setName('offshore_api_key').setDescription('Offshore API key or env:VAR reference').setRequired(true)))
      .addSubcommand(sc => sc.setName('set_offshore').setDescription('Set the single global offshore alliance ID (ADMIN_DISCORD_IDS only)')
        .addIntegerOption(o => o.setName('alliance_id').setDescription('Offshore alliance ID').setRequired(true).setMinValue(1)))
      .addSubcommand(sc => sc.setName('show_offshore').setDescription('Show the single global offshore alliance ID')), 
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
      .addSubcommand(sc => sc.setName('alliance_show').setDescription('Show guild primary alliance ID'))
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
    ...TERRITORIAL_COMMANDS,

  ].map(c => c.toJSON());

  type SyncedCommand = { name?: string };
  type SyncSummary = {
    count: number;
    hasGov: boolean;
    hasVerify: boolean;
    hasVerifyAllianceServer: boolean;
  };
  const summarizeSyncedCommands = (rows: unknown): SyncSummary => {
    const list = Array.isArray(rows) ? rows as SyncedCommand[] : [];
    const names = new Set(list.map((row) => String(row?.name ?? '')));
    return {
      count: list.length,
      hasGov: names.has('gov'),
      hasVerify: names.has('verify'),
      hasVerifyAllianceServer: names.has('verify_alliance_server'),
    };
  };
  const syncSlashCommands = async (rest: REST, appId: string, guildId?: string): Promise<SyncSummary> => {
    const route = guildId
      ? Routes.applicationGuildCommands(appId, guildId)
      : Routes.applicationCommands(appId);
    const synced = await rest.put(route, { body: commands }) as any[];
    console.log('Synced commands:', synced.map((c: any) => c.name).sort().join(', '));
    console.log('Total:', synced.length);
    let summary = summarizeSyncedCommands(synced);
    if (guildId && (!summary.hasGov || !summary.hasVerifyAllianceServer)) {
      await rest.put(route, { body: [] });
      const resynced = await rest.put(route, { body: commands });
      summary = summarizeSyncedCommands(resynced);
    }
    return summary;
  };

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

  const sendToAllWelcomeChannels = async (message: string, customMessage?: string): Promise<{ sent: number; skipped: number }> => {
    let sent = 0;
    let skipped = 0;
    const outboundEmbed = new EmbedBuilder()
      .setTitle('📢 Bot Update')
      .setColor(0x5865F2)
      .setDescription(customMessage?.trim() || message);
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
        await channel.send({ embeds: [outboundEmbed] });
        sent += 1;
      } catch {
        skipped += 1;
      }
    }
    return { sent, skipped };
  };

  let inviteRefreshTimer: NodeJS.Timeout | null = null;
  let bankSyncTimer: NodeJS.Timeout | null = null;
  let bankDepositListenerTimer: NodeJS.Timeout | null = null;
  let offshoreDepositListenerTimer: NodeJS.Timeout | null = null;
  const BANK_DEPOSIT_LISTENER_RECONCILE_INTERVAL_MS = 60_000;
  const postDepositOffshoreButtons = async (guildId: string, newDeposits: BankingLedgerDoc[]): Promise<void> => {
    if (newDeposits.length === 0) return;
    const channelId = await db.getCounterRequestChannel(BigInt(guildId));
    if (!channelId) return;
    let channel: TextChannel | null = null;
    try {
      const fetched = await client.channels.fetch(channelId);
      if (fetched instanceof TextChannel) channel = fetched;
    } catch (error) {
      logWarn(`[banking] failed to fetch counter request channel ${channelId} for guild ${guildId}:`, error);
      return;
    }
    if (!channel) return;
    for (const deposit of newDeposits) {
      const embed = new EmbedBuilder()
        .setTitle('New deposit logged')
        .setDescription(
          `**Nation:** ${deposit.nation_id ?? 'Unknown'}\n` +
          `**Resources:** ${balanceToNote(deposit.resources)}\n` +
          `**Note:** ${deposit.note || '—'}`
        )
        .setColor(0x2ECC71)
        .setTimestamp(new Date(deposit.created_at));
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('banking_offshore_btn_all')
          .setLabel('Send All to Offshore')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🏦')
      );
      try {
        const sentMessage = await channel.send({ embeds: [embed], components: [row] });
        await db.setBankingLedgerDiscordMessage(deposit.ledger_id, channel.id, sentMessage.id);
      } catch (error) {
        logWarn(`[banking] failed to post deposit message for ledger ${deposit.ledger_id}:`, error);
      }
    }
  };

  const syncAllGuildBanking = async (): Promise<void> => {
    if (!BANKING_ENABLED) return;
    const guildIds = client.guilds.cache.map((guild) => guild.id);
    for (const guildId of guildIds) {
      try {
        const result = await banking.syncGuildDeposits(guildId);
        await postDepositOffshoreButtons(guildId, result.newDeposits);
      } catch (error) {
        logWarn(`[banking] sync failed for guild ${guildId}:`, error);
      }
    }
  };

  // Push-based deposit ingestion over the PnW `bankrec/create` WS
  // subscription, keyed per guild since each guild's alliance bank can use
  // a different API key/alliance ID. syncGuildDeposits (REST poll, above)
  // keeps running alongside this as a backfill/failover path — both paths
  // write through the same idempotency key and the unique
  // (guild_id, source_transaction_id) ledger index, so a transaction seen
  // by both is only ever logged once.
  interface BankDepositListener {
    allianceId: number;
    apiKeyFingerprint: string;
    stopped: boolean;
    task: Promise<void>;
  }
  const bankDepositListeners = new Map<string, BankDepositListener>();

  const stopBankDepositListener = (guildId: string): void => {
    const existing = bankDepositListeners.get(guildId);
    if (!existing) return;
    existing.stopped = true;
    bankDepositListeners.delete(guildId);
  };

  const startBankDepositListener = (guildId: string, allianceId: number, apiKey: string): void => {
    const subClient = new PnWSubscriptionClient(apiKey);
    const listener: BankDepositListener = {
      allianceId,
      apiKeyFingerprint: apiKey,
      stopped: false,
      task: Promise.resolve(),
    };
    listener.task = (async () => {
      for await (const tx of subClient.iterBankRecCreates(allianceId)) {
        if (listener.stopped) break;
        try {
          const deposit = await banking.handleIncomingBankRecDeposit(guildId, tx);
          if (deposit) await postDepositOffshoreButtons(guildId, [deposit]);
        } catch (error) {
          logWarn(`[banking] failed to process bankrec ${tx.id} for guild ${guildId}:`, error);
        }
      }
    })();
    bankDepositListeners.set(guildId, listener);
  };

  const reconcileBankDepositListeners = async (): Promise<void> => {
    if (!BANKING_ENABLED) return;
    const guildIds = client.guilds.cache.map((guild) => guild.id);
    const activeGuildIds = new Set(guildIds);
    for (const guildId of [...bankDepositListeners.keys()]) {
      if (!activeGuildIds.has(guildId)) stopBankDepositListener(guildId);
    }
    for (const guildId of guildIds) {
      let context: { allianceId: number; apiKey: string } | null = null;
      try {
        context = await banking.getBankSubscriptionContext(guildId);
      } catch (error) {
        logWarn(`[banking] failed to resolve bank subscription context for guild ${guildId}:`, error);
      }
      const existing = bankDepositListeners.get(guildId);
      if (!context) {
        if (existing) stopBankDepositListener(guildId);
        continue;
      }
      if (existing && existing.allianceId === context.allianceId && existing.apiKeyFingerprint === context.apiKey) {
        continue;
      }
      if (existing) stopBankDepositListener(guildId);
      startBankDepositListener(guildId, context.allianceId, context.apiKey);
    }
  };

  // Push-based ingestion for deposits landing directly in the OFFSHORE
  // alliance's bank (as opposed to bankDepositListeners above, which watches
  // the main alliance bank). Self-banked deposits (banker == sender) are
  // auto-credited straight to the sender's nation balance and are
  // intentionally never passed to postDepositOffshoreButtons — the funds are
  // already offshore, so there's nothing to sweep and no "Send All to
  // Offshore" button/popup is needed for them.
  const offshoreDepositListeners = new Map<string, BankDepositListener>();

  const stopOffshoreDepositListener = (guildId: string): void => {
    const existing = offshoreDepositListeners.get(guildId);
    if (!existing) return;
    existing.stopped = true;
    offshoreDepositListeners.delete(guildId);
  };

  const startOffshoreDepositListener = (guildId: string, allianceId: number, apiKey: string): void => {
    const subClient = new PnWSubscriptionClient(apiKey);
    const listener: BankDepositListener = {
      allianceId,
      apiKeyFingerprint: apiKey,
      stopped: false,
      task: Promise.resolve(),
    };
    listener.task = (async () => {
      for await (const tx of subClient.iterBankRecCreates(allianceId)) {
        if (listener.stopped) break;
        try {
          await banking.handleIncomingOffshoreDeposit(guildId, tx);
        } catch (error) {
          logWarn(`[banking] failed to process offshore bankrec ${tx.id} for guild ${guildId}:`, error);
        }
      }
    })();
    offshoreDepositListeners.set(guildId, listener);
  };

  const reconcileOffshoreDepositListeners = async (): Promise<void> => {
    if (!BANKING_ENABLED) return;
    const guildIds = client.guilds.cache.map((guild) => guild.id);
    const activeGuildIds = new Set(guildIds);
    for (const guildId of [...offshoreDepositListeners.keys()]) {
      if (!activeGuildIds.has(guildId)) stopOffshoreDepositListener(guildId);
    }
    for (const guildId of guildIds) {
      let context: { allianceId: number; apiKey: string } | null = null;
      try {
        context = await banking.getOffshoreSubscriptionContext(guildId);
      } catch (error) {
        logWarn(`[banking] failed to resolve offshore subscription context for guild ${guildId}:`, error);
      }
      const existing = offshoreDepositListeners.get(guildId);
      if (!context) {
        if (existing) stopOffshoreDepositListener(guildId);
        continue;
      }
      if (existing && existing.allianceId === context.allianceId && existing.apiKeyFingerprint === context.apiKey) {
        continue;
      }
      if (existing) stopOffshoreDepositListener(guildId);
      startOffshoreDepositListener(guildId, context.allianceId, context.apiKey);
    }
  };

  client.once('ready', async () => {
    logInfo(`Logged in as ${client.user?.tag ?? 'unknown'}`);
    const appId = client.application?.id;
    if (!appId) return;
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const syncSummary = await syncSlashCommands(rest, appId);
    for (const guild of client.guilds.cache.values()) {
      await persistGuildMetadata(guild);
      await banking.ensureGuildConfig(guild.id);
    }
    await refreshDeletedGuildInvitesOnce();
    if (!inviteRefreshTimer) {
      inviteRefreshTimer = setInterval(() => {
        void refreshDeletedGuildInvitesOnce();
      }, INVITE_REFRESH_INTERVAL_MS);
    }
    if (!bankSyncTimer && BANKING_ENABLED) {
      bankSyncTimer = setInterval(() => {
        void syncAllGuildBanking();
      }, Math.max(30, BANKING_SYNC_INTERVAL_SECONDS) * 1000);
      void syncAllGuildBanking();
    }
    if (!bankDepositListenerTimer && BANKING_ENABLED) {
      bankDepositListenerTimer = setInterval(() => {
        void reconcileBankDepositListeners();
      }, BANK_DEPOSIT_LISTENER_RECONCILE_INTERVAL_MS);
      void reconcileBankDepositListeners();
    }
    if (!offshoreDepositListenerTimer && BANKING_ENABLED) {
      offshoreDepositListenerTimer = setInterval(() => {
        void reconcileOffshoreDepositListeners();
      }, BANK_DEPOSIT_LISTENER_RECONCILE_INTERVAL_MS);
      void reconcileOffshoreDepositListeners();
    }
    logInfo(
      `Slash commands synced. count=${syncSummary.count}, gov=${syncSummary.hasGov}, verify=${syncSummary.hasVerify}, verify_alliance_server=${syncSummary.hasVerifyAllianceServer}`
    );
  });

  client.on('guildCreate', async (guild) => {
    await persistGuildMetadata(guild);
    await banking.ensureGuildConfig(guild.id);
    void reconcileBankDepositListeners();
    void reconcileOffshoreDepositListeners();
    const appId = client.application?.id;
    if (!appId) return;
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await syncSlashCommands(rest, appId, guild.id);
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

  client.on('messageCreate', async (message: Message) => {
    try {
      if (!message.inGuild() || !message.guildId) return;
      if (message.author.bot) return;
      const content = message.content?.trim() || '';
      if (!content) return;
      const enabledChannelIds = await db.getTranslationChannels(BigInt(message.guildId));
      if (!enabledChannelIds.includes(message.channelId)) return;
      const translation = await translateBetweenEnglishAndCroatian(content);
      if (!translation) return;
      const translatedText = translation.text.trim();
      if (!translatedText) return;
      await message.reply({
        content: translatedText.slice(0, 1990),
        allowedMentions: { repliedUser: false },
      });
    } catch (err) {
      logWarn('Translation handling failed:', err);
    }
  });

  client.on('interactionCreate', async (interaction: Interaction) => {

    if (interaction.isButton() && interaction.customId === 'banking_offshore_btn_all') {
      if (!interaction.guildId) return void interaction.reply({ content: 'Guild only interaction.', flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await banking.sendAllPendingDepositsToOffshore(interaction.guildId, interaction.user.id);
      if (!result.ok) {
        return void interaction.editReply({ content: `❌ ${result.error}` });
      }
      // Only disable/relabel buttons for deposits that were actually part of
      // this successful transfer — anything not in sentLedgerIds wasn't sent
      // and its message is left untouched so it can still be swept later.
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('banking_offshore_btn_done')
          .setLabel(`Sent by @${interaction.user.username}`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
          .setDisabled(true)
      );
      for (const ledgerId of result.sentLedgerIds) {
        try {
          const deposit = await db.getBankingLedgerEntry(ledgerId);
          if (!deposit?.discord_channel_id || !deposit.discord_message_id) continue;
          const channel = await client.channels.fetch(deposit.discord_channel_id);
          if (!(channel instanceof TextChannel)) continue;
          const message = await channel.messages.fetch(deposit.discord_message_id);
          if (message.editable) await message.edit({ components: [disabledRow] });
        } catch (error) {
          logWarn(`[banking] failed to disable offshore button for ledger ${ledgerId}:`, error);
        }
      }
      return void interaction.editReply({ content: `✅ Sent ${result.sentLedgerIds.length} deposit(s) to offshore.` });
    }

    if (interaction.isButton() && interaction.customId === 'verify_alliance_send_open_modal') {
      if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only interaction.', flags: MessageFlags.Ephemeral });
      if (!await hasGovAccess(interaction as unknown as ChatInputCommandInteraction, db, ['leader', '2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
      const pendingDispatch = pendingAllianceVerificationDispatch.get(interaction.guildId);
      if (!pendingDispatch) return void interaction.reply({ content: 'No pending verification send request. Run `/verify_alliance_server` first.', flags: MessageFlags.Ephemeral });
      const modal = new ModalBuilder().setCustomId('verify_alliance_send_modal').setTitle('Confirm alliance code send');
      const confirmInput = new TextInputBuilder()
        .setCustomId('verify_alliance_send_confirm')
        .setLabel('Type SEND to confirm')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('SEND');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(confirmInput));
      return void interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'verify_alliance_send_modal') {
      if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only interaction.', flags: MessageFlags.Ephemeral });
      if (!await hasGovAccess(interaction as unknown as ChatInputCommandInteraction, db, ['leader', '2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
      const pendingDispatch = pendingAllianceVerificationDispatch.get(interaction.guildId);
      if (!pendingDispatch) return void interaction.reply({ content: 'No pending verification send request. Run `/verify_alliance_server` first.', flags: MessageFlags.Ephemeral });
      if ((Date.now() - pendingDispatch.createdAt) > ALLIANCE_VERIFY_TTL_MS) {
        pendingAllianceVerificationDispatch.delete(interaction.guildId);
        pendingAllianceVerifications.delete(interaction.guildId);
        return void interaction.reply({ content: 'The pending verification request expired (30 minutes). Run `/verify_alliance_server` again.', flags: MessageFlags.Ephemeral });
      }
      const confirmed = (interaction.fields.getTextInputValue('verify_alliance_send_confirm') || '').trim().toUpperCase();
      if (confirmed !== 'SEND') return void interaction.reply({ content: 'Confirmation failed. Type exactly `SEND` to dispatch alliance verification mail.', flags: MessageFlags.Ephemeral });

      const rawSubject = 'BAR3 alliance verification';
      const subject = rawSubject.length <= MAX_PNW_MESSAGE_SUBJECT_LENGTH
        ? rawSubject
        : `${rawSubject.slice(0, PNW_SUBJECT_TRUNCATE_AT)}${PNW_SUBJECT_ELLIPSIS}`;
      const messageResults: Array<{ leader: { nationId: number; leaderName: string }; sent: PnwMessageSendResult }> = [];
      for (const leader of pendingDispatch.leaders) {
        const verificationMessage = [
          `Hello ${leader.leaderName},`,
          `Please verify that this Discord server belongs to ${pendingDispatch.allianceName} (${pendingDispatch.allianceId}).`,
          `Verification code: ${pendingDispatch.code}`,
          `Discord server: ${pendingDispatch.guildName}`,
          `Requested by: ${interaction.user.tag} (${interaction.user.id})`,
        ].join('\n');
        const sent = await sendPnwMessageToNation(leader.nationId, subject, verificationMessage);
        messageResults.push({ leader, sent });
      }
      const sentCount = messageResults.filter((m) => m.sent.ok).length;
      const failed = messageResults.filter((m) => !m.sent.ok);
      const failureLines = failed.length
        ? '\n\nFailed targets:\n' + failed.map((m) => `• **${m.leader.leaderName}** (${nationUrl(m.leader.nationId)}): ${(m.sent as { ok: false; error: string }).error}`).join('\n')
        : '';
      pendingAllianceVerificationDispatch.delete(interaction.guildId);
      return void interaction.reply({
        content:
          `Attempted to send the verification code in-game to ${pendingDispatch.leaders.length} alliance leader target(s).\n` +
          `Delivered: ${sentCount}/${pendingDispatch.leaders.length}.\n` +
          `Ask a leader to send you the exact code they received, then click **Verify code** and paste it into the popup.` +
          `${failureLines}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (interaction.isButton() && interaction.customId === 'verify_alliance_open_modal') {
      const modal = new ModalBuilder().setCustomId('verify_alliance_modal').setTitle('Verify Alliance Server');
      const codeInput = new TextInputBuilder()
        .setCustomId('verification_code')
        .setLabel('Verification code')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('BAR3-VERIFY-...');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput));
      return void interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'verify_alliance_modal') {
      if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only interaction.', flags: MessageFlags.Ephemeral });
      if (!await hasGovAccess(interaction as unknown as ChatInputCommandInteraction, db, ['leader', '2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
      const providedCode = (interaction.fields.getTextInputValue('verification_code') || '').trim().toUpperCase();
      const pending = pendingAllianceVerifications.get(interaction.guildId);
      if (!pending) return void interaction.reply({ content: 'No pending verification for this server. Run `/verify_alliance_server` first.', flags: MessageFlags.Ephemeral });
      if ((Date.now() - pending.createdAt) > ALLIANCE_VERIFY_TTL_MS) {
        pendingAllianceVerifications.delete(interaction.guildId);
        return void interaction.reply({ content: 'The pending verification code expired (30 minutes). Run `/verify_alliance_server` again.', flags: MessageFlags.Ephemeral });
      }
      if (providedCode !== pending.code) {
        return void interaction.reply({ content: 'Verification code mismatch. Double-check the code from the alliance leader and try again.', flags: MessageFlags.Ephemeral });
      }
      pendingAllianceVerifications.delete(interaction.guildId);
      await db.markAllianceVerified(BigInt(interaction.guildId));
      return void interaction.reply({ content: `✅ Alliance server verification confirmed for this guild.\nConfirmed by <@${interaction.user.id}> with code \`${providedCode}\`.`, flags: MessageFlags.Ephemeral });
    }
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
      if (commandName === 'translation_enable') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const channel = interaction.options.getChannel('channel', true);
        await db.enableTranslationChannel(BigInt(interaction.guildId), channel.id);
        return void interaction.reply({ content: `Translation enabled for <#${channel.id}>.` });
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
        const dmEmbed = new EmbedBuilder()
          .setTitle('📬 New /suggestion submission')
          .setColor(0x5865F2)
          .addFields(
            { name: 'From', value: `${interaction.user} (ID: ${interaction.user.id})`, inline: false },
            { name: 'Guild', value: interaction.guild?.name ?? 'DM/Unknown', inline: false },
            { name: 'Content', value: content, inline: false },
          );
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
          try { await userObj.send({ embeds: [dmEmbed] }); sentTo.push(username); } catch { missing.push(username); }
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
          if (role) (current as Record<string, string | null>)[dbKey] = role.id;
        }
        await db.setGovRoles(BigInt(interaction.guildId), current as any);
        const GOV_DEPT_LABELS: Record<string, string> = {
          leader: 'Leader', '2ic': 'Second in Command', econ: 'Economics', econ_gov: 'Economics Gov',
          milcom: 'Military Command', milcom_gov: 'Military Command Gov', ia: 'Internal Affairs',
          ia_asst: 'Internal Affairs Assistant', gov: 'Basic Gov', member: 'Member',
        };
        const lines: string[] = ['✅ Government role configuration updated:'];
        for (const [key, label] of Object.entries(GOV_DEPT_LABELS)) {
          const rid = (current as Record<string, string | null>)[key];
          if (rid && interaction.guild) {
            const role = interaction.guild.roles.cache.get(rid);
            lines.push(`**${label}:** ${role ? role.toString() : `<@&${rid}>`}`);
          } else {
            lines.push(`**${label}:** *(not set)*`);
          }
        }
        return void interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'gov') {
        if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) {
          return void interaction.reply({ embeds: [new EmbedBuilder().setDescription('❌ You need the **Member** role to use this command.').setColor(0xE74C3C)], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply();

        // Fetch both roles and members so the cache is warm.
        let guildRoleCollection = interaction.guild.roles.cache;
        try {
          guildRoleCollection = await interaction.guild.roles.fetch();
        } catch (err) {
          logWarn(`[gov] Failed to fetch roles for ${interaction.guildId}: ${String((err as Error)?.message ?? err)}`);
        }
        let allGuildMembers: Map<string, GuildMember>;
        try {
          allGuildMembers = await interaction.guild.members.fetch();
        } catch (err) {
          logWarn(`[gov] Failed to fetch full guild member list for ${interaction.guildId}: ${String((err as Error)?.message ?? err)}`);
          allGuildMembers = interaction.guild.members.cache;
        }
        const cfg = await db.getGovRoles(BigInt(interaction.guildId));
        if (!Object.values(cfg).some((roleId) => roleId)) {
          return void interaction.editReply({
            embeds: [new EmbedBuilder().setDescription('ℹ️ No government roles configured yet. An admin can use `/roles setup` to set them up.').setColor(0x3498DB)],
          });
        }
        const GOV_DEPT_LABELS: Record<string, string> = {
          leader: 'Leader', '2ic': 'Second in Command', econ: 'Economics', econ_gov: 'Economics Gov',
          milcom: 'Military Command', milcom_gov: 'Military Command Gov', ia: 'Internal Affairs',
          ia_asst: 'Internal Affairs Assistant', gov: 'Basic Gov', member: 'Member',
        };
        const GOV_DEPT_EMOJI: Record<string, string> = {
          leader: '👑', '2ic': '🥈', econ: '💰', econ_gov: '📊',
          milcom: '⚔️', milcom_gov: '🛡️', ia: '🤝', ia_asst: '📋', gov: '🏛️', member: '🧑‍🤝‍🧑',
        };
        const GOV_HIDDEN_FROM_EMBED = new Set(['gov', 'member']);
        const embed = new EmbedBuilder().setTitle('Government').setColor(0x5865F2);
        const guildRoles = new Map(guildRoleCollection.map((r) => [r.id, r]));
        let total = 0;
        for (const [key, label] of Object.entries(GOV_DEPT_LABELS)) {
          if (GOV_HIDDEN_FROM_EMBED.has(key)) continue;
          const rid = (cfg as Record<string, string | null>)[key];
          if (!rid) continue;
          const role = guildRoles.get(rid);
          if (!role) {
            embed.addFields({ name: `${GOV_DEPT_EMOJI[key] ?? ''} ${label}`, value: '*(role not found)*', inline: false });
            continue;
          }
          const membersWithRole = [...allGuildMembers.values()].filter(
            (m) => !m.user.bot && m.roles.cache.has(rid),
          );
          total += membersWithRole.length;
          const value = membersWithRole.length
            ? formatMentionsForEmbed(
              membersWithRole
                .sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()))
                .map((m) => m.id)
            )
            : '*(no members)*';
          embed.addFields({ name: `${GOV_DEPT_EMOJI[key] ?? ''} ${label} (${membersWithRole.length})`, value, inline: false });
        }
        embed.setFooter({ text: `${total} government member(s) total` });
        return void interaction.editReply({ embeds: [embed] });
      }
      if (commandName === 'verify_alliance_server') {
        if (!interaction.guildId || !interaction.guild) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['leader', '2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        if (!allianceId) return void interaction.editReply({ content: 'No primary alliance configured. Run `/admin_alliance_set` first.' });
        const info = await pnw.getAllianceById(allianceId);
        if (!info) return void interaction.editReply({ content: `Alliance ${allianceId} was not found via PnW API.` });
        const members = await pnw.getAllianceMembers([allianceId]);
        const leaderCandidates = members.filter((m) => {
          const pos = m.alliancePosition.toLowerCase();
          return pos.includes('leader') || pos.includes('heir');
        });
        if (!leaderCandidates.length) return void interaction.editReply({ content: 'Could not determine alliance leader/heir members from the API member list right now. Please try again shortly.' });
        const guildName = interaction.guild.name;
        const verificationCode = `BAR3-VERIFY-${interaction.guildId}-${Date.now().toString(36).toUpperCase()}`;
        pendingAllianceVerifications.set(interaction.guildId, {
          code: verificationCode,
          createdAt: Date.now(),
          createdBy: interaction.user.id,
        });
        pendingAllianceVerificationDispatch.set(interaction.guildId, {
          code: verificationCode,
          createdAt: Date.now(),
          createdBy: interaction.user.id,
          allianceId: info.allianceId,
          allianceName: info.name,
          guildName,
          leaders: leaderCandidates.map((leader) => ({ nationId: leader.nationId, leaderName: leader.leaderName })),
        });
        return void interaction.editReply({
          content:
            `Prepared alliance verification for ${leaderCandidates.length} leader target(s).\n` +
            'Click **Send verification code** to confirm and dispatch in-game messages to leaders.\n' +
            `After a leader sends you the code, click **Verify code** and paste it into the popup.`,
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId('verify_alliance_send_open_modal').setLabel('Send verification code').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('verify_alliance_open_modal').setLabel('Verify code').setStyle(ButtonStyle.Success),
            ),
          ],
        });
      }
      if (commandName === 'verify_alliance_server_confirm') {
        return void interaction.reply({ content: 'Use `/verify_alliance_server` and click the **Verify code** button to open the code input popup.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'counter_request_channel_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (interaction.commandName === 'chanel_set') {
          if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        } else if (!await hasGovAccess(interaction, db, ['leader', '2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const verified = await db.isAllianceVerified(BigInt(interaction.guildId));
        if (!verified) return void interaction.reply({ content: 'This guild is not alliance-verified yet. Complete `/verify_alliance_server` first.', flags: MessageFlags.Ephemeral });
        const ch = interaction.options.getChannel('channel');
        if (!ch) return void interaction.reply({ content: 'Please provide a channel when using action `set`.', flags: MessageFlags.Ephemeral });
        await db.setCounterRequestChannel(BigInt(interaction.guildId), ch.id);
        return void interaction.reply({ content: `Counter request channel set to <#${ch.id}>.`, flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'counter_request_channel_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (interaction.commandName === 'chanel_set' && !hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const ch = await db.getCounterRequestChannel(BigInt(interaction.guildId));
        return void interaction.reply({ content: ch ? `Counter request channel: <#${ch}>` : 'No counter request channel configured.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'counter_request_channel_clear') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (interaction.commandName === 'chanel_set') {
          if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        } else if (!await hasGovAccess(interaction, db, ['leader', '2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        await db.setCounterRequestChannel(BigInt(interaction.guildId), null);
        return void interaction.reply({ content: 'Counter request channel cleared.', flags: MessageFlags.Ephemeral });
      }

      if (commandName === 'roles_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const roles = await db.getGovRoles(BigInt(interaction.guildId));
        const text = Object.entries(roles).map(([k,v]) => `• ${k}: ${v ? `<@&${v}>` : 'not set'}`).join('\n');
        return void interaction.reply({ embeds: [new EmbedBuilder().setTitle('Configured gov roles').setDescription(text)] , flags: MessageFlags.Ephemeral});
      }
      if (commandName === 'setup_grant_channel') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (interaction.commandName === 'chanel_set') {
          if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        } else {
          if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
          if (!await hasGovAccess(interaction, db, ['econ','econ_gov','ia','ia_asst'])) return void interaction.reply({ content: 'You need Economics or Internal Affairs gov access to use this command.', flags: MessageFlags.Ephemeral });
        }
        const ch = interaction.options.getChannel('channel');
        if (!ch) return void interaction.reply({ content: 'Please provide a channel when using action `set`.', flags: MessageFlags.Ephemeral });
        await db.setGrantChannel(BigInt(interaction.guildId), ch.id);
        return void interaction.reply({ content: `Grant channel set to <#${ch.id}>.` });
      }
      if (commandName === 'setup_grant_channel_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (interaction.commandName === 'chanel_set') {
          if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        } else {
          if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
          if (!await hasGovAccess(interaction, db, ['econ','econ_gov','ia','ia_asst'])) return void interaction.reply({ content: 'You need Economics or Internal Affairs gov access to use this command.', flags: MessageFlags.Ephemeral });
        }
        const channelId = await db.getGrantChannel(BigInt(interaction.guildId));
        return void interaction.reply({ content: channelId ? `Grant channel is <#${channelId}>.` : 'Grant channel is not configured.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'setup_grant_channel_clear') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (interaction.commandName === 'chanel_set') {
          if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        } else {
          if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
          if (!await hasGovAccess(interaction, db, ['econ','econ_gov','ia','ia_asst'])) return void interaction.reply({ content: 'You need Economics or Internal Affairs gov access to use this command.', flags: MessageFlags.Ephemeral });
        }
        await db.setGrantChannel(BigInt(interaction.guildId), null);
        return void interaction.reply({ content: 'Grant channel cleared.', flags: MessageFlags.Ephemeral });
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

      if (commandName === 'banking_set_api_keys') {
        if (!ADMIN_DISCORD_IDS.has(BigInt(interaction.user.id))) {
          return void interaction.reply({ content: 'Only ADMIN_DISCORD_IDS may set banking API keys.', flags: MessageFlags.Ephemeral });
        }
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const allianceBankApiKey = interaction.options.getString('alliance_bank_api_key', true).trim();
        const offshoreApiKey = interaction.options.getString('offshore_api_key', true).trim();
        if (!allianceBankApiKey || !offshoreApiKey) {
          return void interaction.reply({ content: 'Both API keys are required.', flags: MessageFlags.Ephemeral });
        }
        await banking.setApiKeyRefs(interaction.guildId, allianceBankApiKey, offshoreApiKey);
        void reconcileBankDepositListeners();
        void reconcileOffshoreDepositListeners();
        return void interaction.reply({ content: 'Banking API keys updated for this guild.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'banking_set_offshore') {
        if (!ADMIN_DISCORD_IDS.has(BigInt(interaction.user.id))) {
          return void interaction.reply({ content: 'Only ADMIN_DISCORD_IDS may set the global offshore alliance ID.', flags: MessageFlags.Ephemeral });
        }
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const allianceId = interaction.options.getInteger('alliance_id', true);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await banking.setOffshoreAllianceId(allianceId, interaction.guildId, interaction.user.id);
        void reconcileBankDepositListeners();
        void reconcileOffshoreDepositListeners();
        const migrationLine = result.migrated && result.resources
          ? `\nMigrated existing offshore holdings to the new offshore:\n${formatResourceSummary(result.resources)}`
          : '';
        return void interaction.followUp({ content: `Global offshore alliance ID set to **${result.offshoreAllianceId}**.${migrationLine}`, flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'banking_show_offshore') {
        const allianceId = await banking.getOffshoreAllianceId();
        return void interaction.reply({ content: allianceId ? `Global offshore alliance ID: **${allianceId}**.` : 'Global offshore alliance ID is not configured.', flags: MessageFlags.Ephemeral });
      }

      if (commandName === 'banking_balance') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        const registration = await db.getByDiscordId(BigInt(interaction.user.id));
        if (!registration) return void interaction.reply({ content: 'You do not have a registered nation.', flags: MessageFlags.Ephemeral });
        const view = await banking.getMemberVisibility(interaction.guildId, registration.nation_id);
        const hasBalance = hasAnyPositiveBalance(view.nationBalance);
        let nationFlag: string | null = null;
        try {
          const nation = await pnw.getNation(registration.nation_id);
          nationFlag = nation?.flag || null;
        } catch { /* fall back to Discord avatar below */ }
        const embed = new EmbedBuilder()
          .setTitle('💳 Deposit Balance')
          .setDescription(`Offshored deposit balance for nation **${registration.nation_id}**`)
          .setColor(hasBalance ? 0x2ECC71 : 0x99AAB5)
          .setThumbnail(nationFlag || interaction.user.displayAvatarURL())
          .setTimestamp(new Date())
          .addFields(buildResourceFields(view.nationBalance));
        if (view.lastActivity) {
          embed.addFields({
            name: 'Latest activity',
            value: `${view.lastActivity.type} • ${view.lastActivity.status} • ${view.lastActivity.updated_at}`,
            inline: false,
          });
        }
        embed.setFooter({ text: 'Bar3 Banking' });
        return void interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'banking_alliance_balance') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['leader', '2ic'])) {
          return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        }
        const pool = await banking.getAlliancePoolVisibility(interaction.guildId);
        const hasBalance = hasAnyPositiveBalance(pool);
        const embed = new EmbedBuilder()
          .setTitle('🏦 Alliance-Held Balance')
          .setDescription('Alliance-held/unregistered deposit balance')
          .setColor(hasBalance ? 0x2ECC71 : 0x99AAB5)
          .setTimestamp(new Date())
          .setFooter({ text: 'Bar3 Banking' })
          .addFields(buildResourceFields(pool));
        return void interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'banking_user_balances') {
        if (!ADMIN_DISCORD_IDS.has(BigInt(interaction.user.id))) {
          return void interaction.reply({ content: 'Only ADMIN_DISCORD_IDS may view every user balance.', flags: MessageFlags.Ephemeral });
        }
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const rows = await banking.getAllNationBalances(interaction.guildId);
        const tracked = rows.filter((row) => hasAnyPositiveBalance(row.balances));
        const shown = tracked.slice(0, 40);
        const lines = shown.map((row) => {
          const owner = row.registration ? `<@${row.registration.discord_id}>` : 'unregistered';
          return `• **Nation ${row.nation_id}** (${owner}) — ${summarizeBalanceLine(row.balances)}`;
        });
        const embed = new EmbedBuilder()
          .setTitle('📊 Tracked Nation Balances')
          .setColor(0x2ECC71)
          .setDescription(lines.length ? lines.join('\n') : '*No tracked nation balances.*')
          .setTimestamp(new Date())
          .setFooter({
            text: tracked.length > shown.length
              ? `Showing ${shown.length} of ${tracked.length} nation(s) with a balance`
              : `${tracked.length} nation(s) with a balance`,
          });
        return void interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'banking_manual_offshore') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['econ', 'econ_gov', 'leader', '2ic'])) {
          return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        }
        const enabled = await banking.getBankingEnabled(interaction.guildId);
        if (!enabled) return void interaction.reply({ content: 'Banking is currently disabled.', flags: MessageFlags.Ephemeral });
        const resources = getResourceOptionsFromInteraction(interaction);
        if (!hasPositiveResourceInput(resources)) {
          return void interaction.reply({ content: 'Provide at least one resource amount greater than zero.', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const note = interaction.options.getString('note');
        const sent = await banking.manualSendToOffshore(
          interaction.guildId,
          resources,
          interaction.user.id,
          note
        );
        if (!sent.ok) {
          return void interaction.followUp({ content: `Manual offshore send failed: ${sent.error}`, flags: MessageFlags.Ephemeral });
        }
        return void interaction.followUp({
          content:
            `Manual offshore transfer sent.\nResources:\n${formatResourceSummary(resources)}\n\n` +
            `Alliance pool (unassigned):\n${formatResourceSummary(sent.pool)}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      if (commandName === 'banking_alliance_pool_withdraw') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        if (!await hasGovAccess(interaction, db, ['econ', 'econ_gov', 'leader', '2ic'])) {
          return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        }
        const enabled = await banking.getBankingEnabled(interaction.guildId);
        if (!enabled) return void interaction.reply({ content: 'Banking is currently disabled.', flags: MessageFlags.Ephemeral });
        const destinationNationId = interaction.options.getInteger('nation_id', true);
        const resources = getResourceOptionsFromInteraction(interaction);
        if (!hasPositiveResourceInput(resources)) {
          return void interaction.reply({ content: 'Provide at least one resource amount greater than zero.', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await banking.withdrawFromAlliancePool(
          interaction.guildId,
          resources,
          interaction.user.id,
          destinationNationId
        );
        if (!result.ok) {
          return void interaction.followUp({ content: `Withdrawal failed: ${result.error}`, flags: MessageFlags.Ephemeral });
        }
        return void interaction.followUp({
          content:
            `Withdrew from the alliance pool to nation **${destinationNationId}**.\nRequested:\n${formatResourceSummary(resources)}\n\n` +
            `Remaining alliance pool:\n${formatResourceSummary(result.remaining)}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      if (commandName === 'banking_withdraw') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        const enabled = await banking.getBankingEnabled(interaction.guildId);
        if (!enabled) return void interaction.reply({ content: 'Banking is currently disabled.', flags: MessageFlags.Ephemeral });
        const registration = await db.getByDiscordId(BigInt(interaction.user.id));
        if (!registration) {
          return void interaction.reply({ content: 'You must register your nation before using withdrawals.', flags: MessageFlags.Ephemeral });
        }
        const resources = getResourceOptionsFromInteraction(interaction);
        if (!hasPositiveResourceInput(resources)) {
          return void interaction.reply({ content: 'Provide at least one resource amount greater than zero.', flags: MessageFlags.Ephemeral });
        }
        const destinationNationId = interaction.options.getInteger('nation_id');
        if (destinationNationId != null && destinationNationId <= 0) {
          return void interaction.reply({ content: 'nation_id must be a positive integer.', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await banking.withdrawToNation(
          interaction.guildId,
          registration.nation_id,
          resources,
          interaction.user.id,
          destinationNationId
        );
        if (!result.ok) {
          return void interaction.followUp({ content: `Withdrawal failed: ${result.error}`, flags: MessageFlags.Ephemeral });
        }
        const recipientNationId = destinationNationId ?? registration.nation_id;
        return void interaction.followUp({
          content:
            (recipientNationId === registration.nation_id
              ? `Withdrawal completed for nation **${registration.nation_id}**.\n`
              : `Withdrawal completed from your balance (nation **${registration.nation_id}**), sent to nation **${recipientNationId}**.\n`) +
            `Requested:\n${formatResourceSummary(resources)}\n\n` +
            `Remaining balance:\n${formatResourceSummary(result.remaining)}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (commandName === 'banking_transfer') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!await hasMemberAccess(interaction, db)) return void interaction.reply({ content: 'You need the Member role to use this command.', flags: MessageFlags.Ephemeral });
        const enabled = await banking.getBankingEnabled(interaction.guildId);
        if (!enabled) return void interaction.reply({ content: 'Banking is currently disabled.', flags: MessageFlags.Ephemeral });
        const registration = await db.getByDiscordId(BigInt(interaction.user.id));
        if (!registration) {
          return void interaction.reply({ content: 'You must register your nation before using transfers.', flags: MessageFlags.Ephemeral });
        }
        const destinationNationId = interaction.options.getInteger('nation_id', true);
        if (destinationNationId === registration.nation_id) {
          return void interaction.reply({ content: 'You cannot transfer to your own tracked balance.', flags: MessageFlags.Ephemeral });
        }
        const resources = getResourceOptionsFromInteraction(interaction);
        if (!hasPositiveResourceInput(resources)) {
          return void interaction.reply({ content: 'Provide at least one resource amount greater than zero.', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await banking.transferToNation(
          interaction.guildId,
          registration.nation_id,
          destinationNationId,
          resources,
          interaction.user.id
        );
        if (!result.ok) {
          return void interaction.followUp({ content: `Transfer failed: ${result.error}`, flags: MessageFlags.Ephemeral });
        }
        return void interaction.followUp({
          content:
            `Transferred tracked balance from nation **${registration.nation_id}** to nation **${destinationNationId}** (internal only, no PnW transfer sent).\n` +
            `Sent:\n${formatResourceSummary(resources)}\n\n` +
            `Your remaining balance:\n${formatResourceSummary(result.remaining)}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (commandName === 'admin_alliance_set') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const guildId = BigInt(interaction.guildId);
        const show = interaction.options.getBoolean('show') ?? false;
        const allianceId = interaction.options.getInteger('alliance_id')
          ?? Number.parseInt((interaction.options.getString('value') ?? '').trim(), 10);
        if (!Number.isInteger(allianceId) || allianceId <= 0) {
          return void interaction.reply({ content: 'Alliance ID must be a positive integer.', flags: MessageFlags.Ephemeral });
        }
        const previousAllianceId = await db.getAllianceId(guildId);
        await db.setAllianceId(guildId, allianceId);
        if (previousAllianceId !== allianceId) {
          await db.markAllianceVerified(guildId, null);
          return void interaction.reply({ content: `Primary alliance set.${show ? ` Value: ${allianceId}.` : ''} Alliance verification has been reset; run \`/verify_alliance_server\` again.` });
        }
        return void interaction.reply({ content: `Primary alliance set.${show ? ` Value: ${allianceId}.` : ''}` });
      }
      if (commandName === 'admin_alliance_show') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        const allianceId = await db.getAllianceId(BigInt(interaction.guildId));
        return void interaction.reply({ content: allianceId ? `Primary alliance: ${allianceId}` : 'No primary alliance configured.', flags: MessageFlags.Ephemeral });
      }
      if (commandName === 'admin_api_key_set') {
        if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const show = interaction.options.getBoolean('show') ?? false;
        const apiKey = (interaction.options.getString('api_key') ?? interaction.options.getString('value') ?? '').trim();
        if (apiKey.length === 0) return void interaction.reply({ content: 'API key cannot be empty.', flags: MessageFlags.Ephemeral });
        await db.setPnwApiKey(apiKey);
        pnw.apiKey = apiKey;
        return void interaction.reply({ content: `PnW API key updated successfully.${show ? ` Value: \`${apiKey}\`.` : ''}`, flags: MessageFlags.Ephemeral });
      }



      if (commandName === 'alliance_lots_of_info' || commandName === 'test_alliance_lots_of_info') {
        await interaction.deferReply();
        const query = interaction.options.getString('query', true).trim();
        const useTestApi = commandName === 'test_alliance_lots_of_info';
        const apiClient = useTestApi ? new PnWClient(PNW_TEST_API_KEY, { restUrl: PNW_TEST_REST_URL }) : pnw;
        const baseUrl = useTestApi ? PNW_TEST_BASE_URL : PNW_BASE_URL;
        let alliance: AllianceInfo | null;
        let lotsMembers: Nation[];
        try {
          alliance = /^\d+$/.test(query)
            ? await apiClient.getAllianceById(parseInt(query, 10))
            : await apiClient.getAllianceByName(query);
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
        const firstHistoryPoint = historyChartPoints[0];
        const lastHistoryPoint = historyChartPoints[historyChartPoints.length - 1];
        const historyRangeNote = firstHistoryPoint && lastHistoryPoint
          ? `\nGraph shows full interior date range (${firstHistoryPoint.fetchDate} to ${lastHistoryPoint.fetchDate}) with missing dates included as empty points.`
          : '';
        const scoreDevEmbed = new EmbedBuilder()
          .setTitle(`${alliance.name} — Score History`)
          .setURL(allianceUrl(alliance.allianceId, baseUrl))
          .setDescription(`${renderAllianceScoreHistoryTable(historyPoints)}${historyRangeNote}`)
          .setColor(0x0F766E)
          .setFooter({ text: 'Page 3 · Alliance score history' });
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
        if (interaction.commandName === 'chanel_set') {
          if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        } else if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const ch = interaction.options.getChannel('channel');
        if (!ch) return void interaction.reply({ content: 'Please provide a channel when using action `set`.', flags: MessageFlags.Ephemeral });
        await db.setWelcomeConfig(BigInt(interaction.guildId), { channelId: ch.id });
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
        if (interaction.commandName === 'chanel_set' && !hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const cfg = await db.getWelcomeConfig(BigInt(interaction.guildId));
        return void interaction.reply({
          embeds: [new EmbedBuilder().setTitle('Welcome config').setDescription(`Enabled: **${cfg.enabled ? 'yes' : 'no'}**
Channel: ${cfg.channel_id ? `<#${cfg.channel_id}>` : 'not set'}
Message: ${cfg.message}`)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (commandName === 'setup_welcome_channel_clear') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (interaction.commandName === 'chanel_set') {
          if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        } else if (!await hasGovAccess(interaction, db, ['ia','leader','2ic'])) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        await db.setWelcomeConfig(BigInt(interaction.guildId), { channelId: null });
        return void interaction.reply({ content: 'Welcome channel cleared.', flags: MessageFlags.Ephemeral });
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
        const urbanization = interaction.options.getBoolean('urbanization') ?? false;
        const centerForCivilEngineering = interaction.options.getBoolean('center_for_civil_engineering') ?? false;
        const advancedEngineeringCorps = interaction.options.getBoolean('advanced_engineering_corps') ?? false;
        const governmentSupportAgency = interaction.options.getBoolean('government_support_agency') ?? false;
        const bureauOfDomesticAffairs = interaction.options.getBoolean('bureau_domestic_affairs') ?? false;
        if (to <= from) return void interaction.reply({ content: 'Target infra must be greater than current infra.', flags: MessageFlags.Ephemeral });
        if (from < 0 || to > 20_000) return void interaction.reply({ content: 'Infrastructure values must be between 0 and 20,000.', flags: MessageFlags.Ephemeral });
        if (cities < 1) return void interaction.reply({ content: 'Number of cities must be at least 1.', flags: MessageFlags.Ephemeral });
        const baseCostPerCity = calculateInfraCost(from, to);
        let discount = 0.0;
        const discountParts: string[] = [];
        if (urbanization) {
          discount += 0.05;
          discountParts.push('Urbanization (−5%)');
          if (governmentSupportAgency) { discount += 0.025; discountParts.push('Government Support Agency (−2.5%)'); }
          if (bureauOfDomesticAffairs) { discount += 0.0125; discountParts.push('Bureau of Domestic Affairs (−1.25%)'); }
        }
        if (centerForCivilEngineering) { discount += 0.05; discountParts.push('Center for Civil Engineering (−5%)'); }
        if (advancedEngineeringCorps) { discount += 0.05; discountParts.push('Advanced Engineering Corps (−5%)'); }
        const discountedCostPerCity = calculateInfraCost(from, to, {
          urbanization,
          centerForCivilEngineering,
          advancedEngineeringCorps,
          governmentSupportAgency,
          bureauOfDomesticAffairs,
        });
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
      if (commandName === 'loot') {
        await interaction.deferReply();
        const days = interaction.options.getInteger('days', true);
        const rawNation = interaction.options.getString('nation', true).trim();
        const nation = await resolveNationQuery(interaction, db, pnw, rawNation);
        if (!nation) {
          const safeNation = rawNation.replace(/`/g, 'ʼ');
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`ℹ️ No nation found for \`${safeNation}\`.`).setColor(0x3498DB)] });
        }

        let loot;
        try {
          loot = await pnw.getNationWarLoot(nation.nationId, days);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return void interaction.followUp({ embeds: [new EmbedBuilder().setDescription(`❌ Could not fetch war loot from the Politics and War API: ${msg}`).setColor(0xE74C3C)] });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🏴‍☠️ War Loot — ${nation.nationName}`)
          .setURL(nationUrl(nation.nationId))
          .setColor(0xF39C12)
          .setDescription(`Wars opened since <t:${Math.floor(loot.since.getTime() / 1000)}:d> (${loot.days} day${loot.days === 1 ? '' : 's'}).`);
        embed.addFields(
          { name: 'Wars Checked', value: loot.warsChecked.toLocaleString(), inline: true },
          { name: 'Loot Attacks', value: loot.lootAttacks.toLocaleString(), inline: true },
          { name: 'Victory Attacks', value: loot.victoryAttacks.toLocaleString(), inline: true },
          { name: 'All Loot', value: formatLootResourceLines(loot.total), inline: false },
          { name: 'Loot Won by Nation', value: formatLootResourceLines(loot.gained), inline: true },
          { name: 'Loot Taken by Opponents', value: formatLootResourceLines(loot.lost), inline: true },
        );
        const recent = loot.entries.slice(0, 10).map((entry) => {
          const perspective = entry.looterId === nation.nationId ? 'won' : entry.victimId === nation.nationId ? 'lost' : 'other';
          const marker = perspective === 'won' ? '✅' : perspective === 'lost' ? '❌' : '•';
          const action = entry.attackType === 'VICTORY' ? 'victory looted' : 'ground looted';
          return `${marker} [#${entry.warId}](${warUrl(entry.warId)}) ${entry.looterName} ${action} ${entry.victimName}: ${compactLootSummary(entry.resources)}`;
        });
        embed.addFields({ name: 'Recent Loot Attacks', value: recent.length ? recent.join('\n').slice(0, 1024) : '*None found.*', inline: false });
        embed.setFooter({ text: 'Loot is summed from GROUND and VICTORY attacks in wars involving this nation; raw resources depend on API loot fields and loot_info availability.' });
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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (interaction.guildId) {
          const summary = await syncSlashCommands(rest, appId, interaction.guildId);
          return void interaction.editReply(
            `Guild commands synced (${summary.count}). verify=${summary.hasVerify ? 'present' : 'missing'}, verify_alliance_server=${summary.hasVerifyAllianceServer ? 'present' : 'missing'}.`
          );
        }
        const summary = await syncSlashCommands(rest, appId);
        return void interaction.editReply(
          `Global commands synced (${summary.count}). verify=${summary.hasVerify ? 'present' : 'missing'}, verify_alliance_server=${summary.hasVerifyAllianceServer ? 'present' : 'missing'}.`
        );
      }
      if (commandName === 'admin_clear_guild_commands') {
        if (!interaction.guildId) return void interaction.reply({ content: 'Guild only command.', flags: MessageFlags.Ephemeral });
        if (!hasAdminCommandAccess(interaction)) return void interaction.reply({ content: 'Missing permissions.', flags: MessageFlags.Ephemeral });
        const appId = client.application?.id;
        if (!appId) return void interaction.reply({ content: 'Application not ready.', flags: MessageFlags.Ephemeral });
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        await rest.put(Routes.applicationGuildCommands(appId, interaction.guildId), { body: [] });
        return void interaction.reply({ content: 'Cleared guild commands for this server.', flags: MessageFlags.Ephemeral });
      }

      if (commandName === 'help') {
        const sections = renderCommandHelpSections();
        const embeds = sections.map(({ category, body }, idx) =>
          new EmbedBuilder()
            .setTitle(idx === 0 ? `flame_bot commands — ${category.toUpperCase()}` : `flame_bot commands (continued) — ${category.toUpperCase()}`)
            .setDescription(body)
            .setColor(0x5865F2)
        );
        return void interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
      }
      const territorialResult = await handleTerritorialCommand(interaction, db);
      if (territorialResult) return;


      
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
  const memberCounterRequestsByDiscordId = new Map<string, Array<{
    warId: number;
    requestedAt: string;
    defenderNationId: number;
    defenderDiscordId: string;
  }>>();
  const DISCORD_ID_PATTERN = /^\d+$/;
  const NATIVE_MEMBER_SELECTOR_PATTERN = /^pnw:(\d+)$/;
  const resolveRegistrationByMemberSelector = async (memberSelector: string) => {
    const nativeMatch = NATIVE_MEMBER_SELECTOR_PATTERN.exec(memberSelector);
    if (nativeMatch) return db.getByNationId(Number(nativeMatch[1]));
    if (!DISCORD_ID_PATTERN.test(memberSelector)) return null;
    return db.getByDiscordId(BigInt(memberSelector));
  };
  if (API_KEY) {
    const app = createApp({
      guildGetter: () => getPrimaryGuild(client),
      apiKey: API_KEY,
      db,
      roleConfig: {
        verifiedRoleId: VERIFIED_ROLE_ID,
        bar3ClientRoleId: BAR3_CLIENT_ROLE_ID,
        bar3ServerRoleId: BAR3_SERVER_ROLE_ID,
        memberGuildId: MEMBER_GUILD_ID,
        memberRoleId: MEMBER_ROLE_ID,
      },
      guildByIdGetter: (guildId: string) => client.guilds.cache.get(guildId) ?? null,
      guildsGetter: () => [...client.guilds.cache.values()],
      sendToWelcomeFn: sendToAllWelcomeChannels,
      commandUsageGetter: () => Object.fromEntries(commandUsage.entries()),
      adminIds: ADMIN_DISCORD_IDS,
      bankingEnabledGetter: async () => {
        const enabledByGuild: Record<string, boolean> = {};
        for (const guild of client.guilds.cache.values()) {
          enabledByGuild[guild.id] = await banking.getBankingEnabled(guild.id);
        }
        return { enabledByGuild };
      },
      bankingEnabledSetter: async (enabled: boolean) => {
        const enabledByGuild: Record<string, boolean> = {};
        for (const guild of client.guilds.cache.values()) {
          enabledByGuild[guild.id] = await banking.setBankingEnabled(guild.id, enabled);
        }
        void reconcileBankDepositListeners();
        void reconcileOffshoreDepositListeners();
        return { enabledByGuild };
      },
      memberNationContextGetter: async (discordIdStr: string) => {
        const emptyContext = {
          registered: false,
          nation: null,
          alliance: null,
          activeDefensiveWars: [],
          nationDefensiveWars: [],
          counterRequests: [],
          banking: undefined,
        };
        const registration = await resolveRegistrationByMemberSelector(discordIdStr);
        if (!registration) return emptyContext;

        let nation: Nation | null = null;
        try {
          nation = await pnw.getNation(registration.nation_id);
        } catch {
          nation = null;
        }
        if (!nation) {
          return { ...emptyContext, registered: true };
        }

        let alliance: AllianceInfo | null = null;
        if (nation.allianceId > 0) {
          try {
            alliance = await pnw.getAllianceById(nation.allianceId);
          } catch {
            alliance = null;
          }
        }

        let activeDefensiveWars: WarDetail[] = [];
        if (nation.allianceId > 0) {
          try {
            activeDefensiveWars = await pnw.getActiveDefensiveWarsForAlliance(nation.allianceId);
          } catch {
            activeDefensiveWars = [];
          }
        }
        const activeWarIds = new Set(activeDefensiveWars.map((war) => war.warId));
        const counterRequests = (memberCounterRequestsByDiscordId.get(discordIdStr) ?? [])
          .filter((request) => activeWarIds.has(request.warId))
          .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
        const counterRequestedAtByWarId = new Map(counterRequests.map((request) => [request.warId, request.requestedAt]));
        const memberGuildId = getPrimaryGuild(client)?.id ?? null;
        const bankingVisibility = memberGuildId
          ? await banking.getMemberVisibility(memberGuildId, nation.nationId).catch(() => null)
          : null;

        const nationDefensiveWars = activeDefensiveWars
          .filter((war) => war.defenderId === nation!.nationId)
          .map((war) => ({
            warId: war.warId,
            date: war.date.toISOString(),
            reason: war.warType,
            attackerId: war.attackerId,
            attackerName: war.attackerName,
            attackerCities: war.attackerCities,
            attackerUnits: {
              soldiers: war.attackerSoldiers,
              tanks: war.attackerTanks,
              aircraft: war.attackerAircraft,
              ships: war.attackerShips,
              missiles: war.attackerMissiles,
              nukes: war.attackerNukes,
            },
            url: warUrl(war.warId),
          }));

        return {
          registered: true,
          nation: {
            nationId: nation.nationId,
            nationName: nation.nationName,
            leaderName: nation.leaderName,
            numCities: nation.numCities,
            score: nation.score,
            allianceId: nation.allianceId,
            allianceName: nation.allianceName,
            alliancePosition: nation.alliancePosition,
            url: nationUrl(nation.nationId),
          },
          alliance: alliance ? {
            allianceId: alliance.allianceId,
            name: alliance.name,
            acronym: alliance.acronym,
            rank: alliance.rank,
            score: alliance.score,
            averageScore: alliance.averageScore,
            numMembers: alliance.numMembers,
            totalCities: alliance.totalCities,
            url: allianceUrl(alliance.allianceId),
          } : null,
          activeDefensiveWars: activeDefensiveWars.map((war) => ({
            warId: war.warId,
            date: war.date.toISOString(),
            warType: war.warType,
            attackerId: war.attackerId,
            attackerName: war.attackerName,
            attackerAllianceId: war.attackerAllianceId,
            attackerAllianceName: war.attackerAllianceName,
            defenderId: war.defenderId,
            defenderName: war.defenderName,
            defenderAllianceId: war.defenderAllianceId,
            defenderAllianceName: war.defenderAllianceName,
            url: warUrl(war.warId),
            counterRequested: counterRequestedAtByWarId.has(war.warId),
            counterRequestedAt: counterRequestedAtByWarId.get(war.warId) ?? null,
          })),
          nationDefensiveWars,
          counterRequests,
          banking: bankingVisibility ? {
            nationBalance: bankingVisibility.nationBalance,
            alliancePool: bankingVisibility.alliancePool,
            lastActivity: bankingVisibility.lastActivity ? {
              ledgerId: bankingVisibility.lastActivity.ledger_id,
              type: bankingVisibility.lastActivity.type,
              status: bankingVisibility.lastActivity.status,
              createdAt: bankingVisibility.lastActivity.created_at,
              updatedAt: bankingVisibility.lastActivity.updated_at,
              error: bankingVisibility.lastActivity.error,
            } : null,
          } : undefined,
        };
      },
      memberNationCounterRequestHandler: async (discordIdStr: string, warId: number) => {
        const registration = await resolveRegistrationByMemberSelector(discordIdStr);
        if (!registration) return { ok: false as const, status: 404, error: 'No nation registration found for the provided member identifier.' };
        const nation = await pnw.getNation(registration.nation_id);
        if (!nation || !nation.allianceId) return { ok: false as const, status: 404, error: 'Nation or alliance not found.' };
        const targets = await db.getVerifiedGuildCounterChannelsByAlliance(nation.allianceId);
        if (!targets.length) return { ok: false as const, status: 404, error: 'No verified guild counter channel configured for this alliance.' };
        const requestedAt = new Date().toISOString();
        const counterRequestEmbed = new EmbedBuilder()
          .setTitle('🚨 Counter request received from Bar3')
          .setColor(0xE74C3C)
          .addFields(
            { name: 'Alliance', value: `**${nation.allianceName || nation.allianceId}** (\`${nation.allianceId}\`)`, inline: false },
            { name: 'Defender', value: `**${nation.nationName}** (${nationUrl(nation.nationId)})`, inline: false },
            { name: 'War', value: `[#${warId}](${warUrl(warId)})`, inline: false },
            { name: 'Requested at', value: requestedAt, inline: false },
          );
        for (const target of targets) {
          const guild = client.guilds.cache.get(target.guildId);
          const channel = guild?.channels?.cache?.get(target.channelId);
          if (!channel || !('send' in channel)) continue;
          try { await (channel as TextChannel).send({ embeds: [counterRequestEmbed] }); } catch { /**/ }
        }
        const existing = memberCounterRequestsByDiscordId.get(discordIdStr) ?? [];
        const withoutWar = existing.filter((request) => request.warId !== warId);
        memberCounterRequestsByDiscordId.set(discordIdStr, [{
          warId,
          requestedAt,
          defenderNationId: nation.nationId,
          defenderDiscordId: discordIdStr,
        }, ...withoutWar]);
        return { ok: true as const, warId, requestedAt };
      },
      memberNationWithdrawHandler: async (discordIdStr: string, resources: Record<string, number>, destinationNationId: number | null) => {
        const registration = await resolveRegistrationByMemberSelector(discordIdStr);
        if (!registration) return { ok: false as const, status: 404, error: 'No nation registration found for the provided member identifier.' };
        const memberGuildId = getPrimaryGuild(client)?.id ?? null;
        if (!memberGuildId) return { ok: false as const, status: 503, error: 'Bot is not in a configured guild.' };
        const result = await banking.withdrawToNation(memberGuildId, registration.nation_id, resources, discordIdStr, destinationNationId);
        if (!result.ok) return { ok: false as const, status: 400, error: result.error };
        return { ok: true as const, remaining: result.remaining };
      },
      allianceBankPoolWithdrawHandler: async (resources: Record<string, number>, destinationNationId: number, actorDiscordId: string) => {
        const memberGuildId = getPrimaryGuild(client)?.id ?? null;
        if (!memberGuildId) return { ok: false as const, status: 503, error: 'Bot is not in a configured guild.' };
        const result = await banking.withdrawFromAlliancePool(memberGuildId, resources, actorDiscordId, destinationNationId);
        if (!result.ok) return { ok: false as const, status: 400, error: result.error };
        return { ok: true as const, remaining: result.remaining };
      },
        winlogSecret: WINLOG_POST_SECRET,
        winlogHandler: (payload) => handleWinlogPayload(client, db, payload),
    });
    httpServer = createServer(app);
    httpServer.listen(API_PORT, () => logInfo(`API listening on :${API_PORT}`));
  }
    process.on('unhandledRejection', (reason, promise) => {
    console.error('[unhandledRejection]', reason);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('[uncaughtException]', error);
  });
  
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    console.error('[uncaughtExceptionMonitor]', origin, error);
  });
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
  const warLoopTask = (async () => {
    for await (const war of warSubClient.iterWarCreates()) {
      if (warLoopStopped) break;
      try {
        const fullWar = await enrichWarFromApi(war);
        const subs = await db.getAllWarAlertSubscriptions();
        for (const sub of subs) {
          const allianceId = await db.getAllianceId(BigInt(sub.guild_id));
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
    if (bankSyncTimer) {
      clearInterval(bankSyncTimer);
      bankSyncTimer = null;
    }
    if (bankDepositListenerTimer) {
      clearInterval(bankDepositListenerTimer);
      bankDepositListenerTimer = null;
    }
    const bankDepositTasks = [...bankDepositListeners.values()].map((listener) => listener.task);
    for (const guildId of [...bankDepositListeners.keys()]) stopBankDepositListener(guildId);
    warLoopStopped = true;
    recruiterLoopStopped = true;
    await db.close();
    await Promise.race([warLoopTask, new Promise((r) => setTimeout(r, 1500))]);
    await Promise.race([recruiterLoopTask, new Promise((r) => setTimeout(r, 1500))]);
    await Promise.race([Promise.allSettled(bankDepositTasks), new Promise((r) => setTimeout(r, 1500))]);
    client.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

void main();
