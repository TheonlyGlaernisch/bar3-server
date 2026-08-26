import state from './state';
import dLog from '../utilities/debugLog';
import {PnWTradeSubscriptionClient} from './pwTradeSubscription';
import {evaluateTradeForLowPriceAlert} from './tradeAlertService';

/**
 * Subscribes to trade/create events from the PnW subscription API and flags
 * underpriced sell offers to admins.
 */
class TradeSearchService {
  private subscriptionStarted = false;

  public startTradeCreateSubscription() {
    if (this.subscriptionStarted) return;
    this.subscriptionStarted = true;

    const scanningKey = (process.env.PW_SCAN_API_KEY || '').trim() || state.config.apiKey;
    if (!scanningKey) {
      console.warn('[tradeSearch] No PW_SCAN_API_KEY / config API key found; trade-create subscription will NOT start.');
      this.subscriptionStarted = false;
      return;
    }
    console.log('[tradeSearch] Starting trade-create subscription.');
    const subscriptionClient = new PnWTradeSubscriptionClient(scanningKey);

    (async () => {
      for await (const trade of subscriptionClient.iterTradeCreates()) {
        console.log(`[tradeSearch] Trade #${trade.tradeId}: ${trade.buyOrSell} ${trade.offerAmount} ${trade.offerResource} @ ${trade.price}`);
        dLog(`Trade #${trade.tradeId}: ${trade.buyOrSell} ${trade.offerAmount} ${trade.offerResource} @ ${trade.price}`);

        evaluateTradeForLowPriceAlert(trade, scanningKey).catch((err) => {
          console.error('[tradeSearch] Failed to evaluate trade for low-price alert', err);
        });
      }
    })().catch((err) => {
      this.subscriptionStarted = false;
      console.error('trade search subscription loop failed', err);
    });
  }
}

export default new TradeSearchService();
