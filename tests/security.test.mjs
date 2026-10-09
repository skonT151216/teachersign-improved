import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Authentication, hashPassword, verifyPassword, COOKIE_NAME } from '../server/auth.mjs';
import { DemoStore, demoSessions, DEMO_USERNAME, DEMO_PASSWORD, DEMO_PARTICIPANT_TOKEN } from '../server/demo-store.mjs';
import { createDemoServer } from '../server/http.mjs';
import { createGasAdapter } from '../server/gas-adapter.mjs';
import { DEMO_ACCOUNTS } from '../server/demo-fixtures.mjs';

const passwordHash = await hashPassword(DEMO_PASSWORD);
const origin = 'http://localhost:5178';
const signature = (id = 'demo-staff-1') => ({ staffId: id, staffName: 'client spoofed name', department: 'client spoofed department', signatureData: 'data:image/webp;base64,AAAA', timestamp: 1790899200000 });
async function fixture(t, options = {}) {
  const instance = await createDemoServer({ auth: new Authentication({ username: DEMO_USERNAME, passwordHash }), ...options });
  await new Promise(resolve => instance.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => instance.server.close(resolve)));
  const base = `http://127.0.0.1:${instance.server.address().port}`;
  const call = async (path, body, extra = {}) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const login = async () => {
    const result = await call('/api/auth/login', { username: DEMO_USERNAME, password: DEMO_PASSWORD });
    assert.equal(result.status, 200);
    const headers = { Cookie: result.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': result.body.csrf };
    return headers;
  };
  return { ...instance, call, login };
}

test('scrypt hash uses a fresh salt, validates the password, rejects malformed hashes', async () => {
  assert.match(passwordHash, /^scrypt\$32768\$8\$3\$/);
  assert.notEqual(passwordHash, await hashPassword(DEMO_PASSWORD));
  assert.equal(await verifyPassword(DEMO_PASSWORD, passwordHash), true);
  assert.equal(await verifyPassword('wrong', passwordHash), false);
  assert.equal(await verifyPassword(DEMO_PASSWORD, 'bad hash'), false);
  assert.ok(!passwordHash.includes(DEMO_PASSWORD));
});

test('opaque sessions expire by idle and absolute lifetime; logout revokes the token', async () => {
  let time = 1000;
  const auth = new Authentication({ username: DEMO_USERNAME, passwordHash, now: () => time, idleMs: 100, lifetimeMs: 250 });
  let result = await auth.login(DEMO_USERNAME, DEMO_PASSWORD, 'loopback');
  let cookie = `${COOKIE_NAME}=${result.token}`;
  assert.equal(auth.get(cookie).username, DEMO_USERNAME);
  assert.ok(![...auth.sessions.keys()].includes(result.token));
  time += 101;
  assert.equal(auth.get(cookie), null);
  result = await auth.login(DEMO_USERNAME, DEMO_PASSWORD, 'loopback'); cookie = `${COOKIE_NAME}=${result.token}`;
  for (let i = 0; i < 3; i++) { time += 80; assert.ok(auth.get(cookie)); }
  time += 11; assert.equal(auth.get(cookie), null);
  result = await auth.login(DEMO_USERNAME, DEMO_PASSWORD, 'loopback'); cookie = `${COOKIE_NAME}=${result.token}`;
  auth.logout(cookie); assert.equal(auth.get(cookie), null);
});

test('concurrent incorrect logins are limited and reset only after the window', async () => {
  let time = 1000;
  const auth = new Authentication({ username: DEMO_USERNAME, passwordHash, now: () => time, maxAttempts: 2, attemptWindowMs: 100 });
  const results = await Promise.all(Array.from({ length: 6 }, () => auth.login(DEMO_USERNAME, 'incorrect', 'same')));
  assert.equal(results.filter(result => result.limited).length, 4);
  assert.deepEqual(await auth.login(DEMO_USERNAME, DEMO_PASSWORD, 'different'), { limited: true });
  time += 101; assert.ok((await auth.login(DEMO_USERNAME, DEMO_PASSWORD, 'same')).token);
});

