import {CampaignAnalytics} from '../interfaces/analytics';
import CampaignAnalyticsModel from '../models/campaignAnalytics';
import debugLog from '../utilities/debugLog';

/**
 * Manages anything to do with saving data to databases
 */
class DatabaseService {
  /**
   * Saves updated analytics about a specific campaign
   * @param {CampaignAnalytics} analytics The analytics of a campaign
   * @param {string} name The name of the campaign
   */
  async saveCampaignAnalytics(analytics: CampaignAnalytics, name: string): Promise<undefined> {
    debugLog(`saving campaign analytics for ${name}`);
    const createdAt = analytics.createdAt || new Date(analytics.createdTime);

    await CampaignAnalyticsModel.findOneAndUpdate(
      {name},
      {
        ...analytics,
        createdAt,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).exec();

    return undefined;
  }

  /**
   * Get's info about a campaign
   * @param {string} name The name of the campaign to retrieve
   */
  async getCampaignAnalytics(name: string): Promise<CampaignAnalytics | null> {
    return CampaignAnalyticsModel.findOne({name}).lean<CampaignAnalytics>().exec();
  }

  /**
   * Get's info about the current, latest campaign
   */
  async getLatestCampaign(): Promise<CampaignAnalytics | null> {
    return CampaignAnalyticsModel.findOne({})
      .sort({createdTime: -1})
      .lean<CampaignAnalytics>()
      .exec();
  }

  /**
   * Returns all stored campaigns
   * @return {CampaignAnalytics[]} Each of the campaigns
   */
  async getAllCampaigns(): Promise<CampaignAnalytics[]> {
    return CampaignAnalyticsModel.find({})
      .sort({createdTime: 1})
      .lean<CampaignAnalytics[]>()
      .exec();
  }
}

export default new DatabaseService();
