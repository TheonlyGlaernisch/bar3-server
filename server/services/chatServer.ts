/**
 * WebSocket chat server for alliance members.
 *
 * Changes vs previous version:
 *  - Tracks known admin usernames in MongoDB (KnownAdmin collection) so
 *    admins are pingable via @mention even when they're offline.
 *  - Sends an `admin_users` frame to every client on connect so the @mention
 *    autocomplete includes offline admins.
 *  - Calls pushService.sendToUsername() on every @mention so the mentioned
 *    user gets an OS push even when they have no open WS connection.
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
import { extractMentionedUsernames, sendToUsername } from './pushService';


const ADMIN_DISCORD_IDS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

// ─── Known-admin persistence ──────────────────────────────────────────────────
// We store admin usernames in a tiny MongoDB collection so the server can
// broadcast them to clients even when no admin is currently connected.

const knownAdminSchema = new mongoose.Schema(
  { username: { type: String, required: true, unique: true } },
  { collection: 'known_admin_usernames', timestamps: false }
);
const KnownAdmin = mongoose.model('KnownAdmin', knownAdminSchema);
let knownAdminUsernamesCache: string[] = [];
/** In-memory cache so we don't hit the DB on every connect. */
// Add getter below it:
export function getKnownAdminUsernames(): string[] {
  return knownAdminUsernamesCache;
}
let knownAdminCacheLoaded = false;

async function loadKnownAdmins(): Promise<string[]> {
  if (knownAdminCacheLoaded) return knownAdminUsernamesCache;
  try {
    const docs = await KnownAdmin.find({}).lean().exec();
    knownAdminUsernamesCache = docs.map((d: any) => d.username as string);
    knownAdminCacheLoaded = true;
  } catch {
    // DB not ready yet — return whatever we have in memory
  }
  return knownAdminUsernamesCache;
}

