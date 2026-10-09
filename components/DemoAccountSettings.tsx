import React, { useEffect, useRef, useState } from 'react';
import { DemoAccount, getDemoAccount, updateDemoAccount } from '../services/managedCloudService';
import { DEMO_ACCOUNTS } from '../server/demo-fixtures.mjs';

export default function DemoAccountSettings() {
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [presetId, setPresetId] = useState('default');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  useEffect(() => { let active = true; getDemoAccount().then(value => { if (active) { setAccount(value); setPresetId(value.presetId); } }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  const current = DEMO_ACCOUNTS.find(item => item.id === account?.presetId);
  const next = DEMO_ACCOUNTS.find(item => item.id === presetId)!;
  const apply = async () => {
    if (lock.current || !account || !current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const value = await updateDemoAccount({ presetId, revision: account.revision, currentPassword: current.password });
      window.dispatchEvent(new CustomEvent('teachersign:account-changed', { detail: value }));
    } catch (error) { setError((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!account) return <p role={error ? 'alert' : 'status'}>{error || '관리자 계정 설정을 불러오는 중…'}</p>;
  return <section className="space-y-5">
    <h2 className="text-xl font-bold">관리자 계정 설정</h2>
    <p className="text-gray-600">이 앱은 학교 공통 관리자 아이디·암호로 로그인합니다. Google 계정과는 별개입니다.</p>
    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">가상 계정 설정 미리보기입니다. 준비된 예시만 선택할 수 있습니다. 운영에서는 담당자가 사용할 아이디·암호를 정하고 서버에 등록합니다.</div>
    <p>현재 관리자 아이디: <strong>{account.username}</strong></p>
    <label className="block font-medium">가상 계정 예시<select value={presetId} disabled={busy} onChange={event => { setPresetId(event.target.value); setConfirm(false); }} className="mt-2 border rounded p-3 w-full">{DEMO_ACCOUNTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <div className="grid sm:grid-cols-2 gap-4">
      <label className="block">변경할 아이디<input readOnly value={next.username} className="mt-2 border rounded p-3 w-full bg-gray-50" /></label>
      <label className="block">가상 새 암호<input readOnly value={next.password} className="mt-2 border rounded p-3 w-full bg-gray-50 font-mono text-sm" /></label>
    </div>
    <label className="block">현재 가상 암호 확인<input readOnly type="password" value={current?.password || ''} className="mt-2 border rounded p-3 w-full bg-gray-50" /></label>
    <p className="text-sm text-gray-600">적용하면 서버에서 현재 암호를 확인하고 새 암호를 해시로 저장합니다. 기존 관리자 세션은 모두 종료됩니다. Google 연결 설정과 연수는 유지됩니다.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={busy || presetId === account.presetId} onClick={() => setConfirm(true)} className="bg-indigo-700 text-white rounded px-4 py-3 disabled:opacity-50">가상 계정 적용</button>
    {confirm && <div role="alertdialog" aria-label="가상 관리자 계정 변경 확인" className="p-4 rounded border bg-indigo-50 space-y-3"><p><strong>{next.username}</strong> 계정으로 변경하고 로그아웃합니다. 위의 가상 새 암호로 다시 로그인하세요.</p><button disabled={busy} onClick={apply} className="rounded bg-indigo-700 text-white p-3">{busy ? '변경 중…' : '변경하고 다시 로그인'}</button><button disabled={busy} onClick={() => setConfirm(false)} className="ml-4">취소</button></div>}
  </section>;
}
