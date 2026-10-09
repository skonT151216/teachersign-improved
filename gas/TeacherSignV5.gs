// TeacherSign Google Apps Script server v5.0.0
// Paste this file into Apps Script, run setupTeacherSign once, then deploy as a web app.

const SERVER_VERSION = "5.0.0";
const DB_FILENAME = "TrainingApp_DB.json";
const SIG_SHEET_FILENAME = "TrainingApp_Signatures";
const SIG_SHEET_TAB = "signatures";
const ADMIN_KEY_PROPERTY = "TEACHERSIGN_ADMIN_KEY";
const SIG_HEADERS = [
  "sessionId",
  "staffId",
  "staffName",
  "department",
  "affiliation",
  "grade",
  "classNumber",
  "childName",
  "signatureData",
  "timestamp",
];

function setupTeacherSign() {
  const properties = PropertiesService.getScriptProperties();
  let adminKey = properties.getProperty(ADMIN_KEY_PROPERTY);
  if (!adminKey) {
    adminKey = createSecureToken();
    properties.setProperty(ADMIN_KEY_PROPERTY, adminKey);
  }
  initializeSchoolStorage();
  getStoredData();
  getSignatureSheet();
  console.log("관리자 연결키: " + adminKey);
  return "관리자 연결키: " + adminKey;
}

function resetTeacherSignAdminKey() {
  const adminKey = createSecureToken();
  PropertiesService.getScriptProperties().setProperty(
    ADMIN_KEY_PROPERTY,
    adminKey,
  );
  console.log("새 관리자 연결키: " + adminKey);
  return "새 관리자 연결키: " + adminKey;
}

function doGet(e) {
  return handleRequest(e, "GET");
}
function doPost(e) {
  return handleRequest(e, "POST");
}

function handleRequest(e, method) {
  try {
    let request = {};
    if (method === 'POST' && e.postData && e.postData.contents) {
      if (e.postData.contents.length > 2000000) throw new Error('[ERR-SIZE] 요청 크기를 초과했습니다.');
      request = JSON.parse(e.postData.contents);
    } else if (method === 'GET') request = e.parameter || {};
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('[ERR-JSON] 요청 형식을 확인하세요.');
    const action = request.action || 'healthCheck';
    if (action === 'schoolGateway') {
      if (method !== 'POST') throw new Error('[ERR-METHOD] POST 요청이 필요합니다.');
      return schoolGateway(request);
    }
    if (action === 'healthCheck') {
      const props = PropertiesService.getScriptProperties();
      return responseJSON({ status: 'success', data: { serverVersion: SERVER_VERSION, storageReady: Boolean(props.getProperty('TEACHERSIGN_DB_FILE_ID') && props.getProperty('TEACHERSIGN_AUTH_FILE_ID') && props.getProperty('TEACHERSIGN_SIGNATURE_FILE_ID')) } });
    }
    // v5 accepts school sessions only; the bootstrap key cannot bypass login via v4 routes.
    throw new Error('[ERR-ACTION] 학교별 v5 요청 경로를 사용하세요.');
  } catch (error) {
    return responseJSON({ status: 'error', message: normalizeError(error) });
  }
}

function requireAdmin(candidate) {
  const saved =
    PropertiesService.getScriptProperties().getProperty(ADMIN_KEY_PROPERTY);
  if (!saved)
    throw new Error(
      "[ERR-ADMIN-SETUP] Apps Script 편집기에서 setupTeacherSign 함수를 먼저 실행하세요.",
    );
  if (!candidate || String(candidate) !== saved)
    throw new Error("[ERR-ADMIN-KEY] 관리자 연결키가 일치하지 않습니다.");
}

function getAdminSessionsResponse() {
  const lock = teacherSignLock();
  lock.waitLock(20000);
  try {
    const db = getStoredData();
    if (ensureParticipantTokens(db)) saveData(db);
    return responseJSON({ status: "success", data: getMergedSessions(db) });
  } finally {
    lock.releaseLock();
  }
}

function getParticipantSessionResponse(request) {
  const db = getStoredData();
  const session = findSession(db, request.sessionId);
  validateParticipantToken(session, request.participantToken);
  const authRequired = Boolean(session.authCode);
  const authVerified =
    !authRequired ||
    String(request.authCode || "") === String(session.authCode);
  return responseJSON({
    status: "success",
    data: toParticipantSession(session, db, authRequired, authVerified),
  });
}

