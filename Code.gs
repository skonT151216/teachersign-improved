// TeacherSign Google Apps Script server v4.0.0
// Paste this file into Apps Script, run setupTeacherSign once, then deploy as a web app.

const SERVER_VERSION = '4.0.0';
const DB_FILENAME = 'TrainingApp_DB.json';
const SIG_SHEET_FILENAME = 'TrainingApp_Signatures';
const SIG_SHEET_TAB = 'signatures';
const ADMIN_KEY_PROPERTY = 'TEACHERSIGN_ADMIN_KEY';
const SIG_HEADERS = ['sessionId', 'staffId', 'staffName', 'department', 'affiliation', 'grade', 'classNumber', 'childName', 'signatureData', 'timestamp'];

function setupTeacherSign() {
  const properties = PropertiesService.getScriptProperties();
  let adminKey = properties.getProperty(ADMIN_KEY_PROPERTY);
  if (!adminKey) {
    adminKey = createSecureToken();
    properties.setProperty(ADMIN_KEY_PROPERTY, adminKey);
  }
  getStoredData();
  getSignatureSheet();
  console.log('관리자 연결키: ' + adminKey);
  return '관리자 연결키: ' + adminKey;
}

function resetTeacherSignAdminKey() {
  const adminKey = createSecureToken();
  PropertiesService.getScriptProperties().setProperty(ADMIN_KEY_PROPERTY, adminKey);
  console.log('새 관리자 연결키: ' + adminKey);
  return '새 관리자 연결키: ' + adminKey;
}

function doGet(e) { return handleRequest(e, 'GET'); }
function doPost(e) { return handleRequest(e, 'POST'); }

function handleRequest(e, method) {
  try {
    let request = {};
    if (method === 'POST' && e.postData && e.postData.contents) request = JSON.parse(e.postData.contents);
    else if (method === 'GET') request = e.parameter || {};
    const action = request.action || 'healthCheck';

    if (action === 'healthCheck') {
      getStoredData();
      getSignatureSheet();
      return responseJSON({ status: 'success', data: { serverVersion: SERVER_VERSION, storageReady: true, adminKeyConfigured: Boolean(PropertiesService.getScriptProperties().getProperty(ADMIN_KEY_PROPERTY)) } });
    }
    if (method === 'GET') return responseJSON({ status: 'error', message: '[ERR-METHOD-01] 이 요청은 POST 방식만 허용됩니다.' });
    if (action === 'getParticipantSession') return getParticipantSessionResponse(request);
    if (action === 'addParticipantSignature') return addParticipantSignatureResponse(request);

    requireAdmin(request.adminKey);
    if (action === 'verifyAdmin') {
      const db = getStoredData();
      return responseJSON({ status: 'success', data: { serverVersion: SERVER_VERSION, sessionCount: (db.sessions || []).length } });
    }
    if (action === 'getAdminSessions' || action === 'getSessions') return getAdminSessionsResponse();
    if (action === 'createSession') return createSessionResponse(request.session);
    if (action === 'deleteSession') return deleteSessionResponse(request.sessionId);
    if (action === 'addSignatureBatch') return addAdminSignatureBatchResponse(request.sessionIds || [], request.signature);
    if (action === 'removeSignatureBatch' || action === 'removeSignature') {
      return removeSignatureResponse(action === 'removeSignature' ? [request.sessionId] : (request.sessionIds || []), request.staffId);
    }
    return responseJSON({ status: 'error', message: '[ERR-ACTION-01] 지원하지 않는 요청입니다.' });
  } catch (error) {
    return responseJSON({ status: 'error', message: normalizeError(error) });
  }
}

function requireAdmin(candidate) {
  const saved = PropertiesService.getScriptProperties().getProperty(ADMIN_KEY_PROPERTY);
  if (!saved) throw new Error('[ERR-ADMIN-SETUP] Apps Script 편집기에서 setupTeacherSign 함수를 먼저 실행하세요.');
  if (!candidate || String(candidate) !== saved) throw new Error('[ERR-ADMIN-KEY] 관리자 연결키가 일치하지 않습니다.');
}

function getAdminSessionsResponse() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const db = getStoredData();
    if (ensureParticipantTokens(db)) saveData(db);
    return responseJSON({ status: 'success', data: getMergedSessions(db) });
  } finally { lock.releaseLock(); }
}

