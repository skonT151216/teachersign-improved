import { classifySchoolHealth, schoolEndpoint } from './schoolEndpoint.mjs';

export interface SchoolVersion {
  major: 4 | 5;
  serverVersion: string;
}

// This request contains no administrator key, password, session or participant
// token. Do not retry it automatically: old v4 health handlers may initialize
// their signature sheet. A deliberate retry is available in the UI.
export async function discoverSchoolVersion(endpoint: string, signal: AbortSignal): Promise<SchoolVersion> {
  const url = schoolEndpoint(endpoint);
  if (!url) throw new Error('[ERR-SCHOOL-URL] 학교 GAS 웹앱의 /exec 주소를 확인하세요.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) throw new DOMException('요청을 취소했습니다.', 'AbortError');
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 35000);
  let result: unknown;
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'healthCheck' }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      signal: controller.signal,
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error('[ERR-GAS-NETWORK] 학교 서버 응답을 확인하지 못했습니다. 웹앱 주소와 공개 설정을 확인하세요.');
    try { result = await response.json(); }
    catch { throw new Error('[ERR-GAS-JSON] 학교 서버가 프로그램 응답을 보내지 않았습니다. 웹앱 주소와 로그인 없는 공개 배포를 확인하세요.'); }
  } catch (error) {
    if (signal.aborted) throw new DOMException('요청을 취소했습니다.', 'AbortError');
    if (controller.signal.aborted) throw new Error('[ERR-GAS-TIMEOUT] 학교 서버 확인에 시간이 걸리고 있습니다. 잠시 후 다시 확인하세요.');
    if (error instanceof TypeError) throw new Error('[ERR-GAS-NETWORK] 학교 서버에 연결하지 못했습니다. 웹앱 주소와 네트워크를 확인하세요.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
  return classifySchoolHealth(result) as SchoolVersion;
}