function addParticipantSignatureResponse(request) {
  const lock = teacherSignLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    const anchor = findSession(db, request.sessionId);
    validateParticipantToken(anchor, request.participantToken);
    if (
      anchor.authCode &&
      String(request.authCode || "") !== String(anchor.authCode)
    )
      throw new Error(
        "[ERR-PARTICIPANT-CODE] 참여 인증번호가 일치하지 않습니다.",
      );
    validateSignature(request.signature);
    const safeSignature = normalizeParticipantSignature(
      anchor,
      request.signature,
    );
    const targets = getRelatedSessions(db, anchor).filter((session) =>
      canParticipantSign(session, safeSignature),
    );
    if (!targets.length)
      throw new Error(
        "[ERR-PARTICIPANT-01] 서명 대상 명단에서 사용자를 찾지 못했습니다.",
      );

    const signatureMap = getSignaturesGroupedBySession();
    targets.forEach((session) => {
      const merged = mergeSignatures(
        session.signatures,
        signatureMap[session.id],
        session.staffList,
      );
      const alreadySigned = merged.some(
        (signature) =>
          String(signature.staffId) === String(safeSignature.staffId),
      );
      if (
        !alreadySigned &&
        uniqueSignatures(merged).length >= Number(session.maxParticipants || 0)
      )
        throw new Error(
          "[ERR-FULL-01] 참가 가능 인원을 초과한 연수가 포함되어 있습니다.",
        );
    });

    const targetIds = targets.map((session) => session.id);
    removeLegacySignatures(db, targetIds, safeSignature.staffId);
    saveData(db);
    upsertSignatureRowsUnlocked(targetIds, safeSignature);
    return responseJSON({
      status: "success",
      data: { updatedCount: targetIds.length },
    });
  } finally {
    lock.releaseLock();
  }
}

function createSessionResponse(incoming) {
  incoming = validateSchoolTraining(incoming);
  const lock = teacherSignLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    if (!db.sessions) db.sessions = [];
    const existing = findSession(db, incoming.id, false);
    const stored = Object.assign({}, incoming, {
      participantToken:
        existing && existing.participantToken
          ? existing.participantToken
          : createSecureToken(),
      signatures:
        existing && Array.isArray(existing.signatures)
          ? existing.signatures
          : [],
    });
    db.sessions = db.sessions.filter((session) => session.id !== stored.id);
    db.sessions.push(stored);
    saveData(db);
    return responseJSON({
      status: "success",
      data: { participantToken: stored.participantToken },
    });
  } finally {
    lock.releaseLock();
  }
}

function deleteSessionResponse(sessionId) {
  const lock = teacherSignLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    db.sessions = (db.sessions || []).filter(
      (session) => session.id !== sessionId,
    );
    saveData(db);
    removeSignatureRowsUnlocked([sessionId], null);
    return responseJSON({ status: "success" });
  } finally {
    lock.releaseLock();
  }
}

function addAdminSignatureBatchResponse(sessionIds, signature) {
  validateSignature(signature);
  const lock = teacherSignLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    const validIds = (db.sessions || []).map((session) => session.id);
    const targets = sessionIds.filter((id) => validIds.indexOf(id) >= 0);
    if (!targets.length)
      throw new Error("[ERR-SESSION-02] 서명할 연수를 찾지 못했습니다.");
    removeLegacySignatures(db, targets, signature.staffId);
    saveData(db);
    upsertSignatureRowsUnlocked(targets, signature);
    return responseJSON({
      status: "success",
      data: { updatedCount: targets.length },
    });
  } finally {
    lock.releaseLock();
  }
}

function removeSignatureResponse(sessionIds, staffId) {
  const lock = teacherSignLock();
  lock.waitLock(28000);
  try {
    const db = getStoredData();
    const legacyRemoved = removeLegacySignatures(db, sessionIds, staffId);
    if (legacyRemoved) saveData(db);
    const sheetRemoved = removeSignatureRowsUnlocked(sessionIds, staffId);
    return responseJSON({
      status: "success",
      data: { removedCount: legacyRemoved + sheetRemoved },
    });
  } finally {
    lock.releaseLock();
  }
}