function getParticipantSessionResponse(request) {
  const db = getStoredData();
  const session = findSession(db, request.sessionId);
  validateParticipantToken(session, request.participantToken);
  const authRequired = Boolean(session.authCode);
  const authVerified = !authRequired || String(request.authCode || '') === String(session.authCode);
  return responseJSON({ status: 'success', data: toParticipantSession(session, db, authRequired, authVerified) });
}

function addParticipantSignatureResponse(request) {
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    const anchor = findSession(db, request.sessionId);
    validateParticipantToken(anchor, request.participantToken);
    if (anchor.authCode && String(request.authCode || '') !== String(anchor.authCode)) throw new Error('[ERR-PARTICIPANT-CODE] 참여 인증번호가 일치하지 않습니다.');
    validateSignature(request.signature);
    const safeSignature = normalizeParticipantSignature(anchor, request.signature);
    const targets = getRelatedSessions(db, anchor).filter(session => canParticipantSign(session, safeSignature));
    if (!targets.length) throw new Error('[ERR-PARTICIPANT-01] 서명 대상 명단에서 사용자를 찾지 못했습니다.');

    const signatureMap = getSignaturesGroupedBySession();
    targets.forEach(session => {
      const merged = mergeSignatures(session.signatures, signatureMap[session.id], session.staffList);
      const alreadySigned = merged.some(signature => String(signature.staffId) === String(safeSignature.staffId));
      if (!alreadySigned && uniqueSignatures(merged).length >= Number(session.maxParticipants || 0)) throw new Error('[ERR-FULL-01] 참가 가능 인원을 초과한 연수가 포함되어 있습니다.');
    });

    const targetIds = targets.map(session => session.id);
    removeLegacySignatures(db, targetIds, safeSignature.staffId);
    saveData(db);
    upsertSignatureRowsUnlocked(targetIds, safeSignature);
    return responseJSON({ status: 'success', data: { updatedCount: targetIds.length } });
  } finally { lock.releaseLock(); }
}

function createSessionResponse(incoming) {
  if (!incoming || !incoming.id) throw new Error('[ERR-SESSION-01] 저장할 연수 정보가 없습니다.');
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    if (!db.sessions) db.sessions = [];
    const existing = findSession(db, incoming.id, false);
    const stored = Object.assign({}, incoming, {
      participantToken: existing && existing.participantToken ? existing.participantToken : (incoming.participantToken || createSecureToken()),
      signatures: existing && Array.isArray(existing.signatures) ? existing.signatures : [],
    });
    db.sessions = db.sessions.filter(session => session.id !== stored.id);
    db.sessions.push(stored);
    saveData(db);
    return responseJSON({ status: 'success', data: { participantToken: stored.participantToken } });
  } finally { lock.releaseLock(); }
}

function deleteSessionResponse(sessionId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    db.sessions = (db.sessions || []).filter(session => session.id !== sessionId);
    saveData(db);
    removeSignatureRowsUnlocked([sessionId], null);
    return responseJSON({ status: 'success' });
  } finally { lock.releaseLock(); }
}

function addAdminSignatureBatchResponse(sessionIds, signature) {
  validateSignature(signature);
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    const validIds = (db.sessions || []).map(session => session.id);
    const targets = sessionIds.filter(id => validIds.indexOf(id) >= 0);
    if (!targets.length) throw new Error('[ERR-SESSION-02] 서명할 연수를 찾지 못했습니다.');
    removeLegacySignatures(db, targets, signature.staffId);
    saveData(db);
    upsertSignatureRowsUnlocked(targets, signature);
    return responseJSON({ status: 'success', data: { updatedCount: targets.length } });
  } finally { lock.releaseLock(); }
}

function removeSignatureResponse(sessionIds, staffId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    const legacyRemoved = removeLegacySignatures(db, sessionIds, staffId);
    if (legacyRemoved) saveData(db);
    const sheetRemoved = removeSignatureRowsUnlocked(sessionIds, staffId);
    return responseJSON({ status: 'success', data: { removedCount: legacyRemoved + sheetRemoved } });
  } finally { lock.releaseLock(); }
}

