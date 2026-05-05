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
