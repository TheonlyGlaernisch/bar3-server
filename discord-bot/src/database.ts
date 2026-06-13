/**
 * MongoDB-backed storage for nation-to-Discord registrations.
 */
import { MongoClient, Db, Collection, IndexSpecification } from 'mongodb';

export interface RegistrationDoc {
  discord_id: string;
  nation_id: number;
  discord_username: string;
  registered_at: string;
}

export interface GuildConfigDoc {
  guild_id: string;
  slots_alliances?: number[];
  gov_roles?: Record<string, string | null>;
  grant_channel_id?: string | null;
  alliance_id?: number | null;
  welcome_enabled?: boolean;
  welcome_channel_id?: string | null;
  welcome_message?: string;
  gov_panel_channel_id?: string | null;
  gov_panel_message_id?: string | null;
  alliance_verified_at?: string | null;
  counter_request_channel_id?: string | null;
  translation_channel_ids?: string[];
}

export interface GuildDoc {
  guild_id: string;
  guild_name: string;
  invite_link?: string | null;
  updated_at: string;
}

export interface BotConfigDoc {
  key: string;
  value: string;
}

export interface WarAlertSubscriptionDoc {
  guild_id: string;
  channel_id: string;
  min_cities?: number | null;
  max_cities?: number | null;
}

export interface RecruiterSubscriptionDoc {
  guild_id: string;
  channel_id: string;
}

const GOV_ROLE_KEYS = [
  'leader', '2ic', 'econ', 'econ_gov', 'milcom', 'milcom_gov',
  'ia', 'ia_asst', 'gov', 'member',
] as const;

export type GovRoleKey = typeof GOV_ROLE_KEYS[number];

export class Database {
  private _client: MongoClient;
  private _col: Collection<RegistrationDoc>;
  private _guildConfig: Collection<GuildConfigDoc>;
  private _guilds: Collection<GuildDoc>;
  private _botConfig: Collection<BotConfigDoc>;

  constructor(uri: string, client?: MongoClient) {
    this._client = client ?? new MongoClient(uri);
    const db: Db = this._client.db('TRF');
    this._col = db.collection<RegistrationDoc>('registrations');
    this._guildConfig = db.collection<GuildConfigDoc>('guild_config');
    this._guilds = db.collection<GuildDoc>('guilds');
    this._botConfig = db.collection<BotConfigDoc>('bot_config');
  }

  async connect(): Promise<void> {
    await this._client.connect();
    await this._col.createIndex({ discord_id: 1 }, { unique: true });
    await this._col.createIndex({ nation_id: 1 }, { unique: true });
    await this._guilds.createIndex({ guild_id: 1 }, { unique: true });
  }

  // ------------------------------------------------------------------
  // Public helpers
  // ------------------------------------------------------------------

  async register(discordId: bigint, nationId: number, discordUsername = ''): Promise<void> {
    const now = new Date().toISOString();
    await this._col.updateOne(
      { discord_id: discordId.toString() },
      {
        $set: {
          discord_id: discordId.toString(),
          nation_id: nationId,
          registered_at: now,
          discord_username: discordUsername,
        },
      },
      { upsert: true }
    );
  }

  async getByDiscordId(discordId: bigint): Promise<RegistrationDoc | null> {
    return this._col.findOne({ discord_id: discordId.toString() }, { projection: { _id: 0 } });
  }

  async getByNationId(nationId: number): Promise<RegistrationDoc | null> {
    return this._col.findOne({ nation_id: nationId }, { projection: { _id: 0 } });
  }

  async getByDiscordUsername(username: string): Promise<RegistrationDoc | null> {
    const pattern = new RegExp(`^${escapeRegex(username.trim())}$`, 'i');
    return this._col.findOne({ discord_username: { $regex: pattern } }, { projection: { _id: 0 } });
  }

  async delete(discordId: bigint): Promise<boolean> {
    const result = await this._col.deleteOne({ discord_id: discordId.toString() });
    return result.deletedCount > 0;
  }

  // ------------------------------------------------------------------
  // Guild config helpers
  // ------------------------------------------------------------------

