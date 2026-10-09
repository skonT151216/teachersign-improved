import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEMO_ACCOUNTS } from './demo-fixtures.mjs';

export const DEMO_USERNAME = 'demo-admin';
export const DEMO_PASSWORD = 'DemoOnly-TeacherSign-2026!';
export const DEMO_PARTICIPANT_TOKEN = 'demo-participant-token-1';
const SESSION_FIELDS = ['id', 'type', 'title', 'date', 'time', 'schoolName', 'maxParticipants', 'authCode', 'staffList', 'createdAt', 'parentGrades', 'parentClasses'];

export function demoSessions() {
  const staffList = [
    { id: 'demo-staff-1', name: '가상 교직원 가', department: '가상 교사' },
    { id: 'demo-staff-2', name: '가상 교직원 나', department: '가상 교사' },
  ];
  return ['1', '2'].map(id => ({ id: `demo-training-${id}`, type: 'school', title: `가상 연수 ${id}`, date: '2026-10-02', schoolName: '가상 학교', maxParticipants: 200, staffList: structuredClone(staffList), signatures: [], createdAt: 1790899200000, participantToken: id === '1' ? DEMO_PARTICIPANT_TOKEN : 'demo-participant-token-2' }));
}

export class DemoStore {
  constructor({ stateFile, sessions = demoSessions() } = {}) {
    this.stateFile = stateFile;
    this.sessions = structuredClone(sessions);
    this.connection = { provider: 'mock', label: '가상 학교 저장소', revision: 1 };
    this.connectionRevision = 1;
    this.account = { presetId: 'default', username: DEMO_USERNAME, revision: 1 };
    this.queue = Promise.resolve();
  }

