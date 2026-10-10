import test from 'node:test';
import assert from 'node:assert/strict';
import { createGasHarness } from './gas-harness.mjs';

const fixture = () => {
  const gas = createGasHarness('migration-school');
  gas.session.activeEmail = gas.session.effectiveEmail;
  const folder = gas.shared.drive.createFolder('legacy');
  const source = folder.createFile('TrainingApp_DB.json', JSON.stringify({
    sessions: [{ id: 'legacy-1', participantToken: 'existing-token', roster: [{ id: 'staff-1' }], signatures: [{ staffId: 'staff-1', signatureData: 'data:image/png;base64,' + 'x'.repeat(2100000) }] }],
  }));
  gas.props.set('TEACHERSIGN_LEGACY_DB_FILE_ID', source.getId());
  gas.props.set('TEACHERSIGN_LEGACY_SIGNATURE_FILE_ID', 'NONE');
  return { gas, source };
};
test('migration copies a DB larger than browser RPC limit, preserving source, current files, tokens and auth', () => {
  const { gas, source } = fixture();
  const auth = gas.props.get('TEACHERSIGN_AUTH_FILE_ID');
  const originalProps = new Map(gas.props);
  const originalContent = source.content;
  const current = gas.shared.files.get(gas.props.get('TEACHERSIGN_DB_FILE_ID'));
  const currentContent = current.content;
  const authContent = gas.shared.files.get(auth).content;
  const preview = JSON.parse(gas.context.previewTeacherSignMigration());
  assert.equal(preview.source.sessions, 1);
  assert.equal(preview.source.embeddedSignatures, 1);
  assert.equal(current.content, currentContent);
  const result = JSON.parse(gas.context.migrateTeacherSignLegacyData());
  assert.notEqual(result.dbFileId, source.getId());
  assert.notEqual(result.dbFileId, current.getId());
  assert.equal(gas.shared.files.get(result.dbFileId).content, originalContent);
  assert.equal(source.content, originalContent);
  assert.equal(current.content, currentContent);
  assert.equal(gas.shared.files.get(result.backupDbFileId).content, currentContent);
  for (const name of ['TEACHERSIGN_AUTH_FILE_ID', 'TEACHERSIGN_ADMIN_KEY', 'TEACHERSIGN_FOLDER_ID']) assert.equal(gas.props.get(name), originalProps.get(name));
  assert.equal(gas.shared.files.get(auth).content, authContent);
  assert.throws(() => gas.context.migrateTeacherSignLegacyData(), /ERR-MIGRATION/);
});
test('all visible migration entries reject anonymous and other users before reads or writes', () => {
  const { gas } = fixture();
  const before = new Map(gas.props);
  const files = gas.shared.files.size;
  for (const email of ['', 'other@example.test']) {
    gas.session.activeEmail = email;
    for (const name of ['inspectTeacherSignLegacyData', 'previewTeacherSignMigration', 'migrateTeacherSignLegacyData']) assert.throws(() => gas.context[name](), /ERR-INSTALLER/);
  }
  assert.deepEqual(gas.props, before);
  assert.equal(gas.shared.files.size, files);
});
test('existing v5 sessions or separate signatures block migration without deleting or overwriting files', () => {
  for (const useSheet of [false, true]) {
    const { gas } = fixture();
    const current = gas.shared.files.get(gas.props.get('TEACHERSIGN_DB_FILE_ID'));
    if (useSheet) gas.context.getSignatureSheet_().appendRow(['new-1', 'new-staff']);
    else current.content = JSON.stringify({ sessions: [{ id: 'new-1' }] });
    const props = new Map(gas.props), size = gas.shared.files.size;
    assert.throws(() => gas.context.previewTeacherSignMigration(), /ERR-MIGRATION-NOT-EMPTY/);
    assert.throws(() => gas.context.migrateTeacherSignLegacyData(), /ERR-MIGRATION-NOT-EMPTY/);
    assert.deepEqual(gas.props, props);
    assert.equal(gas.shared.files.size, size);
  }
});
test('preview is required and changes to either source or destination invalidate it', () => {
  for (const target of ['source', 'destination', 'connection', 'sheet']) {
    const { gas, source } = fixture();
    assert.throws(() => gas.context.migrateTeacherSignLegacyData(), /ERR-MIGRATION-PREVIEW/);
    gas.context.previewTeacherSignMigration();
    if (target === 'source') source.content += ' ';
    else if (target === 'destination') gas.shared.files.get(gas.props.get('TEACHERSIGN_DB_FILE_ID')).content += ' ';
    else if (target === 'connection') gas.props.set('TEACHERSIGN_FOLDER_ID', gas.shared.drive.createFolder('other').getId());
    else gas.context.getSignatureSheet_().appendRow(['unknown', 'staff']);
    const size = gas.shared.files.size;
    assert.throws(() => gas.context.migrateTeacherSignLegacyData(), /ERR-MIGRATION-(PREVIEW|NOT-EMPTY)/);
    assert.equal(gas.shared.files.size, size);
  }
});
test('explicit legacy signature sheet is validated and copied while both original sheets are preserved', () => {
  const { gas } = fixture();
  const oldSheet = gas.shared.spreadsheet.create('TrainingApp_Signatures');
  const tab = oldSheet.insertSheet('signatures');
  const headers = gas.context.getSignatureSheet_().getDataRange().getValues()[0];
  tab.appendRow(headers);
  tab.appendRow(['legacy-1', 'staff-2', '가상 교사', '', '', '', '', '', 'data:image/png;base64,x', 1]);
  gas.props.set('TEACHERSIGN_LEGACY_SIGNATURE_FILE_ID', oldSheet.getId());
  const before = tab.getDataRange().getValues();
  const currentId = gas.props.get('TEACHERSIGN_SIGNATURE_FILE_ID');
  gas.context.previewTeacherSignMigration();
  const result = JSON.parse(gas.context.migrateTeacherSignLegacyData());
  assert.equal(result.separateSignatureRows, 1);
  assert.notEqual(result.signatureFileId, oldSheet.getId());
  assert.notEqual(result.signatureFileId, currentId);
  assert.deepEqual(tab.getDataRange().getValues(), before);
  assert.deepEqual(gas.shared.spreadsheet.openById(result.signatureFileId).getSheetByName('signatures').getDataRange().getValues(), before);
  assert.equal(gas.shared.spreadsheet.openById(currentId).getSheetByName('signatures').getLastRow(), 1);
});
test('malformed DB, missing source, mismatched sheet and corrupt copy never switch the current DB', () => {
  for (const problem of ['missing', 'malformed', 'duplicates', 'sheet', 'copy']) {
    const { gas, source } = fixture();
    const currentId = gas.props.get('TEACHERSIGN_DB_FILE_ID');
    if (problem === 'missing') gas.props.set('TEACHERSIGN_LEGACY_DB_FILE_ID', 'absent');
    if (problem === 'malformed') source.content = '{broken';
    if (problem === 'duplicates') source.content = JSON.stringify({ sessions: [{ id: 'same' }, { id: 'same' }] });
    if (problem === 'sheet') {
      const sheet = gas.shared.spreadsheet.create('TrainingApp_Signatures');
      const tab = sheet.insertSheet('signatures');
      tab.appendRow(gas.context.getSignatureSheet_().getDataRange().getValues()[0]);
      tab.appendRow(['another-school', 'staff']);
      gas.props.set('TEACHERSIGN_LEGACY_SIGNATURE_FILE_ID', sheet.getId());
    }
    if (problem === 'copy') {
      gas.context.previewTeacherSignMigration();
      const copy = source.makeCopy;
      source.makeCopy = (name, folder) => { const result = copy.call(source, name, folder); result.content += ' '; return result; };
      assert.throws(() => gas.context.migrateTeacherSignLegacyData(), /ERR-MIGRATION-COPY/);
    } else assert.throws(() => gas.context.previewTeacherSignMigration());
    assert.equal(gas.props.get('TEACHERSIGN_DB_FILE_ID'), currentId);
    assert.equal(gas.props.has('TEACHERSIGN_MIGRATION_RECEIPT'), false);
  }
});
test('name lookup only reports candidates; it never silently chooses the first or most recent DB', () => {
  const { gas } = fixture();
  gas.shared.drive.createFolder('another-school').createFile('TrainingApp_DB.json', JSON.stringify({ sessions: [{ id: 'another-school' }] }));
  const props = new Map(gas.props);
  const size = gas.shared.files.size;
  gas.context.inspectTeacherSignLegacyData();
  assert.deepEqual(gas.props, props);
  assert.equal(gas.shared.files.size, size);
  assert.ok(gas.logs.some(line => line.includes('후보 DB 2개')));
  assert.ok(!gas.logs.some(line => line.includes('data:image')));
});