test('every admin route requires authentication; wrong password and origins are rejected', async t => {
  const { call } = await fixture(t);
  for (const path of ['/api/admin/connection', '/api/admin/connection/update', '/api/admin/connection/disconnect', '/api/admin/connection/test', '/api/admin/account', '/api/admin/account/update', '/api/admin/action', '/api/auth/logout']) {
    const result = await call(path, {});
    assert.equal(result.status, 401, path);
    assert.match(result.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await call('/api/auth/session')).status, 401);
  assert.equal((await call('/api/auth/login', { username: DEMO_USERNAME, password: 'incorrect' })).status, 401);
  assert.equal((await call('/api/auth/login', { username: DEMO_USERNAME, password: DEMO_PASSWORD }, { Origin: 'https://untrusted.invalid' })).status, 403);
});

test('login cookie, CSRF, action authorization, and logout are enforced', async t => {
  const { call, login } = await fixture(t);
  const loggedIn = await call('/api/auth/login', { username: DEMO_USERNAME, password: DEMO_PASSWORD });
  const cookie = loggedIn.headers.get('set-cookie');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(attribute));
  assert.ok(!JSON.stringify(loggedIn.body).includes('token'));
  const headers = await login();
  assert.equal((await call('/api/admin/connection', {}, { Cookie: headers.Cookie })).status, 403);
  const connection = await call('/api/admin/connection', {}, headers);
  assert.equal(connection.status, 200);
  assert.ok(!JSON.stringify(connection.body).includes('adminKey'));
  assert.equal((await call('/api/admin/action', { action: 'healthCheck' }, headers)).status, 403);
  assert.equal((await call('/api/participant', { action: 'getAdminSessions' })).status, 403);
  assert.equal((await call('/api/admin/action', { action: 'getAdminSessions', adminKey: 'client-key' }, headers)).status, 400);
  assert.equal((await call('/api/auth/logout', {}, headers)).status, 200);
  assert.equal((await call('/api/admin/connection', {}, headers)).status, 401);
  assert.equal((await call('/api/auth/session', undefined, headers)).status, 401);
});

test('API checks session expiry before serving private data', async t => {
  let time = 1000;
  const auth = new Authentication({ username: DEMO_USERNAME, passwordHash, now: () => time, idleMs: 50 });
  const { call, login } = await fixture(t, { auth });
  const headers = await login(); time += 51;
  assert.equal((await call('/api/admin/action', { action: 'getAdminSessions' }, headers)).status, 401);
});

test('HTTP login route enforces the attempt limit and supplies Retry-After', async t => {
  const { call } = await fixture(t);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await call('/api/auth/login', { username: DEMO_USERNAME, password: 'incorrect' })).status, 401);
  const blocked = await call('/api/auth/login', { username: DEMO_USERNAME, password: DEMO_PASSWORD });
  assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '900');
});

test('server connection survives logout, browser loss and restart; disconnect is a separate action', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'teachersign-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stateFile = join(directory, 'state.json');
  const store = new DemoStore({ stateFile });
  const { call, login } = await fixture(t, { store });
  let headers = await login();
  assert.equal((await call('/api/admin/connection/update', { provider: 'mock', label: '가상 보존 연결', revision: 1 }, headers)).status, 200);
  assert.equal((await call('/api/admin/connection/update', { provider: 'mock', label: 'stale', revision: 1 }, headers)).status, 409);
  await call('/api/auth/logout', {}, headers);
  headers = await login();
  assert.equal((await call('/api/admin/connection', {}, headers)).body.label, '가상 보존 연결');
  headers = await login(); // A new browser only supplies a fresh login, no old connection storage.
  assert.equal((await call('/api/admin/connection', {}, headers)).body.label, '가상 보존 연결');
  const restored = new DemoStore({ stateFile }); await restored.initialize();
  assert.equal(restored.publicConnection().label, '가상 보존 연결');
  const disk = await readFile(stateFile, 'utf8'); assert.ok(!disk.includes(DEMO_PASSWORD)); assert.ok(!disk.includes('csrf'));
  await call('/api/admin/connection/disconnect', { revision: 2 }, headers);
  assert.equal((await call('/api/admin/connection', {}, headers)).body.configured, false);
  assert.equal((await call('/api/participant', { action: 'getParticipantSession', sessionId: 'demo-training-1', participantToken: DEMO_PARTICIPANT_TOKEN })).status, 400);
  assert.equal((await call('/api/admin/connection/update', { provider: 'mock', label: '가상 재연결', revision: 1 }, headers)).status, 409);
  await call('/api/admin/connection/update', { provider: 'mock', label: '가상 재연결', revision: 3 }, headers);
  assert.equal((await call('/api/admin/action', { action: 'getAdminSessions' }, headers)).body.data.length, 2);
});

