import state from '../services/state';
import dLog from '../utilities/debugLog';
import nationSearch from '../services/nationSearch';

/**
 * Finds nations to send the messages to
 * It is a timeout because the update time could change
 */
export default function nationSearchTimeout(): void {
  dLog(`Starting nation-create subscription listener (polling interval ${state.config.updatePeriodMilliseconds}ms disabled).`);
  nationSearch.startNationCreateSubscription();
}
