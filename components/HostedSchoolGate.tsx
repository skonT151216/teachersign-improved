import React, { useCallback, useEffect, useState } from 'react';
import StandaloneGate from './StandaloneGate';
import { clearPrivateSession, setSchoolScope } from '../services/managedCloudService';
import { clearPrivateState } from '../services/storageService';
import { initialSchoolEndpoint, rememberSchoolEndpoint, schoolEndpoint, SCHOOL_URL_KEY } from '../services/schoolEndpoint.mjs';
import { ConnectionGuidePanel } from './ConnectionGuide';
import { CHANGE_SCHOOL_EVENT } from '../services/gasRuntime';

export default function HostedSchoolGate() {
  const [endpoint, setEndpoint] = useState(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('endpoint') || params.has('sessionId')) return schoolEndpoint(params.get('endpoint'));
    try { return initialSchoolEndpoint(location.search, localStorage); } catch { return ''; }
  });
  const [input, setInput] = useState(endpoint);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(false);
  const participant = new URLSearchParams(location.search).has('sessionId');
  useEffect(() => {
    setReady(false);
    if (!endpoint) return;
    if (!participant) { try { rememberSchoolEndpoint(localStorage, endpoint); } catch { /* A query link still works with storage disabled. */ } }
    const school = endpoint.split('/')[5];
    window.__TEACHERSIGN_GAS__ = { school, webAppUrl: endpoint, params: Object.fromEntries(new URLSearchParams(location.search)), serverVersion: '', transport: 'http' };
    setSchoolScope(school);
    setReady(true);
    return () => { clearPrivateSession(); clearPrivateState(); delete window.__TEACHERSIGN_GAS__; };
  }, [endpoint, participant]);
  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    const url = schoolEndpoint(input);
    if (!url) return setError('https://script.google.com/macros/s/…/exec 형식의 학교 웹앱 주소를 입력하세요.');
    try { rememberSchoolEndpoint(localStorage, url); }
    catch { /* Public endpoint remains in the URL when storage is disabled. */ }
    history.replaceState(null, '', `${location.pathname}?endpoint=${encodeURIComponent(url)}`);
    setError(''); setChanged(false); setInput(url); setEndpoint(url);
  };
  const change = useCallback(() => {
    clearPrivateSession(); clearPrivateState();
    try { localStorage.removeItem(SCHOOL_URL_KEY); localStorage.removeItem('training_app_cloud_config'); } catch { /* No private data is stored here. */ }
    history.replaceState(null, '', location.pathname);
    delete window.__TEACHERSIGN_GAS__;
    setSchoolScope('');
    setInput(''); setError(''); setChanged(true); setReady(false); setEndpoint('');
  }, []);
  useEffect(() => {
    if (participant) return;
    window.addEventListener(CHANGE_SCHOOL_EVENT, change);
    return () => window.removeEventListener(CHANGE_SCHOOL_EVENT, change);
  }, [change, participant]);
  if (endpoint && ready) return <>
    {!participant && <div className="bg-slate-100 p-3 text-center text-sm space-x-3">
      <span>이 사이트에서 학교 GAS에 연결해 사용합니다.</span>
      <button type="button" onClick={change} className="underline text-indigo-700">다른 학교 연결</button>
      <details className="mt-2"><summary>연결된 학교 웹앱 주소</summary><p className="break-all mt-2">{endpoint}</p><button type="button" onClick={change} className="underline text-indigo-700 mt-2">저장된 연결 주소 삭제</button><p className="text-xs mt-2">이 브라우저의 주소만 지웁니다. 학교의 자료와 관리자 계정은 유지됩니다.</p></details>
    </div>}
    <StandaloneGate key={endpoint} />
  </>;
  if (endpoint) return <p role="status" className="p-8">학교 연결 준비 중…</p>;
  return <main className="max-w-3xl mx-auto my-10 p-6 sm:p-8 bg-white rounded-2xl shadow space-y-5">
    <h1 className="text-2xl font-bold">교직원 연수 등록부</h1>
    {participant ? <p role="alert">학교 주소가 없는 이전 참여 링크입니다. 담당자에게 새 QR을 요청하세요.</p> : <>
      {changed && <p role="status" className="text-green-800">이 브라우저의 연결 주소를 지웠습니다. 학교의 자료와 계정은 유지됩니다. 아래에 사용할 주소를 다시 입력하세요.</p>}
      <p>처음 사용하는 학교는 아래 1~4단계를 따라 설치·연동하세요. 학교 담당자 한 분이 설정하면 교직원은 공유받은 QR로 서명할 수 있습니다.</p>
      <a href="#school-connect" className="text-indigo-700 underline block">이미 설치한 학교: 주소 입력으로 이동</a>
      <ConnectionGuidePanel initialMode="install" authenticated={false} connectionForm={
        <form id="school-connect" onSubmit={connect} className="space-y-4 border rounded p-4 bg-white scroll-mt-6">
          <label className="block font-bold">학교 GAS 웹앱 주소<input required type="url" value={input} onChange={event => setInput(event.target.value)} className="w-full mt-2 border p-3 rounded font-normal" placeholder="https://script.google.com/macros/s/…/exec" /></label>
          <button type="button" disabled={!input} onClick={() => { setInput(''); setError(''); }} className="border rounded px-3 py-2 disabled:opacity-50">입력 주소 지우기</button>
          <p className="text-sm">위 단계에서 복사한 /exec 주소를 입력하세요. 이미 배포한 학교는 기존 주소를 그대로 사용합니다.</p>
          <p className="text-sm text-gray-600">이 브라우저에는 학교 주소만 저장합니다. 관리자 연결키와 비밀번호는 학교 연결 후 최초 설정 화면에서 입력합니다.</p>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <button className="bg-indigo-700 text-white rounded p-3 w-full">학교 연결</button>
          <p className="text-sm">처음 설치한 학교는 연결 후 학교 이름·관리자 연결키·원하는 아이디와 암호를 입력해 관리자 계정을 만듭니다. 계정이 있는 학교는 기존 아이디·암호로 로그인합니다.</p>
        </form>
      } />
    </>}
  </main>;
}
