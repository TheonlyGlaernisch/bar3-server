import superagent from 'superagent';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocket = require('ws');

const PNW_PUSHER_URL = 'wss://socket.politicsandwar.com/app/a22734a47847a64386c8?protocol=7';
const PNW_SUBSCRIPTION_URL = 'https://api.politicsandwar.com/subscriptions/v1/subscribe/nation/create';
const PNW_SUBSCRIPTION_AUTH_URL = 'https://api.politicsandwar.com/subscriptions/v1/auth';
const RECONNECT_BASE_SECONDS = 5;
const RECONNECT_MAX_SECONDS = 120;
const GATEWAY_RESET_INTERVAL_MINUTES = 55;
const GATEWAY_RESET_INTERVAL_MS = GATEWAY_RESET_INTERVAL_MINUTES * 60 * 1000;

export interface NationCreateEvent {
  nationId: number;
  nationName: string;
  leaderName: string;
  founded: Date;
  allianceId: number;
  alliancePosition: number;
  cities: number;
  score: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseNationCreateEvent(raw: Record<string, unknown>): NationCreateEvent | null {
  const nationId = asNumber(raw.id);
  if (!nationId) return null;

  const dateRaw = asString(raw.date) || asString(raw.founded);
  const founded = dateRaw ? new Date(dateRaw) : new Date();
  const safeFounded = Number.isNaN(founded.getTime()) ? new Date() : founded;

  return {
    nationId,
    nationName: asString(raw.nation_name) || asString(raw.nation) || String(nationId),
    leaderName: asString(raw.leader_name) || asString(raw.leader),
    founded: safeFounded,
    allianceId: asNumber(raw.alliance_id),
    alliancePosition: asNumber(raw.alliance_position_id ?? raw.alliance_position),
    cities: asNumber(raw.num_cities ?? raw.cities),
    score: asNumber(raw.score),
  };
}

export class PnWNationSubscriptionClient {
  private readonly apiKey: string;
  private channel: string | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async getChannel(): Promise<string> {
    if (this.channel) return this.channel;
    const response = await superagent
      .get(PNW_SUBSCRIPTION_URL)
      .query({ api_key: this.apiKey })
      .accept('json');
    const channel = asString((response.body as Record<string, unknown>).channel);
    if (!channel) {
      throw new Error(`PnW subscription API returned no channel: ${JSON.stringify(response.body)}`);
    }
    this.channel = channel;
    return channel;
  }

  private async getAuth(channel: string, socketId: string): Promise<string> {
    const response = await superagent
      .post(PNW_SUBSCRIPTION_AUTH_URL)
      .type('form')
      .send({
        socket_id: socketId,
        channel_name: channel,
        api_key: this.apiKey,
      })
      .accept('json');
    const auth = asString((response.body as Record<string, unknown>).auth);
    if (!auth) {
      throw new Error(`PnW subscription auth returned no token: ${JSON.stringify(response.body)}`);
    }
    return auth;
  }

  private async *streamOnce(): AsyncGenerator<NationCreateEvent> {
    const channel = await this.getChannel();
    const ws = new WebSocket(PNW_PUSHER_URL);
    const queue: Record<string, unknown>[] = [];
    let closed = false;
    let socketId = '';
    const gatewayResetAt = Date.now() + GATEWAY_RESET_INTERVAL_MS;
    let intentionalCloseReason = '';

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err: Error) => reject(err));
    });

    ws.on('message', (raw: any) => {
      try {
        queue.push(JSON.parse(raw.toString()) as Record<string, unknown>);
      } catch {
        // Ignore malformed payloads.
      }
    });
    ws.on('close', (code: number, reason: Buffer) => {
      closed = true;
      const reasonText = reason.length ? reason.toString('utf8') : '';
      const closeSummary = `PnW nation subscription WebSocket closed (code=${code}, reason=${reasonText || 'n/a'}).`;
      if (intentionalCloseReason) {
        console.info(`${closeSummary} ${intentionalCloseReason}.`);
      } else {
        console.warn(closeSummary);
      }
    });
    ws.on('error', () => {
      closed = true;
    });

    try {
      while (!closed) {
        if (Date.now() >= gatewayResetAt) {
          intentionalCloseReason = `Scheduled reconnect after ${GATEWAY_RESET_INTERVAL_MINUTES} minutes`;
          console.info(`PnW nation subscription: resetting gateway connection after ${GATEWAY_RESET_INTERVAL_MINUTES} minutes.`);
          ws.close();
          break;
        }

        const frame = queue.shift();
        if (!frame) {
          await sleep(50);
          continue;
        }

        const eventName = asString(frame.event);

        if (eventName === 'pusher:connection_established') {
          const rawData = frame.data;
          const data = typeof rawData === 'string'
            ? JSON.parse(rawData) as Record<string, unknown>
            : (rawData as Record<string, unknown> || {});
          socketId = asString(data.socket_id);
          if (!socketId) throw new Error('PnW subscription connection did not provide socket_id.');
          const auth = await this.getAuth(channel, socketId);
          ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth, channel } }));
          continue;
        }

        if (eventName === 'pusher:ping') {
          ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
          continue;
        }

        if (eventName !== 'NATION_CREATE' && eventName !== 'BULK_NATION_CREATE') continue;

        let rawItems: unknown = frame.data;
        if (typeof rawItems === 'string') {
          try {
            rawItems = JSON.parse(rawItems);
          } catch {
            rawItems = {};
          }
        }

        const items = eventName === 'BULK_NATION_CREATE'
          ? (Array.isArray(rawItems) ? rawItems : [])
          : [rawItems];

        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const parsed = parseNationCreateEvent(item as Record<string, unknown>);
          if (parsed) yield parsed;
        }
      }
    } finally {
      ws.close();
    }
  }

  async *iterNationCreates(): AsyncGenerator<NationCreateEvent> {
    let delaySeconds = RECONNECT_BASE_SECONDS;
    while (true) {
      try {
        for await (const event of this.streamOnce()) {
          delaySeconds = RECONNECT_BASE_SECONDS;
          yield event;
        }
      } catch (err) {
        console.error(`PnW nation subscription disconnected; retrying in ${delaySeconds}s.`, err);
      }
      await sleep(delaySeconds * 1000);
      delaySeconds = Math.min(delaySeconds * 2, RECONNECT_MAX_SECONDS);
    }
  }
}
