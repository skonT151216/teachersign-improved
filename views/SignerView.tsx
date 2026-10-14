import React from 'react';
import { Staff, TrainingSession, CloudConfig } from '../types';

interface ManualInput {
    department: string;
    position: string;
    name: string;
}

interface ParentsInput {
    grade: string;
    classNumber: string;
    childName: string;
    parentName: string;
}

interface SignerViewProps {
    isLoading: boolean;
    sessions: TrainingSession[];
    selectedSessionId: string | null;
    onSelectSession: (id: string | null) => void;
    cloudConfig: CloudConfig;
    onReloadSessions: () => void;
    isLinkAccess: boolean;

    // Auth gate
    isSessionAuthenticated: boolean;
    authInput: string;
    onChangeAuthInput: (v: string) => void;
    authError: boolean;
    onAuthSubmit: (e: React.FormEvent) => void;

    // School (staff list) mode
    searchTerm: string;
    onChangeSearchTerm: (v: string) => void;
    onSelectStaff: (staff: Staff) => void;

    // Parents mode
    parentsInput: ParentsInput;
    onChangeParentsInput: (next: ParentsInput) => void;
    onParentsInfoSubmit: (e: React.FormEvent) => void;

    // Office mode
    manualInput: ManualInput;
    onChangeManualInput: (next: ManualInput) => void;
    onOfficeInfoSubmit: (e: React.FormEvent) => void;
}

