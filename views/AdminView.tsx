import React from 'react';
import { Staff, TrainingSession, ViewMode, CloudConfig, SessionType } from '../types';

interface AdminViewProps {
    onNavigate: (mode: ViewMode) => void;

    // Staff list management
    globalStaffList: Staff[];
    onResetStaffList: () => void;
    onDownloadTemplate: () => void;
    onGlobalStaffUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

    // New session form
    newSessionType: SessionType;
    onChangeSessionType: (type: SessionType) => void;
    newTitle: string;
    onChangeTitle: (v: string) => void;
    newSchool: string;
    onChangeSchool: (v: string) => void;
    newDate: string;
    onChangeDate: (v: string) => void;
    newTime: string;
    onChangeTime: (v: string) => void;
    newParentGrades: string;
    onChangeParentGrades: (v: string) => void;
    newParentClasses: string;
    onChangeParentClasses: (v: string) => void;
    enableAuth: boolean;
    onChangeEnableAuth: (v: boolean) => void;
    newAuthCode: string;
    onChangeAuthCode: (v: string) => void;
    onCreateSession: (e: React.FormEvent) => void;

    // Session list
    isLoading: boolean;
    isBulkExporting: boolean;
    sessions: TrainingSession[];
    selectedAdminSessions: Set<string>;
    onChangeSelectedAdminSessions: (next: Set<string>) => void;
    onBulkDelete: () => void;
    cloudConfig: CloudConfig;
    onRefresh: () => void;
    onEditTitle: (info: { id: string; title: string }) => void;
    onShare: (session: TrainingSession) => void;
    onOpenSessionStaffUpdate: (sessionId: string) => void;
    onViewReport: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;

    // Hidden file input for per-session staff update
    sessionFileInputRef: React.RefObject<HTMLInputElement>;
    onSessionStaffUpdate: (e: React.ChangeEvent<HTMLInputElement>) => void;

    // Share modal
    shareModalSession: TrainingSession | null;
    onCloseShareModal: () => void;
    getShareUrl: (sessionId: string) => string;
    showNotification: (msg: string, type: 'success' | 'error') => void;
}