test('participant scope hides tokens, PINs and signature images; same-day signatures upsert by staff ID', async t => {
  const { call, login, store } = await fixture(t);
  const payload = { sessionId: 'demo-training-1', participantToken: DEMO_PARTICIPANT_TOKEN };
  assert.equal((await call('/api/participant', { action: 'getParticipantSession', ...payload, participantToken: 'wrong' })).status, 400);
  let result = await call('/api/participant', { action: 'getParticipantSession', ...payload });
  assert.equal(result.body.data.staffList.length, 2);
  assert.equal(result.body.data.relatedSessionTitles.length, 2);
  assert.equal(result.body.data.participantToken, undefined);
  assert.equal(result.body.data.authCode, undefined);
  const request = { action: 'addParticipantSignature', ...payload, signature: signature() };
  const headers = { 'Idempotency-Key': 'mock-write-identifier-1' };
  const results = await Promise.all([call('/api/participant', request, headers), call('/api/participant', request, headers)]);
  results.forEach(value => assert.equal(value.body.data.updatedCount, 2));
  assert.equal((await call('/api/participant', { ...request, signature: signature('demo-staff-2') }, headers)).status, 409);
  result = await call('/api/participant', { action: 'getParticipantSession', ...payload });
  assert.equal(result.body.data.signatures[0].signatureData, '');
  for (const item of store.sessions) { assert.equal(item.signatures.length, 1); assert.equal(item.signatures[0].staffName, '가상 교직원 가'); }
  const admin = await login();
  const sessions = (await call('/api/admin/action', { action: 'getAdminSessions' }, admin)).body.data;
  assert.equal(sessions[0].signatures[0].signatureData, signature().signatureData);
  await call('/api/admin/action', { action: 'removeSignatureBatch', sessionIds: ['demo-training-1', 'demo-training-2'], staffId: 'demo-staff-1' }, { ...admin, 'Idempotency-Key': 'mock-remove-identifier' });
  assert.ok(store.sessions.every(item => item.signatures.length === 0));
});

test('PIN, roster membership and full group checks protect participant writes', async () => {
  const sessions = demoSessions(); sessions[0].authCode = '2468';
  const store = new DemoStore({ sessions });
  const body = { sessionId: sessions[0].id, participantToken: DEMO_PARTICIPANT_TOKEN };
  let result = await store.action('getParticipantSession', body);
  assert.equal(result.authVerified, false); assert.deepEqual(result.staffList, []); assert.deepEqual(result.signatures, []);
  await assert.rejects(store.action('addParticipantSignature', { ...body, signature: signature() }), /CODE/);
  await assert.rejects(store.action('addParticipantSignature', { ...body, authCode: '2468', signature: signature('unknown') }), /PARTICIPANT-01/);
  store.sessions[1].maxParticipants = 0;
  await assert.rejects(store.action('addParticipantSignature', { ...body, authCode: '2468', signature: signature() }), /FULL/);
  assert.ok(store.sessions.every(item => item.signatures.length === 0));
});

