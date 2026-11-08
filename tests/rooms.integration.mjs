/** Cost-free integration checks against a running Wrangler Worker.
 * Run: node tests/rooms.integration.mjs
 * Optional: GATHER_TEST_URL=https://your-worker.example
 * Credentials are read internally; response bodies, cookies and scoped tokens are never logged.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const base = new URL(process.env.GATHER_TEST_URL || 'http://127.0.0.1:8787');
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
  throw new Error('GATHER_TEST_URL must be an HTTP(S) origin without credentials.');
}
const origin = base.origin;
const projectVars = new URL('../.dev.vars', import.meta.url);

async function operatorPassword() {
  if (process.env.GATHER_TEST_PASSWORD) return process.env.GATHER_TEST_PASSWORD;
  let content;
  try { content = await readFile(projectVars, 'utf8'); }
  catch { throw new Error('Set GATHER_TEST_PASSWORD or configure ADMIN_PASSWORD in .dev.vars.'); }
  const match = content.match(/^\s*ADMIN_PASSWORD\s*=\s*(.*?)\s*$/m);
  if (!match) throw new Error('ADMIN_PASSWORD is required for meaningful auth isolation checks.');
  let value = match[1];
  if (value.startsWith('"') && value.endsWith('"')) {
    try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
  } else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  else value = value.replace(/\s+#.*$/, '').trim();
  if (!value) throw new Error('ADMIN_PASSWORD must not be empty for auth isolation checks.');
  return value;
}

async function request(path, { method = 'GET', body, cookie, token, headers = {} } = {}) {
  const url = new URL(path, origin);
  if (token) url.searchParams.set('token', token);
  const allHeaders = { Origin: origin, ...headers };
  if (cookie) allHeaders.Cookie = cookie;
  if (body !== undefined) allHeaders['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(url, {
      method, headers: allHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual', signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Worker is unreachable. Start Wrangler at GATHER_TEST_URL before running this suite.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Worker returned non-JSON for an API request (HTTP ${response.status}).`); }
  return { status: response.status, headers: response.headers, data };
}

function assertStatus(result, expected, operation) {
  assert.equal(result.status, expected, `${operation}: unexpected HTTP status`);
}

function assertPublicSnapshot(data, { displayToken, micToken }) {
  assert.equal(typeof data, 'object', 'Snapshot must be an object');
  assert.equal(Object.hasOwn(data, 'displayToken'), false, 'Scoped snapshot must not include a display credential');
  assert.equal(Object.hasOwn(data, 'micToken'), false, 'Scoped snapshot must not include a microphone credential');
  const serialized = JSON.stringify(data);
  assert.equal(serialized.includes(displayToken), false, 'Scoped snapshot must not contain the display credential');
  assert.equal(serialized.includes(micToken), false, 'Scoped snapshot must not contain the microphone credential');
}

test('Cloudflare Worker authentication and room role isolation', async (suite) => {
  const password = await operatorPassword();
  let cookie;
  let room;
  let cleanupCompleted = false;

  await suite.test('anonymous access and forged operator headers cannot create rooms', async () => {
    const config = await request('/api/config');
    assertStatus(config, 200, 'Read configuration');
    assert.equal(config.data.authenticated, false, 'Worker must require operator authentication');
    assert.equal(config.data.operatorConfigured, true, 'An operator password must be configured');
    assertStatus(await request('/api/rooms', { method: 'POST', body: {} }), 401, 'Anonymous room creation');
    assertStatus(await request('/api/rooms', { method: 'POST', body: {}, headers: { 'X-Gather-Operator': 'true' } }), 401, 'Forged operator room creation');
  });

  await suite.test('operator sign-in sets a protected session cookie', async () => {
    assertStatus(await request('/api/login', { method: 'POST', body: { password: 'incorrect-' + crypto.randomUUID() } }), 401, 'Incorrect password');
    const login = await request('/api/login', { method: 'POST', body: { password } });
    assertStatus(login, 200, 'Operator login');
    const setCookie = login.headers.get('set-cookie') || '';
    assert.ok(/HttpOnly/i.test(setCookie), 'Operator cookie must be HttpOnly');
    assert.ok(/SameSite=Strict/i.test(setCookie), 'Operator cookie must be same-site');
    if (base.protocol === 'https:') assert.ok(/;\s*Secure/i.test(setCookie), 'HTTPS operator cookie must be secure');
    cookie = setCookie.split(';')[0];
    assert.ok(cookie.startsWith('gather_operator='), 'Operator cookie must be issued');
    const config = await request('/api/config', { cookie });
    assertStatus(config, 200, 'Authenticated configuration');
    assert.equal(config.data.authenticated, true);
  });

  try {
    await suite.test('operator can create a bilingual room with separate scoped credentials', async () => {
      const created = await request('/api/rooms', { method: 'POST', cookie, body: { sourceLanguage: 'es' } });
      assertStatus(created, 201, 'Create room');
      room = created.data;
      assert.ok(typeof room.id === 'string' && /^[a-f0-9-]{36}$/.test(room.id), 'Room ID must be a UUID');
      assert.ok(typeof room.displayToken === 'string' && room.displayToken.length >= 32, 'Display credential must have sufficient length');
      assert.ok(typeof room.micToken === 'string' && room.micToken.length >= 32, 'Microphone credential must have sufficient length');
      assert.ok(room.displayToken !== room.micToken, 'Display and microphone credentials must differ');
      assert.equal(room.sourceLanguage, 'es');
      assert.equal(room.targetLanguage, 'en');
    });
    if (!room?.id) throw new Error('Cannot test room isolation because room creation failed.');
    const route = `/api/rooms/${room.id}`;

    await suite.test('scoped readers receive state without either room credential', async () => {
      for (const role of ['displayToken', 'micToken']) {
        const result = await request(route, { token: room[role] });
        assertStatus(result, 200, 'Scoped room read');
        assertPublicSnapshot(result.data, room);
      }
      assertStatus(await request(route), 401, 'Anonymous room read');
    });

    await suite.test('display credentials cannot mutate state or invoke paid OpenAI endpoints', async () => {
      const cases = [
        ['settings', 'PATCH', { churchName: 'Unwanted change' }],
        ['control', 'POST', { action: 'start' }],
        ['phrase', 'POST', { text: 'This request must never reach a model.' }],
        ['realtime', 'POST', {}],
        ['presence', 'POST', { connected: true, name: 'Unwanted microphone' }],
        ['rotate', 'POST', {}],
      ];
      for (const [action, method, body] of cases) {
        assertStatus(await request(`${route}/${action}`, { method, body, token: room.displayToken }), 403, `Display ${action}`);
      }
    });

    await suite.test('microphone credentials cannot change branding, service controls or links', async () => {
      for (const [action, method, body] of [
        ['settings', 'PATCH', { churchName: 'Unwanted change' }],
        ['control', 'POST', { action: 'start' }],
        ['rotate', 'POST', {}],
      ]) {
        assertStatus(await request(`${route}/${action}`, { method, body, token: room.micToken }), 403, `Microphone ${action}`);
      }
    });

    await suite.test('forged internal role headers and cross-origin requests are rejected', async () => {
      assertStatus(await request(`${route}/settings`, { method: 'PATCH', body: { churchName: 'Unwanted change' }, headers: { 'X-Gather-Operator': 'true' } }), 401, 'Forged anonymous role');
      assertStatus(await request(`${route}/control`, { method: 'POST', body: { action: 'start' }, token: room.displayToken, headers: { 'X-Gather-Operator': 'true' } }), 403, 'Forged display role');
      assertStatus(await request(`${route}/control`, { method: 'POST', cookie, body: { action: 'start' }, headers: { Origin: 'https://untrusted.example' } }), 403, 'Cross-origin authenticated control');
      assertStatus(await request('/api/login', { method: 'POST', body: { password }, headers: { Origin: 'https://untrusted.example' } }), 403, 'Cross-origin login');
    });

    await suite.test('branding persists and reaches the read-only display snapshot', async () => {
      const patch = { churchName: 'Gather integration check', serviceName: 'Automated verification', theme: 'sage', textSize: 76, logoPosition: 'center', logoSize: 56, motion: 'gentle', showSummary: false, accentColor: '#c75c32' };
      assertStatus(await request(`${route}/settings`, { method: 'PATCH', cookie, body: patch }), 200, 'Save branding');
      const persisted = await request(route, { token: room.displayToken });
      assertStatus(persisted, 200, 'Read persisted branding');
      for (const [key, value] of Object.entries(patch)) assert.equal(persisted.data.settings[key], value, `Branding field ${key} must persist`);
      assertPublicSnapshot(persisted.data, room);
      assertStatus(await request(`${route}/settings`, { method: 'PATCH', cookie, body: { textSize: 999 } }), 400, 'Reject invalid settings');
    });

    await suite.test('operator lifecycle works and unleased microphone presence is rejected', async () => {
      const started = await request(`${route}/control`, { method: 'POST', cookie, body: { action: 'start' } });
      assertStatus(started, 200, 'Start service');
      assert.equal(started.data.status, 'live');
      const presence = await request(`${route}/presence`, { method: 'POST', token: room.micToken, body: { connected: true, name: 'Integration microphone', clientId: crypto.randomUUID() } });
      assertStatus(presence, 409, 'Unleased microphone presence');
      const blanked = await request(`${route}/control`, { method: 'POST', cookie, body: { action: 'blank' } });
      assert.equal(blanked.data.blank, true);
      const unblanked = await request(`${route}/control`, { method: 'POST', cookie, body: { action: 'unblank' } });
      assert.equal(unblanked.data.blank, false);
      const paused = await request(`${route}/control`, { method: 'POST', cookie, body: { action: 'pause' } });
      assertStatus(paused, 200, 'Pause service');
      assert.equal(paused.data.status, 'paused');
      assert.equal(paused.data.micConnected, false);
    });

    await suite.test('rotation invalidates both previous scoped links and pauses the service', async () => {
      const oldDisplay = room.displayToken;
      const oldMicrophone = room.micToken;
      const result = await request(`${route}/rotate`, { method: 'POST', cookie, body: {} });
      assertStatus(result, 200, 'Rotate links');
      room = result.data;
      assert.ok(room.displayToken !== oldDisplay, 'Display credential must rotate');
      assert.ok(room.micToken !== oldMicrophone, 'Microphone credential must rotate');
      assert.equal(room.status, 'paused');
      for (const token of [oldDisplay, oldMicrophone]) assertStatus(await request(route, { token }), 401, 'Expired scoped credential');
      for (const token of [room.displayToken, room.micToken]) {
        const read = await request(route, { token });
        assertStatus(read, 200, 'Rotated scoped credential');
        assertPublicSnapshot(read.data, room);
      }
    });

    await suite.test('clear retains branding and resets transcript and summary state', async () => {
      const cleared = await request(`${route}/control`, { method: 'POST', cookie, body: { action: 'clear' } });
      assertStatus(cleared, 200, 'Clear transcript');
      assert.deepEqual(cleared.data.segments, []);
      assert.equal(cleared.data.summary, '');
      assert.equal(cleared.data.summaryStale, false);
      assert.equal(cleared.data.settings.churchName, 'Gather integration check');
      const stopped = await request(`${route}/control`, { method: 'POST', cookie, body: { action: 'stop' } });
      assertStatus(stopped, 200, 'Stop integration service');
      assert.equal(stopped.data.status, 'ended');
      cleanupCompleted = true;
    });

    await suite.test('logout clears the browser session cookie', async () => {
      const result = await request('/api/logout', { method: 'POST', cookie, body: {} });
      assertStatus(result, 200, 'Logout');
      assert.ok(/Max-Age=0/i.test(result.headers.get('set-cookie') || ''), 'Logout must expire the operator cookie');
      assertStatus(await request(route), 401, 'Room read without the expired browser cookie');
    });
  } finally {
    // No delete endpoint exists: leave only an ended, empty test room, retained for the app's normal TTL.
    if (room?.id && cookie && !cleanupCompleted) {
      const route = `/api/rooms/${room.id}/control`;
      await request(route, { method: 'POST', cookie, body: { action: 'clear' } }).catch(() => {});
      await request(route, { method: 'POST', cookie, body: { action: 'stop' } }).catch(() => {});
    }
  }
});
