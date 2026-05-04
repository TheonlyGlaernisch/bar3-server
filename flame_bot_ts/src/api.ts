/**
 * flame_bot – HTTP API server for bar3 integration.
 *
 * bar3 (the website) calls this API after a user logs in via Discord OAuth to
 * decide whether the user should be granted access.
 *
 * Endpoints
 * ---------
 * GET /
 *     Returns "would you kindly begone" (200 OK).
 *
 * GET /health
 *     Returns {"status": "ok"} (200 OK).
 *
 * GET /ping
 *     Returns {"ping": "pong", "sigma": true, "skibidi": "toilet"} (200 OK).
 *
 * GET /glaernisch
 *     Returns {"touch": "grass"} (200 OK).
 *
 * GET /egg
 *     Returns an egg-themed SVG image (200 OK).
 *
 * GET /api/roles/:discord_id
 *     Returns the bar3 role status for the given Discord user ID.
 *     Requires the X-API-Key request header.
 *
 * GET /api/bot/servers
 *     Returns the list of Discord servers the bot is currently in.
 *     Requires the X-API-Key request header.
 *
 * GET /api/bot/commands/usage
 *     Returns a ranked list of slash-command usage counts (highest first).
 *     Requires the X-API-Key request header.
 *
 * POST /api/bot/send
 *     Send a message to the configured welcome channel of every server the bot is in.
 *     Requires the X-API-Key request header.
 */
import express, { Application, Request, Response } from 'express';
import { Guild, GuildMember } from 'discord.js';

export interface RoleConfig {
  verifiedRoleId?: bigint | null;
  bar3ClientRoleId?: bigint | null;
  bar3ServerRoleId?: bigint | null;
}

export interface GuildInfo {
  id: string;
  name: string;
  icon: string | null;
  member_count: number | null;
}

export type GuildGetter = () => Guild | null;
export type GuildsGetter = () => Guild[];
export type SendToWelcomeFn = (message: string) => Promise<{ sent: number; skipped: number }>;
export type CommandUsageGetter = () => Record<string, number>;

export interface CreateAppOptions {
  guildGetter: GuildGetter;
  apiKey: string;
  roleConfig?: RoleConfig;
  guildsGetter?: GuildsGetter;
  sendToWelcomeFn?: SendToWelcomeFn;
  commandUsageGetter?: CommandUsageGetter;
  adminIds?: Set<bigint>;
}

function checkApiKey(req: Request, apiKey: string): boolean {
  return req.headers['x-api-key'] === apiKey;
}

const EGG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420" viewBox="0 0 320 420">
  <rect width="320" height="420" fill="#8bcf6b"/>
  <ellipse cx="160" cy="300" rx="110" ry="95" fill="#f8de57"/>
  <circle cx="160" cy="180" r="55" fill="#f7d84d"/>
  <ellipse cx="135" cy="165" rx="8" ry="10" fill="#111"/>
  <ellipse cx="185" cy="165" rx="8" ry="10" fill="#111"/>
  <polygon points="160,178 140,195 180,195" fill="#ea9f2d"/>
  <ellipse cx="120" cy="95" rx="22" ry="48" fill="#f4d9df" transform="rotate(-18 120 95)"/>
  <ellipse cx="200" cy="95" rx="22" ry="48" fill="#f4d9df" transform="rotate(18 200 95)"/>
  <ellipse cx="120" cy="95" rx="16" ry="40" fill="#fff7fb" transform="rotate(-18 120 95)"/>
  <ellipse cx="200" cy="95" rx="16" ry="40" fill="#fff7fb" transform="rotate(18 200 95)"/>
  <path d="M120 215 C80 220, 70 250, 95 265" stroke="#f8de57" stroke-width="18" fill="none" stroke-linecap="round"/>
  <path d="M200 215 C240 220, 250 250, 225 265" stroke="#f8de57" stroke-width="18" fill="none" stroke-linecap="round"/>
  <path d="M145 390 L130 415 L152 408 Z" fill="#d9872a"/>
  <path d="M180 390 L200 415 L170 410 Z" fill="#d9872a"/>
