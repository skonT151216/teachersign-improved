import React, { useEffect, useId, useRef, useState } from 'react';
import { ConnectionCheck, testSchoolConnection } from '../services/managedCloudService';
import { getGasRuntime } from '../services/gasRuntime';
import { DOWNLOAD_URL, fetchLatestGasCode, GITHUB_URL } from '../services/updateService.mjs';

type Mode = 'update' | 'install' | 'legacy';

export default function ConnectionGuideButton({ initialMode = 'update', disabled = false }: { initialMode?: Mode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="space-y-3">
    <button type="button" disabled={disabled} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} className="border border-indigo-300 rounded p-3 text-indigo-700 font-bold disabled:opacity-50">
      {open ? '연동 안내 닫기' : '연동 방법 다시 보기'}
    </button>
    {open && <section id={id} aria-labelledby={`${id}-title`} className="border rounded-xl p-4 sm:p-6 bg-slate-50 space-y-5"><ConnectionGuide titleId={`${id}-title`} initialMode={initialMode} /></section>}
  </div>;
}

export function ConnectionGuidePanel({ initialMode = 'update', authenticated = true, connectionForm }: { initialMode?: Mode; authenticated?: boolean; connectionForm?: React.ReactNode }) {
  const id = useId();
  return <section aria-labelledby={id} className="border rounded-xl p-4 sm:p-6 bg-slate-50 space-y-5"><ConnectionGuide titleId={id} initialMode={initialMode} authenticated={authenticated} connectionForm={connectionForm} /></section>;
}

