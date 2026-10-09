import React, { useState } from 'react';
import * as CloudService from '../services/cloudServiceV4';
import scriptCode from '../gas/legacy/TeacherSignV4.gs?raw';

interface CloudSetupProps {
  currentUrl: string;
  currentAdminKey: string;
  onSave: (url: string, adminKey: string) => void;
  onCancel: () => void;
}

const CloudSetupV4: React.FC<CloudSetupProps> = ({ currentUrl, currentAdminKey, onSave, onCancel }) => {
  const [url, setUrl] = useState(currentUrl);
  const [adminKey, setAdminKey] = useState(currentAdminKey);
  const [copyStatus, setCopyStatus] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [checks, setChecks] = useState<CloudService.ConnectionCheck[]>([]);

  const resetTest = () => {
    setTestStatus('idle');
    setTestMessage('');
    setChecks([]);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(scriptCode);
    setCopyStatus('v4.0 코드가 복사되었습니다. Apps Script의 기존 코드를 모두 바꾸세요.');
    window.setTimeout(() => setCopyStatus(''), 5000);
  };

  const handleTestConnection = async () => {
    if (!isUrlValid(url)) {
      setTestStatus('error');
      setTestMessage('배포된 웹앱 주소(/exec)를 확인하세요.');
      return;
    }
    if (!adminKey.trim()) {
      setTestStatus('error');
      setTestMessage('setupTeacherSign 실행 기록에서 관리자 연결키를 복사해 입력하세요.');
      return;
    }

    setTestStatus('loading');
    setTestMessage('웹앱·서버 버전·저장소·관리자 권한을 확인하고 있습니다...');
    setChecks([]);
    try {
      const result = await CloudService.testCloudConnection(url.trim(), adminKey.trim());
      setChecks(result.checks);
      setTestStatus('success');
      setTestMessage(`모든 검사 통과 · 등록된 연수 ${result.sessionCount}개`);
    } catch (error: any) {
      setChecks(error.checks || []);
      setTestStatus('error');
      setTestMessage(error.message || '연동 테스트에 실패했습니다.');
    }
  };

  const isUrlValid = (input: string) => /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(input.trim());
  const urlError = !url ? null : isUrlValid(url) ? null : "웹앱 URL은 https://script.google.com/macros/s/.../exec 형식이어야 합니다.";

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">구글 드라이브 연동 설정</h1>
            <p className="text-sm text-gray-500 mt-1">TeacherSign v4.0 · 교직원은 로그인 없이 QR로 서명합니다.</p>
          </div>
          <button onClick={onCancel} className="px-4 py-2 bg-white border rounded-lg text-gray-600 font-bold">닫기</button>
        </div>

        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 text-sm text-amber-900">
          <p className="font-bold mb-1">기존 사용 학교도 Apps Script를 v4.0으로 새 배포해야 합니다.</p>
          <p>학교마다 자신의 Google 계정과 저장 공간을 그대로 사용합니다. 관리자 연결키는 담당자 기기에만 저장하며, 교직원 공유 링크에는 포함되지 않습니다.</p>
        </div>

        <div className="space-y-6">
          <section className="bg-white p-6 rounded-xl border shadow-sm">
            <h2 className="font-bold text-lg text-blue-800 mb-3">1. Apps Script 코드 교체</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li><a href="https://script.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 underline">Google Apps Script</a>에서 기존 프로젝트를 엽니다.</li>
              <li>기존 코드를 모두 지우고 아래 v4.0 코드를 붙여넣은 뒤 저장합니다.</li>
            </ol>
            <div className="relative mt-4">
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-auto h-56 font-mono">{scriptCode}</pre>
              <button onClick={handleCopy} className="absolute top-2 right-2 bg-white text-gray-800 px-3 py-1.5 rounded text-xs font-bold">코드 복사</button>
            </div>
            {copyStatus && <p className="text-green-700 text-sm mt-2 font-bold">✓ {copyStatus}</p>}
          </section>

          <section className="bg-white p-6 rounded-xl border shadow-sm">
            <h2 className="font-bold text-lg text-blue-800 mb-3">2. 관리자 연결키 발급</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Apps Script 상단의 실행할 함수에서 <strong>setupTeacherSign</strong>을 선택하고 <strong>실행</strong>합니다.</li>
              <li>처음 한 번 나타나는 Drive·Sheets 권한 요청을 승인합니다.</li>
              <li>하단 <strong>실행 로그</strong>의 “관리자 연결키” 값을 복사합니다.</li>
            </ol>
            <p className="text-xs text-red-600 mt-3 font-bold">관리자 연결키는 학교 담당자만 보관하세요. QR·메신저·공개 문서에 넣지 마세요.</p>
          </section>

          <section className="bg-white p-6 rounded-xl border shadow-sm">
            <h2 className="font-bold text-lg text-blue-800 mb-3">3. 새 버전으로 웹앱 배포</h2>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-blue-50 p-3 rounded-lg"><span className="block text-xs text-gray-500">다음 사용자로 실행</span><strong>나 (Me)</strong></div>
              <div className="bg-blue-50 p-3 rounded-lg"><span className="block text-xs text-gray-500">액세스 권한</span><strong>모든 사용자 (Anyone)</strong></div>
            </div>
            <p className="text-sm text-gray-600 mt-3">[배포] → [배포 관리] → [수정] → 버전을 <strong>새 버전</strong>으로 선택해 배포한 후, 끝이 /exec인 웹앱 URL을 복사하세요.</p>
            <p className="text-xs text-gray-500 mt-2">‘모든 사용자’ 항목이 없는 학교 계정은 조직 정책에 의해 익명 웹앱이 제한된 것입니다. 이 경우 현재 방식의 무로그인 서명을 위해 개인 Google 계정으로 Apps Script를 배포해야 합니다.</p>
          </section>

          <section className="bg-white p-6 rounded-xl border-2 border-indigo-500 shadow-lg">
            <h2 className="font-bold text-lg text-indigo-800 mb-4">4. URL 입력 및 최종 연동 테스트</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold text-gray-700">웹앱 URL</span>
                <input value={url} onChange={event => { setUrl(event.target.value); resetTest(); }} placeholder="https://script.google.com/macros/s/.../exec" className="mt-1 w-full p-3 border rounded-lg font-mono text-sm bg-white text-gray-900" />
              </label>
              {urlError && <p className="text-red-600 text-xs font-bold">{urlError}</p>}
              <label className="block">
                <span className="text-sm font-bold text-gray-700">관리자 연결키</span>
                <input type="password" value={adminKey} onChange={event => { setAdminKey(event.target.value); resetTest(); }} placeholder="setupTeacherSign 실행 로그에서 복사" autoComplete="off" className="mt-1 w-full p-3 border rounded-lg font-mono text-sm bg-white text-gray-900" />
              </label>

              <button onClick={handleTestConnection} disabled={!isUrlValid(url) || !adminKey.trim() || testStatus === 'loading'} className="w-full sm:w-auto px-5 py-3 rounded-lg font-bold bg-green-600 text-white disabled:bg-gray-300">
                {testStatus === 'loading' ? '단계별 검사 중...' : '연동 테스트 실행'}
              </button>

              {checks.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-2">
                  {checks.map(check => (
                    <div key={check.id} className={`p-3 rounded-lg border text-sm ${check.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <p className={`font-bold ${check.ok ? 'text-green-800' : 'text-red-800'}`}>{check.ok ? '✓' : '✕'} {check.label}</p>
                      <p className="text-xs text-gray-600 mt-1">{check.message}</p>
                    </div>
                  ))}
                </div>
              )}
              {testStatus !== 'idle' && <p className={`text-sm font-bold ${testStatus === 'success' ? 'text-green-700' : testStatus === 'error' ? 'text-red-700' : 'text-indigo-700'}`}>{testMessage}</p>}
            </div>
          </section>

          <div className="flex justify-between items-center pb-8">
            <button onClick={onCancel} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold">취소</button>
            <button onClick={() => onSave(url.trim(), adminKey.trim())} disabled={testStatus !== 'success'} className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold shadow disabled:bg-gray-300">저장 및 완료</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudSetupV4;
