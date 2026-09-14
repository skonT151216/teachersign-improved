import { TrainingSession, Signature } from '../types';

export interface ConnectionCheck {
  id: 'server' | 'version' | 'storage' | 'admin';
  label: string;
  ok: boolean;
  message: string;
}

export interface ConnectionTestResult {
  checks: ConnectionCheck[];
  sessionCount: number;
  serverVersion: string;
}

const REQUEST_TIMEOUT_MS = 35000;

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, baseDelay = 1200): Promise<T> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const message = error?.message || '';
      const retryable = message.includes('[ERR-NET') || message.includes('[ERR-TIMEOUT') || message.includes('[ERR-HTTP-5');
      if (!retryable || attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, baseDelay * attempt + Math.random() * 500));
    }
  }
  throw new Error('[ERR-NET-00] 요청을 완료하지 못했습니다.');
};

const postToGAS = async (url: string, action: string, payload: Record<string, unknown> = {}) => {
  const cleanUrl = url.trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(cleanUrl)) {
    throw new Error('[ERR-URL-01] 배포된 Google Apps Script 웹앱 주소(/exec)가 아닙니다.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(cleanUrl, {
      method: 'POST',
      redirect: 'follow',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`[ERR-HTTP-${response.status}] Google 서버가 HTTP ${response.status} 상태를 반환했습니다.`);

    const responseText = await response.text();
    if (!responseText.trim()) throw new Error('[ERR-EMPTY-01] 서버가 빈 응답을 반환했습니다.');
    if (responseText.trim().startsWith('<')) {
      throw new Error('[ERR-DEPLOY-01] JSON 대신 Google 로그인 또는 오류 페이지가 반환되었습니다. 웹앱 배포 권한과 /exec 주소를 확인하세요.');
    }

    let json: any;
    try {
      json = JSON.parse(responseText);
    } catch {
      throw new Error(`[ERR-JSON-01] 앱 전용 응답을 해석하지 못했습니다. 최신 Apps Script 코드를 다시 배포하세요. (${responseText.substring(0, 40)})`);
    }
    if (json.status !== 'success') throw new Error(json.message || '[ERR-SCRIPT-01] Apps Script 처리 중 오류가 발생했습니다.');
    return json;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('[ERR-TIMEOUT-01] 35초 안에 응답이 오지 않았습니다. Apps Script 실행 기록을 확인한 뒤 다시 시도하세요.');
    }
    if (error instanceof TypeError || error?.message === 'Failed to fetch') {
      throw new Error('[ERR-NET-01] 웹앱 주소에 연결하지 못했습니다. 다른 네트워크에서도 같은지 확인하세요.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const testCloudConnection = async (url: string, adminKey: string): Promise<ConnectionTestResult> => {
  const checks: ConnectionCheck[] = [];
  let serverVersion = '';
  try {
    const health = await postToGAS(url, 'healthCheck');
    serverVersion = health.data?.serverVersion || '';
    checks.push({ id: 'server', label: '웹앱 응답', ok: true, message: '배포 주소가 정상적으로 응답합니다.' });
    const compatible = /^4\./.test(serverVersion);
    checks.push({ id: 'version', label: '서버 코드', ok: compatible, message: compatible ? `호환 버전 ${serverVersion}` : `서버 버전 ${serverVersion || '확인 불가'} — 최신 코드를 새 버전으로 배포하세요.` });
    checks.push({ id: 'storage', label: 'Drive·Sheets', ok: Boolean(health.data?.storageReady), message: health.data?.storageReady ? '저장소 읽기·생성이 가능합니다.' : '저장소 권한 승인이 필요합니다.' });
    if (!compatible || !health.data?.storageReady) throw new Error('[ERR-TEST-01] 서버 코드 또는 저장소 검사를 통과하지 못했습니다.');
  } catch (error: any) {
    if (!checks.some(check => check.id === 'server')) checks.push({ id: 'server', label: '웹앱 응답', ok: false, message: error.message });
    error.checks = checks;
    throw error;
  }

  try {
    const admin = await postToGAS(url, 'verifyAdmin', { adminKey: adminKey.trim() });
    checks.push({ id: 'admin', label: '관리자 연결키', ok: true, message: '관리자 권한이 확인되었습니다.' });
    return { checks, sessionCount: admin.data?.sessionCount || 0, serverVersion };
  } catch (error: any) {
    checks.push({ id: 'admin', label: '관리자 연결키', ok: false, message: error.message });
    error.checks = checks;
    throw error;
  }
};

export const fetchAdminSessions = async (url: string, adminKey: string): Promise<TrainingSession[]> => {
  const response = await withRetry(() => postToGAS(url, 'getAdminSessions', { adminKey }), 3);
  return response.data || [];
};

export const fetchParticipantSession = async (url: string, sessionId: string, participantToken: string, authCode = ''): Promise<TrainingSession> => {
  const response = await withRetry(() => postToGAS(url, 'getParticipantSession', { sessionId, participantToken, authCode }), 3);
  return response.data;
};

export const createCloudSession = async (url: string, adminKey: string, session: TrainingSession): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'createSession', { adminKey, session }), 3);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const deleteCloudSession = async (url: string, adminKey: string, sessionId: string): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'deleteSession', { adminKey, sessionId }), 3);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const addSignatureBatch = async (url: string, adminKey: string, sessionIds: string[], signature: Signature): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'addSignatureBatch', { adminKey, sessionIds, signature }), 4, 1800);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const sendParticipantSignature = async (url: string, sessionId: string, participantToken: string, authCode: string, signature: Signature): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'addParticipantSignature', { sessionId, participantToken, authCode, signature }), 4, 1800);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

export const removeSignatureBatch = async (url: string, adminKey: string, sessionIds: string[], staffId: string): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'removeSignatureBatch', { adminKey, sessionIds, staffId }), 3);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};
