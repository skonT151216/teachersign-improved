import { TrainingSession, Signature } from '../types';
import { hasGasConnection, getGasRuntime } from './gasRuntime';
import { validParticipantEndpoint } from './schoolEndpoint.mjs';
import { gasRequest, clearGasSession } from './gasTransport';

export interface AdminSession { username: string; csrf: string; expiresAt: number }
export interface Connection { configured: boolean; provider: 'mock' | 'gas'; label: string; revision: number; participantEndpoint: string; setupMode?: 'basic' | 'google-demo' }
export interface DemoAccount { presetId: string; username: string; revision: number; demo: true }
export interface DemoCheck { id: string; label: string; message: string; ok: boolean }
let csrf = '';
let epoch = 0;
const pending = new Set<AbortController>();
let schoolScope = '';
export const getSchoolScope = () => schoolScope;
export function setSchoolScope(value: string) { clearPrivateSession(); schoolScope = value; }
export function clearPrivateSession() {
  csrf = '';
  clearGasSession();
  epoch++;
  pending.forEach(controller => controller.abort());
  pending.clear();
  document.title = '교직원 연수 등록부';
}
export function acceptSession(session: AdminSession) { csrf = session.csrf; }

export async function request<T>(path: string, body?: unknown, write = false): Promise<T> {
  const target = schoolScope ? `${path}${path.includes('?') ? '&' : '?'}school=${encodeURIComponent(schoolScope)}` : path;
  const controller = new AbortController();
  const currentEpoch = epoch;
  const key = write ? crypto.randomUUID() : '';
  pending.add(controller);
  const timer = window.setTimeout(() => controller.abort(), hasGasConnection() ? 90_000 : 35_000);
  try {
    if (hasGasConnection()) {
      try {
        const result = await gasRequest(path, body, csrf, key, controller.signal);
        if (currentEpoch !== epoch) throw new DOMException('Session changed', 'AbortError');
        return result as T;
      } catch (error) {
        if ((error as Error).message.startsWith('[ERR-AUTH]') && path !== '/api/auth/login' && path !== '/api/auth/session') {
          clearPrivateSession(); window.dispatchEvent(new Event('teachersign:unauthorized'));
        }
        throw error;
      }
    }
    // Network retries reuse the write ID; application errors are never retried.
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetch(target, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        break;
      } catch (error) { if (attempt || controller.signal.aborted) throw error; }
    }
    const result = await response.json();
    if (currentEpoch !== epoch) throw new DOMException('Session changed', 'AbortError');
    if (!response.ok) {
      if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/session') {
        clearPrivateSession();
        window.dispatchEvent(new Event('teachersign:unauthorized'));
      }
      throw new Error(result.message || '[ERR-SERVER] 서버 요청에 실패했습니다.');
    }
    return result;
  } finally { window.clearTimeout(timer); pending.delete(controller); }
}

export const getConnection = () => request<Connection>('/api/admin/connection', {});
export const updateConnection = (connection: Pick<Connection, 'provider' | 'label' | 'revision' | 'setupMode'>) => request<Connection>('/api/admin/connection/update', connection);
export const testDemoGoogle = () => request<{ simulation: true; checks: DemoCheck[] }>('/api/admin/connection/test', { fixtureId: 'google-drive-v4' });
export const getDemoAccount = () => request<DemoAccount>('/api/admin/account', {});
export const updateDemoAccount = (input: { presetId: string; revision: number; currentPassword: string }) => request<DemoAccount>('/api/admin/account/update', input);
export const disconnect = (revision: number) => request<Connection>('/api/admin/connection/disconnect', { revision });
const action = async <T>(participant: boolean, name: string, payload: object, write = false) => {
  const result = await request<{ data: T }>(participant ? '/api/participant' : '/api/admin/action', { action: name, ...payload }, write);
  return result.data;
};
const save = async (participant: boolean, name: string, payload: object): Promise<boolean> => {
  try { await action(participant, name, payload, true); return true; }
  catch (error) {
    if ((error as Error).name !== 'AbortError') window.dispatchEvent(new CustomEvent('teachersign:error', { detail: (error as Error).message }));
    return false;
  }
};
// Arguments retain the v4 client call shape; connection credentials are never sent.
export const fetchAdminSessions = (_url: string, _key?: string) => action<TrainingSession[]>(false, 'getAdminSessions', {});
export const fetchParticipantSession = (url: string, sessionId: string, participantToken: string, authCode = '') => {
  if (!validParticipantEndpoint(url, getGasRuntime())) throw new Error('[ERR-LINK] 이 앱에서 발급한 학교 참여 링크를 사용하세요.');
  return action<TrainingSession>(true, 'getParticipantSession', { sessionId, participantToken, authCode });
};
export const createCloudSession = (_url: string, _key: string, session: TrainingSession) => save(false, 'createSession', { session });
export const deleteCloudSession = (_url: string, _key: string, sessionId: string) => save(false, 'deleteSession', { sessionId });
export const addSignatureBatch = (_url: string, _key: string, sessionIds: string[], signature: Signature) => save(false, 'addSignatureBatch', { sessionIds, signature });
export const removeSignatureBatch = (_url: string, _key: string, sessionIds: string[], staffId: string) => save(false, 'removeSignatureBatch', { sessionIds, staffId });
export const sendParticipantSignature = (url: string, sessionId: string, participantToken: string, authCode: string, signature: Signature) => {
  if (!validParticipantEndpoint(url, getGasRuntime())) return Promise.resolve(false);
  return save(true, 'addParticipantSignature', { sessionId, participantToken, authCode, signature });
};

export interface LegacyFile { fileId: string; name: string; folder: string; modifiedAt: string; readable: boolean; sessions?: number; embeddedSignatures?: number; rows?: number; titles?: { title: string; date: string }[] }
export interface LegacySearch { current: { sessions: number; signatures: number }; completed: boolean; databases: LegacyFile[]; sheets: LegacyFile[]; truncated: boolean }
export interface LegacyPreview { ticket: string; sessions: number; signatures: number; embeddedSignatures: number; separateSignatureRows: number; database: LegacyFile; signatureFile: LegacyFile | null; titles: { title: string; date: string }[] }
export interface LegacyResult { sessions: number; signatures: number; dbFileId: string; signatureFileId: string; backupDbFileId: string; backupSignatureFileId: string }
export const findLegacyData = () => action<LegacySearch>(false, 'findLegacyData', {});
export const previewLegacyData = (dbFileId: string, signatureFileId: string) => action<LegacyPreview>(false, 'previewLegacyData', { dbFileId, signatureFileId });
export const connectLegacyData = (ticket: string) => action<LegacyResult>(false, 'connectLegacyData', { ticket }, true);
