import test from 'node:test';
import assert from 'node:assert/strict';
import { createGasHarness } from './gas-harness.mjs';

const oldImage = 'data:image/png;base64,T0xE';
const newImage = 'data:image/png;base64,TkVX';
function fixture(location) {
  const gas = createGasHarness('signature-preservation');
  const signature = { staffId: 'teacher-1', staffName: '가상 교사', signatureData: oldImage, timestamp: gas.now() + 10000 };
  const db = gas.shared.files.get(gas.props.get('TEACHERSIGN_DB_FILE_ID'));
  db.content = JSON.stringify({ sessions: [{ id: 'training', type: 'school', participantToken: 'test-participant-token-1234567890', title: '가상 연수', maxParticipants: 1, staffList: [{ id: 'teacher-1', name: '가상 교사' }], signatures: location === 'json' ? [signature] : [] }] });
  const sheet = gas.context.getSignatureSheet_();
  if (location === 'sheet') sheet.appendRow(['training', signature.staffId, signature.staffName, '', '', '', '', '', oldImage, signature.timestamp]);
  const write = mode => mode === 'admin' ? gas.context.addAdminSignatureBatchResponse_(['training'], { ...signature, signatureData: newImage, timestamp: 1 }) : gas.context.addParticipantSignatureResponse_({ sessionId: 'training', participantToken: 'test-participant-token-1234567890', signature: { ...signature, signatureData: newImage, timestamp: 1 } });
  const read = () => gas.context.getMergedSessions_(gas.context.getStoredData_())[0].signatures;
  return { gas, db, sheet, write, read };
}
test('failed replacement writes preserve previous JSON and sheet signatures for administrators and participants', () => {
  for (const location of ['json', 'sheet']) for (const mode of ['admin', 'participant']) {
    const { db, sheet, write, read } = fixture(location);
    const before = db.content, rows = sheet.getDataRange().getValues();
    const range = sheet.getRange;
    sheet.getRange = (...args) => { const result = range(...args); if (args[0] > rows.length) result.setValues = () => { throw Error('Injected append failure'); }; return result; };
    assert.throws(() => write(mode), /Injected append failure/);
    assert.equal(db.content, before);
    assert.deepEqual(sheet.getDataRange().getValues(), rows);
    assert.equal(read().length, 1); assert.equal(read()[0].signatureData, oldImage);
  }
});
test('successful replacements are selected once despite old client timestamps and retain the original records', () => {
  for (const location of ['json', 'sheet']) for (const mode of ['admin', 'participant']) {
    const { db, sheet, write, read } = fixture(location);
    const before = db.content, rows = sheet.getLastRow();
    assert.equal(JSON.parse(write(mode).getContent()).status, 'success');
    assert.equal(db.content, before); assert.equal(sheet.getLastRow(), rows + 1);
    assert.equal(read().length, 1); assert.equal(read()[0].signatureData, newImage);
    write(mode);
    assert.equal(read().length, 1);
    assert.equal(read()[0].signatureData, newImage);
  }
});
test('explicit signature removal removes retained history and embedded copies', () => {
  const { gas, write, read } = fixture('json');
  write('admin'); write('admin');
  gas.context.removeSignatureResponse_(['training'], 'teacher-1');
  assert.equal(read().length, 0); assert.equal(gas.context.getSignatureSheet_().getLastRow(), 1);
});
