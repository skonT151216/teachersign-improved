import React, { useEffect, useRef, useState } from 'react';
import { getAppParams, getGasRuntime } from '../services/gasRuntime';
import { request, setSchoolScope } from '../services/managedCloudService';
import { SchoolLogin } from './SchoolGate';

setSchoolScope(getGasRuntime()?.school || '');
export default function StandaloneGate() {
  const runtime = getGasRuntime();
  const participant = Boolean(getAppParams().get('sessionId'));
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!runtime || participant) return;
    setError(''); setConfigured(null);
    request<{ accountConfigured: boolean }>('/api/school/info', {})
      .then(value => { if (active) setConfigured(value.accountConfigured); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [participant, retry, runtime]);
  if (!runtime) return <p role="alert" className="p-8">학교 GAS의 /exec 주소에서 프로그램을 열어 주세요.</p>;
  if (!participant && configured === null) return (
    <main className="max-w-xl mx-auto p-8 space-y-4">
      <h1 className="text-2xl font-bold">교직원 연수 등록부</h1>
      <p role={error ? 'alert' : 'status'}>{error || '학교 설치 상태 확인 중…'}</p>
      {error && <>
        <p>최초 설치라면 Apps Script 편집기에서 setupTeacherSign을 실행하고 권한을 승인한 뒤 새 버전으로 배포하세요.</p>
        <button type="button" onClick={() => setRetry(value => value + 1)} className="border rounded p-3">다시 확인</button>
      </>}
    </main>
  );
  return <React.Suspense fallback={<p role="status" className="p-8 text-center">화면을 불러오는 중…</p>}>
    {participant || configured ? <SchoolLogin school={runtime.school} /> : <SchoolRegistration onComplete={() => setConfigured(true)} />}
  </React.Suspense>;
}
function SchoolRegistration({ onComplete }: { onComplete: () => void }) {
  const [label, setLabel] = useState('');
  const [setupKey, setKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    if (password !== repeat) return setError('새 암호 확인이 일치하지 않습니다.');
    lock.current = true; setBusy(true); setError('');
    try {
      await request('/api/school/register', { label, setupKey, username, password });
      setPassword(''); setRepeat(''); setKey(''); onComplete();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <main className="max-w-xl mx-auto my-8 p-8 bg-white rounded-2xl shadow space-y-5">
    <h1 className="text-2xl font-bold">학교 관리자 최초 설정</h1>
    <p>이 학교의 Google Drive에 관리자 계정과 연수·서명을 보관합니다. 최초 한 번만 설정합니다.</p>
    <p className="text-sm text-gray-600">연결키는 Apps Script 편집기에서 setupTeacherSign을 실행했을 때 나온 설치 담당자용 값입니다.</p>
    <form onSubmit={register} className="space-y-4">
      <label className="block">학교 이름<input required disabled={busy} value={label} onChange={e => setLabel(e.target.value)} maxLength={80} className="border p-3 rounded block mt-1 w-full" /></label>
      <label className="block">학교 관리자 연결키<input required disabled={busy} type="password" autoComplete="off" value={setupKey} onChange={e => setKey(e.target.value)} minLength={32} maxLength={256} className="border p-3 rounded block mt-1 w-full" /></label>
      <label className="block">관리자 아이디<input required disabled={busy} autoComplete="username" pattern="[A-Za-z0-9_.@\-]{3,64}" value={username} onChange={e => setUsername(e.target.value)} className="border p-3 rounded block mt-1 w-full" /></label>
      <p className="text-sm text-gray-600">아이디는 영문·숫자와 _ . @ - 사용, 3~64자입니다.</p>
      <label className="block">새 암호<input required disabled={busy} type="password" autoComplete="new-password" minLength={12} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} className="border p-3 rounded block mt-1 w-full" /></label>
      <label className="block">새 암호 확인<input required disabled={busy} type="password" autoComplete="new-password" minLength={12} maxLength={256} value={repeat} onChange={e => setRepeat(e.target.value)} className="border p-3 rounded block mt-1 w-full" /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} aria-busy={busy} className="bg-indigo-700 text-white rounded p-3 w-full disabled:opacity-50">{busy ? '계정 설정 중…' : '학교 관리자 계정 만들기'}</button>
    </form>
  </main>;
}
