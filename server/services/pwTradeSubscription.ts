import superagent from 'superagent';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocket = require('ws');

const PNW_PUSHER_URL = 'wss://socket.politicsandwar.com/app/a22734a47847a64386c8?protocol=7';
const PNW_SUBSCRIPTION_URL = 'https://api.politicsandwar.com/subscriptions/v1/subscribe/trade/create';
const PNW_SUBSCRIPTION_AUTH_URL = 'https://api.politicsandwar.com/subscriptions/v1/auth';
const RECONNECT_BASE_SECONDS = 5;
const RECONNECT_MAX_SECONDS = 120;
const GATEWAY_RESET_INTERVAL_MINUTES = (() => {
  const raw = Number.parseInt(process.env.PNW_SUBSCRIPTION_GATEWAY_RESET_MINUTES || '', 10);
  return Number.isFinite(raw) && raw >= 30 ? raw : 180;
})();
const GATEWAY_RESET_INTERVAL_MS = GATEWAY_RESET_INTERVAL_MINUTES * 60 * 1000;
const WS_KEEPALIVE_INTERVAL_SECONDS = 18;
const WS_KEEPALIVE_INTERVAL_MS = WS_KEEPALIVE_INTERVAL_SECONDS * 1000;

/**
 * Mirrors the `trade` model returned by the PnW v3 API / subscription system.
 * See https://mrvillage.gitbook.io/pnwapi/subscriptions/getting-started
 */
export interface TradeCreateEvent {
  tradeId: number;
  date: Date;
  senderId: number;
  senderType: number;
  receiverId: number;
  receiverType: number;
  /** e.g. 'money', 'food', 'coal', 'oil', 'uranium', 'iron', 'bauxite', 'lead', 'gasoline', 'munitions', 'steel', 'aluminum' */
  offerResource: string;
  offerAmount: number;
  /** 'buy' or 'sell' from the sender's perspective */
  buyOrSell: string;
  /** Price per unit (ppu) */
  price: number;
  originalTradeId: number;
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

function parseTradeCreateEvent(raw: Record<string, unknown>): TradeCreateEvent | null {
  const tradeId = asNumber(raw.id);
  if (!tradeId) return null;

  const dateRaw = asString(raw.date);
  const date = dateRaw ? new Date(dateRaw) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return {
    tradeId,
    date: safeDate,
    senderId: asNumber(raw.sender_id),
    senderType: asNumber(raw.sender_type),
    receiverId: asNumber(raw.receiver_id),
    receiverType: asNumber(raw.receiver_type),
    offerResource: asString(raw.offer_resource).toLowerCase(),
    offerAmount: asNumber(raw.offer_amount),
    buyOrSell: asString(raw.buy_or_sell).toLowerCase(),
    price: asNumber(raw.price),
    originalTradeId: asNumber(raw.original_trade_id),
  };
}

export class PnWTradeSubscriptionClient {
  private readonly apiKey: string;
  private channel: string | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async getChannel(): Promise<string> {
    if (this.channel) return this.channel;
    const response = await superagent
        .get(PNW_SUBSCRIPTION_URL)
        .query({api_key: this.apiKey})
        .accept('json');
    const channel = asString((response.body as Record<string, unknown>).channel);
    if (!channel) {
      throw new Error(`PnW trade subscription API returned no channel: ${JSON.stringify(response.body)}`);
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
      throw new Error(`PnW trade subscription auth returned no token: ${JSON.stringify(response.body)}`);
    }
    return auth;
  }

