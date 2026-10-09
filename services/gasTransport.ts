import { browserPassword, digest, passwordProof, randomToken } from './browserPassword.mjs';
import { getGasRuntime } from './gasRuntime';

let sessionToken = '';
export const clearGasSession = () => { sessionToken = ''; };
const abortError = () => new DOMException('요청을 취소했습니다.', 'AbortError');
export function gasRpc(operation: string, input: object, signal: AbortSignal): Promise<any> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    let settled = false;
    const finish = (callback: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', abort); callback(value);
    };
    const abort = () => finish(reject, abortError());
    signal.addEventListener('abort', abort, { once: true });
    try {
      window.google.script.run
        .withSuccessHandler((value: any) => {
          if (value?.status !== 'success') return finish(reject, new Error(value?.message || '[ERR-GAS] 요청을 처리하지 못했습니다.'));
          finish(resolve, value.data);
        })
        .withFailureHandler(() => finish(reject, new Error('[ERR-GAS-NETWORK] 학교 GAS에 연결하지 못했습니다. 다시 시도하세요.')))
        .teacherSignRpc({ ...input, operation });
    } catch { finish(reject, new Error('[ERR-GAS-NETWORK] GAS 웹앱 주소에서 프로그램을 열어 주세요.')); }
  });
}
export async function gasRequest(path: string, body: any, csrf: string, requestId: string, signal: AbortSignal) {
  const call = (operation: string, input: object = {}) => gasRpc(operation, input, signal);
  const access = () => ({ sessionToken, csrf });
  const check = () => { if (signal.aborted) throw abortError(); };
  if (path === '/api/runtime') return { mode: 'gas-standalone', ready: true };
  if (path === '/api/school/info') return call('info');
  if (path === '/api/school/register') {
    const passwordHash = await browserPassword(body.password); check();
    await call('bootstrap', { username: body.username, label: body.label, setupKey: body.setupKey, passwordHash });
    return { school: getGasRuntime()!.school };
  }
  if (path === '/api/auth/login') {
    const challenge = await call('challenge', { username: body.username });
    if (!/^[a-f0-9]{32}$/.test(challenge.salt) || !/^[a-f0-9]{64}$/.test(challenge.nonce) || !Number.isSafeInteger(challenge.revision)) throw new Error('[ERR-GAS] 학교 인증 형식을 확인하세요.');
    const verifier = await browserPassword(body.password, challenge.salt); check();
    const token = randomToken(), nextCsrf = randomToken();
    const tokenHash = await digest(token);
    const proof = await passwordProof(verifier, [challenge.nonce, body.username, challenge.revision, tokenHash, nextCsrf]); check();
    const value = await call('login', { nonce: challenge.nonce, username: body.username, tokenHash, csrf: nextCsrf, proof });
    check();
    if (value.csrf !== nextCsrf || value.username !== body.username || !Number.isSafeInteger(value.expiresAt)) throw new Error('[ERR-GAS] 학교 세션 형식을 확인하세요.');
    sessionToken = token;
    return value;
  }
  if (path === '/api/auth/session') {
    if (!sessionToken) throw new Error('[ERR-AUTH] 학교 관리자 로그인이 필요합니다.');
    return call('session', access());
  }
  if (path === '/api/auth/logout') {
    const value = await call('logout', access()); sessionToken = ''; return value;
  }
  if (path === '/api/admin/connection') return call('connection', access());
  if (path === '/api/admin/account') return call('account', access());
  if (path === '/api/admin/account/update') {
    const salt = await call('accountSalt', access());
    const oldHash = await browserPassword(body.currentPassword, salt.salt);
    const passwordHash = await browserPassword(body.password); check();
    const proof = await passwordProof(oldHash, ['accountUpdate', await digest(sessionToken), body.revision, body.username, passwordHash]); check();
    const value = await call('accountUpdate', { ...access(), username: body.username, revision: body.revision, passwordHash, proof });
    sessionToken = ''; return value;
  }
  if (path === '/api/admin/action' || path === '/api/participant') {
    const { action: name, ...payload } = body;
    const data = await call(path === '/api/participant' ? 'participant' : 'admin', { ...(path === '/api/participant' ? {} : access()), name, payload, requestId });
    return { status: 'success', data };
  }
  throw new Error('[ERR-ROUTE] 지원하지 않는 요청입니다.');
}
