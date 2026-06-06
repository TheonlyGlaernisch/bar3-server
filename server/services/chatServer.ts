/**
 * WebSocket chat server for alliance members.
 */
import * as http from 'http';
import * as ws from 'ws';
import { SessionData } from 'express-session';
import { SessionStore } from '../interfaces/chatServer';
import mongoose from 'mongoose';
import superagent from 'superagent';
import cookie from 'cookie';
import signature from 'cookie-signature';
import { ChatMessage } from '../interfaces/schemas/ChatMessageSchema';
import { PnwNativeAccount } from '../interfaces/schemas/PnwNativeAccountSchema';


const ADMIN_DISCORD_IDS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientInfo {
  username: string;
  isAdmin: boolean;   // ADD THIS
  joinedAt: Date;
  lastMessageAt: number;
  messageCount: number;
}

interface ChatPayload {
  type: 'message' | 'system';
  username?: string;
  isAdmin?: boolean;  // ADD THIS
  text: string;
  timestamp: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const clients = new Map<ws.WebSocket, ClientInfo>();
const MAX_CLIENTS = 50;
const MAX_MSG_LEN = 500;
const RATE_WINDOW_MS = 1000;
const RATE_MAX = 2;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const NATION_ALLIANCE_CACHE_MS = 5 * 60 * 1000;
const CHAT_UNAUTHENTICATED_CLOSE_CODE = 4001;
const CHAT_FORBIDDEN_CLOSE_CODE = 4003;

type RegistrationDoc = {
  nation_id?: number | string;
  discord_username?: string;
};

type RegisteredNation = {
  nationId: number;
  username: string;
};

type NationAllianceInfo = {
  allianceId: number | null;
  nationName?: string;
};

type NationAllianceCacheEntry = {
  expiresAt: number;
  info: NationAllianceInfo | null;
};

const nationAllianceCache = new Map<number, NationAllianceCacheEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function broadcast(message: ChatPayload): void {
  const payload = JSON.stringify(message);
  for (const [client] of clients) {
    if (client.readyState === ws.WebSocket.OPEN) {
      client.send(payload);
    }
  }

  // Persist — fire-and-forget, never blocks the live broadcast
  ChatMessage.create({
    username:  message.username ?? '',
    text:      message.text,
    type:      message.type,
    timestamp: new Date(message.timestamp),
  }).catch(() => undefined);
}

function isImageContent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('<img') ||
    lower.includes('data:image') ||
    /https?:\/\/\S+\.(png|jpg|jpeg|gif|webp|svg|bmp)/i.test(text)
  );
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function getTrackedAllianceId(): number | null {
  return parsePositiveInteger(process.env.COUNTER_TRACKED_ALLIANCE_ID);
}

function getPnwGraphqlApiKey(): string {
  return (process.env.PNW_API_KEY || process.env.PW_SCAN_API_KEY || '').trim();
}

function isChatUpgradePath(req: http.IncomingMessage): boolean {
  try {
    return new URL(req.url || '/', 'http://localhost').pathname === '/api/chat/ws';
  } catch {
    return false;
  }
}

