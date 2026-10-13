import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createFakeDrive } from './gas-harness.mjs';

const source = readFileSync(new URL('../gas/legacy/TeacherSignV4.gs', import.meta.url), 'utf8');
export const legacyFixtureKey = id => `Fictional-Legacy-School-${id}-Private-Key-2026!`;
export const legacyFixtureToken = id => `fictional-legacy-participant-token-${id}`;

// Execute the shipped, archived v4 server rather than reproducing its API in
// browser mocks. Every school gets its own Drive to match filename-based v4 IO.
export function createLegacyGasHarness(id = 'A') {
  const shared = createFakeDrive(), props = new Map();
  const folder = shared.drive.createFolder(`fictional-school-${id}`);
  shared.drive.createFile = (name, content) => folder.createFile(name, content);
  shared.drive.searchFiles = query => {
    const name = /^title = '([^']+)' and trashed = false$/.exec(query)?.[1];
    if (!name) throw Error('Unexpected archived Drive query');
    return shared.drive.getFilesByName(name);
  };
  shared.spreadsheet.open = file => shared.spreadsheet.openById(file.getId());
  let locked = false;
  const context = vm.createContext({
    Date, console: { log() {} },
    DriveApp: shared.drive, SpreadsheetApp: shared.spreadsheet,
    Utilities: { getUuid: randomUUID },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: name => props.get(name),
      setProperty: (name, value) => props.set(name, value),
    }) },
    LockService: { getScriptLock: () => ({
      waitLock() { if (locked) throw Error('Nested archived server lock'); locked = true; },
      releaseLock() { locked = false; },
    }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({
      setMimeType() { return this; }, getContent: () => text,
    }) },
  });
  vm.runInContext(source, context);
  const key = legacyFixtureKey(id), token = legacyFixtureToken(id);
  props.set('TEACHERSIGN_ADMIN_KEY', key);
  context.setupTeacherSign();
  const staff = [
    { id: `${id}-inline-person`, name: `가상 ${id} 기존 서명`, department: '교무부' },
    { id: `${id}-sheet-person`, name: `가상 ${id} 시트 서명`, department: '연구부' },
    { id: `${id}-new-person`, name: `가상 ${id} 참여 교사`, department: '교육부' },
  ];
  const inline = {
    staffId: staff[0].id, staffName: staff[0].name, department: staff[0].department,
    signatureData: 'data:image/png;base64,RmljdGlvbmFsLWlubGluZS1zaWduYXR1cmU=', timestamp: 100,
  };
  const sessions = [1, 2].map(number => ({
    id: `legacy-${id}-${number}`, type: 'school', title: `가상 v4 ${id} 기존 연수 ${number}`,
    date: '2026-10-13', time: '15:00~16:00', schoolName: `가상 v4 학교 ${id}`,
    maxParticipants: 10, staffList: staff, participantToken: token,
    signatures: number === 1 ? [inline] : [], createdAt: 1,
  }));
  shared.drive.createFile('TrainingApp_DB.json', JSON.stringify({ sessions }));
  context.getSignatureSheet().appendRow([
    sessions[0].id, staff[1].id, staff[1].name, staff[1].department,
    '', '', '', '', 'data:image/webp;base64,RmljdGlvbmFsLXNoZWV0LXNpZ25hdHVyZQ==', 200,
  ]);
  const dispatch = request => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(request) } }).getContent());
  return {
    context, shared, props, key, token, staff,
    dispatch,
    sessions: () => dispatch({ action: 'getAdminSessions', adminKey: key }).data,
    files: () => [...shared.files.values()].map(file => ({ id: file.id, name: file.name, content: file.content })),
    rows: () => JSON.parse(JSON.stringify(context.getSignatureSheet().getDataRange().getValues())),
  };
}