  async getSlotsAlliances(guildId: bigint): Promise<number[]> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    if (!doc) return [];
    return (doc.slots_alliances || []).map(Number);
  }

  async setSlotsAlliances(guildId: bigint, allianceIds: number[]): Promise<void> {
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: { guild_id: guildId.toString(), slots_alliances: allianceIds } },
      { upsert: true }
    );
  }

  // Gov-role config helpers ---------------------------------------------------

  async getGovRoles(guildId: bigint): Promise<Record<GovRoleKey, string | null>> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    const stored = (doc?.gov_roles) || {};
    const result: Partial<Record<GovRoleKey, string | null>> = {};
    for (const k of GOV_ROLE_KEYS) {
      const val = stored[k];
      result[k] = val != null ? String(val) : null;
    }
    return result as Record<GovRoleKey, string | null>;
  }

  async setGovRoles(guildId: bigint, roles: Record<GovRoleKey, string | null>): Promise<void> {
    const normalized: Partial<Record<GovRoleKey, string | null>> = {};
    for (const k of GOV_ROLE_KEYS) {
      normalized[k] = roles[k] ?? null;
    }
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: { guild_id: guildId.toString(), gov_roles: normalized } },
      { upsert: true }
    );
  }

  // Grant channel config helpers -------------------------------------------

  async getGrantChannel(guildId: bigint): Promise<string | null> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    if (!doc) return null;
    return doc.grant_channel_id != null ? String(doc.grant_channel_id) : null;
  }

  async setGrantChannel(guildId: bigint, channelId: string | null): Promise<void> {
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: { guild_id: guildId.toString(), grant_channel_id: channelId != null ? String(channelId) : null } },
      { upsert: true }
    );
  }

  // Alliance ID config helpers ---------------------------------------------

  async getAllianceId(guildId: bigint): Promise<number | null> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    if (!doc) return null;
    return doc.alliance_id != null ? Number(doc.alliance_id) : null;
  }

  async setAllianceId(guildId: bigint, allianceId: number | null): Promise<void> {
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: { guild_id: guildId.toString(), alliance_id: allianceId } },
      { upsert: true }
    );
  }

  async markAllianceVerified(guildId: bigint, verifiedAt: string | null = new Date().toISOString()): Promise<void> {
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: { guild_id: guildId.toString(), alliance_verified_at: verifiedAt } },
      { upsert: true }
    );
  }

  async isAllianceVerified(guildId: bigint): Promise<boolean> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0, alliance_verified_at: 1 } });
    return Boolean(doc?.alliance_verified_at);
  }

  async setCounterRequestChannel(guildId: bigint, channelId: string | null): Promise<void> {
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: { guild_id: guildId.toString(), counter_request_channel_id: channelId != null ? String(channelId) : null } },
      { upsert: true }
    );
  }

  async getCounterRequestChannel(guildId: bigint): Promise<string | null> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0, counter_request_channel_id: 1 } });
    return doc?.counter_request_channel_id != null ? String(doc.counter_request_channel_id) : null;
  }

  async getVerifiedGuildCounterChannelsByAlliance(allianceId: number): Promise<Array<{ guildId: string; channelId: string }>> {
    const docs = await this._guildConfig.find(
      {
        alliance_id: allianceId,
        alliance_verified_at: { $exists: true, $ne: null },
        counter_request_channel_id: { $exists: true, $ne: null },
      },
      { projection: { _id: 0, guild_id: 1, counter_request_channel_id: 1 } }
    ).toArray();
    return docs
      .map((d) => ({ guildId: String(d.guild_id), channelId: String(d.counter_request_channel_id) }))
      .filter((x) => /^\d+$/.test(x.guildId) && /^\d+$/.test(x.channelId));
  }

  async getTranslationChannels(guildId: bigint): Promise<string[]> {
    const doc = await this._guildConfig.findOne(
      { guild_id: guildId.toString() },
      { projection: { _id: 0, translation_channel_ids: 1 } }
    );
    const ids = Array.isArray(doc?.translation_channel_ids) ? doc.translation_channel_ids : [];
    return ids.map((id) => String(id));
  }

  async enableTranslationChannel(guildId: bigint, channelId: string): Promise<void> {
    const existing = await this.getTranslationChannels(guildId);
    const normalizedChannelId = String(channelId);
    const merged = Array.from(new Set([...existing, normalizedChannelId]));
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      {
        $set: {
          guild_id: guildId.toString(),
          translation_channel_ids: merged,
        },
      },
      { upsert: true }
    );
  }

  // Welcome message config helpers ----------------------------------------

  async getWelcomeConfig(guildId: bigint): Promise<{ enabled: boolean; channel_id: string | null; message: string }> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    return {
      enabled: Boolean(doc?.welcome_enabled ?? false),
      channel_id: doc?.welcome_channel_id != null ? String(doc.welcome_channel_id) : null,
      message: String(doc?.welcome_message ?? 'Welcome !(user)!'),
    };
  }

  async setWelcomeConfig(
    guildId: bigint,
    opts: { enabled?: boolean; channelId?: string | null; message?: string }
  ): Promise<void> {
    const updates: Record<string, unknown> = { guild_id: guildId.toString() };
    if (opts.enabled !== undefined) updates['welcome_enabled'] = opts.enabled;
    if (opts.channelId !== undefined) updates['welcome_channel_id'] = opts.channelId != null ? String(opts.channelId) : null;
    if (opts.message !== undefined) updates['welcome_message'] = opts.message;
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: updates },
      { upsert: true }
    );
  }

  async getGovPanel(guildId: bigint): Promise<{ channelId: string | null; messageId: string | null }> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    return {
      channelId: doc?.gov_panel_channel_id != null ? String(doc.gov_panel_channel_id) : null,
      messageId: doc?.gov_panel_message_id != null ? String(doc.gov_panel_message_id) : null,
    };
  }

  async setGovPanel(guildId: bigint, channelId: string | null, messageId: string | null): Promise<void> {
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      {
        $set: {
          guild_id: guildId.toString(),
          gov_panel_channel_id: channelId != null ? String(channelId) : null,
          gov_panel_message_id: messageId != null ? String(messageId) : null,
        },
      },
      { upsert: true }
    );
  }

  // Guild listing helpers ---------------------------------------------------

  async upsertGuild(guildId: bigint, guildName: string, inviteLink: string | null = null): Promise<void> {
    const now = new Date().toISOString();
    await this._guilds.updateOne(
      { guild_id: guildId.toString() },
      {
        $set: {
          guild_id: guildId.toString(),
          guild_name: guildName,
          invite_link: inviteLink,
          updated_at: now,
        },
      },
      { upsert: true }
    );
  }

  async getGuild(guildId: bigint): Promise<GuildDoc | null> {
    return this._guilds.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
  }

  async getAllGuilds(): Promise<GuildDoc[]> {
    return this._guilds.find({}, { projection: { _id: 0 } }).toArray();
  }

  // Bot-level config helpers -----------------------------------------------

  async getPnwApiKey(): Promise<string | null> {
    const doc = await this._botConfig.findOne({ key: 'pnw_api_key' }, { projection: { _id: 0 } });
    return doc?.value ?? null;
  }

  async setPnwApiKey(apiKey: string): Promise<void> {
    await this._botConfig.updateOne(
      { key: 'pnw_api_key' },
      { $set: { key: 'pnw_api_key', value: apiKey } },
      { upsert: true }
    );
  }

  // War alert subscription helpers -----------------------------------------

  private get _warAlertCol(): Collection<WarAlertSubscriptionDoc> {
    return this._client.db('TRF').collection<WarAlertSubscriptionDoc>('war_alert_subscriptions');
  }

  async ensureWarAlertIndexes(): Promise<void> {
    await this._warAlertCol.createIndex(
      { guild_id: 1, channel_id: 1 },
      { unique: true }
    );
  }

  async addWarAlertSubscription(
    guildId: bigint,
    channelId: bigint,
    minCities: number | null,
    maxCities: number | null
  ): Promise<void> {
    await this._warAlertCol.updateOne(
      { guild_id: guildId.toString(), channel_id: channelId.toString() },
      {
        $set: {
          guild_id: guildId.toString(),
          channel_id: channelId.toString(),
          min_cities: minCities,
          max_cities: maxCities,
        },
      },
      { upsert: true }
    );
  }

  async removeWarAlertSubscription(guildId: bigint, channelId: bigint): Promise<boolean> {
    const result = await this._warAlertCol.deleteOne({
      guild_id: guildId.toString(),
      channel_id: channelId.toString(),
    });
    return result.deletedCount > 0;
  }

  async getWarAlertSubscriptions(guildId: bigint): Promise<WarAlertSubscriptionDoc[]> {
    return this._warAlertCol.find({ guild_id: guildId.toString() }, { projection: { _id: 0 } }).toArray();
  }

  async getAllWarAlertSubscriptions(): Promise<WarAlertSubscriptionDoc[]> {
    return this._warAlertCol.find({}, { projection: { _id: 0 } }).toArray();
  }

  // Recruiter subscription helpers -----------------------------------------

  private get _recruiterCol(): Collection<RecruiterSubscriptionDoc> {
    return this._client.db('TRF').collection<RecruiterSubscriptionDoc>('recruiter_subscriptions');
  }

  async ensureRecruiterIndexes(): Promise<void> {
    await this._recruiterCol.createIndex(
      { guild_id: 1, channel_id: 1 },
      { unique: true }
    );
  }

  async addRecruiterSubscription(guildId: bigint, channelId: bigint): Promise<void> {
    await this._recruiterCol.updateOne(
      { guild_id: guildId.toString(), channel_id: channelId.toString() },
      { $set: { guild_id: guildId.toString(), channel_id: channelId.toString() } },
      { upsert: true }
    );
  }

  async removeRecruiterSubscription(guildId: bigint, channelId: bigint): Promise<boolean> {
    const result = await this._recruiterCol.deleteOne({
      guild_id: guildId.toString(),
      channel_id: channelId.toString(),
    });
    return result.deletedCount > 0;
  }

  async getRecruiterSubscriptions(guildId: bigint): Promise<RecruiterSubscriptionDoc[]> {
    return this._recruiterCol.find({ guild_id: guildId.toString() }, { projection: { _id: 0 } }).toArray();
  }

  async getAllRecruiterSubscriptions(): Promise<RecruiterSubscriptionDoc[]> {
    return this._recruiterCol.find({}, { projection: { _id: 0 } }).toArray();
  }

  async close(): Promise<void> {
    await this._client.close();
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export interface PointsDoc {
  user_id: string;
  user_name: string;
  guild_id: string;
  guild_name: string;
  amount: number;
  base_amount: number;
  multiplier_used: number;
  type: string;
  added_by?: string | null;
  removed_by?: string | null;
  timestamp: Date;
}
 
export interface WinsDoc {
  user_id: string;
  user_name: string;
  guild_id: string;
  guild_name: string;
  amount: number;
  type: string;
  added_by?: string | null;
  removed_by?: string | null;
  timestamp: Date;
}
 
export interface MultiplierDoc {
  guild_id: string;
  guild_name: string;
  multiplier: number;
  description: string;
  set_by: string;
  set_by_name: string;
  timestamp: Date;
  active: boolean;
  edited_by?: string;
  edited_by_name?: string;
  edit_timestamp?: Date;
  ended_by?: string;
  ended_by_name?: string;
  end_timestamp?: Date;
}
 
export interface RewardRoleDoc {
  guild_id: string;
  channel_id: string;
  role_id: string;
  role_name: string;
  type: 'points' | 'wins';
  amount: number;
  created_at: Date;
  created_by: string;
  active: boolean;
}
 
export interface WinlogSettingsDoc {
  guild_id: string;
  guild_name: string;
  channel_id: string;
  channel_name: string;
  clan_name: string;
  set_by: string;
  set_by_name: string;
  timestamp: Date;
  active: boolean;
}
 
export interface AccountLinkDoc {
  user_id: string;
  guild_id: string;
  account_name: string;
  linked_by: string;
  timestamp: Date;
}
 
export interface BotManagerSettingsDoc {
  guild_id: string;
  manager_role_id: string;
  manager_role_name: string;
  set_by: string;
  set_at: Date;
}
 
// ---------------------------------------------------------------------------
// Methods to add to the Database class
// ---------------------------------------------------------------------------
 
export class DatabaseTerritorialExtensions {
  private _points!: Collection<PointsDoc>;
  private _wins!: Collection<WinsDoc>;
  private _multipliers!: Collection<MultiplierDoc>;
  private _rewardRoles!: Collection<RewardRoleDoc>;
  private _winlogSettings!: Collection<WinlogSettingsDoc>;
  private _accountLinks!: Collection<AccountLinkDoc>;
  private _botManagerSettings!: Collection<BotManagerSettingsDoc>;
 
  // Call this from the constructor alongside other collection initializers:
  //   this._points = db.collection<PointsDoc>('points');
  //   this._wins = db.collection<WinsDoc>('wins');
  //   this._multipliers = db.collection<MultiplierDoc>('multipliers');
  //   this._rewardRoles = db.collection<RewardRoleDoc>('reward_roles');
  //   this._winlogSettings = db.collection<WinlogSettingsDoc>('winlog_settings');
  //   this._accountLinks = db.collection<AccountLinkDoc>('account_links');
  //   this._botManagerSettings = db.collection<BotManagerSettingsDoc>('bot_settings');
 
  // -----------------------------------------------------------------------
  // Points / Wins
  // -----------------------------------------------------------------------
 
  async addPoints(doc: PointsDoc): Promise<void> {
    await this._points.insertOne(doc);
  }
 
  async addWins(doc: WinsDoc): Promise<void> {
    await this._wins.insertOne(doc);
  }
 
  async getUserTotal(
    collection: 'points' | 'wins',
    guildId: string,
    userId: string,
    since?: Date,
  ): Promise<number> {
    const col = collection === 'points' ? this._points : this._wins;
    const match: Record<string, unknown> = { guild_id: guildId, user_id: userId };
    if (since) match['timestamp'] = { $gte: since };
    const result = await col.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).toArray();
    return (result[0] as { total?: number } | undefined)?.total ?? 0;
  }
 
  async getGuildRanking(
    collection: 'points' | 'wins',
    guildId: string,
    opts: { since?: Date; until?: Date; page?: number; pageSize?: number } = {},
  ): Promise<Array<{ userId: string; total: number }>> {
    const col = collection === 'points' ? this._points : this._wins;
    const { since, until, page = 0, pageSize = 10 } = opts;
    const match: Record<string, unknown> = { guild_id: guildId };
    if (since || until) {
      const range: Record<string, Date> = {};
      if (since) range['$gte'] = since;
      if (until) range['$lt'] = until;
      match['timestamp'] = range;
    }
    const result = await col.aggregate([
      { $match: match },
      { $group: { _id: '$user_id', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $skip: page * pageSize },
      { $limit: pageSize },
    ]).toArray();
    return (result as Array<{ _id: string; total: number }>).map((r) => ({ userId: r._id, total: r.total }));
  }
 
  async getUserRank(collection: 'points' | 'wins', guildId: string, userId: string): Promise<number | null> {
    const col = collection === 'points' ? this._points : this._wins;
    const result = await col.aggregate([
      { $match: { guild_id: guildId } },
      { $group: { _id: '$user_id', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]).toArray();
    const rows = result as Array<{ _id: string; total: number }>;
    const idx = rows.findIndex((r) => r._id === userId);
    return idx === -1 ? null : idx + 1;
  }
 
  async getAvailableMonths(guildId: string): Promise<Array<[number, number]>> {
    const months = new Set<string>();
    for (const col of [this._points, this._wins]) {
      const results = await col.aggregate([
        { $match: { guild_id: guildId } },
        { $group: { _id: { year: { $year: '$timestamp' }, month: { $month: '$timestamp' } } } },
      ]).toArray();
      for (const r of results as Array<{ _id: { year: number; month: number } }>) {
        months.add(`${r._id.year}-${r._id.month}`);
      }
    }
    return [...months]
      .map((s) => s.split('-').map(Number) as [number, number])
      .sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]));
  }
 
  // -----------------------------------------------------------------------
  // Multipliers
  // -----------------------------------------------------------------------
 
  async getActiveMultiplier(guildId: string): Promise<MultiplierDoc | null> {
    return this._multipliers.findOne({ guild_id: guildId, active: true }, { projection: { _id: 0 } });
  }
 
  async setMultiplier(doc: Omit<MultiplierDoc, 'active'>): Promise<void> {
    await this._multipliers.updateOne(
      { guild_id: doc.guild_id },
      { $set: { ...doc, active: true } },
      { upsert: true },
    );
  }
 
  async editMultiplier(
    guildId: string,
    multiplier: number,
    description: string,
    editedBy: string,
    editedByName: string,
  ): Promise<MultiplierDoc | null> {
    const existing = await this.getActiveMultiplier(guildId);
    if (!existing) return null;
    await this._multipliers.updateOne(
      { guild_id: guildId, active: true },
      {
        $set: {
          multiplier,
          description,
          edited_by: editedBy,
          edited_by_name: editedByName,
          edit_timestamp: new Date(),
        },
      },
    );
    return existing;
  }
 
  async endMultiplier(guildId: string, endedBy: string, endedByName: string): Promise<MultiplierDoc | null> {
    const existing = await this.getActiveMultiplier(guildId);
    if (!existing) return null;
    await this._multipliers.updateOne(
      { guild_id: guildId, active: true },
      {
        $set: {
          active: false,
          ended_by: endedBy,
          ended_by_name: endedByName,
          end_timestamp: new Date(),
        },
      },
    );
    return existing;
  }
 
  // -----------------------------------------------------------------------
  // Reward roles
  // -----------------------------------------------------------------------
 
  async addRewardRole(doc: RewardRoleDoc): Promise<void> {
    await this._rewardRoles.insertOne(doc);
  }
 
  async getRewardRoles(guildId: string): Promise<RewardRoleDoc[]> {
    return this._rewardRoles.find({ guild_id: guildId, active: true }, { projection: { _id: 0 } }).toArray();
  }
 
  async getAllActiveRewardRoles(): Promise<RewardRoleDoc[]> {
    return this._rewardRoles.find({ active: true }, { projection: { _id: 0 } }).sort({ amount: -1 }).toArray();
  }
 
  async deleteRewardRole(guildId: string, roleId: string): Promise<boolean> {
    const result = await this._rewardRoles.deleteOne({ guild_id: guildId, role_id: roleId, active: true });
    return result.deletedCount > 0;
  }
 
  async editRewardRole(
    guildId: string,
    roleId: string,
    updates: { amount?: number; channelId?: string },
  ): Promise<boolean> {
    const set: Record<string, unknown> = {};
    if (updates.amount != null) set['amount'] = updates.amount;
    if (updates.channelId != null) set['channel_id'] = updates.channelId;
    if (!Object.keys(set).length) return false;
    const result = await this._rewardRoles.updateOne(
      { guild_id: guildId, role_id: roleId, active: true },
      { $set: set },
    );
    return result.modifiedCount > 0;
  }
 
  // -----------------------------------------------------------------------
  // Winlog settings
  // -----------------------------------------------------------------------
 
  async setWinlogSettings(doc: WinlogSettingsDoc): Promise<void> {
    await this._winlogSettings.deleteMany({ guild_id: doc.guild_id });
    await this._winlogSettings.insertOne(doc);
  }
 
  async getActiveWinlogSettings(): Promise<WinlogSettingsDoc[]> {
    return this._winlogSettings.find({ active: true }, { projection: { _id: 0 } }).toArray();
  }
 
  // -----------------------------------------------------------------------
  // Account links
  // -----------------------------------------------------------------------
 
  async setAccountLink(doc: AccountLinkDoc): Promise<void> {
    await this._accountLinks.updateOne(
      { user_id: doc.user_id, guild_id: doc.guild_id },
      { $set: doc },
      { upsert: true },
    );
  }
 
  async getAccountLinksForGuild(guildId: string): Promise<AccountLinkDoc[]> {
    return this._accountLinks.find({ guild_id: guildId }, { projection: { _id: 0 } }).toArray();
  }
 
  // -----------------------------------------------------------------------
  // Bot manager role
  // -----------------------------------------------------------------------
 
  async setBotManagerRole(guildId: string, roleId: string, roleName: string, setBy: string): Promise<void> {
    await this._botManagerSettings.deleteMany({ guild_id: guildId });
    await this._botManagerSettings.insertOne({
      guild_id: guildId,
      manager_role_id: roleId,
      manager_role_name: roleName,
      set_by: setBy,
      set_at: new Date(),
    });
  }
 
  async getBotManagerSettings(guildId: string): Promise<BotManagerSettingsDoc | null> {
    return this._botManagerSettings.findOne({ guild_id: guildId }, { projection: { _id: 0 } });
  }
}