  private async* streamOnce(): AsyncGenerator<TradeCreateEvent> {
    const channel = await this.getChannel();
    const ws = new WebSocket(PNW_PUSHER_URL);
    const queue: Record<string, unknown>[] = [];
    let closed = false;
    let socketId = '';
    const gatewayResetAt = Date.now() + GATEWAY_RESET_INTERVAL_MS;
    let intentionalCloseReason = '';
    let lastActivityAt = Date.now();
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (err: Error) => reject(err));
    });

    ws.on('message', (raw: any) => {
      try {
        lastActivityAt = Date.now();
        const frame = JSON.parse(raw.toString()) as Record<string, unknown>;
        const eventName = asString(frame.event);
        if (eventName === 'pusher:ping') {
          const pusherPingData = frame.data;
          let pongData: Record<string, unknown> = {};
          if (typeof pusherPingData === 'string') {
            try {
              const parsed = JSON.parse(pusherPingData);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                pongData = parsed as Record<string, unknown>;
              }
            } catch {
              // Fall back to an empty object.
            }
          } else if (pusherPingData && typeof pusherPingData === 'object' && !Array.isArray(pusherPingData)) {
            pongData = pusherPingData as Record<string, unknown>;
          }
          ws.send(JSON.stringify({event: 'pusher:pong', data: pongData}));
          return;
        }
        queue.push(frame);
      } catch {
        // Ignore malformed payloads.
      }
    });
    ws.on('pong', () => {
      lastActivityAt = Date.now();
    });
    ws.on('ping', () => {
      lastActivityAt = Date.now();
      try {
        ws.pong();
      } catch {
        // Ignore keepalive send failures; close/error handlers drive reconnect.
      }
    });
    ws.on('close', (code: number, reason: Buffer) => {
      closed = true;
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
      const reasonText = reason.length ? reason.toString('utf8') : '';
      const idleSeconds = Math.max(0, Math.floor((Date.now() - lastActivityAt) / 1000));
      const closeSummary = `PnW trade subscription WebSocket closed (code=${code}, reason=${reasonText || 'n/a'}, idle=${idleSeconds}s).`;
      if (intentionalCloseReason) {
        console.info(`${closeSummary} ${intentionalCloseReason}.`);
      } else {
        if (code === 4201) {
          this.channel = null;
        }
        console.warn(closeSummary);
      }
    });
    ws.on('error', () => {
      closed = true;
    });
    keepaliveTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({event: 'pusher:ping', data: {}}));
      } catch {
        // Ignore keepalive send failures; close/error handlers drive reconnect.
      }
    }, WS_KEEPALIVE_INTERVAL_MS);

    try {
      while (!closed) {
        if (Date.now() >= gatewayResetAt) {
          intentionalCloseReason = `Scheduled reconnect after ${GATEWAY_RESET_INTERVAL_MINUTES} minutes`;
          console.info(`PnW trade subscription: resetting gateway connection after ${GATEWAY_RESET_INTERVAL_MINUTES} minutes.`);
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
          const data = typeof rawData === 'string' ?
            JSON.parse(rawData) as Record<string, unknown> :
            (rawData as Record<string, unknown> || {});
          socketId = asString(data.socket_id);
          if (!socketId) throw new Error('PnW trade subscription connection did not provide socket_id.');
          const auth = await this.getAuth(channel, socketId);
          ws.send(JSON.stringify({event: 'pusher:subscribe', data: {auth, channel}}));
          continue;
        }
        if (eventName === 'pusher:error') {
          let errPayload: Record<string, unknown> = {};
          if (typeof frame.data === 'string') {
            try {
              const parsed = JSON.parse(frame.data);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                errPayload = parsed as Record<string, unknown>;
              }
            } catch {
              // Ignore malformed payloads.
            }
          } else if (frame.data && typeof frame.data === 'object' && !Array.isArray(frame.data)) {
            errPayload = frame.data as Record<string, unknown>;
          }
          const pusherCode = asNumber(errPayload.code);
          if (pusherCode === 4201) {
            this.channel = null;
            intentionalCloseReason = 'Pusher auth error 4201; clearing cached channel and reconnecting';
          }
          const msg = asString(errPayload.message) || 'unknown pusher error';
          console.warn(`PnW trade subscription pusher:error code=${pusherCode || 'n/a'} message=${msg}`);
          ws.close();
          continue;
        }

        if (eventName !== 'TRADE_CREATE' && eventName !== 'BULK_TRADE_CREATE') continue;

        let rawItems: unknown = frame.data;
        if (typeof rawItems === 'string') {
          try {
            rawItems = JSON.parse(rawItems);
          } catch {
            rawItems = {};
          }
        }

        const items = eventName === 'BULK_TRADE_CREATE' ?
          (Array.isArray(rawItems) ? rawItems : []) :
          [rawItems];

        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const parsed = parseTradeCreateEvent(item as Record<string, unknown>);
          if (parsed) yield parsed;
        }
      }
    } finally {
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
      ws.close();
    }
  }

  async* iterTradeCreates(): AsyncGenerator<TradeCreateEvent> {
    let delaySeconds = RECONNECT_BASE_SECONDS;
    while (true) {
      try {
        for await (const event of this.streamOnce()) {
          delaySeconds = RECONNECT_BASE_SECONDS;
          yield event;
        }
      } catch (err) {
        console.error(`PnW trade subscription disconnected; retrying in ${delaySeconds}s.`, err);
      }
      await sleep(delaySeconds * 1000);
      delaySeconds = Math.min(delaySeconds * 2, RECONNECT_MAX_SECONDS);
    }
  }
}
