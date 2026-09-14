import React from 'react';

interface UpdateModalProps {
    show: boolean;
    appVersion: string;
    onClose: (dontShowAgain: boolean) => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ show, appVersion, onClose }) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[300] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-pop-in relative border-4 border-blue-100">
                <div className="absolute top-0 right-0 bg-red-500 text-white font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl text-sm animate-pulse">필독</div>
                <h3 className="text-xl font-bold mb-4 text-gray-800 text-center">&lt;교직원 연수 등록부 {appVersion} 업데이트&gt;</h3>

                <div className="bg-blue-50/70 p-4 rounded-xl mb-6 text-gray-700 text-sm leading-relaxed space-y-4 border border-blue-200 break-keep">
                    <div>
                        <span className="font-extrabold text-red-600 text-base block mb-1">기존 Google 연동 사용자는 서버 업데이트가 필요합니다.</span>
                        <span className="text-gray-600">관리자 화면의 <strong>[구글 연동 설정]</strong>에서 아래 순서대로 진행하세요.</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-2 bg-white p-3 rounded-lg border border-blue-100">
                        <li>v4.0 Apps Script 코드를 복사해 기존 코드를 교체하고 저장</li>
                        <li><strong>setupTeacherSign</strong> 함수를 한 번 실행해 관리자 연결키 발급</li>
                        <li>[배포 관리]에서 <strong>새 버전</strong>으로 웹앱 배포</li>
                        <li>웹앱 URL과 관리자 연결키를 입력하고 단계별 연동 테스트</li>
                        <li>기존 QR 대신 관리자 화면에서 새 참여 링크·QR 공유</li>
                    </ol>
                    <div className="space-y-2">
                        <p className="font-bold text-gray-800">업데이트 내용</p>
                        <p>• 교직원은 종전처럼 별도 로그인 없이 QR로 접속해 한 번만 서명합니다.</p>
                        <p>• 공유 링크에서는 관리자 기능과 다른 사람의 서명 이미지를 볼 수 없습니다.</p>
                        <p>• 행사 수정·삭제·전체 자료 조회는 관리자 연결키가 있는 담당자 기기에서만 가능합니다.</p>
                        <p>• 같은 서명을 다시 전송해도 중복 행이 생기지 않고 최신 서명으로 교체됩니다.</p>
                        <p>• 연동 테스트가 웹앱·서버 버전·저장소·관리자 권한을 단계별로 알려줍니다.</p>
                    </div>
                    <p className="text-xs text-gray-500">학교마다 기존처럼 자신의 Google 계정에 Apps Script를 배포하고 자료를 보관합니다. 관리자 연결키는 QR에 포함되지 않습니다.</p>
                </div>

                <div className="flex flex-col gap-2">
                    <button onClick={() => onClose(true)} className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all text-base">
                        확인! (다시 보지 않기)
                    </button>
                    <button onClick={() => onClose(false)} className="w-full py-3 bg-gray-50 text-gray-500 rounded-xl font-bold hover:bg-gray-100 active:scale-95 transition-all text-sm">
                        닫기 (다음에 또 보기)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpdateModal;
