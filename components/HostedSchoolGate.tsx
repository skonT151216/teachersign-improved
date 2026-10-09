import React, { useEffect, useState } from 'react';
import StandaloneGate from './StandaloneGate';
import { clearPrivateSession, setSchoolScope } from '../services/managedCloudService';
import { clearPrivateState } from '../services/storageService';
import { initialSchoolEndpoint, rememberSchoolEndpoint, schoolEndpoint, SCHOOL_URL_KEY } from '../services/schoolEndpoint.mjs';
import { GITHUB_URL, DOWNLOAD_URL } from '../services/updateService.mjs';

export default function HostedSchoolGate() {
  const [endpoint, setEndpoint] = useState(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('endpoint') || params.has('sessionId')) return schoolEndpoint(params.get('endpoint'));
    try { return initialSchoolEndpoint(location.search, localStorage); } catch { return ''; }
  });
  const [input, setInput] = useState(endpoint);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
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
    setError(''); setEndpoint(url);
  };
  const change = () => {
    clearPrivateSession(); clearPrivateState();
    try { localStorage.removeItem(SCHOOL_URL_KEY); localStorage.removeItem('training_app_cloud_config'); } catch { /* No private data is stored here. */ }
    history.replaceState(null, '', location.pathname);
    setReady(false); setEndpoint('');
  };
  if (endpoint && ready) return <>
    {!participant && <div className="bg-slate-100 p-3 text-center text-sm space-x-3">
      <span>이 사이트에서 학교 GAS에 연결해 사용합니다.</span>
      <button type="button" onClick={change} className="underline text-indigo-700">다른 학교 연결</button>
      <details className="mt-2"><summary>연결된 학교 웹앱 주소</summary><p className="break-all mt-2">{endpoint}</p></details>
    </div>}
    <StandaloneGate key={endpoint} />
  </>;
  if (endpoint) return <p role="status" className="p-8">학교 연결 준비 중…</p>;
  return <main className="max-w-xl mx-auto my-10 p-8 bg-white rounded-2xl shadow space-y-5">
    <h1 className="text-2xl font-bold">교직원 연수 등록부</h1>
    {participant ? <p role="alert">학교 주소가 없는 이전 참여 링크입니다. 담당자에게 새 QR을 요청하세요.</p> : <>
      <p>학교 담당자가 배포한 GAS 웹앱의 /exec 주소를 연결하세요. 같은 프로그램을 학교 /exec 주소에서도 바로 사용할 수 있습니다.</p>
      <form onSubmit={connect} className="space-y-4">
        <label className="block">학교 GAS 웹앱 주소<input required type="url" value={input} onChange={event => setInput(event.target.value)} className="w-full mt-2 border p-3 rounded" placeholder="https://script.google.com/macros/s/…/exec" /></label>
        <p className="text-sm text-gray-600">이 브라우저에는 학교 주소만 저장합니다. 관리자 연결키와 비밀번호는 이 입력란에 넣지 않습니다.</p>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button className="bg-indigo-700 text-white rounded p-3 w-full">학교 연결</button>
      </form>
    </>}
    <a className="text-indigo-700 underline block" href={DOWNLOAD_URL}>GAS 설치 ZIP 다운로드</a>
    <a className="text-indigo-700 underline block" href={`${GITHUB_URL}#학교에-설치하기`} target="_blank" rel="noopener noreferrer">학교 설치 및 업데이트 안내</a>
  </main>;
}