function toParticipantSession(session, db, authRequired, authVerified) {
  const related = getRelatedSessions(db, session);
  const view = {
    id: session.id,
    type: session.type,
    title: session.title,
    date: session.date,
    time: session.time,
    schoolName: session.schoolName,
    maxParticipants: session.maxParticipants,
    createdAt: session.createdAt,
    parentGrades: session.parentGrades,
    parentClasses: session.parentClasses,
    relatedSessionTitles: related.map((item) => item.title),
    authRequired: authRequired,
    authVerified: authVerified,
    staffList: [],
    signatures: [],
  };
  if (!authVerified) return view;
  if (session.type === "school") {
    const signatureMap = getSignaturesGroupedBySession();
    const merged = mergeSignatures(
      session.signatures,
      signatureMap[session.id],
      session.staffList,
    );
    view.staffList = (session.staffList || []).map((staff) => ({
      id: staff.id,
      name: staff.name,
      department: staff.department,
    }));
    view.signatures = uniqueSignatures(merged).map((signature) => ({
      staffId: signature.staffId,
      staffName: signature.staffName,
      department: signature.department,
      signatureData: "",
      timestamp: signature.timestamp,
    }));
  }
  return view;
}

function getRelatedSessions(db, anchor) {
  return (db.sessions || []).filter(
    (session) => session.date === anchor.date && session.type === anchor.type,
  );
}
function canParticipantSign(session, signature) {
  return (
    session.type !== "school" ||
    (session.staffList || []).some(
      (staff) => String(staff.id) === String(signature.staffId),
    )
  );
}

function normalizeParticipantSignature(anchor, signature) {
  if (anchor.type !== "school") return signature;
  const staff = (anchor.staffList || []).find(
    (item) => String(item.id) === String(signature.staffId),
  );
  if (!staff)
    throw new Error(
      "[ERR-PARTICIPANT-01] 서명 대상 명단에서 사용자를 찾지 못했습니다.",
    );
  return Object.assign({}, signature, {
    staffName: staff.name,
    department: staff.department,
    affiliation: staff.affiliation || "",
  });
}

function validateParticipantToken(session, candidate) {
  if (
    !session.participantToken ||
    !candidate ||
    String(candidate) !== String(session.participantToken)
  )
    throw new Error(
      "[ERR-PARTICIPANT-LINK] 유효하지 않거나 이전 버전에서 만든 참여 링크입니다. 담당자에게 새 QR을 요청하세요.",
    );
}

function validateSignature(signature) {
  if (
    !signature ||
    !signature.staffId ||
    !signature.staffName ||
    !signature.signatureData
  )
    throw new Error("[ERR-SIGNATURE-01] 서명 정보가 올바르지 않습니다.");
  if (
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
      signature.signatureData || "",
    ) ||
    signature.signatureData.length > 1000000 ||
    !Number.isFinite(signature.timestamp) ||
    String(signature.staffId).length > 100 ||
    String(signature.staffName).length > 300
  )
    throw new Error("[ERR-SIGNATURE-02] 서명 이미지와 기록 형식을 확인하세요.");
}

function getMergedSessions(db) {
  const signatureMap = getSignaturesGroupedBySession();
  return (db.sessions || []).map((session) =>
    Object.assign({}, session, {
      signatures: mergeSignatures(
        session.signatures,
        signatureMap[session.id],
        session.staffList,
      ),
    }),
  );
}

function mergeSignatures(legacySignatures, sheetSignatures, staffList) {
  const legacy = legacySignatures || [];
  const fromSheet = uniqueSignatures(sheetSignatures || []);
  const sheetStaffIds = Object.create(null);
  fromSheet.forEach((signature) => {
    sheetStaffIds[signature.staffId] = true;
  });
  const merged = legacy
    .filter((signature) => !sheetStaffIds[signature.staffId])
    .concat(fromSheet);
  const staffById = Object.create(null);
  (staffList || []).forEach((staff) => {
    staffById[staff.id] = staff;
  });
  merged.forEach((signature) => {
    if (!signature.staffName && staffById[signature.staffId]) {
      signature.staffName = staffById[signature.staffId].name;
      signature.department = staffById[signature.staffId].department;
    }
  });
  return uniqueSignatures(merged);
}

