import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from './build/src/database.js';

// ---------------------------------------------------------------------------
// Lightweight pure-JS MongoDB mock (no binary download required).
// Mirrors the pattern used by Python's mongomock in test_core.py.
// ---------------------------------------------------------------------------

class InMemoryCollection {
  constructor() {
    this._docs = [];
    this._uniqueIndexes = []; // each entry is an array of field names
  }

  async createIndex(spec, opts = {}) {
    if (opts.unique) {
      this._uniqueIndexes.push(Object.keys(spec));
    }
  }

  _matches(doc, filter) {
    for (const [k, v] of Object.entries(filter)) {
      if (v !== null && typeof v === 'object' && '$regex' in v) {
        if (!v.$regex.test(doc[k])) return false;
      } else {
        if (doc[k] !== v) return false;
      }
    }
    return true;
  }

  _checkUnique(candidate, excludeIndex = -1) {
    for (const fields of this._uniqueIndexes) {
      for (let i = 0; i < this._docs.length; i++) {
        if (i === excludeIndex) continue;
        const existing = this._docs[i];
        if (fields.every((f) => candidate[f] !== undefined && existing[f] === candidate[f])) {
          const key = fields.map((f) => `${f}:${candidate[f]}`).join(', ');
          throw Object.assign(new Error(`E11000 duplicate key error: ${key}`), { code: 11000 });
        }
      }
    }
  }

