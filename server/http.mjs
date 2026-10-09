import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { Authentication, hashPassword, verifyPassword } from './auth.mjs';
import { DemoStore, DEMO_USERNAME, DEMO_PASSWORD } from './demo-store.mjs';
import { DEMO_ACCOUNTS, DEMO_GOOGLE } from './demo-fixtures.mjs';

const adminActions = new Set(['getAdminSessions', 'createSession', 'deleteSession', 'addSignatureBatch', 'removeSignatureBatch']);
const participantActions = new Set(['getParticipantSession', 'addParticipantSignature']);
const readActions = new Set(['getAdminSessions', 'getParticipantSession']);
const fault = (status, message) => Object.assign(new Error(message), { status });

export async function createDemoServer({ store = new DemoStore(), auth, origin = 'http://localhost:5178', now = Date.now } = {}) {
  await store.initialize();
  const preset = DEMO_ACCOUNTS.find(item => item.id === store.account.presetId);
  if (!store.account.passwordHash) {
    const passwordHash = auth?.username === preset.username ? auth.passwordHash : await hashPassword(preset.password);
    await store.transact(() => { store.account.passwordHash = passwordHash; });
  }
  auth ||= new Authentication({ username: store.account.username, passwordHash: store.account.passwordHash, now });
  const requests = new Map();
  const participantLimits = new Map();
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const path = req.url?.split('?')[0];
      if (req.method === 'GET' && path === '/api/runtime') return send(200, { mode: 'demo', ready: true });
      // Only fixture IDs/usernames are public; password examples are fixed in the demo UI source.
      if (req.method === 'GET' && path === '/api/demo/account') return send(200, { presetId: store.account.presetId, username: store.account.username, demo: true });
      if (req.method === 'GET' && path === '/api/auth/session') {
        const session = auth.get(req.headers.cookie);
        if (!session) throw fault(401, '[ERR-AUTH] 관리자 로그인이 필요합니다.');
        return send(200, { username: session.username, csrf: session.csrf, expiresAt: session.expiresAt });
      }
      if (req.method !== 'POST') throw fault(404, '[ERR-ROUTE] 요청을 찾을 수 없습니다.');
      // Strict origin checks also protect login/logout from cross-site form requests.
      if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') throw fault(403, '[ERR-ORIGIN] 같은 앱에서 다시 요청하세요.');
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fault(415, '[ERR-FORMAT] JSON 요청이 필요합니다.');
      let raw = '';
      for await (const chunk of req) {
        raw += chunk.toString('utf8');
        if (Buffer.byteLength(raw) > 2_000_000) throw fault(413, '[ERR-SIZE] 요청 크기를 초과했습니다.');
      }
      let body;
      try { body = JSON.parse(raw); } catch { throw fault(400, '[ERR-JSON] 요청 형식을 확인하세요.'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') throw fault(400, '[ERR-JSON] 요청 형식을 확인하세요.');
      const address = req.socket.remoteAddress || 'unknown';
      if (path === '/api/auth/login') {
        if (typeof body.username !== 'string' || body.username.length > 128 || typeof body.password !== 'string' || body.password.length > 512) throw fault(400, '[ERR-LOGIN] 아이디와 암호를 확인하세요.');
        const result = await auth.login(body.username, body.password, address);
        if (result.limited) { res.setHeader('Retry-After', '900'); throw fault(429, '[ERR-LIMIT] 로그인 시도가 많습니다. 15분 후 다시 시도하세요.'); }
        if (result.denied) throw fault(401, '[ERR-LOGIN] 아이디 또는 암호가 일치하지 않습니다.');
        res.setHeader('Set-Cookie', auth.cookie(result.token));
        return send(200, { username: result.session.username, csrf: result.session.csrf, expiresAt: result.session.expiresAt });
      }
      const isParticipant = path === '/api/participant';
      const session = isParticipant ? null : auth.get(req.headers.cookie);
      if (!isParticipant) {
        if (!session) throw fault(401, '[ERR-AUTH] 관리자 세션이 만료되었습니다. 다시 로그인하세요.');
        if (req.headers['x-csrf-token'] !== session.csrf) throw fault(403, '[ERR-CSRF] 로그인 상태를 다시 확인하세요.');
      } else {
        // Limit abuse of the public signature route; forwarded addresses are never trusted.
        for (const [key, value] of participantLimits) if (value.until <= now()) participantLimits.delete(key);
        const bucket = participantLimits.get(address) || { count: 0, until: now() + 60_000 };
        if (++bucket.count > 120) throw fault(429, '[ERR-LIMIT] 잠시 후 다시 시도하세요.');
        participantLimits.set(address, bucket);
      }
      if (path === '/api/auth/logout') {
        auth.logout(req.headers.cookie);
        res.setHeader('Set-Cookie', auth.cookie());
        return send(200, { loggedOut: true });
      }
      if (path === '/api/admin/connection') return send(200, store.publicConnection());
      if (path === '/api/admin/connection/test') {
        if (Object.keys(body).length !== 1 || body.fixtureId !== DEMO_GOOGLE.id) throw fault(400, '[ERR-DEMO] 정해진 가상 연동 예시만 사용할 수 있습니다.');
        return send(200, { simulation: true, checks: [
          { id: 'server', label: '웹앱 응답', message: '모의 v4 서버 응답 확인', ok: true },
          { id: 'version', label: '서버 버전', message: 'v4 요청 형식 확인', ok: true },
          { id: 'storage', label: 'Drive·Sheets 저장소', message: '가상 TrainingApp_DB.json · TrainingApp_Signatures 확인', ok: true },
          { id: 'admin', label: '관리자 연결키', message: '가상 서버 연결키 확인', ok: true },
        ] });
      }
      if (path === '/api/admin/account') return send(200, store.publicAccount());
      if (path === '/api/admin/account/update') {
        const next = DEMO_ACCOUNTS.find(item => item.id === body.presetId);
        if (!next || Object.keys(body).some(key => !['presetId', 'revision', 'currentPassword'].includes(key)) || typeof body.currentPassword !== 'string' || body.currentPassword.length > 128) throw fault(400, '[ERR-DEMO] 정해진 가상 계정만 설정할 수 있습니다.');
        const currentVersion = auth.credentialVersion;
        if (!await verifyPassword(body.currentPassword, auth.passwordHash)) throw fault(403, '[ERR-ACCOUNT] 현재 가상 암호를 확인하세요.');
        const passwordHash = await hashPassword(next.password);
        await store.transact(() => {
          if (!auth.get(req.headers.cookie, false) || auth.credentialVersion !== currentVersion) throw fault(401, '[ERR-AUTH] 계정이 변경되었습니다. 다시 로그인하세요.');
          if (body.revision !== store.account.revision) throw fault(409, '[ERR-CONFLICT] 계정 설정이 변경되었습니다. 다시 불러오세요.');
          store.account = { presetId: next.id, username: next.username, passwordHash, revision: store.account.revision + 1 };
        });
        auth.replaceCredentials(next.username, passwordHash);
        res.setHeader('Set-Cookie', auth.cookie());
        return send(200, { ...store.publicAccount(), loginRequired: true });
      }
      if (path === '/api/admin/connection/update') return send(200, await store.updateConnection(body));
      if (path === '/api/admin/connection/disconnect') return send(200, await store.disconnect(body.revision));
      if (path !== '/api/admin/action' && !isParticipant) throw fault(404, '[ERR-ROUTE] 요청을 찾을 수 없습니다.');
      if (!(isParticipant ? participantActions : adminActions).has(body.action)) throw fault(403, '[ERR-ACTION] 이 경로에서 허용하지 않는 요청입니다.');
      if (Object.hasOwn(body, 'adminKey') || Object.hasOwn(body, 'scriptUrl')) throw fault(400, '[ERR-CONNECTION] 브라우저에서 연결키를 보낼 수 없습니다.');
      let result;
      if (readActions.has(body.action)) result = await store.action(body.action, body);
      else {
        // A retry of the same write shares its promise/result. Reusing a key with a different payload is rejected.
        const key = req.headers['idempotency-key'];
        if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(key)) throw fault(400, '[ERR-RETRY] 요청 식별자가 필요합니다.');
        for (const [id, entry] of requests) if (entry.until <= now()) requests.delete(id);
        if (requests.size >= 500) throw fault(429, '[ERR-LIMIT] 잠시 후 다시 시도하세요.');
        const scope = isParticipant ? `${body.sessionId}:${body.participantToken}:${body.authCode || ''}` : session.csrf;
        const id = createHash('sha256').update(`${scope}:${key}`).digest('hex');
        const fingerprint = createHash('sha256').update(raw).digest('hex');
        let entry = requests.get(id);
        if (entry && entry.fingerprint !== fingerprint) throw fault(409, '[ERR-RETRY] 같은 요청 식별자로 다른 내용을 저장할 수 없습니다.');
        if (!entry) {
          entry = { fingerprint, until: now() + 5 * 60_000, promise: store.action(body.action, body) };
          requests.set(id, entry);
        }
        result = await entry.promise;
      }
      send(200, { status: 'success', data: result });
    } catch (error) {
      const status = error.status || (error.message?.includes('[ERR-CONFLICT]') ? 409 : 400);
      send(status, { message: error.message?.startsWith('[ERR-') ? error.message : '[ERR-SERVER] 요청을 처리하지 못했습니다.' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return { server, auth, store };
}
