const ADMIN_ACTIONS = new Set(['getAdminSessions', 'createSession', 'deleteSession', 'addSignatureBatch', 'removeSignatureBatch']);
const PARTICIPANT_ACTIONS = new Set(['getParticipantSession', 'addParticipantSignature']);

// Retains the v4.0 POST protocol. The prototype never enables this adapter.
// Only an operator-provisioned server configuration may select a live endpoint.
export function createGasAdapter({ scriptUrl, adminKey, allowLive = false, fetchImpl = fetch }) {
  if (!allowLive) throw new Error('Live Google storage is disabled');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(scriptUrl) || !adminKey) throw new Error('Server storage configuration is incomplete');
  return {
    async action(action, payload) {
      if (!ADMIN_ACTIONS.has(action) && !PARTICIPANT_ACTIONS.has(action)) throw new Error('[ERR-ACTION-01] 지원하지 않는 요청입니다.');
      const body = { ...payload, action };
      // Ignore all client-supplied connection credentials.
      delete body.adminKey;
      delete body.scriptUrl;
      if (ADMIN_ACTIONS.has(action)) body.adminKey = adminKey;
      const response = await fetchImpl(scriptUrl, { method: 'POST', redirect: 'follow', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: AbortSignal.timeout(35_000) });
      if (!response.ok) throw new Error('[ERR-STORAGE] 저장 서버에 연결할 수 없습니다.');
      let result;
      try { result = await response.json(); } catch { throw new Error('[ERR-STORAGE] 저장 서버의 응답을 확인할 수 없습니다.'); }
      // Do not forward arbitrary upstream error pages/messages containing credentials.
      if (result.status !== 'success') throw new Error('[ERR-STORAGE] 저장 요청을 처리하지 못했습니다. 담당자가 서버 상태를 확인해야 합니다.');
      return result.data;
    },
  };
}
