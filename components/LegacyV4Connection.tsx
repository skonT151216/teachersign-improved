import React, { useEffect, useRef, useState } from 'react';
import { TrainingSession } from '../types';
import { fetchAdminSessions } from '../services/cloudServiceV4';
import { schoolEndpoint } from '../services/schoolEndpoint.mjs';

interface LegacyV4ConnectionProps {
  endpoint: string;
  currentAdminKey: string;
  onSave: (adminKey: string, sessions: TrainingSession[]) => void;
  onCancel: () => void;
  onChangeSchool: () => void;
}

const LegacyV4Connection: React.FC<LegacyV4ConnectionProps> = ({ endpoint, currentAdminKey, onSave, onCancel, onChangeSchool }) => {
  const [adminKey, setAdminKey] = useState(currentAdminKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const url = schoolEndpoint(endpoint);
    if (!url || !adminKey.trim()) {
      setError('기존 학교의 관리자 연결키를 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const sessions = await fetchAdminSessions(url, adminKey.trim());
      if (active.current) onSave(adminKey.trim(), sessions);
    } catch (reason: any) {
      if (!active.current) return;
      setError(/ERR-ADMIN-(KEY|SETUP)/.test(reason?.message || '')
        ? '학교에서 사용하던 관리자 연결키와 일치하지 않습니다. 기존 값을 확인해주세요.'
        : reason?.message || '학교 서버에 연결하지 못했습니다. 잠시 후 다시 확인해주세요.');
    } finally { if (active.current) setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <section className="max-w-xl w-full bg-white rounded-2xl shadow p-6 space-y-5">
        <h1 className="text-2xl font-bold">기존 v4 구글 연동 설정</h1>
        <p className="text-gray-600">학교에서 사용하던 연결키로 기존 연수와 서명을 불러옵니다. 학교 자료는 그대로 유지됩니다.</p>
        <form onSubmit={connect} className="space-y-4">
          <label className="block">현재 학교 웹앱 주소
            <input value={endpoint} readOnly className="mt-2 w-full border rounded-lg p-3 bg-gray-50 text-sm" />
          </label>
          <label className="block">학교 관리자 연결키
            <input type="password" value={adminKey} onChange={event => setAdminKey(event.target.value)} autoComplete="off" disabled={busy} className="mt-2 w-full border rounded-lg p-3" />
          </label>
          <p className="text-sm text-gray-600">기존 Apps Script의 프로젝트 설정 → 스크립트 속성 → TEACHERSIGN_ADMIN_KEY에 보관된 값입니다.</p>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 font-bold disabled:opacity-60">{busy ? '기존 자료 확인 중…' : '기존 학교 연결'}</button>
        </form>
        <div className="flex flex-wrap gap-3">
          <button onClick={onCancel} disabled={busy} className="border rounded-lg px-4 py-2">돌아가기</button>
          <button onClick={onChangeSchool} disabled={busy} className="text-blue-700 underline">학교 주소 변경</button>
        </div>
      </section>
    </main>
  );
};

export default LegacyV4Connection;