test('manual office and parents signatures retain fields and stay in their date/type group', async () => {
  const sessions = demoSessions();
  sessions.push({ ...sessions[0], id: 'office-1', type: 'office', staffList: [], participantToken: 'office-token' });
  sessions.push({ ...sessions[0], id: 'parents-1', type: 'parents', staffList: [], participantToken: 'parents-token' });
  const store = new DemoStore({ sessions });
  for (const [id, token, fields] of [['office-1', 'office-token', { affiliation: '가상 기관' }], ['parents-1', 'parents-token', { grade: '1학년', classNumber: '1반', childName: '가상 학생' }]]) {
    const value = { ...signature('manual-stable-id'), ...fields };
    assert.equal((await store.action('addParticipantSignature', { sessionId: id, participantToken: token, signature: value })).updatedCount, 1);
    await store.action('addParticipantSignature', { sessionId: id, participantToken: token, signature: value });
    assert.equal(store.session(id).signatures.length, 1);
    assert.deepEqual(store.session(id).signatures[0], value);
  }
  assert.ok(store.sessions.filter(item => item.type === 'school').every(item => !item.signatures.length));
});

test('GAS live mode stays disabled; fake adapter keeps v4 protocol and server credential ownership', async () => {
  let calls = 0;
  assert.throws(() => createGasAdapter({ scriptUrl: 'https://script.google.com/macros/s/FAKE/exec', adminKey: 'mock-secret', fetchImpl: () => { calls++; } }), /disabled/);
  assert.equal(calls, 0);
  const captured = [];
  const adapter = createGasAdapter({ allowLive: true, scriptUrl: 'https://script.google.com/macros/s/FAKE/exec', adminKey: 'mock-server-only-key', fetchImpl: async (url, options) => { captured.push({ url, ...options }); return { ok: true, json: async () => ({ status: 'success', data: { updatedCount: 2 } }) }; } });
  await adapter.action('getAdminSessions', { adminKey: 'client-value', scriptUrl: 'client-url' });
  assert.deepEqual(JSON.parse(captured[0].body), { action: 'getAdminSessions', adminKey: 'mock-server-only-key' });
  await adapter.action('addParticipantSignature', { sessionId: 'demo-training-1', participantToken: DEMO_PARTICIPANT_TOKEN, authCode: '2468', signature: signature() });
  const participantBody = JSON.parse(captured[1].body);
  assert.equal(participantBody.adminKey, undefined); assert.deepEqual(participantBody.signature, signature());
  assert.equal(captured[1].headers['Content-Type'], 'text/plain;charset=utf-8'); assert.equal(captured[1].credentials, 'omit');
  await assert.rejects(adapter.action('healthCheck', {}), /ACTION/);
});

test('admin creation validates fields and server-owned token; editing preserves signatures and token', async t => {
  const { call, login, store } = await fixture(t);
  const headers = await login();
  const original = { ...demoSessions()[0], id: 'mock-created-training', participantToken: 'client-chosen-token', unexpectedSecret: 'mock-field' };
  const write = body => call('/api/admin/action', body, { ...headers, 'Idempotency-Key': crypto.randomUUID() });
  assert.equal((await write({ action: 'createSession', session: { ...original, title: '' } })).status, 400);
  assert.equal((await write({ action: 'createSession', session: { ...original, staffList: [original.staffList[0], original.staffList[0]] } })).status, 400);
  assert.equal((await write({ action: 'createSession', session: original })).status, 200);
  const token = store.session(original.id).participantToken;
  assert.notEqual(token, original.participantToken); assert.equal(store.session(original.id).unexpectedSecret, undefined);
  await write({ action: 'addSignatureBatch', sessionIds: [original.id], signature: signature() });
  assert.equal((await write({ action: 'createSession', session: { ...original, title: '가상 제목 변경', participantToken: 'changed-client-token' } })).status, 200);
  assert.equal(store.session(original.id).participantToken, token); assert.equal(store.session(original.id).signatures.length, 1);
  await write({ action: 'deleteSession', sessionId: original.id }); assert.ok(!store.sessions.some(item => item.id === original.id));
});

