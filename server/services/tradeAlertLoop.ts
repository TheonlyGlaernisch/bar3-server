import dLog from '../utilities/debugLog';
import tradeSearch from '../services/tradeSearch';

/**
 * Starts the trade-create subscription listener, which flags underpriced
 * sell offers and notifies admins.
 */
export default function tradeAlertTimeout(): void {
  dLog('Starting trade-create subscription listener.');
  tradeSearch.startTradeCreateSubscription();
}
