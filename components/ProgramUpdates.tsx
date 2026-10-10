import React, { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../services/managedCloudService';
import { APP_VERSION, compareVersions, DOWNLOAD_URL, fetchLatestUpdate, GITHUB_URL } from '../services/updateService.mjs';
import { isGasStandalone } from '../services/gasRuntime';

type Update = { appVersion: string; gasVersion: string; publishedAt: string; notes: string };
export default function ProgramUpdates() {
  const [latest, setLatest] = useState<Update | null>(null);
  const [gasVersion, setGasVersion] = useState('');
  const [gasError, setGasError] = useState('');
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const check = useCallback(async () => {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    const timer = window.setTimeout(() => current.abort(), 12000);
    setBusy(true); setError(''); setGasError(''); setLatest(null); setGasVersion(''); setCheckedAt('');
    try {
      const [release, school] = await Promise.allSettled([
        fetchLatestUpdate(current.signal),
        request<{ serverVersion: string }>('/api/school/info', {}),
      ]);
      if (current.signal.aborted) {
        if (controller.current === current) setError('확인 시간이 초과되었습니다. 다시 확인해 주세요.');
        return;
      }
      if (release.status === 'fulfilled') {
        setLatest(release.value);
        setCheckedAt(new Date().toLocaleString('ko-KR'));
      } else setError('최신 버전을 확인하지 못했습니다. 네트워크를 확인하거나 GitHub에서 직접 확인하세요.');
      if (school.status === 'fulfilled') {
        try { compareVersions(school.value.serverVersion, '0.0.0'); setGasVersion(school.value.serverVersion); }
        catch { setGasError('학교 GAS 버전을 확인하지 못했습니다.'); }
      } else setGasError('학교 GAS에 연결하지 못해 설치 버전을 확인하지 못했습니다.');
    } finally {
      window.clearTimeout(timer);
      if (controller.current === current) { controller.current = null; setBusy(false); }
    }
  }, []);
  useEffect(() => {
    void check();
    return () => { controller.current?.abort(); controller.current = null; };
  }, [check]);
  const appUpdate = latest && compareVersions(APP_VERSION, latest.appVersion) < 0;
  const gasUpdate = latest && gasVersion && compareVersions(gasVersion, latest.gasVersion) < 0;
  return (
    <section className="space-y-4" aria-labelledby="program-updates-title">
      <h2 id="program-updates-title" className="text-xl font-bold">프로그램 업데이트</h2>
      <p>현재 화면 버전: v{APP_VERSION}</p>
      <p>학교 GAS 버전: {gasVersion ? `v${gasVersion}` : busy ? '확인 중…' : '확인 불가'}</p>
      <button type="button" disabled={busy} aria-busy={busy} onClick={() => void check()} className="bg-indigo-700 text-white p-3 rounded disabled:opacity-50">
        {busy ? '업데이트 확인 중…' : '업데이트 확인'}
      </button>
      <div role="status" aria-live="polite" className="space-y-3">
        {latest && <>
          <p className="font-bold">{appUpdate || gasUpdate ? '새 업데이트가 있습니다.' : gasVersion ? '현재 화면과 학교 GAS는 최신 버전 이상입니다.' : '현재 화면은 최신 버전 이상입니다. 학교 GAS는 별도 확인이 필요합니다.'}</p>
          <p>GitHub 최신: 화면 v{latest.appVersion} · GAS v{latest.gasVersion} ({latest.publishedAt})</p>
          <p>{latest.notes}</p>
          {(appUpdate || gasUpdate) && isGasStandalone() ? <p>설치 ZIP을 받아 같은 GAS 프로젝트의 Code.gs와 Index HTML을 함께 교체하고, 배포 관리 → 수정 → 새 버전으로 배포하세요. 기존 웹앱 주소·스크립트 속성을 유지하며 관리자 계정을 다시 만들지 않습니다.</p> : <>
            {appUpdate && <p>화면 버전은 공용 앱 운영 담당자가 새 버전을 배포한 뒤 새로고침하면 적용됩니다.</p>}
            {gasUpdate && <p>학교 담당자가 아래 GitHub에서 새 GAS 코드를 받아 기존 v5 프로젝트의 코드를 교체하고, 배포 관리에서 새 버전으로 배포하세요. 기존 프로젝트·웹앱 주소와 스크립트 속성을 유지하며 관리자 계정을 다시 만들지 않습니다.</p>}
          </>}
          <p className="text-sm text-gray-600">확인 시각: {checkedAt} · GitHub 캐시로 최신 반영이 잠시 늦어질 수 있습니다.</p>
        </>}
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {gasError && <p role="alert" className="text-red-700">{gasError}</p>}
      <div className="flex flex-wrap gap-4">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">GitHub에서 업데이트 확인</a>
        <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">GAS 설치 ZIP 다운로드</a>
        <a href={`${GITHUB_URL}/blob/main/Code.gs`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">최신 GAS 코드 보기</a>
      </div>
      <p className="text-sm text-gray-600">업데이트는 자동 설치되지 않습니다. v4를 쓰던 학교는 기존 연수·서명 파일을 확인하고 자료 이전 절차를 진행해야 합니다. 새 설치만으로 기존 자료가 연결되지는 않습니다.</p>
      <a href={`${GITHUB_URL}/blob/main/gas/standalone/v4자료이전.md`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">v4 연수·서명 자료 이전 안내</a>
    </section>
  );
}