test('Google setup simulation only accepts the fixed fixture and always keeps mock storage', async t => {
  const { call, login } = await fixture(t);
  const headers = await login();
  assert.equal((await call('/api/admin/connection/test', { fixtureId: 'google-drive-v4', scriptUrl: 'https://script.google.com/macros/s/FAKE/exec' }, headers)).status, 400);
  assert.equal((await call('/api/admin/connection/test', { fixtureId: 'unknown' }, headers)).status, 400);
  const result = await call('/api/admin/connection/test', { fixtureId: 'google-drive-v4' }, headers);
  assert.equal(result.status, 200); assert.equal(result.body.simulation, true); assert.equal(result.body.checks.length, 4);
  const connection = await call('/api/admin/connection/update', { provider: 'mock', label: '가상 Google 저장소', setupMode: 'google-demo', revision: 1 }, headers);
  assert.equal(connection.status, 200); assert.equal(connection.body.provider, 'mock'); assert.equal(connection.body.setupMode, 'google-demo');
  assert.equal(connection.body.scriptUrl, undefined); assert.equal(connection.body.adminKey, undefined);
  assert.equal((await call('/api/admin/connection/update', { provider: 'gas', label: 'live', revision: 2 }, headers)).status, 400);
});

test('demo account update stores only a hash, revokes all sessions, preserves connection and survives restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'teachersign-account-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stateFile = join(directory, 'state.json');
  const { call, login, store } = await fixture(t, { store: new DemoStore({ stateFile }) });
  const first = await login(), second = await login();
  const current = (await call('/api/admin/account', {}, first)).body;
  assert.equal(current.username, DEMO_USERNAME); assert.equal(current.passwordHash, undefined);
  assert.equal((await call('/api/admin/account/update', { presetId: 'real-account', revision: 1, currentPassword: DEMO_PASSWORD }, first)).status, 400);
  assert.equal((await call('/api/admin/account/update', { presetId: 'school', username: 'arbitrary', revision: 1, currentPassword: DEMO_PASSWORD }, first)).status, 400);
  assert.equal((await call('/api/admin/account/update', { presetId: 'school', revision: 1, currentPassword: 'wrong' }, first)).status, 403);
  assert.equal((await call('/api/admin/account/update', { presetId: 'school', revision: 0, currentPassword: DEMO_PASSWORD }, first)).status, 409);
  const saved = await call('/api/admin/account/update', { presetId: 'school', revision: 1, currentPassword: DEMO_PASSWORD }, first);
  assert.equal(saved.status, 200); assert.equal(saved.body.loginRequired, true); assert.equal(saved.body.passwordHash, undefined);
  for (const headers of [first, second]) assert.equal((await call('/api/admin/connection', {}, headers)).status, 401);
  assert.equal((await call('/api/auth/login', { username: DEMO_USERNAME, password: DEMO_PASSWORD })).status, 401);
  const selected = DEMO_ACCOUNTS[1];
  const loggedIn = await call('/api/auth/login', { username: selected.username, password: selected.password });
  assert.equal(loggedIn.status, 200);
  assert.equal(store.publicConnection().configured, true); assert.equal(store.sessions.length, 2);
  const disk = await readFile(stateFile, 'utf8');
  for (const item of DEMO_ACCOUNTS) assert.ok(!disk.includes(item.password));
  assert.match(store.account.passwordHash, /^scrypt\$/);
  const publicAccount = (await call('/api/demo/account')).body;
  assert.deepEqual(Object.keys(publicAccount).sort(), ['demo', 'presetId', 'username']);
  const restored = await fixture(t, { store: new DemoStore({ stateFile }), auth: undefined });
  assert.equal((await restored.call('/api/auth/login', { username: selected.username, password: selected.password })).status, 200);
});

test('credential changes cannot issue a session from an in-flight old password verification', async () => {
  const selected = DEMO_ACCOUNTS[1];
  const nextHash = await hashPassword(selected.password);
  const auth = new Authentication({ username: DEMO_USERNAME, passwordHash });
  const pending = auth.login(DEMO_USERNAME, DEMO_PASSWORD, 'loopback');
  auth.replaceCredentials(selected.username, nextHash);
  assert.deepEqual(await pending, { denied: true }); assert.equal(auth.sessions.size, 0);
});