function toParticipantSession(session, db, authRequired, authVerified) {
  const related = getRelatedSessions(db, session);
  const view = {
    id: session.id, type: session.type, title: session.title, date: session.date, time: session.time,
    schoolName: session.schoolName, maxParticipants: session.maxParticipants, createdAt: session.createdAt,
    parentGrades: session.parentGrades, parentClasses: session.parentClasses,
    relatedSessionTitles: related.map(item => item.title), authRequired: authRequired, authVerified: authVerified,
    staffList: [], signatures: [],
  };
  if (!authVerified) return view;
  if (session.type === 'school') {
    const signatureMap = getSignaturesGroupedBySession();
    const merged = mergeSignatures(session.signatures, signatureMap[session.id], session.staffList);
    view.staffList = (session.staffList || []).map(staff => ({ id: staff.id, name: staff.name, department: staff.department }));
    view.signatures = uniqueSignatures(merged).map(signature => ({ staffId: signature.staffId, staffName: signature.staffName, department: signature.department, signatureData: '', timestamp: signature.timestamp }));
  }
  return view;
}

function getRelatedSessions(db, anchor) { return (db.sessions || []).filter(session => session.date === anchor.date && session.type === anchor.type); }
function canParticipantSign(session, signature) { return session.type !== 'school' || (session.staffList || []).some(staff => String(staff.id) === String(signature.staffId)); }

function normalizeParticipantSignature(anchor, signature) {
  if (anchor.type !== 'school') return signature;
  const staff = (anchor.staffList || []).find(item => String(item.id) === String(signature.staffId));
  if (!staff) throw new Error('[ERR-PARTICIPANT-01] 서명 대상 명단에서 사용자를 찾지 못했습니다.');
  return Object.assign({}, signature, { staffName: staff.name, department: staff.department, affiliation: staff.affiliation || '' });
}

function validateParticipantToken(session, candidate) {
  if (!session.participantToken || !candidate || String(candidate) !== String(session.participantToken)) throw new Error('[ERR-PARTICIPANT-LINK] 유효하지 않거나 이전 버전에서 만든 참여 링크입니다. 담당자에게 새 QR을 요청하세요.');
}

function validateSignature(signature) {
  if (!signature || !signature.staffId || !signature.staffName || !signature.signatureData) throw new Error('[ERR-SIGNATURE-01] 서명 정보가 올바르지 않습니다.');
  if (String(signature.signatureData).indexOf('data:image/') !== 0) throw new Error('[ERR-SIGNATURE-02] 서명 이미지 형식이 올바르지 않습니다.');
}

function getMergedSessions(db) {
  const signatureMap = getSignaturesGroupedBySession();
  return (db.sessions || []).map(session => Object.assign({}, session, { signatures: mergeSignatures(session.signatures, signatureMap[session.id], session.staffList) }));
}

function mergeSignatures(legacySignatures, sheetSignatures, staffList) {
  const legacy = legacySignatures || [];
  const fromSheet = uniqueSignatures(sheetSignatures || []);
  const sheetStaffIds = {};
  fromSheet.forEach(signature => { sheetStaffIds[signature.staffId] = true; });
  const merged = legacy.filter(signature => !sheetStaffIds[signature.staffId]).concat(fromSheet);
  const staffById = {};
  (staffList || []).forEach(staff => { staffById[staff.id] = staff; });
  merged.forEach(signature => {
    if (!signature.staffName && staffById[signature.staffId]) {
      signature.staffName = staffById[signature.staffId].name;
      signature.department = staffById[signature.staffId].department;
    }
  });
  return uniqueSignatures(merged);
}

function uniqueSignatures(signatures) {
  const latest = {};
  (signatures || []).forEach(signature => {
    const key = String(signature.staffId || '');
    if (key && (!latest[key] || Number(signature.timestamp || 0) >= Number(latest[key].timestamp || 0))) latest[key] = signature;
  });
  return Object.keys(latest).map(key => latest[key]);
}

function ensureParticipantTokens(db) {
  let changed = false;
  (db.sessions || []).forEach(session => {
    if (!session.participantToken) { session.participantToken = createSecureToken(); changed = true; }
  });
  return changed;
}