</svg>`;

export function createApp(options: CreateAppOptions): Application {
  const {
    guildGetter,
    apiKey,
    roleConfig = {},
    guildsGetter,
    sendToWelcomeFn,
    commandUsageGetter,
    adminIds = new Set<bigint>(),
  } = options;

  const app = express();
  app.use(express.json());

  app.get('/', (_req: Request, res: Response) => {
    res.status(200).send('would you kindly begone');
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/ping', (_req: Request, res: Response) => {
    res.status(200).json({ ping: 'pong', sigma: true, skibidi: 'toilet' });
  });

  app.get('/glaernisch', (_req: Request, res: Response) => {
    res.status(200).json({ touch: 'grass' });
  });

  app.get('/egg', (_req: Request, res: Response) => {
    res.status(200).type('image/svg+xml').send(EGG_SVG);
  });

  app.get('/api/roles/:discord_id', async (req: Request, res: Response) => {
    if (!checkApiKey(req, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const discordIdStr = req.params['discord_id'] ?? '';
    if (!/^\d+$/.test(discordIdStr)) {
      res.status(400).json({ error: 'Invalid discord_id' });
      return;
    }

    const discordId = BigInt(discordIdStr);

    const roles: Record<string, boolean> = {
      verified: false,
      bar3_client: false,
      bar3_server: false,
    };

    const guild = guildGetter();
    if (!guild) {
      res.status(503).json({ error: 'Bot not ready' });
      return;
    }

    let member: GuildMember | null = guild.members.cache.get(discordId.toString()) ?? null;
    if (!member) {
      try {
        member = await guild.members.fetch(discordId.toString());
      } catch {
        member = null;
      }
    }

    if (member) {
      const memberRoleIds = new Set(member.roles.cache.keys());
      if (roleConfig.verifiedRoleId && memberRoleIds.has(roleConfig.verifiedRoleId.toString())) {
        roles['verified'] = true;
      }
      if (roleConfig.bar3ClientRoleId && memberRoleIds.has(roleConfig.bar3ClientRoleId.toString())) {
        roles['bar3_client'] = true;
      }
      if (roleConfig.bar3ServerRoleId && memberRoleIds.has(roleConfig.bar3ServerRoleId.toString())) {
        roles['bar3_server'] = true;
      }
    }

    res.status(200).json({ discord_id: discordIdStr, roles });
  });

  app.get('/api/bot/servers', (_req: Request, res: Response) => {
    if (!checkApiKey(_req, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!guildsGetter) {
      res.status(503).json({ error: 'Bot not ready' });
      return;
    }
    const guilds = guildsGetter();
    const result: GuildInfo[] = guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL() ?? null,
      member_count: g.memberCount,
    }));
    res.status(200).json(result);
  });

  app.get('/api/bot/commands/usage', (_req: Request, res: Response) => {
    if (!checkApiKey(_req, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const usage = commandUsageGetter ? commandUsageGetter() : {};
    const ranked = Object.entries(usage)
      .sort(([, a], [, b]) => b - a)
      .map(([command, count]) => ({ command, count }));
    res.status(200).json(ranked);
  });

  app.post('/api/bot/send', async (req: Request, res: Response) => {
    if (!checkApiKey(req, apiKey)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const discordIdStr = String(body['discord_id'] ?? '').trim();
    if (!/^\d+$/.test(discordIdStr)) {
      res.status(400).json({ error: 'Missing or invalid discord_id' });
      return;
    }
    const discordId = BigInt(discordIdStr);

    const message = String(body['message'] ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }

    if (!adminIds.has(discordId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (!sendToWelcomeFn) {
      res.status(503).json({ error: 'Bot not ready' });
      return;
    }

    const result = await sendToWelcomeFn(message);
    res.status(200).json(result);
  });

  return app;
}
