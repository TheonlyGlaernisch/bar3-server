/**
 * WebSocket chat server for alliance members.
 */
import * as http from 'http';
import * as ws from 'ws';
import { SessionData } from 'express-session';
import { SessionStore } from '../interfaces/chatServer';
import mongoose from 'mongoose';
import cookie from 'cookie';
import { ChatMessage } from '../interfaces/schemas/ChatMessageSchema';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientInfo {
  username: string;
  joinedAt: Date;
  lastMessageAt: number;
  messageCount: number;
}

interface ChatPayload {
  type: 'message' | 'system';
  username?: string;
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

async function resolveNationName(discordUserId: string): Promise<string> {
  if (!discordUserId) return 'Guest';
  try {
    const db = mongoose.connection.useDb('TRF', { useCache: true });
    const col = db.collection('registrations');

    let doc: Record<string, unknown> | null = null;

    if (discordUserId.startsWith('pnw:')) {
      const nationId = Number(discordUserId.slice(4));
      if (Number.isFinite(nationId) && nationId > 0) {
        doc = await col.findOne({ nation_id: nationId });
      }
    } else {
      doc = await col.findOne({ discord_id: discordUserId });
    }

    if (doc?.discord_username && typeof doc.discord_username === 'string') {
      return doc.discord_username;
    }
    if (doc?.nation_id) return `Nation#${doc.nation_id}`;
  } catch {
    // degrade gracefully
  }
  return 'Guest';
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

    const unsigned = rawSid.startsWith('s:')
      ? rawSid.slice(2).split('.')[0]
      : rawSid.split('.')[0];

    if (!unsigned) return resolve(null);

    store.get(unsigned, (err, session) => {
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
    if (req.url !== '/api/chat/ws') return;

    const session = await parseSessionData(req, store, sessionSecret);

    const authenticated = session?.discordAuthenticated === true;
    const hasMemberRole =
      (session?.discordRoles as Record<string, unknown> | undefined)?.member_guild === true;

    if (!authenticated || !hasMemberRole) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (clients.size >= MAX_CLIENTS) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    chatWss.handleUpgrade(req, socket, head, async (client) => {
      const discordUserId =
        typeof session?.discordUserId === 'string' ? session.discordUserId : '';
      const username = await resolveNationName(discordUserId);

      const info: ClientInfo = {
        username,
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
          text,
          timestamp: now,
        });
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