function uniqueSignatures(signatures) {
  const latest = {};
  (signatures || []).forEach((signature) => {
    const key = String(signature.staffId || "");
    if (
      key &&
      (!latest[key] ||
        Number(signature.timestamp || 0) >= Number(latest[key].timestamp || 0))
    )
      latest[key] = signature;
  });
  return Object.keys(latest).map((key) => latest[key]);
}

function ensureParticipantTokens(db) {
  let changed = false;
  (db.sessions || []).forEach((session) => {
    if (!session.participantToken) {
      session.participantToken = createSecureToken();
      changed = true;
    }
  });
  return changed;
}

function removeLegacySignatures(db, sessionIds, staffId) {
  let removed = 0;
  (db.sessions || []).forEach((session) => {
    if (sessionIds.indexOf(session.id) < 0) return;
    const before = (session.signatures || []).length;
    session.signatures = (session.signatures || []).filter(
      (signature) => String(signature.staffId) !== String(staffId),
    );
    removed += before - session.signatures.length;
  });
  return removed;
}

function getStoredData() {
  const file = schoolFile("TEACHERSIGN_DB_FILE_ID");
  const content = file.getBlob().getDataAsString();
  if (!content || !content.trim()) return { sessions: [] };
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.sessions)) parsed.sessions = [];
    return parsed;
  } catch (error) {
    file.setName(DB_FILENAME + "_corrupted_" + Date.now());
    throw new Error(
      "[ERR-DB-01] 데이터 파일이 손상되어 이름을 변경했습니다. 백업 파일을 확인하세요.",
    );
  }
}

function saveData(data) {
  schoolFile("TEACHERSIGN_DB_FILE_ID").setContent(JSON.stringify(data));
}

function findSession(db, sessionId, required) {
  const session = (db.sessions || []).find((item) => item.id === sessionId);
  if (!session && required !== false)
    throw new Error("[ERR-SESSION-03] 연수 정보를 찾지 못했습니다.");
  return session;
}

function getSignatureSheet() {
  const spreadsheet = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty(
      "TEACHERSIGN_SIGNATURE_FILE_ID",
    ),
  );
  let sheet = spreadsheet.getSheetByName(SIG_SHEET_TAB);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SIG_SHEET_TAB);
    sheet.appendRow(SIG_HEADERS);
  } else {
    const currentHeaders = sheet
      .getRange(1, 1, 1, SIG_HEADERS.length)
      .getValues()[0];
    if (currentHeaders.join("|") !== SIG_HEADERS.join("|"))
      sheet.getRange(1, 1, 1, SIG_HEADERS.length).setValues([SIG_HEADERS]);
  }
  return sheet;
}

function getSignaturesGroupedBySession() {
  const sheet = getSignatureSheet();
  const lastRow = sheet.getLastRow();
  const map = Object.create(null);
  if (lastRow < 2) return map;
  sheet
    .getRange(2, 1, lastRow - 1, SIG_HEADERS.length)
    .getValues()
    .forEach((row) => {
      const sessionId = row[0];
      if (!sessionId) return;
      if (!map[sessionId]) map[sessionId] = [];
      map[sessionId].push({
        staffId: row[1],
        staffName: row[2],
        department: row[3],
        affiliation: row[4],
        grade: row[5],
        classNumber: row[6],
        childName: row[7],
        signatureData: row[8],
        timestamp: row[9],
      });
    });
  return map;
}

function upsertSignatureRowsUnlocked(sessionIds, signature) {
  removeSignatureRowsUnlocked(sessionIds, signature.staffId);
  const sheet = getSignatureSheet();
  const rows = sessionIds.map((sessionId) => [
    sessionId,
    signature.staffId || "",
    signature.staffName || "",
    signature.department || "",
    signature.affiliation || "",
    signature.grade || "",
    signature.classNumber || "",
    signature.childName || "",
    signature.signatureData || "",
    signature.timestamp || Date.now(),
  ]);
  if (rows.length)
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, SIG_HEADERS.length)
      .setValues(
        rows.map((row) =>
          row.map((value) =>
            typeof value === "string" && /^[=+\-@]/.test(value)
              ? "'" + value
              : value,
          ),
        ),
      );
}