  async initialize() {
    if (!this.stateFile) return;
    try {
      const data = JSON.parse(await readFile(this.stateFile, 'utf8'));
      if (data.format !== 'teachersign-demo-v1' || (data.connection && data.connection.provider !== 'mock') || !Array.isArray(data.sessions)) throw new Error('Invalid demo state');
      this.connection = data.connection;
      this.connectionRevision = data.connectionRevision ?? data.connection?.revision ?? 0;
      this.sessions = data.sessions;
      if (data.account) {
        const preset = DEMO_ACCOUNTS.find(item => item.id === data.account.presetId);
        if (!preset || data.account.username !== preset.username || !Number.isInteger(data.account.revision) || data.account.revision < 1) throw new Error('Invalid demo account');
        this.account = data.account;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Demo state is invalid; preserve the file and inspect it before restarting');
      await this.persist();
    }
  }

  async persist() {
    if (!this.stateFile) return;
    await mkdir(dirname(this.stateFile), { recursive: true, mode: 0o700 });
    const temporary = `${this.stateFile}.tmp`;
    await writeFile(temporary, JSON.stringify({ format: 'teachersign-demo-v1', connection: this.connection, connectionRevision: this.connectionRevision, account: this.account, sessions: this.sessions }), { mode: 0o600 });
    await rename(temporary, this.stateFile);
  }

  transact(operation) {
    const run = this.queue.then(async () => {
      const previous = structuredClone({ connection: this.connection, connectionRevision: this.connectionRevision, account: this.account, sessions: this.sessions });
      try {
        const result = await operation();
        await this.persist();
        return result;
      } catch (error) {
        this.connection = previous.connection;
        this.connectionRevision = previous.connectionRevision;
        this.account = previous.account;
        this.sessions = previous.sessions;
        throw error;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  publicConnection() {
    return { configured: Boolean(this.connection), label: this.connection?.label || '', provider: 'mock', revision: this.connectionRevision, participantEndpoint: '/api/participant', setupMode: this.connection?.setupMode || 'basic' };
  }

  updateConnection(input) {
    return this.transact(() => {
      if (input.provider !== 'mock' || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 80 || (input.setupMode !== undefined && !['basic', 'google-demo'].includes(input.setupMode)) || Object.keys(input).some(key => !['provider', 'label', 'revision', 'setupMode'].includes(key))) throw new Error('[ERR-CONNECTION] 가상 저장소 설정만 사용할 수 있습니다.');
      this.checkRevision(input.revision);
      this.connection = { provider: 'mock', label: input.label.trim(), setupMode: input.setupMode || 'basic', revision: ++this.connectionRevision };
      return this.publicConnection();
    });
  }

  checkRevision(revision) {
    if (revision !== this.connectionRevision) throw new Error('[ERR-CONFLICT] 다른 관리자가 연결 설정을 변경했습니다. 다시 불러오세요.');
  }

  publicAccount() {
    return { presetId: this.account.presetId, username: this.account.username, revision: this.account.revision, demo: true };
  }

  disconnect(revision) {
    return this.transact(() => { this.checkRevision(revision); this.connection = null; this.connectionRevision++; return this.publicConnection(); });
  }

  requireConnection() {
    if (!this.connection) throw new Error('[ERR-CONNECTION] 서버의 저장소 연결이 해제되어 있습니다. 관리자에게 문의하세요.');
  }

  session(id) {
    const session = this.sessions.find(item => item.id === id);
    if (!session) throw new Error('[ERR-SESSION-03] 연수 정보를 찾을 수 없습니다.');
    return session;
  }

  async action(action, request) {
    this.requireConnection();
    if (action === 'getAdminSessions') return structuredClone(this.sessions);
    if (action === 'getParticipantSession') {
      const session = this.session(request.sessionId);
      this.validateParticipant(session, request.participantToken);
      const authRequired = Boolean(session.authCode);
      const authVerified = !authRequired || String(request.authCode || '') === String(session.authCode);
      const { participantToken, authCode, signatures, staffList, ...publicFields } = session;
      return { ...structuredClone(publicFields), relatedSessionTitles: this.related(session).map(item => item.title), authRequired, authVerified, staffList: authVerified && session.type === 'school' ? staffList.map(({ id, name, department }) => ({ id, name, department })) : [], signatures: authVerified && session.type === 'school' ? signatures.map(({ staffId, staffName, department, timestamp }) => ({ staffId, staffName, department, timestamp, signatureData: '' })) : [] };
    }
    return this.transact(() => {
      this.requireConnection();
      if (action === 'createSession') {
        const incoming = request.session;
        if (!incoming || typeof incoming.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(incoming.id) || !['school', 'office', 'parents'].includes(incoming.type) || !Array.isArray(incoming.staffList) || incoming.staffList.length > 2000 || typeof incoming.title !== 'string' || !incoming.title.trim() || incoming.title.length > 300 || typeof incoming.schoolName !== 'string' || !incoming.schoolName.trim() || incoming.schoolName.length > 300 || !/^\d{4}-\d{2}-\d{2}$/.test(incoming.date || '') || !Number.isInteger(incoming.maxParticipants) || incoming.maxParticipants < 1 || incoming.maxParticipants > 2000 || !Number.isFinite(incoming.createdAt) || (incoming.authCode !== undefined && (typeof incoming.authCode !== 'string' || incoming.authCode.length > 64))) throw new Error('[ERR-SESSION-01] 연수 정보를 확인하세요.');
        const ids = new Set();
        for (const staff of incoming.staffList) {
          if (!staff || typeof staff.id !== 'string' || !staff.id || ids.has(staff.id) || typeof staff.name !== 'string' || !staff.name || typeof staff.department !== 'string') throw new Error('[ERR-STAFF] 교직원 명단을 확인하세요.');
          ids.add(staff.id);
        }
        const existing = this.sessions.find(item => item.id === incoming.id);
        const fields = Object.fromEntries(SESSION_FIELDS.filter(key => incoming[key] !== undefined).map(key => [key, structuredClone(incoming[key])]));
        // Preserve only the documented v4 session fields. Tokens are always server-owned.
        const stored = { ...fields, participantToken: existing?.participantToken || randomUUID().replaceAll('-', ''), signatures: existing?.signatures || [] };
        this.sessions = this.sessions.filter(item => item.id !== stored.id).concat(stored);
        return { participantToken: stored.participantToken };
      }
      if (action === 'deleteSession') { this.sessions = this.sessions.filter(item => item.id !== request.sessionId); return {}; }
      if (action === 'removeSignatureBatch') {
        for (const session of this.sessions.filter(item => request.sessionIds?.includes(item.id))) session.signatures = session.signatures.filter(item => item.staffId !== request.staffId);
        return {};
      }
      if (action === 'addSignatureBatch' || action === 'addParticipantSignature') {
        const input = request.signature;
        if (!input || typeof input.staffId !== 'string' || typeof input.staffName !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.signatureData || '') || input.signatureData.length > 1_000_000 || !Number.isFinite(input.timestamp)) throw new Error('[ERR-SIGNATURE-01] 서명 정보를 확인하세요.');
        let signature = structuredClone(input);
        let targets;
        if (action === 'addParticipantSignature') {
          const anchor = this.session(request.sessionId);
          this.validateParticipant(anchor, request.participantToken);
          if (anchor.authCode && String(request.authCode || '') !== String(anchor.authCode)) throw new Error('[ERR-PARTICIPANT-CODE] 참여 인증번호가 일치하지 않습니다.');
          if (anchor.type === 'school') {
            const staff = anchor.staffList.find(item => item.id === input.staffId);
            if (!staff) throw new Error('[ERR-PARTICIPANT-01] 명단에서 사용자를 찾을 수 없습니다.');
            signature = { ...signature, staffName: staff.name, department: staff.department, affiliation: staff.affiliation || '' };
          }
          targets = this.related(anchor).filter(item => item.type !== 'school' || item.staffList.some(staff => staff.id === signature.staffId));
        } else targets = this.sessions.filter(item => request.sessionIds?.includes(item.id));
        if (!targets.length) throw new Error('[ERR-SESSION-02] 서명 대상을 찾을 수 없습니다.');
        for (const session of targets) if (!session.signatures.some(item => item.staffId === signature.staffId) && session.signatures.length >= session.maxParticipants) throw new Error('[ERR-FULL-01] 참가 가능 인원을 초과했습니다.');
        for (const session of targets) session.signatures = session.signatures.filter(item => item.staffId !== signature.staffId).concat(structuredClone(signature));
        return { updatedCount: targets.length };
      }
      throw new Error('[ERR-ACTION-01] 지원하지 않는 요청입니다.');
    });
  }

  related(anchor) { return this.sessions.filter(item => item.date === anchor.date && item.type === anchor.type); }
  validateParticipant(session, token) { if (!token || token !== session.participantToken) throw new Error('[ERR-PARTICIPANT-LINK] 유효하지 않은 참여 링크입니다.'); }
}
