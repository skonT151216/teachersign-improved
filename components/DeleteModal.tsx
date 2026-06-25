import React from 'react';

interface DeleteConfirmInfo {
    staffName: string;
    relatedSessionIds: string[];
}

interface DeleteModalProps {
    info: DeleteConfirmInfo | null;
    isLoading: boolean;
    onDeleteAll: () => void;
    onDeleteSingle: () => void;
    onCancel: () => void;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ info, isLoading, onDeleteAll, onDeleteSingle, onCancel }) => {
    if (!info) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl animate-pop-in">
                <h3 className="text-lg font-bold mb-2 text-gray-800">{info.staffName}님의 서명을 삭제하시겠습니까?</h3>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">같은 날 실시된 모든 연수의 서명을 한꺼번에 삭제하거나, 현재 보고 있는 연수의 서명만 개별 삭제할 수 있습니다.</p>
                <div className="flex flex-col gap-2">
                    {info.relatedSessionIds.length > 1 && (
                        <button onClick={onDeleteAll} disabled={isLoading} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-md active:scale-95 transition-all">전체 연수 서명 삭제</button>
                    )}
                    <button onClick={onDeleteSingle} disabled={isLoading} className="w-full py-3 border-2 border-red-200 text-red-600 rounded-xl font-bold active:scale-95 transition-all">현재 연수만 삭제</button>
                    <button onClick={onCancel} disabled={isLoading} className="w-full py-3 bg-gray-100 rounded-xl font-bold text-gray-600 mt-2 active:scale-95 transition-all">취소</button>
                </div>
            </div>
        </div>
    );
};

export default DeleteModal;
