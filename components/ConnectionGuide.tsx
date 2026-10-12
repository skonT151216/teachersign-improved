import React, { useEffect, useId, useRef, useState } from 'react';
import { getGasRuntime } from '../services/gasRuntime';
import { DOWNLOAD_URL, fetchLatestGasCode, GITHUB_URL } from '../services/updateService.mjs';

type Mode = 'update' | 'install';

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

function ConnectionGuide({ titleId, initialMode }: { titleId: string; initialMode: Mode }) {
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
      <button type="button" aria-pressed={mode === 'update'} onClick={() => setMode('update')} className={`border rounded p-3 ${mode === 'update' ? 'bg-indigo-700 text-white' : 'bg-white'}`}>설치한 학교 업데이트</button>
      <button type="button" aria-pressed={mode === 'install'} onClick={() => setMode('install')} className={`border rounded p-3 ${mode === 'install' ? 'bg-indigo-700 text-white' : 'bg-white'}`}>새 학교 처음 설치</button>
    </div>
    <section className="space-y-3">
      <h3 className="font-bold">1. Code.gs와 Index.html 준비</h3>
      <p className="text-sm">{mode === 'update' ? '학교 담당자 계정으로 기존 Apps Script 프로젝트를 엽니다. 설치 ZIP의 Code.gs와 Index.html 전체 내용을 각각 교체하고 저장합니다.' : '학교 담당자 계정으로 Apps Script 프로젝트를 만듭니다. 설치 ZIP의 Code.gs를 붙여넣고, HTML 파일 Index를 만들어 Index.html 내용을 붙여넣은 뒤 저장합니다.'}</p>
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
      {mode === 'update' ? <p className="text-sm">이미 관리자 계정이 있다면 연결키를 다시 입력하지 않습니다. 기존 아이디·암호로 로그인하세요. 연결키는 Apps Script의 프로젝트 설정(톱니바퀴) → 스크립트 속성 → TEACHERSIGN_ADMIN_KEY에서 담당자가 확인할 수 있습니다.</p> : <p className="text-sm">Apps Script 상단에서 setupTeacherSign을 선택해 실행하고 필요한 권한을 승인합니다. 실행 로그에 표시된 관리자 연결키를 보관합니다. 배포 후 학교 관리자 최초 설정 화면에 이 키를 입력하고 아이디·암호를 정합니다.</p>}
    </section>
    <section className="space-y-2">
      <h3 className="font-bold">3. 웹앱 배포</h3>
      <p className="text-sm">{mode === 'update' ? '배포 → 배포 관리 → 사용 중인 웹앱 수정(연필) → 새 버전 → 배포를 선택합니다. 기존 /exec 주소를 유지합니다.' : '배포 → 새 배포 → 웹 앱을 선택합니다. 다음 사용자로 실행은 나, 액세스 권한은 모든 사용자로 배포한 뒤 /exec 주소를 복사합니다.'}</p>
    </section>
    <section className="space-y-2">
      <h3 className="font-bold">4. 학교 주소로 접속</h3>
      <p className="text-sm">/exec 주소를 직접 열거나 공용 사이트의 학교 연결 화면에 입력합니다. 학교별 관리자 계정과 Drive 자료를 사용합니다.</p>
      {endpoint && <label className="block text-sm">현재 학교 GAS 웹앱 주소<input readOnly value={endpoint} className="w-full border rounded p-3 mt-2 bg-white text-sm" /></label>}
      {mode === 'update' && <p className="text-sm">현재 자료 파일은 Apps Script의 스크립트 속성에서 TEACHERSIGN_DB_FILE_ID(연수)와 TEACHERSIGN_SIGNATURE_FILE_ID(서명)로 확인합니다. 업데이트 후 정상적으로 표시되는 자료는 다시 이전하지 않습니다.</p>}
      <div className="flex flex-wrap gap-3 text-sm">
        <a href={`${GITHUB_URL}/blob/main/docs/교사용매뉴얼.md`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">사진으로 보는 전체 연동 안내</a>
        <a href={`${GITHUB_URL}/blob/main/docs/자료이전_핵심안내.md`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">v4 자료 연결 안내</a>
      </div>
    </section>
  </>;
}
