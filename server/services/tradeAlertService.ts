import superagent from 'superagent';
import {TradeCreateEvent} from './pwTradeSubscription';
import {sendToAdmins} from './pushService';

/**
 * Alerts admins when a nation creates a SELL trade offer that is priced
 * suspiciously low, either:
 *   - under a flat 10 ppu (price per unit), OR
 *   - under 10% of the average price of the last 5 trades for that resource
 *
 * Threshold PPU below which any sell offer is always flagged.
 */
const LOW_PPU_THRESHOLD = 10;
/** Fraction of the recent average price below which a sell offer is flagged. */
const LOW_PCT_OF_AVG_THRESHOLD = 0.1;
/** How many recent trades of the same resource to average. */
const RECENT_TRADE_SAMPLE_SIZE = 5;

/**
 * Where an admin should land when they click the notification.
 * PnW does not expose a stable "accept this exact trade id" deep link on
 * the public site, so by default we send admins to their own trade offers
 * page. If you'd rather point this at a page in your own frontend (e.g. a
 * `/trades/accept/:id` route you build), set TRADE_ACCEPT_URL_BASE to your
 * own app's URL and it will be used instead, with the trade id appended as
 * `?tradeId=`.
 */
function buildAcceptTradeUrl(trade: TradeCreateEvent): string {
  const base = (process.env.TRADE_ACCEPT_URL_BASE || '').trim();
  if (base) {
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}tradeId=${trade.tradeId}`;
  }
  // Default: PnW's own "my trade offers" page, which lists incoming offers
  // a nation can accept. Verify this matches your alliance's expected flow;
  // adjust PNW_TRADE_OFFERS_URL below if PnW changes their routing.
  return `https://politicsandwar.com/nation/trade/offers?tradeId=${trade.tradeId}`;
}

/**
 * PnW's `buy_or_sell` labeling has a documented history of being confusing —
 * the old (deprecated) Tradeprice API's own docs describe its "lowestbuy"
 * field as actually representing the best SELL side offer. We could not
 * find a confirmed report of the current v3 `buy_or_sell` trade field being
 * inverted, but if you verify (via test_trade_subscription.py — create a
 * real small sell offer yourself and watch what value comes back) that it
 * IS flipped, set TRADE_BUY_OR_SELL_INVERTED=true and every check below
 * corrects itself without a code change.
 */
const BUY_OR_SELL_INVERTED = (process.env.TRADE_BUY_OR_SELL_INVERTED || '').trim().toLowerCase() === 'true';
const SELL_VALUE = BUY_OR_SELL_INVERTED ? 'buy' : 'sell';

function isSellOffer(buyOrSell: string): boolean {
  return buyOrSell === SELL_VALUE;
}
function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Fetches the last N sell trades for a resource (excluding the trade we're
 * currently evaluating) and returns their average price. Returns 0 if none
 * could be fetched, in which case callers should skip the % check and rely
 * on the flat threshold only.
 */
async function fetchAveragePriceForResource(
    apiKey: string,
    resource: string,
    excludeTradeId: number,
): Promise<number> {
  const endpoint = (process.env.PW_GRAPHQL_URL || 'https://api.politicsandwar.com/graphql').trim();
  const query = `
    query RecentSellTrades($resource: [String], $buyOrSell: [String], $first: Int) {
      trades(offer_resource: $resource, buy_or_sell: $buyOrSell, first: $first, page: 1) {
        data {
          id
          price
          date
        }
      }
    }
  `;

  const response = await superagent
      .post(endpoint)
      .query({api_key: apiKey})
      .accept('json')
      .send({query, variables: {resource: [resource], buyOrSell: [SELL_VALUE], first: RECENT_TRADE_SAMPLE_SIZE + 1}})
      .ok(() => true)
      .catch(() => undefined);

  const body = response?.body as Record<string, unknown> | undefined;
  const data = (body?.data as Record<string, unknown> | undefined);
  const tradesField = (data?.trades as Record<string, unknown> | undefined);
  const rows = (tradesField?.data as Record<string, unknown>[] | undefined) ?? [];

  const prices = rows
      .filter((row) => asNumber(row.id) !== excludeTradeId)
      .sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime())
      .slice(0, RECENT_TRADE_SAMPLE_SIZE)
      .map((row) => asNumber(row.price))
      .filter((price) => price > 0);

  if (prices.length === 0) return 0;
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

/**
 * Evaluates a newly-created trade and, if it looks like an underpriced sell
 * offer, pushes a notification to every known admin account. Clicking the
 * notification takes the admin to the accept-trade page (see
 * buildAcceptTradeUrl above).
 */
export async function evaluateTradeForLowPriceAlert(
    trade: TradeCreateEvent,
    apiKey: string,
): Promise<void> {
  if (!isSellOffer(trade.buyOrSell)) return;
  if (!trade.offerResource || trade.price <= 0) return;

  let averagePrice = 0;
  try {
    averagePrice = await fetchAveragePriceForResource(apiKey, trade.offerResource, trade.tradeId);
  } catch (err) {
    console.error('[tradeAlertService] Failed to fetch recent trade prices for average calc', err);
  }

  const belowFlatThreshold = trade.price < LOW_PPU_THRESHOLD;
  const belowPercentOfAvg = averagePrice > 0 && trade.price < averagePrice * LOW_PCT_OF_AVG_THRESHOLD;

  if (!belowFlatThreshold && !belowPercentOfAvg) return;

  const reason = belowFlatThreshold && belowPercentOfAvg ?
    `under ${LOW_PPU_THRESHOLD} ppu and under ${LOW_PCT_OF_AVG_THRESHOLD * 100}% of the recent average (${averagePrice.toFixed(2)})` :
    belowFlatThreshold ?
      `under ${LOW_PPU_THRESHOLD} ppu` :
      `under ${LOW_PCT_OF_AVG_THRESHOLD * 100}% of the recent average (${averagePrice.toFixed(2)})`;

  console.log(
      `[tradeAlertService] Flagging trade #${trade.tradeId}: selling ${trade.offerAmount} ${trade.offerResource} ` +
    `at ${trade.price} ppu (${reason}).`,
  );

  await sendToAdmins({
    title: 'Underpriced sell offer',
    body: `#${trade.tradeId}: ${trade.offerAmount} ${trade.offerResource} @ ${trade.price} ppu (${reason})`,
    tag: `bar3-cheap-trade-${trade.tradeId}`,
    url: buildAcceptTradeUrl(trade),
  });
}