function removeSignatureRowsUnlocked(sessionIds, staffId) {
  const sheet = getSignatureSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  let removed = 0;
  for (let index = data.length - 1; index >= 0; index--) {
    if (
      sessionIds.indexOf(data[index][0]) >= 0 &&
      (staffId === null || String(data[index][1]) === String(staffId))
    ) {
      sheet.deleteRow(index + 2);
      removed++;
    }
  }
  return removed;
}

function createSecureToken() {
  return (
    Utilities.getUuid().replace(/-/g, "") +
    Utilities.getUuid().replace(/-/g, "")
  );
}
function normalizeError(error) {
  const message = error && error.message ? error.message : String(error);
  return message.indexOf("[ERR-") === 0
    ? message
    : "[ERR-SCRIPT-01] 서버 처리에 실패했습니다. 설치 담당자가 실행 기록을 확인하세요.";
}
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// v5 school installation: persistent authentication lives in this script's Drive.
// New installations only. Existing v4 files are never searched or overwritten.
let schoolWriteLocked = false;
function teacherSignLock() {
  if (schoolWriteLocked)
    return { waitLock: function () {}, releaseLock: function () {} };
  return LockService.getScriptLock();
}
function initializeSchoolStorage() {
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    const props = PropertiesService.getScriptProperties();
    let folderId = props.getProperty("TEACHERSIGN_FOLDER_ID");
    if (!folderId) {
      folderId = DriveApp.createFolder(
        "TeacherSign_" + ScriptApp.getScriptId(),
      ).getId();
      props.setProperty("TEACHERSIGN_FOLDER_ID", folderId);
    }
    const folder = DriveApp.getFolderById(folderId);
    if (!props.getProperty("TEACHERSIGN_DB_FILE_ID"))
      props.setProperty(
        "TEACHERSIGN_DB_FILE_ID",
        folder
          .createFile(DB_FILENAME, JSON.stringify({ sessions: [] }))
          .getId(),
      );
    if (!props.getProperty("TEACHERSIGN_SIGNATURE_FILE_ID")) {
      const sheet = SpreadsheetApp.create(SIG_SHEET_FILENAME);
      DriveApp.getFileById(sheet.getId()).moveTo(folder);
      props.setProperty("TEACHERSIGN_SIGNATURE_FILE_ID", sheet.getId());
    }
    if (!props.getProperty("TEACHERSIGN_AUTH_FILE_ID"))
      props.setProperty(
        "TEACHERSIGN_AUTH_FILE_ID",
        folder
          .createFile(
            "TeacherSign_Auth.json",
            JSON.stringify({
              account: null,
              sessions: {},
              challenges: {},
              attempts: {},
              receipts: {},
            }),
          )
          .getId(),
      );
  } finally {
    lock.releaseLock();
  }
}
function schoolFile(property) {
  const id = PropertiesService.getScriptProperties().getProperty(property);
  if (!id)
    throw new Error(
      "[ERR-SCHOOL-SETUP] 새 시험용 GAS에서 setupTeacherSign을 먼저 실행하세요.",
    );
  return DriveApp.getFileById(id);
}
function readSchoolAuth() {
  const state = JSON.parse(
    schoolFile("TEACHERSIGN_AUTH_FILE_ID").getBlob().getDataAsString(),
  );
  const now = Date.now();
  Object.keys(state.sessions).forEach((key) => {
    const s = state.sessions[key];
    if (s.expiresAt <= now || s.lastSeenAt + 1800000 <= now)
      delete state.sessions[key];
  });
  ["challenges", "attempts", "receipts"].forEach((kind) =>
    Object.keys(state[kind]).forEach((key) => {
      if (state[kind][key].until <= now) delete state[kind][key];
    }),
  );
  return state;
}
function saveSchoolAuth(state) {
  schoolFile("TEACHERSIGN_AUTH_FILE_ID").setContent(JSON.stringify(state));
}
function schoolHex(bytes) {
  return bytes
    .map((b) => ("0" + ((b + 256) % 256).toString(16)).slice(-2))
    .join("");
}
function schoolBytes(hex) {
  return hex.match(/../g).map((pair) => {
    const n = parseInt(pair, 16);
    return n > 127 ? n - 256 : n;
  });
}
function schoolDigest(value) {
  return schoolHex(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(value),
      Utilities.Charset.UTF_8,
    ),
  );
}
function schoolEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function validVerifier(value) {
  return (
    typeof value === "string" &&
    /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(value)
  );
}
function accountView(account) {
  return {
    username: account.username,
    label: account.label,
    revision: account.revision,
    demo: false,
  };
}
function sessionView(session) {
  return {
    username: session.username,
    csrf: session.csrf,
    expiresAt: session.expiresAt,
  };
}
function requireSchoolSession(state, request, requireCsrf) {
  if (
    typeof request.sessionToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(request.sessionToken)
  )
    throw new Error("[ERR-AUTH] 학교 관리자 로그인이 필요합니다.");
  const session = state.sessions[schoolDigest(request.sessionToken)];
  if (!session || !state.account || session.revision !== state.account.revision)
    throw new Error("[ERR-AUTH] 학교 관리자 세션이 만료되었습니다.");
  if (requireCsrf && !schoolEqual(session.csrf, request.csrf))
    throw new Error("[ERR-CSRF] 로그인 상태를 확인하세요.");
  // Background session checks must not keep an idle administrator logged in.
  if (requireCsrf) session.lastSeenAt = Date.now();
  return session;
}
function schoolGateway(request) {
  const lock = LockService.getScriptLock();
  lock.waitLock(28000);
  try {
    schoolWriteLocked = true;
    const state = readSchoolAuth();
    const op = request.operation;
    const now = Date.now();
    let data;
    if (op === "info") {
      data = {
        serverVersion: SERVER_VERSION,
        accountConfigured: Boolean(state.account),
        label: state.account ? state.account.label : "",
        storageReady: true,
      };
    } else if (op === "bootstrap") {
      requireAdmin(request.setupKey);
      if (state.account)
        throw new Error(
          "[ERR-ACCOUNT-EXISTS] 이 학교에는 관리자 계정이 있습니다. 로그인하세요.",
        );
      if (
        !validVerifier(request.passwordHash) ||
        typeof request.username !== "string" ||
        !/^[A-Za-z0-9_.@-]{3,64}$/.test(request.username) ||
        typeof request.label !== "string" ||
        !request.label.trim() ||
        request.label.length > 80
      )
        throw new Error("[ERR-ACCOUNT] 계정 설정을 확인하세요.");
      state.account = {
        username: request.username,
        label: request.label.trim(),
        passwordHash: request.passwordHash,
        revision: 1,
      };
      data = accountView(state.account);
    } else if (op === "challenge") {
      if (!state.account)
        throw new Error(
          "[ERR-SCHOOL-SETUP] 학교 관리자 계정을 먼저 설정하세요.",
        );
      if (typeof request.username !== "string" || request.username.length > 64)
        throw new Error("[ERR-LOGIN] 아이디 또는 암호를 확인하세요.");
      const bucket = state.attempts.login || { count: 0, until: now + 900000 };
      if (bucket.count >= 5)
        throw new Error(
          "[ERR-LIMIT] 로그인 시도가 많습니다. 15분 후 다시 시도하세요.",
        );
      bucket.count++;
      state.attempts.login = bucket;
      const nonce = createSecureToken();
      state.challenges[nonce] = {
        username: request.username,
        revision: state.account.revision,
        until: now + 60000,
      };
      data = {
        nonce: nonce,
        salt: state.account.passwordHash.split("$")[4],
        revision: state.account.revision,
      };
    } else if (op === "login") {
      const challenge = state.challenges[request.nonce];
      delete state.challenges[request.nonce];
      // Consume even a failed proof; replay cannot issue another session.
      saveSchoolAuth(state);
      if (
        !challenge ||
        !state.account ||
        challenge.revision !== state.account.revision ||
        challenge.username !== request.username ||
        request.username !== state.account.username ||
        !/^[a-f0-9]{64}$/.test(request.tokenHash || "") ||
        !/^[A-Za-z0-9_-]{43}$/.test(request.csrf || "")
      )
        throw new Error("[ERR-LOGIN] 아이디 또는 암호가 일치하지 않습니다.");
      const message = JSON.stringify([
        request.nonce,
        request.username,
        challenge.revision,
        request.tokenHash,
        request.csrf,
      ]);
      const verifier = state.account.passwordHash.split("$")[5];
      const proof = schoolHex(
        Utilities.computeHmacSha256Signature(
          Utilities.newBlob(message).getBytes(),
          schoolBytes(verifier),
        ),
      );
      if (!schoolEqual(proof, request.proof))
        throw new Error("[ERR-LOGIN] 아이디 또는 암호가 일치하지 않습니다.");
      const keys = Object.keys(state.sessions);
      if (keys.length >= 100)
        delete state.sessions[
          keys.sort(
            (a, b) =>
              state.sessions[a].lastSeenAt - state.sessions[b].lastSeenAt,
          )[0]
        ];
      const session = {
        username: state.account.username,
        csrf: request.csrf,
        revision: state.account.revision,
        lastSeenAt: now,
        expiresAt: now + 28800000,
      };
      state.sessions[request.tokenHash] = session;
      // The persisted account-wide bucket also bounds successful repeated logins.
      data = sessionView(session);
    } else if (op === "participant") {
      if (!state.account)
        throw new Error(
          "[ERR-SCHOOL-SETUP] 학교 관리자 계정을 먼저 설정하세요.",
        );
      if (
        ["getParticipantSession", "addParticipantSignature"].indexOf(
          request.name,
        ) < 0
      )
        throw new Error("[ERR-ACTION] 참여자 작업을 확인하세요.");
      const bucket = state.attempts.participant || {
        count: 0,
        until: now + 60000,
      };
      if (++bucket.count > 300)
        throw new Error("[ERR-LIMIT] 잠시 후 다시 시도하세요.");
      state.attempts.participant = bucket;
      saveSchoolAuth(state);
      const payload = request.payload || {};
      const callback = () =>
        request.name === "getParticipantSession"
          ? getParticipantSessionResponse(payload)
          : addParticipantSignatureResponse(payload);
      return schoolActionReceipt(
        state,
        request,
        "participant:" +
          schoolDigest(
            JSON.stringify([
              payload.sessionId,
              payload.participantToken,
              payload.authCode || "",
            ]),
          ),
        callback,
      );
    } else {
      const session = requireSchoolSession(state, request, op !== "session");
      if (op === "session") data = sessionView(session);
      else if (op === "logout") {
        delete state.sessions[schoolDigest(request.sessionToken)];
        data = { loggedOut: true };
      } else if (op === "account") data = accountView(state.account);
      else if (op === "connection")
        data = {
          configured: true,
          provider: "gas",
          label: state.account.label,
          revision: state.account.revision,
          participantEndpoint: "/api/participant",
        };
      else if (op === "accountUpdate") {
        // Current-password proof obtained separately, bound to this session and revision.
        if (
          !validVerifier(request.passwordHash) ||
          !/^[A-Za-z0-9_.@-]{3,64}$/.test(request.username || "") ||
          request.revision !== state.account.revision
        )
          throw new Error("[ERR-CONFLICT] 계정 설정을 다시 확인하세요.");
        const message = JSON.stringify([
          "accountUpdate",
          schoolDigest(request.sessionToken),
          state.account.revision,
          request.username,
          request.passwordHash,
        ]);
        const expected = schoolHex(
          Utilities.computeHmacSha256Signature(
            Utilities.newBlob(message).getBytes(),
            schoolBytes(state.account.passwordHash.split("$")[5]),
          ),
        );
        if (!schoolEqual(expected, request.proof))
          throw new Error("[ERR-ACCOUNT] 현재 암호를 확인하세요.");
        state.account.username = request.username;
        state.account.passwordHash = request.passwordHash;
        state.account.revision++;
        state.sessions = {};
        state.challenges = {};
        state.attempts = {};
        data = Object.assign(accountView(state.account), {
          loginRequired: true,
        });
      } else if (op === "accountSalt")
        data = {
          salt: state.account.passwordHash.split("$")[4],
          revision: state.account.revision,
        };
      else if (op === "admin") {
        const callbacks = {
          getAdminSessions: () => getAdminSessionsResponse(),
          createSession: () => createSessionResponse(request.payload.session),
          deleteSession: () => deleteSessionResponse(request.payload.sessionId),
          addSignatureBatch: () =>
            addAdminSignatureBatchResponse(
              request.payload.sessionIds || [],
              request.payload.signature,
            ),
          removeSignatureBatch: () =>
            removeSignatureResponse(
              request.payload.sessionIds || [],
              request.payload.staffId,
            ),
        };
        if (!Object.prototype.hasOwnProperty.call(callbacks, request.name))
          throw new Error("[ERR-ACTION] 관리자 작업을 확인하세요.");
        saveSchoolAuth(state);
        return schoolActionReceipt(
          state,
          request,
          "admin:" + schoolDigest(request.sessionToken),
          callbacks[request.name],
        );
      } else throw new Error("[ERR-ACTION] 지원하지 않는 요청입니다.");
    }
    saveSchoolAuth(state);
    return responseJSON({ status: "success", data: data });
  } finally {
    schoolWriteLocked = false;
    lock.releaseLock();
  }
}
function schoolActionReceipt(state, request, scope, callback) {
  if (
    request.name === "getAdminSessions" ||
    request.name === "getParticipantSession"
  )
    return callback();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(request.requestId || ""))
    throw new Error("[ERR-RETRY] 요청 식별자가 필요합니다.");
  const key = schoolDigest(scope + ":" + request.requestId);
  const fingerprint = schoolDigest(
    JSON.stringify([request.name, request.payload]),
  );
  const saved = state.receipts[key];
  if (saved) {
    if (saved.fingerprint !== fingerprint)
      throw new Error("[ERR-RETRY] 같은 요청 식별자의 내용이 다릅니다.");
    return responseJSON(saved.result);
  }
  if (Object.keys(state.receipts).length >= 200)
    throw new Error("[ERR-LIMIT] 잠시 후 다시 시도하세요.");
  const output = callback();
  const result = JSON.parse(output.getContent());
  if (result.status === "success") {
    state.receipts[key] = {
      fingerprint: fingerprint,
      result: result,
      until: Date.now() + 300000,
    };
    saveSchoolAuth(state);
  }
  return output;
}