function ConnectionGuide({ titleId, initialMode, authenticated = false, connectionForm }: { titleId: string; initialMode: Mode; authenticated?: boolean; connectionForm?: React.ReactNode }) {
  const [mode, setMode] = useState(initialMode);
  const [code, setCode] = useState<{ version: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const loadCode = async () => {
    if (locked.current) return;
    locked.current = true;
    const current = new AbortController();
    controller.current = current;
    const timer = window.setTimeout(() => current.abort(), 15000);
    setBusy(true); setError(''); setMessage(''); setCode(null);
    try {
      const value = await fetchLatestGasCode(current.signal);
      if (mounted.current && !current.signal.aborted) { setCode(value); setMessage(`최신 GAS v${value.version} 코드를 확인했습니다.`); }
    } catch {
      if (mounted.current) setError('코드를 불러오지 못했습니다. GAS 설치 ZIP 다운로드를 이용하세요.');
    } finally {
      window.clearTimeout(timer);
      if (controller.current === current) controller.current = null;
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const copyCode = async () => {
    if (!code || locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await navigator.clipboard.writeText(code.source);
      if (mounted.current) setMessage(`GAS v${code.version} Code.gs를 복사했습니다. Index.html도 같은 설치 ZIP에서 교체하세요.`);
    } catch {
      if (mounted.current) setError('복사 권한을 사용할 수 없습니다. 아래 코드에서 전체 선택·복사하거나 설치 ZIP을 내려받으세요.');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const endpoint = getGasRuntime()?.webAppUrl;
  return <>
    <h2 id={titleId} className="text-xl font-bold">Google Drive 연동 안내</h2>
    <p className="text-sm">코드 준비, 관리자 연결키, 웹앱 배포와 학교 주소 연결 방법을 언제든 다시 확인할 수 있습니다.</p>
    <div role="group" aria-label="설치 상황" className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={mode === 'legacy'} onClick={() => setMode('legacy')} className={`border rounded p-3 ${mode === 'legacy' ? 'bg-indigo-700 text-white' : 'bg-white'}`}>v4.0에서 업데이트</button>
      <button type="button" aria-pressed={mode === 'update'} onClick={() => setMode('update')} className={`border rounded p-3 ${mode === 'update' ? 'bg-indigo-700 text-white' : 'bg-white'}`}>설치한 학교 업데이트</button>
      <button type="button" aria-pressed={mode === 'install'} onClick={() => setMode('install')} className={`border rounded p-3 ${mode === 'install' ? 'bg-indigo-700 text-white' : 'bg-white'}`}>새 학교 처음 설치</button>
    </div>
    {mode === 'legacy' && <div className="border rounded p-4 bg-blue-50 space-y-2">
      <p className="font-bold">v4를 쓰던 학교는 기존 Apps Script 프로젝트에서 시작하세요.</p>
      <p className="text-sm">기존 Code.gs와 Drive의 연수·서명 파일을 사본이나 다운로드로 보관합니다. 아래 순서로 업데이트하고 기존 자료 연결을 마칠 때까지 새 연수·서명 입력을 잠시 멈춥니다.</p>
    </div>}
    <section className="space-y-3">
      <h3 className="font-bold">1. Code.gs와 Index.html 준비</h3>
      <p className="text-sm">{mode !== 'install' ? '학교 담당자 계정으로 기존 Apps Script 프로젝트를 엽니다. 설치 ZIP의 Code.gs와 Index.html 전체 내용을 각각 교체하고 저장합니다.' : '학교 담당자 계정으로 Apps Script 프로젝트를 만듭니다. 설치 ZIP의 Code.gs를 붙여넣고, HTML 파일 Index를 만들어 Index.html 내용을 붙여넣은 뒤 저장합니다.'}</p>
      <div className="flex flex-wrap gap-3">
        <a href="https://script.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">Apps Script 열기</a>
        <a href={DOWNLOAD_URL} className="text-indigo-700 underline">GAS 설치 ZIP 다운로드</a>
        <button type="button" disabled={busy} aria-busy={busy} onClick={() => void loadCode()} className="border rounded px-3 py-2 bg-white disabled:opacity-50">{busy ? '처리 중…' : '최신 Code.gs 보기'}</button>
        {code && <button type="button" disabled={busy} onClick={() => void copyCode()} className="border rounded px-3 py-2 bg-white disabled:opacity-50">코드 복사</button>}
      </div>
      <p className="text-sm font-bold">Index.html은 설치 ZIP에서 함께 받아야 합니다. Code.gs만 복사하면 화면 업데이트는 적용되지 않습니다.</p>
      {code && <label className="block text-sm">최신 Code.gs · v{code.version}<textarea aria-label="최신 Code.gs" readOnly spellCheck={false} value={code.source} onFocus={event => event.currentTarget.select()} className="block w-full h-56 mt-2 border rounded p-3 bg-white font-mono text-xs" /></label>}
      {message && <p role="status" className="text-sm text-green-800">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
    <section className="space-y-2">
      <h3 className="font-bold">2. 관리자 연결키 확인</h3>
      {mode === 'legacy' ? <p className="text-sm">파일 저장 후 상단 함수 목록에서 setupTeacherSign을 실행하고 필요한 Google 권한을 승인합니다. 실행 로그의 관리자 연결키를 보관합니다. 기존 Drive 파일과 스크립트 속성은 지우지 않습니다.</p> : mode === 'update' ? <p className="text-sm">이미 관리자 계정이 있다면 기존 아이디·암호로 로그인합니다. 로그인 후 이 화면에서 연결키를 입력해 현재 연동을 확인할 수 있습니다. 연결키는 Apps Script의 프로젝트 설정(톱니바퀴) → 스크립트 속성 → TEACHERSIGN_ADMIN_KEY에서 담당자가 확인할 수 있습니다.</p> : <p className="text-sm">Apps Script 상단에서 setupTeacherSign을 선택해 실행하고 필요한 권한을 승인합니다. 실행 로그에 표시된 관리자 연결키를 보관합니다. 배포 후 학교 관리자 최초 설정 화면에 이 키를 입력하고 아이디·암호를 정합니다.</p>}
    </section>
    <section className="space-y-2">
      <h3 className="font-bold">3. 웹앱 배포</h3>
      <p className="text-sm">{mode !== 'install' ? '배포 → 배포 관리 → 사용 중인 웹앱 수정(연필) → 새 버전 → 배포를 선택합니다. 기존 /exec 주소를 유지합니다.' : '배포 → 새 배포 → 웹 앱을 선택합니다. 다음 사용자로 실행은 나, 액세스 권한은 모든 사용자로 배포한 뒤 /exec 주소를 복사합니다.'}</p>
    </section>
    <section className="space-y-2">
      <h3 className="font-bold">4. 학교 주소로 접속</h3>
      <p className="text-sm">/exec 주소를 직접 열거나 공용 사이트의 학교 연결 화면에 입력합니다. 학교별 관리자 계정과 Drive 자료를 사용합니다.</p>
      {endpoint && <label className="block text-sm">현재 학교 GAS 웹앱 주소<input readOnly value={endpoint} className="w-full border rounded p-3 mt-2 bg-white text-sm" /></label>}
      {mode === 'legacy' && <p className="text-sm">기존 /exec 주소를 직접 열거나 아래에 입력합니다. 관리자 최초 설정 화면이 나오면 연결키와 원하는 아이디·암호로 v5 계정을 한 번 만듭니다. 이미 v5 계정이 있으면 로그인합니다.</p>}
      {connectionForm}
      {authenticated && <SchoolConnectionCheck />}
      {mode === 'update' && <p className="text-sm">현재 자료 파일은 Apps Script의 스크립트 속성에서 TEACHERSIGN_DB_FILE_ID(연수)와 TEACHERSIGN_SIGNATURE_FILE_ID(서명)로 확인합니다. 업데이트 후 정상적으로 표시되는 자료는 다시 이전하지 않습니다.</p>}
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={`${GITHUB_URL}/blob/main/docs/교사용매뉴얼.md`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">사진으로 보는 전체 연동 안내</a>
        <a href={`${GITHUB_URL}/blob/main/docs/자료이전_핵심안내.md`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">v4 자료 연결 안내</a>
      </div>
    </section>
    {mode === 'legacy' && <section className="space-y-2 border rounded p-4 bg-blue-50">
      <h3 className="font-bold">5. 기존 v4 연수·서명 연결</h3>
      <p className="text-sm">로그인 → 서버 연결 설정 → Google Drive 연동 → 기존 자료 연결을 엽니다. 기존 파일 찾기 → 제목·개수를 확인해 학교 파일 선택 → 연수·서명 개수 확인 → 이 자료 사용하기 순서로 진행합니다. 원본은 보존하며 백업·복사·검증 후 연결합니다.</p>
      <p className="text-sm">연수가 바로 보이지 않아도 원본이 삭제된 것은 아닙니다. 이미 자료를 연결해 정상적으로 보이는 학교는 이전을 반복하지 않습니다.</p>
      <a href={`${GITHUB_URL}/blob/main/docs/자료이전_핵심안내.md`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">사진으로 보는 기존 자료 연결 세 단계</a>
    </section>}
  </>;
}

function SchoolConnectionCheck() {
  const [key, setKey] = useState('');
  const [result, setResult] = useState<ConnectionCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const test = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current || !key.trim()) return;
    locked.current = true;
    const input = key.trim();
    setKey(''); setBusy(true); setError(''); setResult(null);
    try {
      const value = await testSchoolConnection(input);
      if (mounted.current) setResult(value);
    } catch (error) {
      if (mounted.current) setError((error as Error).message);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return <form onSubmit={event => void test(event)} className="space-y-3 border rounded p-4 bg-white">
    <label className="block font-bold">학교 관리자 연결키
      <input type="password" autoComplete="off" spellCheck={false} value={key} disabled={busy} maxLength={512} onChange={event => { setKey(event.target.value); setError(''); setResult(null); }} className="block w-full border rounded p-3 mt-2 font-normal" placeholder="TEACHERSIGN_ADMIN_KEY 값 입력" />
    </label>
    <p className="text-sm">현재 학교 GAS 주소에 연결키를 보내 연수·서명 파일을 확인합니다. 키는 이 확인에만 사용하며 브라우저에 저장하지 않습니다.</p>
    <button type="submit" disabled={busy || !key.trim()} aria-busy={busy} className="bg-indigo-700 text-white rounded p-3 disabled:opacity-50">{busy ? '연동 확인 중…' : '연동 테스트 실행'}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {result && <div role="status" className="space-y-2 text-sm text-green-900">
      <p className="font-bold">연동 확인 완료 · GAS v{result.serverVersion}</p>
      <p>관리자 연결키 일치 · 연수 파일 읽기 성공 · 서명 파일 읽기 성공</p>
      <p>연수 {result.sessions}개 · 서명 {result.signatures}건</p>
      <p>연수 파일: <a href={`https://drive.google.com/file/d/${encodeURIComponent(result.database.fileId)}/view`} target="_blank" rel="noopener noreferrer" className="underline">{result.database.name}</a></p>
      <p>서명 파일: <a href={`https://drive.google.com/file/d/${encodeURIComponent(result.signatureFile.fileId)}/view`} target="_blank" rel="noopener noreferrer" className="underline">{result.signatureFile.name}</a></p>
      <p>현재 연결과 자료를 그대로 사용합니다.</p>
    </div>}
  </form>;
}