const AdminView: React.FC<AdminViewProps> = (props) => {
    const {
        onNavigate,
        globalStaffList, onResetStaffList, onDownloadTemplate, onGlobalStaffUpload,
        newSessionType, onChangeSessionType,
        newTitle, onChangeTitle,
        newSchool, onChangeSchool,
        newDate, onChangeDate,
        newTime, onChangeTime,
        newParentGrades, onChangeParentGrades,
        newParentClasses, onChangeParentClasses,
        enableAuth, onChangeEnableAuth,
        newAuthCode, onChangeAuthCode,
        onCreateSession,
        isLoading, isBulkExporting,
        sessions, selectedAdminSessions, onChangeSelectedAdminSessions,
        onBulkDelete, onRefresh,
        onEditTitle, onShare, onOpenSessionStaffUpdate, onViewReport, onDeleteSession,
        sessionFileInputRef, onSessionStaffUpdate,
        shareModalSession, onCloseShareModal, getShareUrl, showNotification,
    } = props;

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            <header className="bg-white shadow px-4 py-4 flex justify-between items-center sticky top-0 z-20">
                <h1 className="text-2xl font-bold text-gray-800">관리자 대시보드</h1>
                <div className="flex gap-2">
                    <button onClick={() => onNavigate('cloud_setup')} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-bold border border-blue-200 hover:bg-blue-100 transition-colors">구글 연동 설정</button>
                    <button onClick={() => onNavigate('landing')} className="text-gray-600 font-bold px-3 py-1.5">나가기</button>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                <input type="file" ref={sessionFileInputRef} className="hidden" onChange={onSessionStaffUpdate} accept=".xlsx,.xls,.csv,.txt" />

                {newSessionType === 'school' && (
                    <section className="bg-white rounded-xl shadow p-6 border-l-4 border-indigo-500 animate-fade-in">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">교직원 명단 관리 (학교용)</h2>
                        <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-4 rounded-lg">
                            <div className="flex-1">
                                <span className="font-bold text-gray-700 block">현재 등록된 교직원: <span className="text-indigo-600 font-extrabold text-lg">{globalStaffList.length}명</span></span>
                                <p className="text-[10px] text-gray-400 mt-1">※ 외부공개연수(교육청/타학교) 생성 시에는 명단이 필요하지 않습니다.</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={onResetStaffList}
                                    className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-bold bg-white hover:bg-red-50 transition-all active:scale-95 shadow-sm"
                                >
                                    명단 초기화
                                </button>
                                <button
                                    onClick={onDownloadTemplate}
                                    className="px-3 py-2 border border-green-600 text-green-700 rounded-lg text-sm font-bold bg-white hover:bg-green-50 transition-all active:scale-95 shadow-sm flex items-center gap-1"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    양식 다운로드
                                </button>
                                <label className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg cursor-pointer text-sm font-bold hover:bg-gray-50 transition-all active:scale-95 shadow-sm flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    명단 업로드 (Excel)
                                    <input type="file" onChange={onGlobalStaffUpload} className="hidden" accept=".xlsx,.xls,.csv,.txt" />
                                </label>
                            </div>
                        </div>
                    </section>
                )}

                <section className="bg-white rounded-xl shadow p-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">새 연수 등록</h2>
                    <form onSubmit={onCreateSession} className="space-y-4">
                        <div className="flex gap-4">
                            {(['school', 'office', 'parents'] as SessionType[]).map(type => (
                                <label key={type} className={`flex-1 p-3 rounded-lg border cursor-pointer text-center ${newSessionType === type ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'bg-white border-gray-200 text-gray-600'}`}>
                                    <input type="radio" checked={newSessionType === type} onChange={() => onChangeSessionType(type)} className="hidden" />
                                    {type === 'school' ? '🏫 학교용' : type === 'office' ? '🏢 외부공개' : '👨‍👩‍👧‍👦 학부모 연수'}
                                </label>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="text" value={newTitle} onChange={e => onChangeTitle(e.target.value)} placeholder="연수명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" />
                            <input type="text" value={newSchool} onChange={e => onChangeSchool(e.target.value)} placeholder="기관명" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" />
                            <input type="date" value={newDate} onChange={e => onChangeDate(e.target.value)} className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" />
                            <input type="text" value={newTime} onChange={e => onChangeTime(e.target.value)} placeholder="시간 (예: 15:00~17:00)" className="w-full p-2 border rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" />
                        </div>
                        {newSessionType === 'parents' && (
                            <div className="bg-green-50 p-4 rounded-lg border border-green-200 mt-4 animate-fade-in space-y-3">
                                <h3 className="text-sm font-bold text-green-800">학부모 선택 옵션 설정 (쉼표로 구분)</h3>
                                <div>
                                    <label className="block text-xs text-green-700 font-bold mb-1">학년 옵션</label>
                                    <input type="text" value={newParentGrades} onChange={e => onChangeParentGrades(e.target.value)} className="w-full p-2 border border-green-300 rounded outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-900 text-sm" placeholder="예: 1학년, 2학년, 3학년" />
                                </div>
                                <div>
                                    <label className="block text-xs text-green-700 font-bold mb-1">반 옵션</label>
                                    <input type="text" value={newParentClasses} onChange={e => onChangeParentClasses(e.target.value)} className="w-full p-2 border border-green-300 rounded outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-900 text-sm" placeholder="예: 1반, 2반, 3반, 4반, 5반" />
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-4 bg-gray-50 p-3 rounded">
                            <label className="flex items-center gap-2 font-bold text-sm cursor-pointer text-gray-800"><input type="checkbox" checked={enableAuth} onChange={e => onChangeEnableAuth(e.target.checked)} /> 인증 비밀번호 설정</label>
                            {enableAuth && <input type="text" value={newAuthCode} onChange={e => onChangeAuthCode(e.target.value)} placeholder="비밀번호" className="p-1 border rounded text-sm w-32 outline-none bg-white text-gray-900 placeholder-gray-400" />}
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all active:scale-95">연수 등록</button>
                    </form>
                </section>

                <section>
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-bold text-gray-800">등록된 연수 목록</h2>
                            {selectedAdminSessions.size > 0 && (
                                <div className="flex gap-2 animate-fade-in flex-wrap">
                                    <button onClick={onBulkDelete} disabled={isBulkExporting || isLoading} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-red-700 active:scale-95 transition-all">
                                        선택 삭제
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onRefresh}
                            className={`px-3 py-1.5 bg-white border border-blue-400 text-blue-600 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-50 transition-all active:scale-95 flex items-center gap-1 ${isLoading ? 'animate-pulse' : ''}`}
                        >
                            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            전체 새로고침
                        </button>
                    </div>
                    <div className="grid gap-4">
                        {sessions.length > 0 && (
                            <div className="flex justify-start">
                                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                                    <input
                                        type="checkbox"
                                        checked={sessions.length > 0 && selectedAdminSessions.size === sessions.length}
                                        onChange={(e) => {
                                            if (e.target.checked) onChangeSelectedAdminSessions(new Set(sessions.map(s => s.id)));
                                            else onChangeSelectedAdminSessions(new Set());
                                        }}
                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    /> 전체 목록 선택
                                </label>
                            </div>
                        )}
                        {sessions.map(session => (
                            <div key={session.id} className={`bg-white p-4 sm:p-6 rounded-xl shadow flex flex-col md:flex-row gap-4 border-2 transition-all ${selectedAdminSessions.has(session.id) ? 'border-blue-500 bg-blue-50/30' : 'border-transparent hover:border-blue-100'}`}>
                                <div className="flex items-start gap-4 flex-1">
                                    <input
                                        type="checkbox"
                                        checked={selectedAdminSessions.has(session.id)}
                                        onChange={(e) => {
                                            const newSet = new Set(selectedAdminSessions);
                                            if (e.target.checked) newSet.add(session.id);
                                            else newSet.delete(session.id);
                                            onChangeSelectedAdminSessions(newSet);
                                        }}
                                        className="w-5 h-5 mt-1 rounded text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800 flex-wrap">
                                            <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${session.type === 'office' ? 'bg-purple-50 border-purple-200 text-purple-600' : session.type === 'parents' ? 'bg-green-50 border-green-200 text-green-600' : 'bg-blue-50 border-blue-200 text-blue-600'}`}>{session.type === 'office' ? '외부' : session.type === 'parents' ? '학부모' : '학교'}</span>
                                            <span className="truncate" title={session.title}>{session.title}</span>
                                        </h3>
                                        <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                            <span>📅 {session.date}</span>
                                            <span>🏫 {session.schoolName}</span>
                                            <span className="text-blue-600 font-bold">✍️ {session.signatures.length}명 서명</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => onEditTitle({ id: session.id, title: session.title })} className="px-3 py-1.5 border border-gray-400 text-gray-600 rounded text-sm font-bold hover:bg-gray-50 active:scale-95 transition-all">제목 수정</button>
                                    <button onClick={onRefresh} className="px-3 py-1.5 border border-blue-400 text-blue-500 rounded text-sm font-bold hover:bg-blue-50 active:scale-95 transition-all">새로고침</button>
                                    <button onClick={() => onShare(session)} className="px-3 py-1.5 border border-green-600 text-green-600 rounded text-sm font-bold hover:bg-green-50 active:scale-95 transition-all">링크 공유</button>
                                    {session.type === 'school' && (
                                        <button onClick={() => onOpenSessionStaffUpdate(session.id)} className="px-3 py-1.5 border border-indigo-600 text-indigo-600 rounded text-sm font-bold hover:bg-indigo-50 active:scale-95 transition-all">명단 업데이트</button>
                                    )}
                                    <button onClick={() => onViewReport(session.id)} className="px-3 py-1.5 border border-blue-600 text-blue-600 rounded text-sm font-bold hover:bg-blue-50 active:scale-95 transition-all">결과 출력</button>
                                    <button onClick={() => onDeleteSession(session.id)} className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-sm hover:bg-red-50 active:scale-95 transition-all">삭제</button>
                                </div>
                            </div>
                        ))}
                        {sessions.length === 0 && !isLoading && (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
                                <p className="font-bold mb-2">현재 표시할 연수 목록이 없습니다.</p>
                                <p className="text-sm">서버 연결에 실패했거나, 아직 생성된 연수가 없습니다.<br/>위의 [전체 새로고침] 버튼을 눌러 다시 시도해보세요.</p>
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {shareModalSession && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onCloseShareModal}>
                    <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 text-center animate-pop-in" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800 mb-4">서명 링크 공유</h3>
                        <div className="bg-gray-100 p-4 rounded-lg mb-4 flex justify-center">
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getShareUrl(shareModalSession.id))}`} alt="QR" className="w-40 h-40" />
                        </div>
                        <div className="flex gap-2 mb-4">
                            <input readOnly value={getShareUrl(shareModalSession.id)} className="flex-1 bg-gray-50 border rounded px-2 py-1 text-xs truncate text-gray-900" />
                            <button onClick={() => { navigator.clipboard.writeText(getShareUrl(shareModalSession.id)); showNotification('복사됨', 'success'); }} className="bg-gray-200 px-2 rounded text-xs active:bg-gray-300 text-gray-800">복사</button>
                        </div>
                        <button onClick={onCloseShareModal} className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 active:scale-95 transition-all">닫기</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminView;