function removeLegacySignatures(db, sessionIds, staffId) {
  let removed = 0;
  (db.sessions || []).forEach(session => {
    if (sessionIds.indexOf(session.id) < 0) return;
    const before = (session.signatures || []).length;
    session.signatures = (session.signatures || []).filter(signature => String(signature.staffId) !== String(staffId));
    removed += before - session.signatures.length;
  });
  return removed;
}

function getStoredData() {
  const files = DriveApp.searchFiles("title = '" + DB_FILENAME + "' and trashed = false");
  if (!files.hasNext()) return { sessions: [] };
  const file = files.next();
  const content = file.getBlob().getDataAsString();
  if (!content || !content.trim()) return { sessions: [] };
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.sessions)) parsed.sessions = [];
    return parsed;
  } catch (error) {
    file.setName(DB_FILENAME + '_corrupted_' + Date.now());
    throw new Error('[ERR-DB-01] 데이터 파일이 손상되어 이름을 변경했습니다. 백업 파일을 확인하세요.');
  }
}

function saveData(data) {
  const files = DriveApp.searchFiles("title = '" + DB_FILENAME + "' and trashed = false");
  const content = JSON.stringify(data);
  if (files.hasNext()) files.next().setContent(content);
  else DriveApp.createFile(DB_FILENAME, content);
}

function findSession(db, sessionId, required) {
  const session = (db.sessions || []).find(item => item.id === sessionId);
  if (!session && required !== false) throw new Error('[ERR-SESSION-03] 연수 정보를 찾지 못했습니다.');
  return session;
}

function getSignatureSheet() {
  const files = DriveApp.searchFiles("title = '" + SIG_SHEET_FILENAME + "' and trashed = false");
  const spreadsheet = files.hasNext() ? SpreadsheetApp.open(files.next()) : SpreadsheetApp.create(SIG_SHEET_FILENAME);
  let sheet = spreadsheet.getSheetByName(SIG_SHEET_TAB);
  if (!sheet) { sheet = spreadsheet.insertSheet(SIG_SHEET_TAB); sheet.appendRow(SIG_HEADERS); }
  else {
    const currentHeaders = sheet.getRange(1, 1, 1, SIG_HEADERS.length).getValues()[0];
    if (currentHeaders.join('|') !== SIG_HEADERS.join('|')) sheet.getRange(1, 1, 1, SIG_HEADERS.length).setValues([SIG_HEADERS]);
  }
  return sheet;
}

function getSignaturesGroupedBySession() {
  const sheet = getSignatureSheet();
  const lastRow = sheet.getLastRow();
  const map = {};
  if (lastRow < 2) return map;
  sheet.getRange(2, 1, lastRow - 1, SIG_HEADERS.length).getValues().forEach(row => {
    const sessionId = row[0];
    if (!sessionId) return;
    if (!map[sessionId]) map[sessionId] = [];
    map[sessionId].push({ staffId: row[1], staffName: row[2], department: row[3], affiliation: row[4], grade: row[5], classNumber: row[6], childName: row[7], signatureData: row[8], timestamp: row[9] });
  });
  return map;
}

function upsertSignatureRowsUnlocked(sessionIds, signature) {
  removeSignatureRowsUnlocked(sessionIds, signature.staffId);
  const sheet = getSignatureSheet();
  const rows = sessionIds.map(sessionId => [sessionId, signature.staffId || '', signature.staffName || '', signature.department || '', signature.affiliation || '', signature.grade || '', signature.classNumber || '', signature.childName || '', signature.signatureData || '', signature.timestamp || Date.now()]);
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, SIG_HEADERS.length).setValues(rows);
}

function removeSignatureRowsUnlocked(sessionIds, staffId) {
  const sheet = getSignatureSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  let removed = 0;
  for (let index = data.length - 1; index >= 0; index--) {
    if (sessionIds.indexOf(data[index][0]) >= 0 && (staffId === null || String(data[index][1]) === String(staffId))) {
      sheet.deleteRow(index + 2);
      removed++;
    }
  }
  return removed;
}

function createSecureToken() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function normalizeError(error) { const message = error && error.message ? error.message : String(error); return message.indexOf('[ERR-') === 0 ? message : '[ERR-SCRIPT-01] ' + message; }
function responseJSON(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