async function persistAdminUsername(username: string): Promise<void> {
  if (knownAdminUsernamesCache.includes(username)) return;
  try {
    await KnownAdmin.findOneAndUpdate(
      { username },
      { username },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
    knownAdminUsernamesCache = [...new Set([...knownAdminUsernamesCache, username])];
  } catch {
    // Non-fatal — admin is still in memory for this session
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientInfo {
  username: string;
  isAdmin: boolean;
  joinedAt: Date;
  lastMessageAt: number;
  messageCount: number;
}

interface ChatPayload {
  type: 'message' | 'system';
  username?: string;
  isAdmin?: boolean;
  text: string;
  timestamp: number;
}

interface ReactionPayload {
  type: 'reaction';
  messageKey: string;
  emoji: string;
  username: string;
  delta: 1 | -1;
}

interface ReactionBroadcast {
  type: 'reaction_update';
  messageKey: string;
  emoji: string;
  username: string;
  delta: 1 | -1;
}

// ─── State ────────────────────────────────────────────────────────────────────

const clients = new Map<ws.WebSocket, ClientInfo>();
const typingUsers = new Map<ws.WebSocket, { username: string; timer: ReturnType<typeof setTimeout> }>();
const reactionStore = new Map<string, Map<string, Set<string>>>();

const MAX_CLIENTS = 50;
const MAX_MSG_LEN = 500;
const RATE_WINDOW_MS = 1000;
const RATE_MAX = 2;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const NATION_ALLIANCE_CACHE_MS = 5 * 60 * 1000;
const CHAT_UNAUTHENTICATED_CLOSE_CODE = 4001;
const CHAT_FORBIDDEN_CLOSE_CODE = 4003;
const MAX_EMOJI_PER_MESSAGE = 20;
const MAX_REACTIONS_PER_USER_PER_MESSAGE = 5;

type RegistrationDoc = {
  nation_id?: number | string;
  discord_username?: string;
};

type ChatAccess = {
  nationId: number;
  username: string;
  isAdmin: boolean;
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

  ChatMessage.create({
    username:  message.username ?? '',
    text:      message.text,
    type:      message.type,
    timestamp: new Date(message.timestamp),
    isAdmin: message.isAdmin === true,
  }).catch(() => undefined);

  // ── Server-push @mentions ─────────────────────────────────────────────────
  // This fires even when the mentioned user has no open WS connection,
  // so offline admins and backgrounded iOS PWA users still get notified.
  if (message.type === 'message' && message.text && message.username) {
    const senderLower = (message.username).toLowerCase();
    const mentioned = extractMentionedUsernames(message.text);

    for (const mentionedLower of mentioned) {
      if (mentionedLower === senderLower) continue;

      // Find the canonical stored username — push subscriptions are keyed by
      // the exact username string used when the user registered, but
      // extractMentionedUsernames returns lowercase. We need to look up the
      // real casing from online clients first, then fall back to the raw value
      // (which is fine because saveSubscription also lowercases on store).
      const canonicalUsername = resolveCanonicalUsername(mentionedLower);

      sendToUsername(canonicalUsername, {
        title: `${message.username} mentioned you`,
        body: message.text.slice(0, 100),
        tag: `bar3-mention-${mentionedLower}-${message.timestamp}`,
      }).catch((err) => {
        console.warn(
          '[chatServer] Server push failed for @' + mentionedLower + ':',
          err?.message ?? err
        );
      });
    }
  }
}

/**
 * Resolve the canonical (correctly-cased) username for a lowercase mention.
 *
 * We check connected clients first (O(n) but n ≤ 50), then the known-admin
 * cache. If nothing matches we return the lowercased value as-is — the push
 * subscription lookup does a case-insensitive match via the stored lowercase
 * username field so this still works.
 */
function resolveCanonicalUsername(lowerUsername: string): string {
  for (const [, info] of clients) {
    if (info.username.toLowerCase() === lowerUsername) return info.username;
  }
  for (const adminUsername of knownAdminUsernamesCache) {
    if (adminUsername.toLowerCase() === lowerUsername) return adminUsername;
  }
  return lowerUsername;
}

function broadcastReaction(payload: ReactionBroadcast, excludeClient?: ws.WebSocket): void {
  const data = JSON.stringify(payload);
  for (const [client] of clients) {
    if (client === excludeClient) continue;
    if (client.readyState === ws.WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function applyReaction(
  messageKey: string,
  emoji: string,
  username: string,
  delta: 1 | -1
): 1 | -1 | 0 {
  let emojiMap = reactionStore.get(messageKey);
  if (!emojiMap) {
    if (delta === -1) return 0;
    emojiMap = new Map();
    reactionStore.set(messageKey, emojiMap);
  }

  let users = emojiMap.get(emoji);
  if (!users) {
    if (delta === -1) return 0;
    users = new Set();
    emojiMap.set(emoji, users);
  }

  if (delta === 1) {
    if (users.has(username)) return 0;
    if (emojiMap.size >= MAX_EMOJI_PER_MESSAGE && !emojiMap.has(emoji)) return 0;
    let userReactionCount = 0;
    for (const [, uSet] of emojiMap) {
      if (uSet.has(username)) userReactionCount++;
    }
    if (userReactionCount >= MAX_REACTIONS_PER_USER_PER_MESSAGE) return 0;
    users.add(username);
    return 1;
  } else {
    if (!users.has(username)) return 0;
    users.delete(username);
    if (users.size === 0) emojiMap.delete(emoji);
    if (emojiMap.size === 0) reactionStore.delete(messageKey);
    return -1;
  }
}

function isImageContent(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('<img') ||
    lower.includes('data:image') ||
    /https?:\/\/\S+\.(png|jpg|jpeg|gif|webp|svg|bmp)/i.test(text)
  );
}

function broadcastTyping(excludeClient?: ws.WebSocket): void {
  const usernames = [...typingUsers.values()].map((t) => t.username);
  const payload = JSON.stringify({ type: 'typing_update', typing: usernames });
  for (const [client] of clients) {
    if (client === excludeClient) continue;
    if (client.readyState === ws.WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastOnlineUsers(): void {
  const seen = new Set<string>();
  const users = [...clients.values()]
    .filter((c) => {
      if (seen.has(c.username)) return false;
      seen.add(c.username);
      return true;
    })
    .map((c) => ({ username: c.username, isAdmin: c.isAdmin }));
  const payload = JSON.stringify({ type: 'users_list', users });
  for (const [client] of clients) {
    if (client.readyState === ws.WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

/**
 * Send the known-admin list to a specific client (on connect) or broadcast
 * to all clients (when a new admin is discovered).
 */
function sendAdminList(target: ws.WebSocket | null): void {
  const payload = JSON.stringify({
    type: 'admin_users',
    admins: knownAdminUsernamesCache,
  });
  if (target) {
    if (target.readyState === ws.WebSocket.OPEN) target.send(payload);
    return;
  }
  for (const [client] of clients) {
    if (client.readyState === ws.WebSocket.OPEN) client.send(payload);
  }
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

function getDiscordUserId(session: SessionData | null): string {
  return typeof session?.discordUserId === 'string' ? session.discordUserId.trim() : '';
}

function isDiscordAdmin(session: SessionData | null): boolean {
  const discordUserId = getDiscordUserId(session);
  return discordUserId !== '' && ADMIN_DISCORD_IDS.has(discordUserId);
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

export async function resolveChatAccess(session: SessionData | null): Promise<ChatAccess | null> {
  if (!session || (session.discordAuthenticated !== true && session.pnwNativeAuthenticated !== true)) return null;

  const admin = isDiscordAdmin(session);
  const registeredNation = await resolveChatRegistration(session);

  if (registeredNation) {
    const trackedAllianceId = getTrackedAllianceId();
    if (!trackedAllianceId) return { ...registeredNation, isAdmin: admin };
    const allianceInfo = await fetchNationAllianceInfo(registeredNation.nationId);
    if (!allianceInfo) return { ...registeredNation, isAdmin: admin };
    if (allianceInfo.allianceId !== trackedAllianceId && !admin) return null;
    return {
      ...registeredNation,
      username: allianceInfo.nationName || registeredNation.username,
      isAdmin: admin,
    };
  }

  if (admin) {
    return {
      nationId: 0,
      username: session.discordUsername || 'Admin',
      isAdmin: true,
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
  // Pre-load known admins so the first client to connect gets the full list
  loadKnownAdmins().catch(() => undefined);

  const chatWss = new ws.WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    if (!isChatUpgradePath(req)) return;

    const session = await parseSessionData(req, store, sessionSecret);
    const access = await resolveChatAccess(session);

    if (!session) {
      closeRejectedWebSocket(chatWss, req, socket, head, CHAT_UNAUTHENTICATED_CLOSE_CODE, 'Unauthorized');
      return;
    }

    if (!access) {
      closeRejectedWebSocket(chatWss, req, socket, head, CHAT_FORBIDDEN_CLOSE_CODE, 'Forbidden');
      return;
    }

    if (clients.size >= MAX_CLIENTS) {
      writeUpgradeError(socket, 503, 'Service Unavailable');
      return;
    }

    chatWss.handleUpgrade(req, socket, head, async (client) => {
      const username = access.username;

      // If this is an admin we haven't seen before, persist and broadcast
      if (access.isAdmin) {
        const isNew = !knownAdminUsernamesCache.includes(username);
        await persistAdminUsername(username);
        if (isNew) {
          // Tell all currently-connected clients about this newly-known admin
          sendAdminList(null);
        }
      }

      const info: ClientInfo = {
        username,
        isAdmin: access.isAdmin,
        joinedAt: new Date(),
        lastMessageAt: 0,
        messageCount: 0,
      };

      clients.set(client, info);

      // Tell the client who they are
      client.send(JSON.stringify({ type: 'connected', username }));

      // Send current online users to new client
      const seenJoin = new Set<string>();
      const currentUsers = [...clients.values()]
        .filter((c) => {
          if (seenJoin.has(c.username)) return false;
          seenJoin.add(c.username);
          return true;
        })
        .map((c) => ({ username: c.username, isAdmin: c.isAdmin }));
      client.send(JSON.stringify({ type: 'users_list', users: currentUsers }));

      // Send the known-admin list so the client can show offline admins in autocomplete
      await loadKnownAdmins();
      sendAdminList(client);

      broadcastOnlineUsers();

      // Deliver message history + current reaction state
      ChatMessage.find({ timestamp: { $gte: new Date(Date.now() - FOURTEEN_DAYS_MS) } })
        .sort({ timestamp: 1 })
        .lean()
        .exec()
        .then((docs) => {
          if (client.readyState !== ws.WebSocket.OPEN) return;

          const messages = docs.map((d) => ({
            type:      d.type,
            username:  d.username,
            text:      d.text,
            timestamp: (d.timestamp as Date).getTime(),
            isAdmin:   d.isAdmin === true,
          }));

          client.send(JSON.stringify({ type: 'history', messages }));

          if (reactionStore.size > 0) {
            const snapshot: Record<string, Record<string, string[]>> = {};
            for (const [msgKey, emojiMap] of reactionStore) {
              const emojiSnap: Record<string, string[]> = {};
              for (const [emoji, users] of emojiMap) {
                if (users.size > 0) emojiSnap[emoji] = Array.from(users);
              }
              if (Object.keys(emojiSnap).length > 0) snapshot[msgKey] = emojiSnap;
            }
            if (Object.keys(snapshot).length > 0) {
              client.send(JSON.stringify({ type: 'reactions_snapshot', snapshot }));
            }
          }
        })
        .catch(() => undefined);

      broadcast({ type: 'system', text: `${username} joined`, timestamp: Date.now() });

      client.on('message', (raw) => {
        const clientInfo = clients.get(client);
        if (!clientInfo) return;

        const now = Date.now();

        let parsed: { text?: unknown; type?: string; messageKey?: unknown; emoji?: unknown; delta?: unknown };
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (parsed.type === 'reaction') {
          const messageKey = typeof parsed.messageKey === 'string' ? parsed.messageKey.trim() : '';
          const emoji = typeof parsed.emoji === 'string' ? parsed.emoji.trim() : '';
          const delta = parsed.delta === 1 ? 1 : -1;

          if (!messageKey || !emoji || emoji.length > 8) return;

          const effectiveDelta = applyReaction(messageKey, emoji, clientInfo.username, delta as 1 | -1);
          if (effectiveDelta === 0) return;

          broadcastReaction({ type: 'reaction_update', messageKey, emoji, username: clientInfo.username, delta: effectiveDelta }, client);
          return;
        }

        if (parsed.type === 'typing_start') {
          const existing = typingUsers.get(client);
          if (existing) clearTimeout(existing.timer);

          const timer = setTimeout(() => {
            typingUsers.delete(client);
            broadcastTyping(client);
          }, 5000);

          typingUsers.set(client, { username: clientInfo.username, timer });
          broadcastTyping(client);
          return;
        }

        if (parsed.type === 'typing_stop') {
          const existing = typingUsers.get(client);
          if (existing) clearTimeout(existing.timer);
          typingUsers.delete(client);
          broadcastTyping(client);
          return;
        }

        if (now - clientInfo.lastMessageAt < RATE_WINDOW_MS) {
          clientInfo.messageCount += 1;
          if (clientInfo.messageCount > RATE_MAX) return;
        } else {
          clientInfo.messageCount = 1;
          clientInfo.lastMessageAt = now;
        }

        const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
        if (!text || text.length > MAX_MSG_LEN) return;
        if (isImageContent(text)) return;

        broadcast({
          type: 'message',
          username: clientInfo.username,
          isAdmin: clientInfo.isAdmin,
          text,
          timestamp: now,
        });
      });

      client.on('close', () => {
        const clientInfo = clients.get(client);

        const typing = typingUsers.get(client);
        if (typing) {
          clearTimeout(typing.timer);
          typingUsers.delete(client);
        }

        clients.delete(client);

        if (clientInfo) {
          broadcast({ type: 'system', text: `${clientInfo.username} left`, timestamp: Date.now() });
        }

        broadcastTyping();
        broadcastOnlineUsers();
      });

      client.on('error', () => {
        const typing = typingUsers.get(client);
        if (typing) {
          clearTimeout(typing.timer);
          typingUsers.delete(client);
        }

        clients.delete(client);
        broadcastTyping();
        broadcastOnlineUsers();
      });
    });
  });
}
