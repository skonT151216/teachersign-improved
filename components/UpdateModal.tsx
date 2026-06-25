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
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-pop-in relative border-4 border-blue-100">
                <div className="absolute top-0 right-0 bg-red-500 text-white font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl text-sm animate-pulse">필독</div>
                <h3 className="text-xl font-bold mb-4 text-gray-800 text-center">&lt;교직원 연수 등록부 {appVersion} 업데이트&gt;</h3>

                <div className="bg-blue-50/70 p-4 rounded-xl mb-6 text-gray-700 text-[15px] leading-relaxed space-y-3 border border-blue-200 break-keep">
                    <div>
                        <span className="font-extrabold text-red-600 text-base block mb-0.5">1. 구글 Apps Script 코드를 3.1버전으로 업데이트 필수!</span>
                        <span className="text-gray-500 text-xs">(구글 드라이브 연동 설정에서 Version 3.1 코드를 복사하여 구글 스크립트에 덮어쓰고 꼭 '새 배포' 해주세요. 서명을 별도 구글 시트에 저장하도록 바뀌어서, 동시에 여러 명이 서명해도 훨씬 빠르고 안정적으로 처리됩니다. ※ 3.0에서 서명자 이름/소속이 빈 값으로 저장되는 버그가 있었는데 3.1에서 수정되었고, 기존에 비어버린 이름도 자동으로 복구해서 보여줍니다. 배포 시 구글 시트 접근 권한 동의가 새로 뜰 수 있습니다.)</span>
                    </div>
                    <div className="font-bold text-gray-800">
                        2. 직위 순서 변경을 드래그 앤 드롭으로 간편하게! (화살표를 여러 번 누르지 않고, 항목을 끌어다 원하는 위치에 놓으면 순서가 바로 바뀝니다)
                    </div>
                    <div className="font-bold text-gray-800">
                        3. '부장급 묶어서 이동' 토글 추가 (켜면 부장 직위가 화살표/드래그 시 전체가 함께 이동, 끄면 부장 직위도 개별로 자유롭게 이동 가능)
                    </div>
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