function writeUpgradeError(socket: import('net').Socket, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\n\r\n`);
  socket.destroy();
}

function closeRejectedWebSocket(
  wss: ws.WebSocketServer,
  req: http.IncomingMessage,
  socket: import('net').Socket,
  head: Buffer,
  code: number,
  reason: string
): void {
  wss.handleUpgrade(req, socket, head, (client) => {
    client.close(code, reason);
  });
}

function getSignedSessionId(rawSid: string, secret: string): string | null {
  if (!rawSid.startsWith('s:')) return null;

  const unsigned = signature.unsign(rawSid.slice(2), secret);
  return unsigned === false || !unsigned ? null : unsigned;
}

async function resolveRegisteredNation(session: SessionData): Promise<RegisteredNation | null> {
  const nativeNationId = parsePositiveInteger(session.pnwNativeNationId);
  if (session.pnwNativeAuthenticated === true && nativeNationId) {
    const account = await PnwNativeAccount.findOne({ nationId: nativeNationId })
      .select({ username: 1, nationId: 1 })
      .lean()
      .exec();
    if (!account) return null;
    return {
      nationId: nativeNationId,
      username: typeof account.username === 'string' && account.username.trim()
        ? account.username
        : session.pnwNativeUsername || `Nation#${nativeNationId}`,
    };
  }

  const discordUserId = typeof session.discordUserId === 'string' ? session.discordUserId.trim() : '';
  const nativeSessionMatch = /^pnw:(\d+)$/.exec(discordUserId);
  if (session.pnwNativeAuthenticated === true && nativeSessionMatch?.[1]) {
    const nationId = parsePositiveInteger(nativeSessionMatch[1]);
    if (!nationId) return null;
    const account = await PnwNativeAccount.findOne({ nationId })
      .select({ username: 1, nationId: 1 })
      .lean()
      .exec();
    if (!account) return null;
    return {
      nationId,
      username: typeof account.username === 'string' && account.username.trim()
        ? account.username
        : `Nation#${nationId}`,
    };
  }

  if (!discordUserId) return null;

  const db = mongoose.connection.useDb('TRF', { useCache: true });
  const registration = await db.collection<RegistrationDoc>('registrations').findOne(
    { discord_id: discordUserId },
    { projection: { _id: 0, nation_id: 1, discord_username: 1 } }
  );
  const nationId = parsePositiveInteger(registration?.nation_id);
  if (!registration || !nationId) return null;

  return {
    nationId,
    username: registration.discord_username || session.discordUsername || `Nation#${nationId}`,
  };
}

