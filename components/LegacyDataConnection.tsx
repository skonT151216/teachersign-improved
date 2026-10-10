import React, { useRef, useState } from 'react';
import { findLegacyData, previewLegacyData, connectLegacyData, LegacySearch, LegacyPreview, LegacyResult, LegacyFile } from '../services/managedCloudService';

const modified = (value: string) => new Date(value).toLocaleDateString('ko-KR');
const button = 'rounded bg-blue-700 text-white px-4 py-3 disabled:opacity-50';
const Titles = ({ titles = [] }: { titles?: { title: string; date: string }[] }) => <ul className="text-sm text-gray-600 mt-2 space-y-1">{titles.map((item, i) => <li key={i}>{item.date} {item.title}</li>)}</ul>;
const FileLink = ({ file }: { file: LegacyFile }) => <a className="text-blue-700 underline text-sm" href={`https://drive.google.com/file/d/${encodeURIComponent(file.fileId)}/view`} target="_blank" rel="noopener noreferrer">Drive에서 파일 확인</a>;

export default function LegacyDataConnection({ onComplete, onBusyChange }: { onComplete: () => void; onBusyChange: (busy: boolean) => void }) {
  const [search, setSearch] = useState<LegacySearch | null>(null);
  const [dbFileId, setDb] = useState('');
  const [signatureFileId, setSheet] = useState('');
  const [preview, setPreview] = useState<LegacyPreview | null>(null);
  const [result, setResult] = useState<LegacyResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const run = async (message: string, action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(message); onBusyChange(true); setError('');
    try { await action(); }
    catch (e) {
      const text = (e as Error).message;
      setError(text.startsWith('[ERR-ACTION]') ? '이 기능은 학교 GAS v5.3.0부터 사용할 수 있습니다. 최신 Code.gs와 Index.html을 교체하고 기존 웹앱을 새 버전으로 배포해 주세요.' : text);
    } finally { lock.current = false; setBusy(''); onBusyChange(false); }
  };
  const reset = () => { setPreview(null); setConfirmed(false); setError(''); };
  const blocked = search && (search.completed || search.current.sessions > 0 || search.current.signatures > 0);
  return <section className="space-y-5" aria-label="기존 자료 연결">
    <h2 className="text-xl font-bold">기존 자료 연결 · 세 단계</h2>
    <p className="text-sm text-gray-600">기존 자료를 보관한 Google 계정으로 이 학교의 GAS를 배포해야 합니다. 처음 연결할 때만 사용하세요.</p>
    {result ? <div className="rounded-xl border border-green-300 bg-green-50 p-5 space-y-3" role="status">
      <h3 className="text-lg font-bold">연결 완료</h3>
      <p>연수 {result.sessions}개 · 서명 {result.signatures}개</p>
      <p className="text-sm">원본과 이전 연결 파일을 보존하고 자동 백업을 만들었습니다. 관리자 계정과 학교 접속 주소는 그대로입니다.</p>
      <p className="text-sm">연수 목록에서 내용을 확인한 뒤, 참여자에게 새 QR·서명 링크를 배포하세요.</p>
      <button className={button} onClick={onComplete}>연수 목록 확인</button>
    </div> : <>
      <div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-bold">1. 기존 파일 찾기</h3>
        <p className="text-sm">Drive의 TrainingApp_DB.json과 TrainingApp_Signatures를 찾습니다.</p>
        <button className={button} disabled={!!busy} onClick={() => void run('기존 파일을 찾는 중…', async () => { reset(); setSearch(await findLegacyData()); setDb(''); setSheet(''); })}>{search ? '다시 찾기' : '기존 파일 찾기'}</button>
        {search && <p className="text-sm">현재 연결된 자료: 연수 {search.current.sessions}개 · 서명 {search.current.signatures}개</p>}
      </div>
      {blocked ? <p role="status" className="border rounded bg-amber-50 p-4">{search?.completed ? '이미 기존 자료를 연결했습니다. 돌아가서 연수 목록을 확인하세요.' : '현재 저장소에 자료가 있어 연결을 중단했습니다. 두 자료를 보존한 채 별도 병합이 필요합니다.'}</p> : search && <>
        {search.truncated && <p role="status" className="text-amber-800">후보가 많아 파일 종류별로 30개까지만 표시합니다. 찾는 파일이 없으면 담당자에게 문의하세요.</p>}
        <div className="border rounded-xl p-4 space-y-4">
          <h3 className="font-bold">2. 우리 학교 자료 선택·확인</h3>
          <p className="text-sm">연수 제목·개수와 폴더를 보고 선택하세요. 같은 이름의 다른 학교 파일이 있을 수 있습니다.</p>
          <fieldset disabled={!!busy} className="space-y-2">
            <legend className="font-semibold mb-2">연수 파일</legend>
            {search.databases.length === 0 && <p className="text-sm">기존 연수 파일이 없습니다. 배포한 Google 계정과 파일 이름을 확인하세요.</p>}
            {search.databases.map(file => <div key={file.fileId} className="border rounded p-3 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input className="mt-1" type="radio" name="legacy-db" value={file.fileId} checked={dbFileId === file.fileId} disabled={!file.readable || !file.sessions} onChange={() => { setDb(file.fileId); reset(); }} />
                <span><strong>{file.name}</strong><span className="block text-sm">{file.folder} · 수정 {modified(file.modifiedAt)}</span><span className="block text-sm">{file.readable ? `연수 ${file.sessions}개 · 파일 안의 서명 ${file.embeddedSignatures}개` : '형식을 읽지 못한 파일입니다.'}</span><Titles titles={file.titles} /></span>
              </label>
              <FileLink file={file} />
            </div>)}
          </fieldset>
          <fieldset disabled={!!busy} className="space-y-2">
            <legend className="font-semibold mb-2">서명 파일</legend>
            {search.sheets.map(file => <div key={file.fileId} className="border rounded p-3 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer"><input className="mt-1" type="radio" name="legacy-sheet" value={file.fileId} checked={signatureFileId === file.fileId} disabled={!file.readable} onChange={() => { setSheet(file.fileId); reset(); }} /><span><strong>{file.name}</strong><span className="block text-sm">{file.folder} · 수정 {modified(file.modifiedAt)} · {file.readable ? `서명 기록 ${file.rows}개` : '형식을 읽지 못한 파일입니다.'}</span></span></label>
              <FileLink file={file} />
            </div>)}
            <label className="flex items-start gap-3 border rounded p-3 cursor-pointer"><input className="mt-1" type="radio" name="legacy-sheet" value="NONE" checked={signatureFileId === 'NONE'} onChange={() => { setSheet('NONE'); reset(); }} /><span>별도 서명 파일 없음<span className="block text-sm text-gray-600">모든 서명이 연수 파일 안에 있는 경우에만 선택하세요. 서명 파일이 있으면 위에서 선택하세요.</span></span></label>
          </fieldset>
          <button className={button} disabled={!!busy || !dbFileId || !signatureFileId} onClick={() => void run('선택한 자료를 확인하는 중…', async () => { reset(); setPreview(await previewLegacyData(dbFileId, signatureFileId)); })}>선택한 자료 확인</button>
        </div>
        {preview && <div className="border border-blue-300 bg-blue-50 rounded-xl p-4 space-y-4">
          <h3 className="font-bold">3. 이 자료 사용하기</h3>
          <p className="text-lg font-bold">연수 {preview.sessions}개 · 서명 {preview.signatures}개</p>
          <p className="text-sm">연수 파일: {preview.database.folder} / {preview.database.name}<br />서명 파일: {preview.signatureFile ? `${preview.signatureFile.folder} / ${preview.signatureFile.name}` : '없음 (연수 파일 안의 서명만 사용)'}</p>
          <Titles titles={preview.titles} />
          <p className="text-sm">자동 백업 후 복사본을 만들고 검증하여 연결합니다. 원본은 수정하지 않습니다. 연결 도중에는 기존 앱에서 연수·서명을 저장하지 마세요.</p>
          <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={confirmed} disabled={!!busy} onChange={e => setConfirmed(e.target.checked)} /><span className="text-sm">우리 학교 자료와 개수를 확인했고, 기존 앱에서의 저장을 멈췄습니다.</span></label>
          <button className={button} disabled={!!busy || !confirmed} onClick={() => void run('백업·복사·검증 후 연결하는 중… 잠시 기다려 주세요.', async () => { setResult(await connectLegacyData(preview.ticket)); })}>이 자료 사용하기</button>
        </div>}
      </>}
    </>}
    {busy && <p role="status" className="font-semibold text-blue-800">{busy}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
  </section>;
}
