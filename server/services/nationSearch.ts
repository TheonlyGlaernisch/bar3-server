import state from './state';
import dLog from '../utilities/debugLog';
import superagent, {Response} from 'superagent';
import messages from './messages';
import {NationAPICall} from '../interfaces/types';
import { PnWNationSubscriptionClient } from './pwNationSubscription';

/**
 * Searches for new nations
 * They should be created today and show other traits of being new
 */
class NationSearchService {
  private subscriptionStarted = false;

  public startNationCreateSubscription() {
    if (this.subscriptionStarted) return;
    this.subscriptionStarted = true;

    const scanningKey = (process.env.PW_SCAN_API_KEY || '').trim() || state.config.apiKey;
    if (!scanningKey) return;
    const subscriptionClient = new PnWNationSubscriptionClient(scanningKey);

    (async () => {
      for await (const nation of subscriptionClient.iterNationCreates()) {
        if (!state.isApplicationOn) continue;
        if (state.nationIDCache.includes(nation.nationId)) continue;

        messages.addNationToQueue({
          nation_id: nation.nationId,
          nation: nation.nationName || String(nation.nationId),
          leader: nation.leaderName || '',
          continent: 0,
          war_policy: 0,
          domestic_policy: 0,
          color: 0,
          alliance_id: nation.allianceId,
          alliance: '',
          alliance_position: nation.alliancePosition,
          cities: nation.cities,
          offensive_wars: 0,
          defensive_wars: 0,
          score: nation.score,
          v_mode: false,
          v_mode_turns: 0,
          beige_turns: 0,
          last_active: '',
          discord: '',
          founded: nation.founded.toISOString(),
          soldiers: 0,
          tanks: 0,
          aircraft: 0,
          ships: 0,
          missiles: 0,
          nukes: 0,
        });

        state.nationIDCache.push(nation.nationId);
        if (state.nationIDCache.length > 2000) {
          state.nationIDCache = state.nationIDCache.slice(state.nationIDCache.length - 2000);
        }
      }
    })().catch((err) => {
      this.subscriptionStarted = false;
      console.error('nation search subscription loop failed', err);
    });
  }

  /**
   * Finds new nations
   */
  async findNewNations() {
    dLog(`Bar 3 is currently ${state.isApplicationOn ? 'on' : 'off'}`);
    if (!state.isApplicationOn) return;

    // Get the current date and adjust to match GMT timezone
    const now = new Date();
    const minutesOffset = now.getTimezoneOffset();
    now.setTime(now.getTime() + (minutesOffset * 60 * 1000));

    const year = now.getFullYear();

    let month: number | string = now.getMonth() + 1;
    if (month < 10) {
      month = '0'+month.toString();
    }

    let day: number | string = now.getDate();
    if (day < 10) {
      day = '0'+day.toString();
    }

    const nationsRequest: Response | void = await superagent.get(`https://politicsandwar.com/api/v2/nations/${state.config.apiKey}/&max_score=50&alliance_position=0&date_created=${year}${month}${day}`)
        .accept('json')
        .then()
        .catch((e) => {
          console.error('Cannot get nations!', e);
        });

    if (!nationsRequest) return;
    const apiCall: NationAPICall.RootObject = nationsRequest.body;

    if (!apiCall.api_request.success) {
      if (apiCall.api_request.error_msg == 'No results to display.') {
        dLog('No new nations created today.');
        return;
      }
      console.error('Can\'t get nations! Check your config.');
      dLog('API returned unsuccessful whilst getting nations.');
      return;
    }

    dLog(`API returned ${apiCall.data.length} new nations for processing`);

    state.updateCurrentAPIDetails(
        apiCall.api_request.api_key_details.daily_requests_maximum,
        apiCall.api_request.api_key_details.daily_requests_used);

    dLog('Updated API requests used and max');
    dLog(`Nation ID Cache is storing ${state.nationIDCache.length} nation IDs`);

    if (state.nationIDCache.length == 0) {
      state.updateNationIDCache(apiCall.data);
      return;
    }

    let nation;
    for (nation of apiCall.data) {
      if (state.nationIDCache.includes(nation.nation_id)) continue;
      messages.addNationToQueue(nation);
    }

    state.updateNationIDCache(apiCall.data);
  }
}

export default new NationSearchService();
