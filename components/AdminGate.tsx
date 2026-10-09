import React, { useEffect, useRef, useState } from 'react';
import App from '../App';
import { request, acceptSession, clearPrivateSession, AdminSession } from '../services/managedCloudService';
import { clearPrivateState } from '../services/storageService';
import { DEMO_ACCOUNTS } from '../server/demo-fixtures.mjs';
import SetupGuide from './SetupGuide';

export default function AdminGate() {
  const participant = Boolean(new URLSearchParams(location.search).get('sessionId'));
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(!participant);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [presetId, setPresetId] = useState('default');
  const [showGuide, setShowGuide] = useState(false);
  const lock = useRef(false);
  const drop = () => { clearPrivateSession(); clearPrivateState(); setSession(null); setPassword(''); setGeneration(value => value + 1); };
  useEffect(() => {
    if (participant) return;
    let mounted = true;
    const loadDemoAccount = async () => {
      try { const value = await request<{ presetId: string }>('/api/demo/account'); if (mounted) setPresetId(value.presetId); } catch { /* Verification/login supplies actionable failures. */ }
    };
    const verify = async () => {
      if (lock.current) return;
      try {
        const value = await request<AdminSession>('/api/auth/session');
        if (mounted) { acceptSession(value); setSession(value); }
      } catch (error) { if ((error as Error).name === 'AbortError') return; if (mounted) { drop(); void loadDemoAccount(); if (!(error as Error).message.startsWith('[ERR-AUTH]')) setError('개발 서버 연결을 확인한 뒤 다시 로그인하세요.'); } }
      finally { if (mounted) setChecking(false); }
    };
    const expired = () => { drop(); setError('세션이 종료되었습니다. 다시 로그인하세요.'); void loadDemoAccount(); };
    const accountChanged = (event: Event) => { const value = (event as CustomEvent).detail; drop(); setPresetId(value.presetId); setUsername(value.username); setError('가상 관리자 계정을 변경했습니다. 새 암호로 다시 로그인하세요. 서버 연결은 유지됩니다.'); };
    const visible = () => { if (document.visibilityState === 'visible') void verify(); };
    void verify();
    void loadDemoAccount();
    window.addEventListener('teachersign:unauthorized', expired);
    window.addEventListener('teachersign:account-changed', accountChanged);
    window.addEventListener('focus', verify);
    window.addEventListener('pageshow', verify);
    window.addEventListener('popstate', verify);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(verify, 60_000);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('teachersign:unauthorized', expired); window.removeEventListener('teachersign:account-changed', accountChanged); window.removeEventListener('focus', verify); window.removeEventListener('pageshow', verify); window.removeEventListener('popstate', verify); document.removeEventListener('visibilitychange', visible); };
  }, [participant]);
  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; clearPrivateSession(); setBusy(true); setError('');
    try { const value = await request<AdminSession>('/api/auth/login', { username, password }); acceptSession(value); setPassword(''); setSession(value); setGeneration(value => value + 1); }
    catch (error) { setError((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  const logout = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await request('/api/auth/logout', {}); drop(); setError('로그아웃했습니다. 서버 연결 설정은 유지됩니다.'); }
    catch (error) { drop(); setError('서버 로그아웃을 확인하지 못했습니다. 브라우저 쿠키도 삭제한 뒤 서버 상태를 확인하세요.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const fixture = DEMO_ACCOUNTS.find(item => item.id === presetId) || DEMO_ACCOUNTS[0];
  return <>
    <div className="bg-amber-100 text-amber-950 px-4 py-2 text-sm text-center no-print">독립 개발본 · 가상 계정/모의 데이터 · 운영 Google 연결 없음</div>
    {participant ? <App key="participant" /> : checking ? <p className="p-12 text-center">로그인 상태 확인 중…</p> : session ? <>
      <div className="bg-slate-800 text-white px-4 py-2 flex justify-between items-center no-print"><span>{session.username} · 관리자 로그인</span><button disabled={busy} onClick={logout} className="rounded bg-white text-slate-800 px-4 py-2 font-bold disabled:opacity-50">로그아웃</button></div>
      <App key={generation} />
    </> : <main className="min-h-[85vh] flex items-center justify-center p-6"><form onSubmit={login} className="w-full max-w-md bg-white p-8 rounded-2xl shadow space-y-5">
      <h1 className="text-2xl font-bold">관리자 로그인</h1><p className="text-sm text-gray-600">로그인하면 서버에 보관된 연수와 연결 설정을 불러옵니다.</p>
      <label className="block">아이디<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required maxLength={128} className="block border p-3 rounded w-full mt-1" /></label>
      <label className="block">암호<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required maxLength={512} className="block border p-3 rounded w-full mt-1" /></label>
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <button disabled={busy} className="w-full bg-indigo-700 text-white font-bold p-3 rounded disabled:opacity-50">{busy ? '확인 중…' : '로그인'}</button>
      <details className="text-xs text-gray-600"><summary>현재 가상 테스트 계정 보기</summary><p className="mt-2">아이디: {fixture.username}<br />암호: {fixture.password}</p></details>
      <button type="button" onClick={() => setShowGuide(true)} className="text-indigo-700 underline text-sm">Google 연동·관리자 계정 설정 과정 보기</button>
    </form></main>}
    {showGuide && <div className="fixed inset-0 z-[250] bg-black/50 p-4 flex items-center justify-center"><div role="dialog" aria-modal="true" aria-label="초기 설정 과정" className="bg-white rounded-2xl p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto space-y-5"><h2 className="text-xl font-bold">초기 설정 과정</h2><SetupGuide /><p className="text-sm">로그인 후 상단의 <strong>관리자 계정</strong>과 <strong>서버 연결 설정</strong>에서 가상 설정을 직접 확인할 수 있습니다.</p><button autoFocus onClick={() => setShowGuide(false)} className="bg-indigo-700 text-white rounded p-3 w-full">설정 안내 닫기</button></div></div>}
  </>;
}