function validateSchoolTraining(input) {
  if (
    !input ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(input.id || "") ||
    ["school", "office", "parents"].indexOf(input.type) < 0 ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 300 ||
    typeof input.schoolName !== "string" ||
    !input.schoolName.trim() ||
    input.schoolName.length > 300 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ||
    !Number.isInteger(input.maxParticipants) ||
    input.maxParticipants < 1 ||
    input.maxParticipants > 2000 ||
    !Number.isFinite(input.createdAt) ||
    !Array.isArray(input.staffList) ||
    input.staffList.length > 2000 ||
    (input.authCode !== undefined &&
      (typeof input.authCode !== "string" || input.authCode.length > 64))
  )
    throw new Error("[ERR-SESSION-01] 연수 정보를 확인하세요.");
  const ids = {};
  const staffList = input.staffList.map((staff) => {
    if (
      !staff ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(staff.id || "") ||
      Object.prototype.hasOwnProperty.call(ids, staff.id) ||
      typeof staff.name !== "string" ||
      !staff.name ||
      staff.name.length > 300 ||
      typeof staff.department !== "string" ||
      staff.department.length > 300
    )
      throw new Error("[ERR-STAFF] 교직원 명단을 확인하세요.");
    Object.defineProperty(ids, staff.id, { value: true, enumerable: true });
    const saved = {};
    [
      "id",
      "name",
      "department",
      "affiliation",
      "grade",
      "classNumber",
      "childName",
    ].forEach((key) => {
      if (staff[key] !== undefined) {
        if (typeof staff[key] !== "string" || staff[key].length > 300)
          throw new Error("[ERR-STAFF] 교직원 정보를 확인하세요.");
        saved[key] = staff[key];
      }
    });
    return saved;
  });
  const result = {};
  [
    "id",
    "type",
    "title",
    "date",
    "time",
    "schoolName",
    "maxParticipants",
    "authCode",
    "createdAt",
    "parentGrades",
    "parentClasses",
  ].forEach((key) => {
    if (input[key] !== undefined) result[key] = input[key];
  });
  result.staffList = staffList;
  ["parentGrades", "parentClasses"].forEach((key) => {
    if (
      result[key] !== undefined &&
      (!Array.isArray(result[key]) ||
        result[key].length > 200 ||
        result[key].some(
          (value) => typeof value !== "string" || value.length > 100,
        ))
    )
      throw new Error("[ERR-SESSION-01] 학년·반 정보를 확인하세요.");
  });
  if (
    result.time !== undefined &&
    (typeof result.time !== "string" || result.time.length > 100)
  )
    throw new Error("[ERR-SESSION-01] 연수 시간을 확인하세요.");
  return result;
}