async function fetchNationAllianceInfo(nationId: number): Promise<NationAllianceInfo | null> {
  const now = Date.now();
  const cached = nationAllianceCache.get(nationId);
  if (cached && cached.expiresAt > now) return cached.info;

  const apiKey = getPnwGraphqlApiKey();
  if (!apiKey) {
    nationAllianceCache.set(nationId, { expiresAt: now + NATION_ALLIANCE_CACHE_MS, info: null });
    return null;
  }

  const endpoint = (process.env.PW_GRAPHQL_URL || 'https://api.politicsandwar.com/graphql').trim();
  const query = `
    query NationAlliance($nationId: Int!) {
      nations(id: [$nationId], first: 1, page: 1) {
        data {
          id
          nation_name
          alliance_id
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
      .send({ query, variables: { nationId } })
      .ok(() => true)
      .timeout({ response: 4000, deadline: 6000 })
      .catch(() => undefined);

    const body = response?.body as Record<string, unknown> | undefined;
    const data = body?.data as Record<string, unknown> | undefined;
    const nationsContainer = data?.nations as Record<string, unknown> | undefined;
    const nations = nationsContainer?.data as Array<Record<string, unknown>> | undefined;
    const nation = Array.isArray(nations) ? nations[0] : undefined;
    const resolvedNationId = parsePositiveInteger(nation?.id);
    if (!nation || resolvedNationId !== nationId) continue;

    const info: NationAllianceInfo = {
      allianceId: parsePositiveInteger(nation.alliance_id),
      nationName: typeof nation.nation_name === 'string' ? nation.nation_name : undefined,
    };
    nationAllianceCache.set(nationId, { expiresAt: now + NATION_ALLIANCE_CACHE_MS, info });
    return info;
  }

  nationAllianceCache.set(nationId, { expiresAt: now + NATION_ALLIANCE_CACHE_MS, info: null });
  return null;
}

export async function resolveChatRegistration(session: SessionData | null): Promise<RegisteredNation | null> {
  if (!session) return null;
  if (session.discordAuthenticated !== true && session.pnwNativeAuthenticated !== true) return null;
  return resolveRegisteredNation(session);
}

async function resolveChatAccess(session: SessionData | null): Promise<RegisteredNation | null> {
  const registeredNation = await resolveChatRegistration(session);

  // If registered normally, use that
  if (registeredNation) {
    const trackedAllianceId = getTrackedAllianceId();
    if (!trackedAllianceId) return registeredNation;
    const allianceInfo = await fetchNationAllianceInfo(registeredNation.nationId);
    if (!allianceInfo) return registeredNation;
    if (allianceInfo.allianceId !== trackedAllianceId) return null;
    return {
      ...registeredNation,
      username: allianceInfo.nationName || registeredNation.username,
    };
  }

  // Not registered — check if they are an admin; if so, grant access with their Discord username
  const discordUserId = typeof session?.discordUserId === 'string' ? session.discordUserId.trim() : '';
  if (discordUserId && ADMIN_DISCORD_IDS.has(discordUserId)) {
    return {
      nationId: 0,
      username: session?.discordUsername || 'Admin',
    };
  }

  return null;
}

function parseSessionData(
  req: http.IncomingMessage,
  store: SessionStore,
  secret: string
): Promise<SessionData | null> {
  return new Promise((resolve) => {
    const cookies = cookie.parse(req.headers.cookie || '');
    const rawSid = cookies['connect.sid'];
    if (!rawSid) return resolve(null);

    const sid = getSignedSessionId(rawSid, secret);
    if (!sid) return resolve(null);

    store.get(sid, (err, session) => {
      if (err || !session) return resolve(null);
      resolve(session);
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function attachChatServer(
  httpServer: http.Server,
  store: SessionStore,
  sessionSecret: string
): void {
  const chatWss = new ws.WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    if (!isChatUpgradePath(req)) return;

    const session = await parseSessionData(req, store, sessionSecret);
    const access = await resolveChatAccess(session);

    if (!session) {
      closeRejectedWebSocket(
        chatWss,
        req,
        socket,
        head,
        CHAT_UNAUTHENTICATED_CLOSE_CODE,
        'Unauthorized'
      );
      return;
    }

    if (!access) {
      closeRejectedWebSocket(
        chatWss,
        req,
        socket,
        head,
        CHAT_FORBIDDEN_CLOSE_CODE,
        'Forbidden'
      );
      return;
    }

    if (clients.size >= MAX_CLIENTS) {
      writeUpgradeError(socket, 503, 'Service Unavailable');
      return;
    }

    chatWss.handleUpgrade(req, socket, head, async (client) => {
      const username = access.username;

      const info: ClientInfo = {
        username,
        isAdmin: discordUserId ? ADMIN_DISCORD_IDS.has(discordUserId) : false,
        joinedAt: new Date(),
        lastMessageAt: 0,
        messageCount: 0,
      };

      clients.set(client, info);

      // Deliver history to this client before announcing their arrival
      ChatMessage.find({ timestamp: { $gte: new Date(Date.now() - FOURTEEN_DAYS_MS) } })
        .sort({ timestamp: 1 })
        .lean()
        .exec()
        .then((docs) => {
          if (client.readyState !== ws.WebSocket.OPEN) return;
          client.send(JSON.stringify({
            type: 'history',
            messages: docs.map((d) => ({
              type:      d.type,
              username:  d.username,
              text:      d.text,
              timestamp: (d.timestamp as Date).getTime(),
            })),
          }));
        })
        .catch(() => undefined);

      // Announce join to everyone (also persists via broadcast)
      broadcast({ type: 'system', text: `${username} joined`, timestamp: Date.now() });

      client.on('message', (raw) => {
        const info = clients.get(client);
        if (!info) return;

        const now = Date.now();
        if (now - info.lastMessageAt < RATE_WINDOW_MS) {
          info.messageCount += 1;
          if (info.messageCount > RATE_MAX) return;
        } else {
          info.messageCount = 1;
          info.lastMessageAt = now;
        }

        let parsed: { text?: unknown };
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          return;
        }

        const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
        if (!text || text.length > MAX_MSG_LEN) return;
        if (isImageContent(text)) return;

        broadcast({
          type:      'message',
          username:  info.username,
          isAdmin:   info.isAdmin,
          text,
          timestamp: now,
        });

      client.on('close', () => {
        const info = clients.get(client);
        if (info) {
          broadcast({ type: 'system', text: `${info.username} left`, timestamp: Date.now() });
        }
        clients.delete(client);
      });

      client.on('error', () => {
        clients.delete(client);
      });
    });
  });
}
