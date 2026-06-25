import React from 'react';
import { ViewMode } from '../types';

interface LandingViewProps {
    appVersion: string;
    cloudEnabled: boolean;
    onNavigate: (mode: ViewMode) => void;
}

const LandingView: React.FC<LandingViewProps> = ({ appVersion, cloudEnabled, onNavigate }) => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-indigo-600 p-4">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl max-w-md w-full text-center space-y-8 relative overflow-hidden">
            <div className="absolute top-5 right-6 bg-blue-50 text-blue-500 text-[10px] px-2 py-0.5 rounded border border-blue-100 font-bold z-10">
                {appVersion}
            </div>

            <div className="space-y-2 pt-4">
                <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight leading-tight">
                    교직원 연수 등록부<br />
                    <span className="text-blue-600">서명 도우미</span>
                </h1>
            </div>

            <div className="space-y-1">
                <p className="text-gray-700 font-bold text-lg">만든이 : 곤쌤</p>
                <p className="text-gray-400 text-xs leading-relaxed">
                    프로그램 관련 문의사항은 <br />
                    <a href="https://open.kakao.com/o/scEWSgwf" target="_blank" className="text-blue-400 underline font-bold">오픈카톡방</a>으로 문의주세요.
                </p>
            </div>

            <div className="space-y-4">
                <button onClick={() => onNavigate('signer')} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-xl shadow-xl hover:bg-blue-700 active:scale-95 transition-all">서명하기 (교직원용)</button>
                <button onClick={() => onNavigate('admin')} className="w-full py-5 bg-white border-2 border-gray-100 text-gray-600 rounded-2xl font-bold text-xl shadow-sm hover:bg-gray-50 active:scale-95 transition-all">관리자 모드</button>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <span className={`w-2 h-2 rounded-full ${cloudEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}></span>
                {cloudEnabled ? '구글 드라이브 동기화 중' : '로컬 저장소 사용 중'}
            </div>
        </div>
    </div>
);

export default LandingView;
