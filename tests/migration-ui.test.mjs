import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createGasHarness } from './gas-harness.mjs';

function fixture() {
  const gas = createGasHarness('migration-ui-school');
  const token = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
  const digest = token => createHash('sha256').update(token).digest('hex');
  const state = gas.state();
  state.account = { username: 'admin', label: '가상 학교', passwordHash: 'unchanged-test-verifier', revision: 1 };
  state.sessions[digest(token)] = { revision: 1, csrf, lastSeenAt: gas.now(), expiresAt: gas.now() + 28800000 };
  const auth = gas.shared.files.get(gas.props.get('TEACHERSIGN_AUTH_FILE_ID'));
  auth.setContent(JSON.stringify(state));
  const folder = gas.shared.drive.createFolder('우리 학교 기존 자료');
  const source = folder.createFile('TrainingApp_DB.json', JSON.stringify({ sessions: [{ id: 'legacy-1', title: '가상 기존 연수', participantToken: 'private-participant-token', authCode: 'private-pin', staffList: [{ id: 'teacher', name: 'private-name' }], signatures: [{ staffId: 'teacher', signatureData: 'private-image', timestamp: 1 }] }] }));
  const spreadsheet = gas.shared.spreadsheet.create('TrainingApp_Signatures');
  gas.shared.files.get(spreadsheet.getId()).moveTo(folder);
  const tab = spreadsheet.insertSheet('signatures');
  tab.appendRow(gas.context.getSignatureSheet_().getDataRange().getValues()[0]);
  tab.appendRow(['legacy-1', 'teacher', 'private-name', '', '', '', '', '', 'private-sheet-image', 2]);
  tab.appendRow(['legacy-1', 'other-teacher', 'private-name-2', '', '', '', '', '', 'private-sheet-image-2', 2]);
  const access = { sessionToken: token, csrf };
  const action = (name, payload = {}, extra = {}) => gas.rpc({ operation: 'admin', name, payload, requestId: randomUUID(), ...access, ...extra });
  const selection = { dbFileId: source.getId(), signatureFileId: spreadsheet.getId() };
  return { gas, action, selection, source, tab, auth, access };
}
test('web migration requires school login and CSRF for scans, previews and connection', () => {
  const { gas, action, selection } = fixture();
  const before = new Map(gas.props), size = gas.shared.files.size;
  for (const name of ['findLegacyData', 'previewLegacyData', 'connectLegacyData']) {
    assert.match(gas.rpc({ operation: 'admin', name, payload: selection }).message, /ERR-AUTH/);
    assert.match(action(name, selection, { csrf: 'wrong' }).message, /ERR-CSRF/);
  }
  assert.equal(gas.shared.files.size, size); assert.deepEqual(gas.props, before);
  assert.equal(gas.rpc({ operation: 'participant', name: 'findLegacyData' }).status, 'error');
});
test('scan returns bounded summaries and candidates without changing connections or exposing names, PINs, tokens or images', () => {
  const { gas, action, selection, source } = fixture();
  const props = new Map(gas.props);
  gas.shared.drive.createFolder('다른 학교').createFile('TrainingApp_DB.json', JSON.stringify({ sessions: [{ id: 'other', title: '다른 학교 연수' }] }));
  const scan = action('findLegacyData').data;
  assert.equal(scan.databases.length, 2);
  assert.equal(scan.databases[0].fileId, selection.dbFileId);
  assert.equal(scan.databases[0].folder, '우리 학교 기존 자료');
  assert.equal(scan.databases[0].titles[0].title, '가상 기존 연수');
  assert.equal(scan.sheets[0].rows, 2);
  assert.equal(scan.current.sessions, 0);
  assert.deepEqual(gas.props, props);
  const preview = action('previewLegacyData', selection).data;
  assert.equal(preview.sessions, 1); assert.equal(preview.signatures, 2); // embedded and sheet signatures overlap
  for (const text of ['private-name', 'private-pin', 'private-participant-token', 'private-image', 'private-sheet-image']) assert.ok(!JSON.stringify({ scan, preview }).includes(text));
  const copies = gas.shared.files.size;
  const result = action('connectLegacyData', { ticket: preview.ticket });
  assert.equal(result.status, 'success');
  assert.equal(result.data.signatures, 2);
  assert.notEqual(result.data.dbFileId, source.getId());
  assert.equal(gas.shared.files.get(result.data.dbFileId).content, source.content);
  assert.equal(gas.state().account.passwordHash, 'unchanged-test-verifier');
  const finalSize = gas.shared.files.size; assert.ok(finalSize > copies);
  assert.deepEqual(action('connectLegacyData', { ticket: preview.ticket }).data, result.data);
  assert.equal(gas.shared.files.size, finalSize);
  assert.equal(action('findLegacyData').data.completed, true);
});
test('UI preview expires, belongs to one admin session and is invalidated by source, destination, account-file or connection edits', () => {
  for (const problem of ['expired', 'session', 'source', 'destination', 'auth', 'sheet', 'folder']) {
    const { gas, action, selection, source } = fixture();
    const preview = action('previewLegacyData', selection).data;
    if (problem === 'expired') gas.advance(600001);
    if (problem === 'session') {
      const state = gas.state(), secondToken = randomBytes(32).toString('base64url');
      state.sessions[gas.context.schoolDigest_(secondToken)] = Object.values(state.sessions)[0];
      gas.context.saveSchoolAuth_(state);
      assert.match(action('connectLegacyData', { ticket: preview.ticket }, { sessionToken: secondToken }).message, /ERR-MIGRATION-PREVIEW/);
      continue;
    }
    if (problem === 'source') source.content += ' ';
    if (problem === 'destination') gas.shared.files.get(gas.props.get('TEACHERSIGN_DB_FILE_ID')).content += ' ';
    if (problem === 'auth') gas.props.set('TEACHERSIGN_AUTH_FILE_ID', gas.shared.files.get(gas.props.get('TEACHERSIGN_AUTH_FILE_ID')).makeCopy('other auth', gas.shared.drive.createFolder('other')).getId());
    if (problem === 'sheet') gas.context.getSignatureSheet_().appendRow(['new', 'teacher']);
    if (problem === 'folder') gas.props.set('TEACHERSIGN_FOLDER_ID', gas.shared.drive.createFolder('other').getId());
    const id = gas.props.get('TEACHERSIGN_DB_FILE_ID'), size = gas.shared.files.size;
    assert.match(action('connectLegacyData', { ticket: preview.ticket }).message, /ERR-MIGRATION-(PREVIEW|NOT-EMPTY)/);
    assert.equal(gas.props.get('TEACHERSIGN_DB_FILE_ID'), id); assert.equal(gas.shared.files.size, size);
  }
});
test('UI refuses nonempty destination, mismatched signatures and unconfirmed JSON-only selection', () => {
  const { gas, action, selection, tab } = fixture();
  assert.match(action('previewLegacyData', { dbFileId: selection.dbFileId }).message, /ERR-MIGRATION-SOURCE/);
  tab.appendRow(['another-school', 'teacher']);
  assert.match(action('previewLegacyData', selection).message, /ERR-MIGRATION-SHEET/);
  assert.equal(action('previewLegacyData', { ...selection, signatureFileId: 'NONE' }).data.signatures, 1);
  gas.shared.files.get(gas.props.get('TEACHERSIGN_DB_FILE_ID')).content = JSON.stringify({ sessions: [{ id: 'new-training' }] });
  assert.match(action('previewLegacyData', { ...selection, signatureFileId: 'NONE' }).message, /ERR-MIGRATION-NOT-EMPTY/);
});
test('failed copy, failed backup and edits during copying preserve old file IDs and originals', () => {
  for (const problem of ['copy', 'backup', 'race']) {
    const { gas, action, selection, source } = fixture();
    const preview = action('previewLegacyData', selection).data;
    const currentId = gas.props.get('TEACHERSIGN_DB_FILE_ID');
    const file = problem === 'backup' ? gas.shared.files.get(currentId) : source;
    const original = file.makeCopy;
    file.makeCopy = (name, folder) => {
      const copy = original.call(file, name, folder);
      if (problem === 'race') source.content += ' '; else copy.content += ' ';
      return copy;
    };
    assert.match(action('connectLegacyData', { ticket: preview.ticket }).message, /ERR-MIGRATION-(COPY|PREVIEW)/);
    assert.equal(gas.props.get('TEACHERSIGN_DB_FILE_ID'), currentId);
    assert.equal(gas.props.has('TEACHERSIGN_MIGRATION_RECEIPT'), false);
  }
});
test('completed migration can be confirmed again after a receipt-save failure without making more copies', () => {
  const { gas, action, selection, auth } = fixture();
  const preview = action('previewLegacyData', selection).data;
  const save = auth.setContent;
  let writes = 0;
  auth.setContent = text => { if (++writes === 2) throw Error('Receipt save failed'); save(text); };
  assert.equal(action('connectLegacyData', { ticket: preview.ticket }).status, 'error');
  const finalId = gas.props.get('TEACHERSIGN_DB_FILE_ID'), size = gas.shared.files.size;
  const retry = action('connectLegacyData', { ticket: preview.ticket });
  assert.equal(retry.status, 'success'); assert.equal(retry.data.dbFileId, finalId);
  assert.equal(gas.shared.files.size, size);
});
test('unreadable candidates are disabled and a truncated search is explicit', () => {
  const { gas, action } = fixture();
  const folder = gas.shared.drive.createFolder('many');
  folder.createFile('TrainingApp_DB.json', '{broken');
  for (let i = 0; i < 35; i++) folder.createFile('TrainingApp_DB.json', JSON.stringify({ sessions: [{ id: `training-${i}` }] }));
  const scan = action('findLegacyData').data;
  assert.equal(scan.databases.length, 30); assert.equal(scan.truncated, true);
  assert.equal(scan.databases[1].readable, false);
});
