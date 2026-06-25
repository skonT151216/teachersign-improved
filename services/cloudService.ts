
import { TrainingSession, Signature } from '../types';

// Helper: Retry wrapper for Google Apps Script concurrent execution limits
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, baseDelay = 1500): Promise<T> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = e.message || '';
      // 빠른 실패 조건: URL 형식 오류 등 명백히 재시도 불필요한 경우
      if (msg.includes('[ERR-URL-01]')) throw e;

      if (attempt === retries) throw e;

      const delay = baseDelay * attempt + Math.random() * 1000;
      console.warn(`[Retry] Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms... (${msg})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return fn(); // Unreachable
};

// Helper: POST request (Simple Request to avoid CORS Preflight if possible)
const postToGAS = async (url: string, action: string, payload: any) => {
  const cleanUrl = url.trim();
  const body = JSON.stringify({ action, ...payload });
  
  if (!cleanUrl.startsWith('http')) throw new Error("[ERR-URL-01] URL이 올바르지 않습니다.");

  // Method: POST
  // Credentials: omit (Crucial for anonymous access avoiding multi-login 403)
  // Content-Type: text/plain (Crucial to avoid OPTIONS preflight)
  const response = await fetch(cleanUrl, {
    method: 'POST',
    redirect: 'follow',
    credentials: 'omit', 
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: body,
  });
  
  if (!response.ok) {
      throw new Error(`[ERR-HTTP-01] HTTP Error ${response.status}`);
  }

  const text = await response.text();
  
  try {
    if (text.trim() === '') {
      throw new Error('[ERR-EMPTY] 서버응답 없음 (방화벽 차단/잘못된 URL)');
    }
    const json = JSON.parse(text);
    if (json.status !== 'success') {
      throw new Error(`[ERR-SCRIPT-01] ${json.message || 'Script Error'}`);
    }
    return json;
  } catch (e: any) {
    if (e.message && e.message.includes('[ERR-EMPTY]')) {
      throw e;
    }
    if (text.trim().startsWith('<')) {
        throw new Error("[ERR-AUTH-01] HTML 응답 수신됨. (원인: 학교/기관 계정에서 '모든 사용자' 권한이 막혀있거나 로그인이 필요한 상태)");
    }
    throw new Error(`JSON 파싱 실패: ${e.message} (문자열: ${text.substring(0, 30)})`);
  }
};

// Helper: GET request (Fallback)
const getFromGAS = async (url: string) => {
    const cleanUrl = url.trim();
    const delimiter = cleanUrl.includes('?') ? '&' : '?';
    const getUrl = `${cleanUrl}${delimiter}action=getSessions&nocache=${Date.now()}`;
    
    const response = await fetch(getUrl, { 
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit' 
    });
    
    if (!response.ok) throw new Error(`[ERR-HTTP-02] HTTP Error ${response.status}`);
    
    const text = await response.text();
    if (text.trim() === '') {
        throw new Error('[ERR-EMPTY] 서버응답 없음 (방화벽 차단/잘못된 URL)');
    }
    try {
        const json = JSON.parse(text);
        if (json.status === 'success') return json.data;
        throw new Error(`[ERR-SCRIPT-02] ${json.message || 'Script Error'}`);
    } catch (e: any) {
        if (e.message && e.message.includes('[ERR-EMPTY]')) throw e;
        throw new Error(`JSON 파싱 실패: ${e.message}`);
    }
};

export const fetchCloudSessions = async (url: string): Promise<TrainingSession[]> => {
  return withRetry(async () => {
    // Strategy V2.0: Try POST first -> If Network Error -> Try GET
    try {
      const res = await postToGAS(url, 'getSessions', {});
      return res.data;
    } catch (postError: any) {
      console.warn("POST failed, attempting GET fallback...", postError);
      
      try {
          const data = await getFromGAS(url);
          return data;
      } catch (getError: any) {
          console.error("GET fallback also failed:", getError);
          
          // Combine errors for better debugging
          let msg = "서버 연결 실패.";
          const combinedMsg = (postError.message + getError.message).toLowerCase();

          if (combinedMsg.includes('html') || combinedMsg.includes('권한')) {
              msg = "[ERR-AUTH-02] 권한 설정 오류: 학교 계정(Workspace)이라 '모든 사용자' 접속이 차단되었습니다. 개인 구글 계정으로 시도하세요.";
          } else if (combinedMsg.includes('failed to fetch')) {
              msg = "[ERR-NET-01] 네트워크 차단됨: 보안 네트워크(학교망) 문제일 수 있습니다.";
          } else if (combinedMsg.includes('[err-empty]')) {
              msg = "[ERR-NET-04] 네트워크 차단됨: 서버가 빈 응답을 반환했습니다. 교내 방화벽이 구글 접속을 차단했거나, 과도한 접속으로 차단되었을 수 있습니다.";
          } else {
              // Add actual underlyting errors so we can debug them instead of just hiding them.
              msg = `서버 연결 실패. (상세: POST=${postError.message}, GET=${getError.message})`;
          }
          throw new Error(msg);
      }
    }
  }, 4, 1500); // 연수 목록 조회는 최대 4회 재시도
};

export const createCloudSession = async (url: string, session: TrainingSession): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'createSession', { session }), 3, 1000);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

export const deleteCloudSession = async (url: string, sessionId: string): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'deleteSession', { sessionId }), 3, 1000);
    return true;
  } catch (e) {
    console.error("Delete failed:", e);
    return false;
  }
};

export const sendSignatureToCloud = async (url: string, sessionId: string, signature: Signature): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'addSignature', { sessionId, signature }), 5, 2500);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

export const addSignatureBatch = async (url: string, sessionIds: string[], signature: Signature): Promise<boolean> => {
  try {
    // 서명 배치는 중요하므로 지연 시간과 재시도 횟수를 조금 더 늘림 (최대 28초 서버 대기에 대응)
    await withRetry(() => postToGAS(url, 'addSignatureBatch', { sessionIds, signature }), 6, 2500);
    return true;
  } catch (e) {
    console.error("Batch add failed:", e);
    return false;
  }
};

export const removeSignatureFromCloud = async (url: string, sessionId: string, staffId: string): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'removeSignature', { sessionId, staffId }), 3, 1000);
    return true;
  } catch (e) {
    console.error("Remove signature failed:", e);
    return false;
  }
};

export const removeSignatureBatch = async (url: string, sessionIds: string[], staffId: string): Promise<boolean> => {
  try {
    await withRetry(() => postToGAS(url, 'removeSignatureBatch', { sessionIds, staffId }), 3, 1000);
    return true;
  } catch (e) {
    console.error("Batch remove failed:", e);
    return false;
  }
};
