export const SCHOOL_URL_KEY = 'teachersign_school_url_v5';
export function schoolEndpoint(value) {
  if (typeof value !== 'string') return '';
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,200}\/exec$/.test(value.trim()) ? value.trim() : '';
}
export function initialSchoolEndpoint(search, storage) {
  const params = new URLSearchParams(search);
  // Participant links must select their own school; never use a saved school.
  if (params.has('endpoint') || params.has('sessionId')) return schoolEndpoint(params.get('endpoint'));
  try {
    return schoolEndpoint(storage.getItem(SCHOOL_URL_KEY)) || schoolEndpoint(JSON.parse(storage.getItem('training_app_cloud_config') || '{}').scriptUrl);
  } catch { return ''; }
}
export function rememberSchoolEndpoint(storage, endpoint, detectedMajor) {
  const url = schoolEndpoint(endpoint);
  if (!url) throw new Error('학교 GAS 웹앱의 /exec 주소를 확인하세요.');
  storage.setItem(SCHOOL_URL_KEY, url);
  // Keep a v4 school's existing key until that same deployed server positively
  // reports v5. Selecting another school must not discard the old connection;
  // the v4 client reads a key only when its saved endpoint matches exactly.
  const raw = storage.getItem('training_app_cloud_config');
  if (!raw) return;
  let legacy;
  try { legacy = JSON.parse(raw); } catch { legacy = {}; }
  if (detectedMajor === 5 && schoolEndpoint(legacy?.scriptUrl) === url)
    storage.setItem('training_app_cloud_config', JSON.stringify({ enabled: true, scriptUrl: url }));
}
export function classifySchoolHealth(result) {
  if (result?.status !== 'success') {
    throw new Error(typeof result?.message === 'string' ? result.message : '[ERR-GAS] 학교 서버의 상태를 확인하지 못했습니다.');
  }
  const data = result.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.serverVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(data.serverVersion) || typeof data.storageReady !== 'boolean')
    throw new Error('[ERR-VERSION] 학교 서버 버전을 확인하지 못했습니다. 연결 주소와 배포 상태를 확인하세요.');
  const major = Number(data.serverVersion.split('.')[0]);
  if (major !== 4 && major !== 5)
    throw new Error('[ERR-VERSION] 이 사이트가 지원하지 않는 학교 서버 버전입니다. 연결 주소와 배포 상태를 확인하세요.');
  if (data.uiReady !== undefined && typeof data.uiReady !== 'boolean')
    throw new Error('[ERR-VERSION] 학교 화면 파일의 상태를 확인하지 못했습니다.');
  if (major === 5 && data.uiReady === false)
    throw new Error('[ERR-VERSION] 학교의 Code.gs와 Index.html 버전이 맞지 않습니다. 같은 업데이트 파일로 두 파일을 교체·저장하고 기존 웹앱을 새 버전으로 배포하세요.');
  if (!data.storageReady)
    throw new Error('[ERR-SCHOOL-SETUP] 학교 저장소가 아직 준비되지 않았습니다. 학교 담당자가 설치와 권한 승인을 확인하세요.');
  return { major, serverVersion: data.serverVersion };
}
export function assertCompatibleGas(info) {
  if (info?.uiReady === false)
    throw new Error('[ERR-VERSION] 학교의 Code.gs와 Index.html 버전이 맞지 않습니다. 같은 업데이트 파일로 두 파일을 교체·저장하고 기존 웹앱을 새 버전으로 배포하세요.');
  if (!info || typeof info.accountConfigured !== 'boolean' || !/^\d+\.\d+\.\d+$/.test(info.serverVersion) || (info.apiVersion === undefined ? !/^5\./.test(info.serverVersion) : info.apiVersion !== 1)) {
    throw new Error('[ERR-VERSION] 사이트와 학교 GAS의 연결 버전이 맞지 않습니다. GitHub 설치 안내에서 호환 버전을 확인하고 학교 GAS를 업데이트하세요.');
  }
}
export function validParticipantEndpoint(value, runtime) {
  if (runtime?.transport === 'http') return Boolean(schoolEndpoint(value) && value === runtime.webAppUrl);
  return value === '/api/participant' || Boolean(runtime && value === runtime.webAppUrl);
}

// Initial public discovery never needs an administrator key in protocol v5.
// Only this operation can translate an old-server key rejection to update help.
export function schoolInfoCompatibilityError(operation, result) {
  if (operation !== 'info' || result?.status !== 'error' || typeof result.message !== 'string') return '';
  if (!/^\[(?:ERR-ACTION(?:-\d+)?|ERR-ADMIN-KEY|ERR-ADMIN-SETUP)\]/.test(result.message)) return '';
  return '[ERR-VERSION] 학교 GAS가 현재 사이트의 설치 상태 확인 요청을 지원하지 않습니다. 기존 v4 코드 또는 이전 배포가 연결되어 있을 수 있습니다. Code.gs와 Index.html을 최신 파일로 교체·저장하고, 배포 관리에서 기존 웹앱을 새 버전으로 갱신하세요. setupTeacherSign만 다시 실행하거나 관리자키만 변경해도 해결되지 않습니다. 다른 프로젝트 주소인지도 확인하세요.';
}
