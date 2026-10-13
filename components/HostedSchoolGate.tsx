import React, { useCallback, useEffect, useRef, useState } from 'react';
import StandaloneGate from './StandaloneGate';
import { clearPrivateSession, setSchoolScope } from '../services/managedCloudService';
import { clearPrivateState } from '../services/storageService';
import { initialSchoolEndpoint, rememberSchoolEndpoint, schoolEndpoint, SCHOOL_URL_KEY } from '../services/schoolEndpoint.mjs';
import ConnectionGuideButton, { ConnectionGuidePanel } from './ConnectionGuide';
import { CHANGE_SCHOOL_EVENT } from '../services/gasRuntime';
import { discoverSchoolVersion, SchoolVersion } from '../services/schoolDiscovery';

const LegacyV4App = React.lazy(() => import('./LegacyV4App'));

export default function HostedSchoolGate() {
  const [endpoint, setEndpoint] = useState(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('endpoint') || params.has('sessionId')) return schoolEndpoint(params.get('endpoint'));
    try { return initialSchoolEndpoint(location.search, localStorage); } catch { return ''; }
  });
  const [input, setInput] = useState(endpoint);
  const [selection, setSelection] = useState<{ endpoint: string; attempt: number; version: SchoolVersion } | null>(null);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [installGuide, setInstallGuide] = useState(false);
  const pending = useRef<{ endpoint: string; attempt: number; controller: AbortController; promise: Promise<SchoolVersion>; consumers: number } | null>(null);
  const participant = new URLSearchParams(location.search).has('sessionId');
  useEffect(() => {
    setSelection(null); setError('');
    if (!endpoint) return;
    let active = true;
    let current = pending.current;
    if (!current || current.endpoint !== endpoint || current.attempt !== attempt) {
      const controller = new AbortController();
      current = { endpoint, attempt, controller, promise: discoverSchoolVersion(endpoint, controller.signal), consumers: 0 };
      pending.current = current;
    }
    // StrictMode replays effects. Share its pending request instead of issuing a
    // second v4 health call; real navigation aborts after the final subscriber.
    current.consumers++;
    current.promise.then(version => {
      if (!active) return;
      if (!participant) {
        try { rememberSchoolEndpoint(localStorage, endpoint, version.major); }
        catch { /* A query link still works with storage disabled. */ }
      }
      if (version.major === 5) {
        const school = endpoint.split('/')[5];
        window.__TEACHERSIGN_GAS__ = { school, webAppUrl: endpoint, params: Object.fromEntries(new URLSearchParams(location.search)), serverVersion: version.serverVersion, transport: 'http' };
        setSchoolScope(school);
      }
      setSelection({ endpoint, attempt, version });
    }).catch(value => {
      if (active && value?.name !== 'AbortError') setError(value instanceof Error ? value.message : '[ERR-GAS] 학교 연결 상태를 확인하지 못했습니다.');
    });
    return () => {
      active = false;
      current.consumers--;
      queueMicrotask(() => {
        if (current.consumers === 0) {
          current.controller.abort();
          if (pending.current === current) pending.current = null;
        }
      });
      clearPrivateSession(); clearPrivateState(); delete window.__TEACHERSIGN_GAS__;
    };
  }, [endpoint, participant, attempt]);
  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    const url = schoolEndpoint(input);
    if (!url) return setError('https://script.google.com/macros/s/…/exec 형식의 학교 웹앱 주소를 입력하세요.');
    history.replaceState(null, '', `${location.pathname}?endpoint=${encodeURIComponent(url)}`);
    setError(''); setChanged(false); setInstallGuide(false); setInput(url); setEndpoint(url);
  };
  const change = useCallback(() => {
    clearPrivateSession(); clearPrivateState();
    try { localStorage.removeItem(SCHOOL_URL_KEY); localStorage.removeItem('training_app_cloud_config'); } catch { /* No private data is stored here. */ }
    history.replaceState(null, '', location.pathname);
    delete window.__TEACHERSIGN_GAS__;
    setSchoolScope('');
    setInput(''); setError(''); setChanged(true); setInstallGuide(false); setSelection(null); setEndpoint('');
  }, []);
  useEffect(() => {
    if (participant) return;
    window.addEventListener(CHANGE_SCHOOL_EVENT, change);
    return () => window.removeEventListener(CHANGE_SCHOOL_EVENT, change);
  }, [change, participant]);
  const selected = selection?.endpoint === endpoint && selection.attempt === attempt ? selection.version : null;
  const checkVersion = () => setAttempt(value => value + 1);
  if (endpoint && selected?.major === 4) return <React.Suspense fallback={<p role="status" className="p-8 text-center">기존 학교 화면을 불러오는 중…</p>}>
    <LegacyV4App key={endpoint} endpoint={endpoint} onCheckVersion={checkVersion} onChangeSchool={change} />
  </React.Suspense>;
  if (endpoint && selected?.major === 5) return <>
    {!participant && <div className="bg-slate-100 p-3 text-center text-sm space-x-3">
      <span>이 사이트에서 학교 GAS에 연결해 사용합니다.</span>
      <button type="button" onClick={change} className="underline text-indigo-700">다른 학교 연결</button>
      <details className="mt-2"><summary>연결된 학교 웹앱 주소</summary><p className="break-all mt-2">{endpoint}</p><button type="button" onClick={change} className="underline text-indigo-700 mt-2">저장된 연결 주소 삭제</button><p className="text-xs mt-2">이 브라우저의 주소만 지웁니다. 학교의 자료와 관리자 계정은 유지됩니다.</p></details>
    </div>}
    <StandaloneGate key={endpoint} />
  </>;
  if (endpoint) return <main className="max-w-xl mx-auto my-10 p-8 bg-white rounded-2xl shadow space-y-4">
    <h1 className="text-2xl font-bold">학교 연결 확인</h1>
    <p role={error ? 'alert' : 'status'}>{error || '학교 서버 버전을 확인하는 중…'}</p>
    {error && <>
      <button type="button" onClick={checkVersion} className="border rounded p-3">다시 확인</button>
      {!participant && <button type="button" onClick={change} className="border rounded p-3 ml-3">연결 주소 변경</button>}
      {!participant && <ConnectionGuideButton initialMode="update" />}
    </>}
  </main>;
  return <main className="max-w-3xl mx-auto my-10 p-6 sm:p-8 bg-white rounded-2xl shadow space-y-5">
    <h1 className="text-2xl font-bold">교직원 연수 등록부</h1>
    {participant ? <p role="alert">학교 주소가 없는 이전 참여 링크입니다. 담당자에게 새 QR을 요청하세요.</p> : <>
      {changed && <p role="status" className="text-green-800">이 브라우저의 연결 주소를 지웠습니다. 학교의 자료와 계정은 유지됩니다. 아래에 사용할 주소를 다시 입력하세요.</p>}
      <p>학교에서 사용하던 웹앱 주소를 연결하세요. 학교 버전에 맞는 화면이 열립니다.</p>
        <form id="school-connect" onSubmit={connect} className="space-y-4">
          <label className="block font-bold">학교 GAS 웹앱 주소<input required type="url" value={input} onChange={event => setInput(event.target.value)} className="w-full mt-2 border p-3 rounded font-normal" placeholder="https://script.google.com/macros/s/…/exec" /></label>
          <button type="button" disabled={!input} onClick={() => { setInput(''); setError(''); }} className="border rounded px-3 py-2 disabled:opacity-50">입력 주소 지우기</button>
          <p className="text-sm text-gray-600">이미 사용 중인 학교는 기존 /exec 주소를 그대로 입력하세요. 관리자 연결키와 비밀번호는 이 주소 입력란에 넣지 않습니다.</p>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <button className="bg-indigo-700 text-white rounded p-3 w-full">학교 연결</button>
        </form>
      <button type="button" aria-expanded={installGuide} onClick={() => setInstallGuide(value => !value)} className="border border-indigo-300 text-indigo-700 rounded px-4 py-3">{installGuide ? '설치 안내 접기' : '처음 설치 안내'}</button>
      {installGuide && <ConnectionGuidePanel initialMode="install" authenticated={false} />}
    </>}
  </main>;
}
