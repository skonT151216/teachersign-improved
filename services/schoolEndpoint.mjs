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
export function rememberSchoolEndpoint(storage, endpoint) {
  const url = schoolEndpoint(endpoint);
  if (!url) throw new Error('학교 GAS 웹앱의 /exec 주소를 확인하세요.');
  storage.setItem(SCHOOL_URL_KEY, url);
  // Retain the public v4 connection while removing its obsolete stored key.
  if (storage.getItem('training_app_cloud_config')) storage.setItem('training_app_cloud_config', JSON.stringify({ enabled: true, scriptUrl: url }));
}
export function assertCompatibleGas(info) {
  if (!info || typeof info.accountConfigured !== 'boolean' || !/^\d+\.\d+\.\d+$/.test(info.serverVersion) || (info.apiVersion === undefined ? !/^5\./.test(info.serverVersion) : info.apiVersion !== 1)) {
    throw new Error('[ERR-VERSION] 사이트와 학교 GAS의 연결 버전이 맞지 않습니다. GitHub 설치 안내에서 호환 버전을 확인하고 학교 GAS를 업데이트하세요.');
  }
}
export function validParticipantEndpoint(value, runtime) {
  if (runtime?.transport === 'http') return Boolean(schoolEndpoint(value) && value === runtime.webAppUrl);
  return value === '/api/participant' || Boolean(runtime && value === runtime.webAppUrl);
}
