import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './build/src/api.js';

const API_KEY = 'test-secret-key';

function start(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      resolve({ server, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function req(base, path, opts = {}) {
  const res = await fetch(`${base}${path}`, opts);
  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, body, headers: res.headers };
}

test('core public endpoints', async () => {
  const app = createApp({ guildGetter: () => null, apiKey: API_KEY });
  const { server, base } = await start(app);
  try {
    const idx = await req(base, '/');
    assert.equal(idx.status, 200);
    assert.equal(idx.body, 'would you kindly begone');

    const health = await req(base, '/health');
    assert.deepEqual(health.body, { status: 'ok' });

    const ping = await req(base, '/ping');
    assert.deepEqual(ping.body, { ping: 'pong', sigma: true, skibidi: 'toilet' });

    const glaernisch = await req(base, '/glaernisch');
    assert.deepEqual(glaernisch.body, { touch: 'grass' });

    const egg = await req(base, '/egg');
    assert.equal(egg.status, 200);
    assert.match(String(egg.headers.get('content-type')), /image\/svg\+xml/);
    assert.match(egg.body, /<svg/);
  } finally { server.close(); }
});

test('/api/roles auth and input validation', async () => {
  const app = createApp({ guildGetter: () => null, apiKey: API_KEY });
  const { server, base } = await start(app);
  try {
    const missing = await req(base, '/api/roles/123');
    assert.equal(missing.status, 401);

    const invalid = await req(base, '/api/roles/not-a-number', { headers: { 'X-API-Key': API_KEY } });
    assert.equal(invalid.status, 400);

    const notReady = await req(base, '/api/roles/123', { headers: { 'X-API-Key': API_KEY } });
    assert.equal(notReady.status, 503);
  } finally { server.close(); }
});

test('/api/bot/servers and /api/bot/commands/usage', async () => {
  const fakeGuild = {
    id: '1',
    name: 'Guild One',
    iconURL: () => null,
    memberCount: 42,
  };
  const app = createApp({
    guildGetter: () => null,
    apiKey: API_KEY,
    guildsGetter: () => [fakeGuild],
    commandUsageGetter: () => ({ whois: 5, register: 2, slots: 8 }),
  });
  const { server, base } = await start(app);
  try {
    const serversUnauthorized = await req(base, '/api/bot/servers');
    assert.equal(serversUnauthorized.status, 401);

    const serversOk = await req(base, '/api/bot/servers', { headers: { 'X-API-Key': API_KEY } });
    assert.equal(serversOk.status, 200);
    assert.equal(Array.isArray(serversOk.body), true);
    assert.equal(serversOk.body.length, 1);
    assert.equal(serversOk.body[0].name, 'Guild One');

    const usageOk = await req(base, '/api/bot/commands/usage', { headers: { 'X-API-Key': API_KEY } });
    assert.equal(usageOk.status, 200);
    assert.deepEqual(usageOk.body.map((r) => r.command), ['slots', 'whois', 'register']);
    assert.deepEqual(usageOk.body.map((r) => r.count), [8, 5, 2]);
  } finally { server.close(); }
});

test('/api/bot/send auth/body/permission matrix', async () => {
  const adminId = BigInt('123');
  const sentMessages = [];
  const app = createApp({
    guildGetter: () => null,
    apiKey: API_KEY,
    adminIds: new Set([adminId]),
    sendToWelcomeFn: async (message) => {
      sentMessages.push(message);
      return { sent: 2, skipped: 1 };
    },
  });
  const { server, base } = await start(app);
  try {
    const unauthorized = await req(base, '/api/bot/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    assert.equal(unauthorized.status, 401);

    const badDiscordId = await req(base, '/api/bot/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ discord_id: 'abc', message: 'hi' }),
    });
    assert.equal(badDiscordId.status, 400);

    const missingMessage = await req(base, '/api/bot/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ discord_id: String(adminId), message: '' }),
    });
    assert.equal(missingMessage.status, 400);

    const forbidden = await req(base, '/api/bot/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ discord_id: '999', message: 'hello' }),
    });
    assert.equal(forbidden.status, 403);

    const ok = await req(base, '/api/bot/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({ discord_id: String(adminId), message: 'hello world' }),
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { sent: 2, skipped: 1 });
    assert.deepEqual(sentMessages, ['hello world']);
  } finally { server.close(); }
});

test('malformed JSON returns deterministic 400 payload', async () => {
  const app = createApp({ guildGetter: () => null, apiKey: API_KEY });
  const { server, base } = await start(app);
  try {
    const res = await fetch(`${base}/api/bot/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: '{"discord_id"',
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Invalid JSON body' });
  } finally { server.close(); }
});