  async updateOne(filter, update, opts = {}) {
    const idx = this._docs.findIndex((d) => this._matches(d, filter));
    const setVals = update['$set'] || {};
    if (idx >= 0) {
      const updated = { ...this._docs[idx], ...setVals };
      this._checkUnique(updated, idx);
      this._docs[idx] = updated;
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    } else if (opts.upsert) {
      const newDoc = { ...filter, ...setVals };
      this._checkUnique(newDoc);
      this._docs.push(newDoc);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
  }

  async findOne(filter, opts = {}) {
    const doc = this._docs.find((d) => this._matches(d, filter));
    if (!doc) return null;
    const result = { ...doc };
    if (opts.projection && opts.projection['_id'] === 0) delete result._id;
    return result;
  }

  async deleteOne(filter) {
    const idx = this._docs.findIndex((d) => this._matches(d, filter));
    if (idx >= 0) {
      this._docs.splice(idx, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  find(filter, opts = {}) {
    const results = this._docs.filter((d) => this._matches(d, filter));
    return {
      toArray: async () =>
        results.map((doc) => {
          const r = { ...doc };
          if (opts.projection && opts.projection['_id'] === 0) delete r._id;
          return r;
        }),
    };
  }
}

class InMemoryDb {
  constructor() {
    this._collections = new Map();
  }
  collection(name) {
    if (!this._collections.has(name)) this._collections.set(name, new InMemoryCollection());
    return this._collections.get(name);
  }
}

class InMemoryClient {
  constructor() {
    this._dbs = new Map();
  }
  async connect() {}
  async close() {}
  db(name) {
    if (!this._dbs.has(name)) this._dbs.set(name, new InMemoryDb());
    return this._dbs.get(name);
  }
}

/** Create an isolated Database backed by a fresh in-memory client. */
async function makeDb() {
  const client = new InMemoryClient();
  const db = new Database('mongodb://irrelevant', client);
  await db.connect();
  return db;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

test('register and getByDiscordId', async () => {
  const db = await makeDb();
  await db.register(BigInt(1001), 2001, 'alice');
  const row = await db.getByDiscordId(BigInt(1001));
  assert.ok(row);
  assert.equal(row.nation_id, 2001);
  assert.equal(row.discord_username, 'alice');
});

test('register and getByNationId', async () => {
  const db = await makeDb();
  await db.register(BigInt(1002), 2002, 'bob');
  const row = await db.getByNationId(2002);
  assert.ok(row);
  assert.equal(row.discord_id, '1002');
});

test('register updates existing entry (upsert by discord_id)', async () => {
  const db = await makeDb();
  await db.register(BigInt(1003), 3001, 'carol');
  await db.register(BigInt(1003), 3002, 'carol');
  const row = await db.getByDiscordId(BigInt(1003));
  assert.ok(row);
  assert.equal(row.nation_id, 3002);
});

test('getByDiscordId returns null for missing ID', async () => {
  const db = await makeDb();
  assert.equal(await db.getByDiscordId(BigInt(9999999)), null);
});

test('getByNationId returns null for missing nation', async () => {
  const db = await makeDb();
  assert.equal(await db.getByNationId(8888888), null);
});

test('delete returns true when found and false when not found', async () => {
  const db = await makeDb();
  await db.register(BigInt(1004), 4001, 'dave');
  assert.equal(await db.delete(BigInt(1004)), true);
  assert.equal(await db.getByDiscordId(BigInt(1004)), null);
  assert.equal(await db.delete(BigInt(1004)), false);
});

test('nation_id unique index rejects duplicate registrations', async () => {
  const db = await makeDb();
  await db.register(BigInt(1010), 9001, 'userA');
  await assert.rejects(
    () => db.register(BigInt(1011), 9001, 'userB'),
    (err) => err.code === 11000,
  );
});

test('getByDiscordUsername is case-insensitive', async () => {
  const db = await makeDb();
  await db.register(BigInt(1005), 5001, 'Eve');
  assert.ok(await db.getByDiscordUsername('eve'));
  assert.ok(await db.getByDiscordUsername('EVE'));
  assert.equal(await db.getByDiscordUsername('frank'), null);
});

// ---------------------------------------------------------------------------
// Guild config — slots alliances
// ---------------------------------------------------------------------------

test('getSlotsAlliances returns empty array for unconfigured guild', async () => {
  const db = await makeDb();
  assert.deepEqual(await db.getSlotsAlliances(BigInt(100)), []);
});

test('setSlotsAlliances and getSlotsAlliances round-trip', async () => {
  const db = await makeDb();
  await db.setSlotsAlliances(BigInt(101), [10, 20, 30]);
  assert.deepEqual(await db.getSlotsAlliances(BigInt(101)), [10, 20, 30]);
});

// ---------------------------------------------------------------------------
// Guild config — gov roles
// ---------------------------------------------------------------------------

test('getGovRoles returns all-null for unconfigured guild', async () => {
  const db = await makeDb();
  const roles = await db.getGovRoles(BigInt(200));
  for (const v of Object.values(roles)) assert.equal(v, null);
});

test('setGovRoles and getGovRoles round-trip', async () => {
  const db = await makeDb();
  const input = {
    leader: '1111111111111111111', '2ic': '2222222222222222222', econ: null, econ_gov: null, milcom: null,
    milcom_gov: null, ia: null, ia_asst: null, gov: null, member: null,
  };
  await db.setGovRoles(BigInt(201), input);
  const roles = await db.getGovRoles(BigInt(201));
  assert.equal(roles.leader, '1111111111111111111');
  assert.equal(roles['2ic'], '2222222222222222222');
  assert.equal(roles.econ, null);
});

// ---------------------------------------------------------------------------
// Guild config — grant channel
// ---------------------------------------------------------------------------

test('getGrantChannel returns null for unconfigured guild', async () => {
  const db = await makeDb();
  assert.equal(await db.getGrantChannel(BigInt(300)), null);
});

test('setGrantChannel and getGrantChannel round-trip', async () => {
  const db = await makeDb();
  await db.setGrantChannel(BigInt(301), 999);
  assert.equal(await db.getGrantChannel(BigInt(301)), 999);
  await db.setGrantChannel(BigInt(301), null);
  assert.equal(await db.getGrantChannel(BigInt(301)), null);
});

test('getGovPanel returns null ids for unconfigured guild', async () => {
  const db = await makeDb();
  assert.deepEqual(await db.getGovPanel(BigInt(350)), { channelId: null, messageId: null });
});

test('setGovPanel and getGovPanel round-trip', async () => {
  const db = await makeDb();
  await db.setGovPanel(BigInt(351), '1234567890', '0987654321');
  assert.deepEqual(await db.getGovPanel(BigInt(351)), { channelId: '1234567890', messageId: '0987654321' });
  await db.setGovPanel(BigInt(351), null, null);
  assert.deepEqual(await db.getGovPanel(BigInt(351)), { channelId: null, messageId: null });
});

// ---------------------------------------------------------------------------
// Guild config — welcome
// ---------------------------------------------------------------------------

test('getWelcomeConfig returns defaults for unconfigured guild', async () => {
  const db = await makeDb();
  const cfg = await db.getWelcomeConfig(BigInt(400));
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.channel_id, null);
});

test('setWelcomeConfig and getWelcomeConfig round-trip', async () => {
  const db = await makeDb();
  await db.setWelcomeConfig(BigInt(401), { enabled: true, channelId: 555, message: 'Hello !(user)!' });
  const cfg = await db.getWelcomeConfig(BigInt(401));
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.channel_id, '555');
  assert.equal(cfg.message, 'Hello !(user)!');
});

test('setWelcomeConfig partial update preserves other fields', async () => {
  const db = await makeDb();
  await db.setWelcomeConfig(BigInt(402), { enabled: true, channelId: 123, message: 'Hi' });
  await db.setWelcomeConfig(BigInt(402), { enabled: false });
  const cfg = await db.getWelcomeConfig(BigInt(402));
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.channel_id, '123');
  assert.equal(cfg.message, 'Hi');
});

// ---------------------------------------------------------------------------
// Guild config — alliance ID
// ---------------------------------------------------------------------------

test('getAllianceId returns null for unconfigured guild', async () => {
  const db = await makeDb();
  assert.equal(await db.getAllianceId(BigInt(500)), null);
});

test('setAllianceId and getAllianceId round-trip', async () => {
  const db = await makeDb();
  await db.setAllianceId(BigInt(501), 1234);
  assert.equal(await db.getAllianceId(BigInt(501)), 1234);
});

// ---------------------------------------------------------------------------
// Guild listing
// ---------------------------------------------------------------------------

test('upsertGuild and getGuild round-trip', async () => {
  const db = await makeDb();
  await db.upsertGuild(BigInt(600), 'Test Guild', 'https://discord.gg/abc');
  const guild = await db.getGuild(BigInt(600));
  assert.ok(guild);
  assert.equal(guild.guild_name, 'Test Guild');
  assert.equal(guild.invite_link, 'https://discord.gg/abc');
});

test('getAllGuilds returns all upserted guilds', async () => {
  const db = await makeDb();
  await db.upsertGuild(BigInt(601), 'Alpha', null);
  await db.upsertGuild(BigInt(602), 'Beta', null);
  const guilds = await db.getAllGuilds();
  const names = guilds.map((g) => g.guild_name);
  assert.ok(names.includes('Alpha'));
  assert.ok(names.includes('Beta'));
});

// ---------------------------------------------------------------------------
// Bot config — PnW API key
// ---------------------------------------------------------------------------

test('getPnwApiKey returns null when not set', async () => {
  const db = await makeDb();
  assert.equal(await db.getPnwApiKey(), null);
});

test('setPnwApiKey and getPnwApiKey round-trip', async () => {
  const db = await makeDb();
  await db.setPnwApiKey('mykey123');
  assert.equal(await db.getPnwApiKey(), 'mykey123');
});

// ---------------------------------------------------------------------------
// War alert subscriptions
// ---------------------------------------------------------------------------

test('addWarAlertSubscription and getWarAlertSubscriptions round-trip', async () => {
  const db = await makeDb();
  await db.ensureWarAlertIndexes();
  await db.addWarAlertSubscription(BigInt(700), BigInt(800), 10, 20);
  const subs = await db.getWarAlertSubscriptions(BigInt(700));
  assert.equal(subs.length, 1);
  assert.equal(subs[0]?.min_cities, 10);
  assert.equal(subs[0]?.max_cities, 20);
});

test('addWarAlertSubscription is idempotent (upsert)', async () => {
  const db = await makeDb();
  await db.ensureWarAlertIndexes();
  await db.addWarAlertSubscription(BigInt(701), BigInt(801), 5, 15);
  await db.addWarAlertSubscription(BigInt(701), BigInt(801), 6, 16);
  const subs = await db.getWarAlertSubscriptions(BigInt(701));
  assert.equal(subs.length, 1);
  assert.equal(subs[0]?.min_cities, 6);
});

test('removeWarAlertSubscription returns true then false', async () => {
  const db = await makeDb();
  await db.ensureWarAlertIndexes();
  await db.addWarAlertSubscription(BigInt(702), BigInt(802), null, null);
  assert.equal(await db.removeWarAlertSubscription(BigInt(702), BigInt(802)), true);
  assert.equal(await db.removeWarAlertSubscription(BigInt(702), BigInt(802)), false);
});

// ---------------------------------------------------------------------------
// Recruiter subscriptions
// ---------------------------------------------------------------------------

test('addRecruiterSubscription and getRecruiterSubscriptions round-trip', async () => {
  const db = await makeDb();
  await db.ensureRecruiterIndexes();
  await db.addRecruiterSubscription(BigInt(900), BigInt(950));
  const subs = await db.getRecruiterSubscriptions(BigInt(900));
  assert.equal(subs.length, 1);
  assert.equal(subs[0]?.channel_id, '950');
});

test('removeRecruiterSubscription returns true then false', async () => {
  const db = await makeDb();
  await db.ensureRecruiterIndexes();
  await db.addRecruiterSubscription(BigInt(901), BigInt(951));
  assert.equal(await db.removeRecruiterSubscription(BigInt(901), BigInt(951)), true);
  assert.equal(await db.removeRecruiterSubscription(BigInt(901), BigInt(951)), false);
});