const SignerView: React.FC<SignerViewProps> = (props) => {
    const {
        isLoading, sessions, selectedSessionId, onSelectSession,
        cloudConfig, onReloadSessions, isLinkAccess,
        isSessionAuthenticated, authInput, onChangeAuthInput, authError, onAuthSubmit,
        searchTerm, onChangeSearchTerm, onSelectStaff,
        parentsInput, onChangeParentsInput, onParentsInfoSubmit,
        manualInput, onChangeManualInput, onOfficeInfoSubmit,
    } = props;

    if (isLoading && sessions.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-600 font-bold">연수 정보를 불러오는 중입니다...</p>
            </div>
        );
    }

    if (!selectedSessionId) {
        return (
            <div className="min-h-screen bg-gray-100 p-4">
                <h1 className="text-xl font-bold mb-6 text-center text-gray-800">서명할 연수 선택</h1>
                <div className="grid gap-4 max-w-lg mx-auto">
                    {sessions.map(s => (
                        <button key={s.id} onClick={() => onSelectSession(s.id)} className="bg-white p-6 rounded-xl shadow-md text-left active:scale-95 transition-all border-l-4 border-blue-500 hover:bg-blue-50">
                            <div className="text-xs text-gray-500 mb-1 font-bold">{s.date}</div>
                            <h3 className="text-lg font-bold text-gray-800">{s.title}</h3>
                            <p className="text-sm text-gray-600">{s.schoolName}</p>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    const session = sessions.find(s => s.id === selectedSessionId);
    if (!session) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 animate-fade-in">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
                    <div className="text-4xl mb-4">⌛</div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">연수 정보를 불러오지 못했습니다</h2>
                    <p className="text-sm text-gray-500 mb-6 break-keep">
                        현재 접속자가 많아 구글 서버 응답이 지연되고 있습니다.<br/><br/>
                        잠시 후 아래 버튼을 눌러 다시 시도해주세요. (계속 실패하면 페이지 새로고침을 해주세요)
                    </p>
                    <button
                        onClick={onReloadSessions}
                        className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 hover:bg-blue-700 transition-all"
                    >
                        연수 정보 다시 불러오기
                    </button>
                    <div className="mt-4">
                        <button
                            onClick={() => window.location.reload()}
                            className="text-sm font-bold text-gray-400 hover:text-gray-600 underline"
                        >
                            그래도 안되면 여기를 눌러 새로고침
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if ((session.authRequired || session.authCode) && !isSessionAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl animate-pop-in">
                    <h2 className="text-2xl font-bold mb-2 text-center text-gray-800">{session.title}</h2>
                    <p className="text-sm text-gray-500 mb-6 text-center">{session.schoolName} | {session.date}</p>

                    <div className="space-y-4">
                        <div className="bg-blue-50 p-4 rounded-xl text-center">
                            <p className="text-blue-700 font-bold">인증 비밀번호를 입력해주세요.</p>
                        </div>

                        <form onSubmit={onAuthSubmit}>
                            <input
                                type="tel"
                                value={authInput}
                                onChange={e => onChangeAuthInput(e.target.value)}
                                className={`w-full text-center text-4xl font-bold py-4 border-2 rounded-xl mb-4 outline-none transition-colors bg-white text-gray-900 ${authError ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-blue-500'}`}
                                placeholder="****"
                                autoFocus
                            />
                            {authError && <p className="text-red-500 text-xs text-center mb-4 font-bold">비밀번호가 일치하지 않습니다.</p>}

                            <div className="flex gap-2">
                                {!isLinkAccess && (
                                    <button type="button" onClick={() => onSelectSession(null)} className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-xl active:scale-95 transition-all">뒤로가기</button>
                                )}
                                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all">확인</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    if (session.type === 'school') {
        const filtered = session.staffList.filter(s => s.name.includes(searchTerm) || s.department.includes(searchTerm));
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col animate-fade-in">
                <div className="bg-white p-4 shadow flex-none sticky top-0 z-10">
                    <div className="flex items-center mb-4">
                        <button onClick={() => !isLinkAccess && onSelectSession(null)} className="p-2 text-xl active:scale-90 transition-transform text-gray-800">⬅️</button>
                        <h2 className="font-bold flex-1 text-center truncate px-2 text-gray-800">{session.title}</h2>
                    </div>
                    <div className="relative">
                        <input type="text" className="w-full p-3 bg-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500" placeholder="성명 검색" value={searchTerm} onChange={e => onChangeSearchTerm(e.target.value)} />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {filtered.map(staff => {
                        const isSigned = session.signatures.some(sig => sig.staffId === staff.id);
                        return (
                            <button key={staff.id} onClick={() => onSelectStaff(staff)} className={`w-full p-4 rounded-xl shadow-sm flex justify-between items-center transition-all active:scale-95 active:bg-gray-100 ${isSigned ? 'bg-green-50 border border-green-200' : 'bg-white border border-transparent'}`}>
                                <div className="text-left flex-1 min-w-0">
                                    <p className={`font-bold text-lg leading-tight whitespace-normal break-words ${isSigned ? 'text-green-800' : 'text-gray-800'}`}>{staff.name}</p>
                                    <p className="text-sm text-gray-500 leading-tight whitespace-normal break-words">{staff.department}</p>
                                </div>
                                {isSigned && <span className="text-green-600 font-bold flex items-center gap-1">서명완료</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (session.type === 'parents') {
        const grades = session.parentGrades && session.parentGrades.length > 0 ? session.parentGrades : ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'];
        const classes = session.parentClasses && session.parentClasses.length > 0 ? session.parentClasses : ['1반', '2반', '3반', '4반', '5반'];
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl animate-pop-in">
                    <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 border-b pb-4">{session.title}</h2>
                    <form onSubmit={onParentsInfoSubmit} className="space-y-4">
                        <div className="relative">
                            <select
                                value={parentsInput.grade}
                                onChange={e => onChangeParentsInput({ ...parentsInput, grade: e.target.value })}
                                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 appearance-none cursor-pointer"
                                required
                            >
                                <option value="" disabled className="text-gray-400">학년 선택</option>
                                {grades.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">▼</div>
                        </div>
                        <div className="relative">
                            <select
                                value={parentsInput.classNumber}
                                onChange={e => onChangeParentsInput({ ...parentsInput, classNumber: e.target.value })}
                                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 appearance-none cursor-pointer"
                                required
                            >
                                <option value="" disabled className="text-gray-400">반 선택</option>
                                {classes.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">▼</div>
                        </div>
                        <input type="text" value={parentsInput.childName} onChange={e => onChangeParentsInput({ ...parentsInput, childName: e.target.value })} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" placeholder="자녀이름 입력" required />
                        <input type="text" value={parentsInput.parentName} onChange={e => onChangeParentsInput({ ...parentsInput, parentName: e.target.value })} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" placeholder="학부모 이름 입력" required />
                        <button type="submit" className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 active:bg-blue-700 transition-all mt-2">확인 및 서명</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl animate-pop-in">
                <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 border-b pb-4">{session.title}</h2>
                <form onSubmit={onOfficeInfoSubmit} className="space-y-4">
                    <input type="text" value={manualInput.department} onChange={e => onChangeManualInput({ ...manualInput, department: e.target.value })} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" placeholder="소속 입력" required />
                    <input type="text" value={manualInput.position} onChange={e => onChangeManualInput({ ...manualInput, position: e.target.value })} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" placeholder="직위 입력" required />
                    <input type="text" value={manualInput.name} onChange={e => onChangeManualInput({ ...manualInput, name: e.target.value })} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900 placeholder-gray-400" placeholder="성명 입력" required />
                    <button type="submit" className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg active:scale-95 active:bg-blue-700 transition-all">확인 및 서명</button>
                </form>
            </div>
        </div>
    );
};

export default SignerView;
