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
  gov_roles?: Record<string, number | null>;
  grant_channel_id?: number | null;
  alliance_id?: number | null;
  welcome_enabled?: boolean;
  welcome_channel_id?: number | null;
  welcome_message?: string;
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

  async getGovRoles(guildId: bigint): Promise<Record<GovRoleKey, number | null>> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    const stored = (doc?.gov_roles) || {};
    const result: Partial<Record<GovRoleKey, number | null>> = {};
    for (const k of GOV_ROLE_KEYS) {
      const val = stored[k];
      result[k] = val != null ? Number(val) : null;
    }
    return result as Record<GovRoleKey, number | null>;
  }

  async setGovRoles(guildId: bigint, roles: Record<GovRoleKey, number | null>): Promise<void> {
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: { guild_id: guildId.toString(), gov_roles: roles } },
      { upsert: true }
    );
  }

  // Grant channel config helpers -------------------------------------------

  async getGrantChannel(guildId: bigint): Promise<number | null> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    if (!doc) return null;
    return doc.grant_channel_id != null ? Number(doc.grant_channel_id) : null;
  }

  async setGrantChannel(guildId: bigint, channelId: number | null): Promise<void> {
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: { guild_id: guildId.toString(), grant_channel_id: channelId } },
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

  // Welcome message config helpers ----------------------------------------

  async getWelcomeConfig(guildId: bigint): Promise<{ enabled: boolean; channel_id: number | null; message: string }> {
    const doc = await this._guildConfig.findOne({ guild_id: guildId.toString() }, { projection: { _id: 0 } });
    return {
      enabled: Boolean(doc?.welcome_enabled ?? false),
      channel_id: doc?.welcome_channel_id != null ? Number(doc.welcome_channel_id) : null,
      message: String(doc?.welcome_message ?? 'Welcome !(user)!'),
    };
  }

  async setWelcomeConfig(
    guildId: bigint,
    opts: { enabled?: boolean; channelId?: number | null; message?: string }
  ): Promise<void> {
    const updates: Record<string, unknown> = { guild_id: guildId.toString() };
    if (opts.enabled !== undefined) updates['welcome_enabled'] = opts.enabled;
    if (opts.channelId !== undefined) updates['welcome_channel_id'] = opts.channelId;
    if (opts.message !== undefined) updates['welcome_message'] = opts.message;
    await this._guildConfig.updateOne(
      { guild_id: guildId.toString() },
      { $set: updates },
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
