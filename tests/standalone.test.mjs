import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { browserPassword, passwordProof } from '../services/browserPassword.mjs';
import { hashPassword } from '../server/auth.mjs';
import { createGasHarness, createFakeDrive } from './gas-harness.mjs';

const password = '가상-학교-Password-2026!';
const setupKey = 'Only-For-Unit-Tests-Setup-Key-2026!';
const digest = value => createHash('sha256').update(value).digest('hex');
const login = async (gas, username = 'admin-school', secret = password) => {
  const challenge = gas.rpc({ operation: 'challenge', username }).data;
  const token = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
  const tokenHash = digest(token);
  const verifier = await browserPassword(secret, challenge.salt);
  const proof = await passwordProof(verifier, [challenge.nonce, username, challenge.revision, tokenHash, csrf]);
  const result = gas.rpc({ operation: 'login', nonce: challenge.nonce, username, tokenHash, csrf, proof });
  assert.equal(result.status, 'success');
  return { sessionToken: token, csrf };
};
test('browser scrypt and HMAC retain the existing v5 Node verifier protocol', async () => {
  const salt = '12'.repeat(16);
  const verifier = await browserPassword(password, salt);
  assert.equal(verifier, await hashPassword(password, salt));
  const fields = ['nonce', 'admin-school', 1, 'token-hash', 'csrf'];
  assert.equal(await passwordProof(verifier, fields), createHmac('sha256', Buffer.from(verifier.split('$')[5], 'hex')).update(JSON.stringify(fields)).digest('hex'));
});
test('only guarded RPC and web handlers are callable; private helpers cannot bypass login', async () => {
  const code = await readFile(new URL('../Code.gs', import.meta.url), 'utf8');
  const exposed = [...code.matchAll(/^function (\w+)\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(exposed.sort(), ['doGet', 'doPost', 'inspectTeacherSignLegacyData', 'migrateTeacherSignLegacyData', 'previewTeacherSignMigration', 'setupTeacherSign', 'teacherSignRpc']);
  const gas = createGasHarness();
  assert.equal(gas.rpc({ operation: 'getStoredData' }).status, 'error');
  assert.ok(gas.rpc({ operation: 'admin', name: 'getAdminSessions' }).message.startsWith('[ERR-AUTH]'));
  assert.equal(gas.rpc(null).status, 'error');
  assert.equal(gas.rpc({ operation: 'info', text: 'x'.repeat(2000001) }).status, 'error');
});
test('visible installer rejects anonymous and other users before any storage writes and never returns the key', () => {
  const gas = createGasHarness('installer-school', createFakeDrive(), { initialize: false });
  for (const activeEmail of ['', 'teacher@example.test']) {
    gas.session.activeEmail = activeEmail;
    assert.throws(() => gas.context.setupTeacherSign({ activeEmail: 'installer@example.test' }), /ERR-INSTALLER/);
    assert.equal(gas.props.size, 0);
    assert.equal(gas.shared.files.size, 0);
    assert.equal(gas.logs.length, 0);
  }
  gas.session.activeEmail = 'installer@example.test';
  gas.session.effectiveEmail = '';
  assert.throws(() => gas.context.setupTeacherSign(), /ERR-INSTALLER/);
  assert.equal(gas.props.size, 0);
  gas.session.effectiveEmail = 'installer@example.test';
  const result = gas.context.setupTeacherSign();
  const key = gas.props.get('TEACHERSIGN_ADMIN_KEY');
  assert.ok(key);
  assert.ok(gas.logs.some(message => message === `관리자 연결키: ${key}`));
  assert.ok(!result.includes(key));
  const files = [...gas.shared.files.keys()];
  gas.context.setupTeacherSign();
  assert.equal(gas.props.get('TEACHERSIGN_ADMIN_KEY'), key);
  assert.deepEqual([...gas.shared.files.keys()], files);
});
test('default GAS URL serves self-contained HTML and escapes untrusted participant query values', () => {
  const gas = createGasHarness('A_PRIVATE_PROJECT_ID');
  const attack = '</script><script>alert(1)</script>$&$`$\'';
  const html = gas.context.doGet({ parameter: { sessionId: attack, token: 'test-token', school: 'B', setupKey: setupKey } }).getContent();
  assert.ok(html.includes('window.__TEACHERSIGN_GAS__='));
  assert.ok(!html.includes(attack));
  assert.ok(!html.includes(setupKey));
  const boot = JSON.parse(/window\.__TEACHERSIGN_GAS__=(.*?);<\/script>/.exec(html)[1]);
  assert.equal(boot.school, 'A_PRIVATE_PROJECT_ID');
  assert.equal(boot.projectEditorUrl, 'https://script.google.com/home/projects/A_PRIVATE_PROJECT_ID/edit');
  assert.equal(gas.rpc({operation:'info'}).data.projectEditorUrl, boot.projectEditorUrl);
  assert.equal(boot.params.sessionId, attack);
  assert.equal(boot.params.school, undefined);
  assert.ok([...html.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/g)].every(match => !/\bsrc\s*=/.test(match[1])));
  assert.equal(JSON.parse(gas.context.doGet({ parameter: { action: 'healthCheck' } }).getContent()).data.serverVersion, '5.3.7');
});
test('GAS RPC supports existing v5 account, school isolation, CSRF, logout and expiry', async () => {
  const shared = createFakeDrive(), a = createGasHarness('rpc-school-A', shared), b = createGasHarness('rpc-school-B', shared);
  for (const gas of [a, b]) {
    gas.props.set('TEACHERSIGN_ADMIN_KEY', setupKey);
    assert.equal(gas.rpc({ operation: 'bootstrap', setupKey, username: 'admin-school', label: '가상 학교', passwordHash: await hashPassword(password) }).status, 'success');
  }
  const access = await login(a);
  assert.equal(a.rpc({ operation: 'connection', ...access }).status, 'success');
  assert.ok(b.rpc({ operation: 'connection', ...access }).message.startsWith('[ERR-AUTH]'));
  assert.ok(a.rpc({ operation: 'connection', ...access, csrf: 'wrong' }).message.startsWith('[ERR-CSRF]'));
  const files = [...shared.files.keys()];
  const before = a.state().account.passwordHash;
  a.session.activeEmail = a.session.effectiveEmail;
  a.context.setupTeacherSign();
  assert.deepEqual([...shared.files.keys()], files);
  assert.equal(a.state().account.passwordHash, before);
  assert.equal(a.rpc({ operation: 'logout', ...access }).status, 'success');
  assert.ok(a.rpc({ operation: 'connection', ...access }).message.startsWith('[ERR-AUTH]'));
  const next = await login(a);
  a.advance(30 * 60_000 + 1);
  assert.ok(a.rpc({ operation: 'session', ...next }).message.startsWith('[ERR-AUTH]'));
});

test('connection key check requires the school session and CSRF, preserves data and never returns the key', async () => {
  const gas = createGasHarness();
  gas.props.set('TEACHERSIGN_ADMIN_KEY', setupKey);
  gas.rpc({ operation: 'bootstrap', setupKey, username: 'admin-school', label: '가상 학교', passwordHash: await hashPassword(password) });
  const access = await login(gas);
  const originalProps = [...gas.props];
  const db = gas.shared.files.get(gas.props.get('TEACHERSIGN_DB_FILE_ID'));
  const sheet = gas.context.getSignatureSheet_();
  const signatureFile = gas.shared.files.get(gas.props.get('TEACHERSIGN_SIGNATURE_FILE_ID'));
  db.content = JSON.stringify({ sessions: [{ id: 'one', participantToken: 'existing-token', signatures: [{ staffId: 'one-person', timestamp: 1 }] }] });
  sheet.appendRow(['one', 'one-person', 'Private Person', '', '', '', '', '', 'private-signature-image', 2]);
  const source = db.content;
  const rows = JSON.stringify(sheet.getDataRange().getValues());
  const account = JSON.stringify(gas.state().account);
  const files = [...gas.shared.files.keys()];
  for (const request of [
    { operation: 'connectionTest', setupKey },
    { operation: 'connectionTest', setupKey, ...access, csrf: 'bad' },
    { operation: 'connectionTest', setupKey: 'bad', ...access },
  ]) assert.equal(gas.rpc(request).status, 'error');
  const response = gas.rpc({ operation: 'connectionTest', setupKey, ...access });
  assert.equal(response.status, 'success');
  assert.equal(response.data.sessions, 1);
  assert.equal(response.data.signatures, 1);
  assert.equal(response.data.database.fileId, db.getId());
  assert.equal(response.data.signatureFile.fileId, signatureFile.getId());
  for (const privateValue of [setupKey, 'Private Person', 'private-signature-image', 'existing-token']) assert.ok(!JSON.stringify(response).includes(privateValue));
  assert.equal(db.content, source);
  assert.equal(JSON.stringify(sheet.getDataRange().getValues()), rows);
  assert.equal(JSON.stringify(gas.state().account), account);
  assert.deepEqual([...gas.props], originalProps);
  assert.deepEqual([...gas.shared.files.keys()], files);
  db.content = 'broken-json';
  assert.ok(gas.rpc({ operation: 'connectionTest', setupKey, ...access }).message.startsWith('[ERR-CONNECTION-DB]'));
  assert.equal(db.getName(), response.data.database.name);
  assert.equal(db.content, 'broken-json');
  db.content = source;
  sheet.getRange(1, 1).setValues([['bad-header']]);
  assert.ok(gas.rpc({ operation: 'connectionTest', setupKey, ...access }).message.startsWith('[ERR-CONNECTION-SIGNATURE]'));
  assert.equal(sheet.getRange(1, 1).getValues()[0][0], 'bad-header');
});
