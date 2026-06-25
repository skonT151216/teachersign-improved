
import React, { useState } from 'react';
import * as CloudService from '../services/cloudService';

interface CloudSetupProps {
  currentUrl: string;
  onSave: (url: string) => void;
  onCancel: () => void;
}

const CloudSetup: React.FC<CloudSetupProps> = ({ currentUrl, onSave, onCancel }) => {
  const [url, setUrl] = useState(currentUrl);
  const [copyStatus, setCopyStatus] = useState('');
  const [clientIdSaved, setClientIdSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const scriptCode = `
// ---------------------------------------------------------
// Google Apps Script Code for Digital Training Register
// Version: 3.1 (Signatures moved to a Sheet via appendRow -> much shorter lock time,
//              big improvement to concurrent-signing throughput.
//              3.1: fixed staffName/department field mapping bug from 3.0)
// Copy and paste this into Extensions > Apps Script
// ---------------------------------------------------------

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  try {
    let action, request;

    if (method === 'GET') {
      action = e.parameter.action;
      if (!action) action = 'getSessions';
    } else {
      if (e.postData && e.postData.contents) {
        request = JSON.parse(e.postData.contents);
        action = request.action;
      }
    }

    // 서명 추가/삭제는 시트(appendRow)로 처리하므로 전체 DB 락이 필요 없습니다.
    if (request && action === 'addSignature') {
      const session = findSessionMeta(request.sessionId);
      if (!session) return responseJSON({ status: 'error', message: 'Session not found' });
      appendSignatureRow(request.sessionId, request.signature);
      return responseJSON({ status: 'success' });
    }

    if (request && action === 'addSignatureBatch') {
      const sessionIds = request.sessionIds || [];
      const signature = request.signature;
      const validIds = getAllSessionIds();
      let updatedCount = 0;
      sessionIds.forEach((sid) => {
        if (validIds.indexOf(sid) >= 0) {
          appendSignatureRow(sid, signature);
          updatedCount++;
        }
      });
      return responseJSON({ status: 'success', updatedCount: updatedCount });
    }

    if (request && action === 'removeSignatureBatch') {
      const sessionIds = request.sessionIds || [];
      const staffId = request.staffId;
      const updatedCount = removeSignatureRows(sessionIds, staffId);
      return responseJSON({ status: 'success', updatedCount: updatedCount });
    }

    if (request && action === 'removeSignature') {
      removeSignatureRows([request.sessionId], request.staffId);
      return responseJSON({ status: 'success' });
    }

    // 그 외(createSession/deleteSession/getSessions)는 세션 메타데이터 JSON 파일을 다룹니다.
    const lock = LockService.getScriptLock();
    let lockAcquired = false;
    try {
      if (method === 'POST') {
        try {
          lock.waitLock(28000);
          lockAcquired = true;
        } catch (err) {
          return responseJSON({ status: 'error', message: '[동시접속 제한] 서버가 혼잡합니다. 약 30초 후 다시 시도해주세요.' });
        }
      }

      const db = getStoredData();

      if (action === 'getSessions') {
        const sigMap = getSignaturesGroupedBySession();
        const sessions = (db.sessions || []).map((s) => ({
          ...s,
          signatures: mergeSignatures(s.signatures, sigMap[s.id], s.staffList),
        }));
        return responseJSON({ status: 'success', data: sessions });
      }

      if (request) {
        if (action === 'createSession') {
          const newSession = request.session;
          if (!db.sessions) db.sessions = [];
          db.sessions = db.sessions.filter(s => s.id !== newSession.id);
          db.sessions.push(newSession);
          saveData(db);
          return responseJSON({ status: 'success' });
        }

        if (action === 'deleteSession') {
          const sessionId = request.sessionId;
          if (db.sessions) {
            db.sessions = db.sessions.filter(s => s.id !== sessionId);
            saveData(db);
          }
          removeSignatureRows([sessionId], null); // 세션 삭제 시 해당 세션의 서명 행도 함께 정리
          return responseJSON({ status: 'success' });
        }
      }

      return responseJSON({ status: 'error', message: 'Unknown action: ' + action });
    } finally {
      if (lockAcquired) lock.releaseLock();
    }
  } catch (err) {
    return responseJSON({ status: 'error', message: err.toString() });
  }
}

// 과거 버전에서 JSON 파일 안에 직접 저장된 서명과, 새로 시트에 쌓인 서명을 합쳐서 반환 (마이그레이션 없이 호환)
// staffList로 이름/소속을 보강(backfill)해서, 예전에 잘못 저장되어 이름이 빈 값인 행도 화면에는 정상 표시되게 합니다.
function mergeSignatures(legacySignatures, sheetSignatures, staffList) {
  const legacy = legacySignatures || [];
  const fromSheet = sheetSignatures || [];
  const sheetStaffIds = {};
  fromSheet.forEach(s => { sheetStaffIds[s.staffId] = true; });
  const legacyOnly = legacy.filter(s => !sheetStaffIds[s.staffId]);
  const merged = legacyOnly.concat(fromSheet);

  const staffById = {};
  (staffList || []).forEach(st => { staffById[st.id] = st; });
  merged.forEach((sig) => {
    if (!sig.staffName) {
      const st = staffById[sig.staffId];
      if (st) {
        sig.staffName = st.name;
        sig.department = st.department;
      }
    }
  });
  return merged;
}

const DB_FILENAME = "TrainingApp_DB.json";

function getStoredData() {
  const files = DriveApp.searchFiles("title = '" + DB_FILENAME + "' and trashed = false");
  if (files.hasNext()) {
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    if (!content || content.trim() === '') return { sessions: [] };
    try {
      return JSON.parse(content);
    } catch (e) {
      // 파일이 손상된 경우 백업 처리 후 빈 데이터 반환
      file.setName(DB_FILENAME + "_corrupted_" + Date.now());
      return { sessions: [] };
    }
  }
  return { sessions: [] };
}

function saveData(data) {
  // Lock 처리는 이미 상위(handleRequest)에서 획득했으므로 여기서는 순수하게 저장만 수행합니다.
  const files = DriveApp.searchFiles("title = '" + DB_FILENAME + "' and trashed = false");
  const contentStr = JSON.stringify(data);
  if (files.hasNext()) {
    files.next().setContent(contentStr);
  } else {
    DriveApp.createFile(DB_FILENAME, contentStr);
  }
}

function findSessionMeta(sessionId) {
  const db = getStoredData();
  return (db.sessions || []).find(s => s.id === sessionId);
}

function getAllSessionIds() {
  const db = getStoredData();
  return (db.sessions || []).map(s => s.id);
}

// --- 서명 전용 시트: appendRow는 전체 파일을 다시 쓰지 않아 락 점유 시간이 훨씬 짧습니다 ---

const SIG_SHEET_FILENAME = "TrainingApp_Signatures";
const SIG_SHEET_TAB = "signatures";
// 프론트의 Signature 타입(types.ts)과 동일한 필드 이름/순서로 저장해야 합니다.
const SIG_HEADERS = ['sessionId', 'staffId', 'staffName', 'department', 'affiliation', 'grade', 'classNumber', 'childName', 'signatureData', 'timestamp'];

function getSignatureSheet() {
  const files = DriveApp.searchFiles("title = '" + SIG_SHEET_FILENAME + "' and trashed = false");
  let ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SIG_SHEET_FILENAME);
  }
  let sheet = ss.getSheetByName(SIG_SHEET_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(SIG_SHEET_TAB);
    sheet.appendRow(SIG_HEADERS);
  } else if (sheet.getRange(1, 1, 1, SIG_HEADERS.length).getValues()[0].join('|') !== SIG_HEADERS.join('|')) {
    // 이전 버전의 시트(컬럼명/개수가 다름)를 새 헤더로 맞춰줍니다. 기존 데이터 행은 그대로 둡니다.
    sheet.getRange(1, 1, 1, SIG_HEADERS.length).setValues([SIG_HEADERS]);
  }
  return sheet;
}

function appendSignatureRow(sessionId, signature) {
  // appendRow 자체도 동시 호출 시 같은 줄에 쓰는 경우가 드물게 있을 수 있어 짧게만 락을 잡습니다.
  // (전체 JSON을 읽고 쓰는 것보다 훨씬 짧게 끝나서 대기열이 거의 생기지 않습니다.)
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lock.waitLock(15000);
    lockAcquired = true;
    const sheet = getSignatureSheet();
    sheet.appendRow([
      sessionId,
      signature.staffId || '',
      signature.staffName || '',
      signature.department || '',
      signature.affiliation || '',
      signature.grade || '',
      signature.classNumber || '',
      signature.childName || '',
      signature.signatureData || '',
      signature.timestamp || Date.now(),
    ]);
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

function getSignaturesGroupedBySession() {
  const sheet = getSignatureSheet();
  const lastRow = sheet.getLastRow();
  const map = {};
  if (lastRow < 2) return map;
  const data = sheet.getRange(2, 1, lastRow - 1, SIG_HEADERS.length).getValues();
  data.forEach((row) => {
    const [sessionId, staffId, staffName, department, affiliation, grade, classNumber, childName, signatureData, timestamp] = row;
    if (!sessionId) return;
    if (!map[sessionId]) map[sessionId] = [];
    map[sessionId].push({ staffId, staffName, department, affiliation, grade, classNumber, childName, signatureData, timestamp });
  });
  return map;
}

function removeSignatureRows(sessionIds, staffId) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lock.waitLock(20000);
    lockAcquired = true;
    const sheet = getSignatureSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 0;
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // sessionId, staffId
    let removed = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      const matchSession = sessionIds.indexOf(data[i][0]) >= 0;
      const matchStaff = staffId === null || data[i][1] === staffId;
      if (matchSession && matchStaff) {
        sheet.deleteRow(i + 2);
        removed++;
      }
    }
    return removed;
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopyStatus('코드가 복사되었습니다! 구글 스크립트에 붙여넣고 [새 배포] 하세요.');
    setTimeout(() => setCopyStatus(''), 5000);
  };

  const handleTestConnection = async () => {
    const cleanUrl = url.trim();
    if (!isUrlValid(cleanUrl)) {
      setTestStatus('error');
      setTestMessage('올바른 URL 형식이 아닙니다.');
      return;
    }

    setTestStatus('loading');
    setTestMessage('서버에 연결 중...');

    try {
      const sessions = await CloudService.fetchCloudSessions(cleanUrl);
      setTestStatus('success');
      setTestMessage(`연결 성공! ${sessions.length}개의 연수 데이터를 찾았습니다.`);
    } catch (e: any) {
      setTestStatus('error');
      let msg = e.message || '알 수 없는 오류';

      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = '네트워크 차단됨: 학교/기관 계정 문제이거나 보안 네트워크 문제입니다.';
      } else if (msg.includes('권한')) {
        msg = '권한 오류: 학교 계정에서는 "모든 사용자" 설정이 차단되었을 수 있습니다.';
      }
      setTestMessage(msg);
    }
  };

  const isUrlValid = (input: string) => {
    return input.includes('script.google.com') && input.trim().endsWith('/exec');
  };

  const getUrlError = (input: string) => {
    if (!input) return null;
    if (!input.includes('script.google.com')) return "구글 스크립트 주소가 아닙니다.";
    if (input.includes('/edit')) return "⚠️ '/edit' 주소는 사용할 수 없습니다. [배포] URL(/exec)을 입력하세요.";
    if (!input.endsWith('/exec')) return "⚠️ 주소 끝이 '/exec'로 끝나야 합니다.";
    return null;
  };

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">구글 드라이브 연동 설정</h1>

        {/* Workspace Warning Banner */}
        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-6">
          <h3 className="font-bold text-orange-900 flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            학교/기관 계정(Workspace) 사용 시 주의사항
          </h3>
          <div className="mt-2 text-sm text-orange-800 space-y-2">
            <p>
              학교나 교육청 계정으로 로그인한 경우, 보안 정책 때문에 <strong>'모든 사용자(Anyone)'</strong> 공개 설정이 불가능하거나, 설정하더라도 외부 접속이 차단될 수 있습니다.
            </p>
            <p className="font-bold bg-white p-2 rounded border border-orange-200 inline-block">
              💡 해결 방법: 테스트 실패 시, 개인 구글 계정(Gmail)으로 로그인하여 스크립트를 생성하세요.
            </p>
          </div>
        </div>

        {/* Google Client ID Setup Section */}
        <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-6">
          <h3 className="font-bold text-indigo-900 flex items-center gap-2">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032 s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2 C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" /></svg>
            계정 동기화 설정 (선택 사항)
          </h3>
          <div className="mt-2 text-sm text-indigo-800 space-y-2">
            <p>
              다른 컴퓨터에서도 구글 스크립트 주소를 자동으로 불러오려면 **Google Client ID**가 필요합니다.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                defaultValue={localStorage.getItem('training_app_google_client_id') || ''}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val) {
                    localStorage.setItem('training_app_google_client_id', val);
                    setClientIdSaved(true);
                    setTimeout(() => setClientIdSaved(false), 3000);
                  }
                }}
                placeholder="123456789-abc.apps.googleusercontent.com"
                className="flex-1 p-2 border rounded text-xs outline-none focus:ring-2 focus:ring-indigo-300 bg-white text-gray-900"
              />
            </div>
            {clientIdSaved && (
              <p className="text-green-700 text-xs font-bold animate-fade-in">
                ✓ Client ID가 저장되었습니다. 이제 메인 화면에서 동기화를 사용할 수 있습니다.
              </p>
            )}
            <p className="text-[10px] text-indigo-600">
              ※ 구글 클라우드 콘솔 → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID (웹 애플리케이션)에서 발급 가능합니다.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <section className="bg-blue-50 p-6 rounded-lg border border-blue-100">
            <h3 className="font-bold text-lg mb-2 text-blue-800">1단계: 구글 Apps Script 코드 업데이트</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>사용 중인 <a href="https://script.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 underline">구글 Apps Script 프로젝트</a>를 엽니다.</li>
              <li>기존 코드를 모두 지우고, 아래의 <strong>Version 3.1</strong> 코드를 복사해서 붙여넣으세요.</li>
            </ol>
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 mt-2">
              ⚠️ 3.0부터는 서명을 별도의 구글 시트(스프레드시트)에 저장합니다. 저장/배포 시 "이 앱이 내 구글시트에 액세스하도록 허용"하는 권한 동의 창이 새로 뜰 수 있으니, 본인 계정으로 허용해주세요.
            </p>

            <div className="relative mt-4">
              <pre className="bg-gray-800 text-gray-100 p-4 rounded text-xs overflow-x-auto h-64 font-mono">
                {scriptCode}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-white text-gray-800 px-3 py-1 rounded text-xs font-bold hover:bg-gray-200"
              >
                코드 복사
              </button>
            </div>
            {copyStatus && <p className="text-green-600 text-sm mt-2 font-bold animate-pulse">{copyStatus}</p>}
          </section>

          <section className="bg-blue-50 p-6 rounded-lg border border-blue-100">
            <h3 className="font-bold text-lg mb-2 text-blue-800">2단계: 배포 설정 (가장 중요!)</h3>
            <div className="text-sm text-gray-700 space-y-3 mb-2">
              <p><strong>[배포] &gt; [새 배포]</strong> 클릭 후 아래 설정을 확인하세요.</p>
              <div className="bg-white p-4 border rounded text-sm space-y-2 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="font-bold w-36 text-gray-500">설명</span>
                  <span>v2.1</span>
                </div>
                <div className="flex items-center gap-2 text-indigo-700 font-bold bg-indigo-50 p-1 rounded">
                  <span className="font-bold w-36">다음 사용자로 실행</span>
                  <span>나 (Me)</span>
                </div>
                <div className="flex items-center gap-2 text-red-600 font-bold bg-red-50 p-1 rounded border border-red-100">
                  <span className="font-bold w-36">액세스 권한</span>
                  <div className="flex flex-col">
                    <span>모든 사용자 (Anyone)</span>
                    <span className="text-[10px] font-normal text-gray-500">
                      ※ 'Google 계정이 있는 모든 사용자' 또는 '학교 내 사용자'로 설정하면 작동하지 않습니다!
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                ※ 만약 '모든 사용자' 옵션이 없다면, 학교 관리자가 차단한 것입니다. 개인 Gmail을 사용하세요.
              </p>
            </div>
          </section>

          <section className="bg-white p-6 rounded-lg border-2 border-indigo-500 shadow-lg">
            <h3 className="font-bold text-lg mb-4 text-indigo-800">3단계: URL 입력 및 테스트</h3>
            <div className="space-y-4">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setTestStatus('idle');
                  setTestMessage('');
                }}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full p-3 border rounded focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm bg-white text-gray-900 placeholder-gray-400"
              />
              {getUrlError(url) && (
                <p className="text-red-500 text-xs font-bold animate-pulse">{getUrlError(url)}</p>
              )}

              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={!isUrlValid(url) || testStatus === 'loading'}
                    className={`px-4 py-2 rounded-lg font-bold text-sm ${!isUrlValid(url) ? 'bg-gray-200 text-gray-500' : 'bg-green-600 text-white hover:bg-green-700'}`}
                  >
                    {testStatus === 'loading' ? '접속 중...' : '🔌 연동 테스트 실행'}
                  </button>
                </div>

                {testStatus === 'success' && (
                  <div className="text-green-600 font-bold text-sm flex items-center animate-fade-in p-2 bg-green-50 rounded">
                    <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {testMessage}
                  </div>
                )}
                {testStatus === 'error' && (
                  <div className="flex-1 bg-red-50 p-3 rounded border border-red-200">
                    <div className="text-red-700 font-bold text-sm flex items-center mb-1">
                      <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      테스트 실패: {testMessage}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      학교 계정 문제일 가능성이 높습니다. 일단 저장을 원하시면 아래 주황색 버튼을 누르세요.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <button
              onClick={onCancel}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              취소
            </button>

            <div className="flex gap-3">
              {/* Force Save Button */}
              {testStatus === 'error' && (
                <button
                  onClick={() => onSave(url.trim())}
                  className="px-4 py-3 bg-orange-100 text-orange-700 border border-orange-300 rounded-lg font-bold hover:bg-orange-200 flex items-center gap-2"
                >
                  <span>⚠️ 테스트 건너뛰고 강제 저장</span>
                </button>
              )}

              <button
                onClick={() => onSave(url.trim())}
                disabled={testStatus !== 'success'}
                className={`px-6 py-3 text-white rounded-lg font-bold shadow ${testStatus !== 'success' ? 'bg-gray-300 cursor-not-allowed hidden' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                저장 및 완료
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudSetup;
