import React from 'react';

interface EditModeSession {
    id: string;
    title: string;
}

interface EditTitleModalProps {
    session: EditModeSession | null;
    isLoading: boolean;
    onChange: (next: EditModeSession) => void;
    onCancel: () => void;
    onSubmit: (e: React.FormEvent) => void;
}

const EditTitleModal: React.FC<EditTitleModalProps> = ({ session, isLoading, onChange, onCancel, onSubmit }) => {
    if (!session) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
                <h3 className="text-xl font-bold text-center mb-4 text-gray-800">연수 제목 수정</h3>
                <form onSubmit={onSubmit}>
                    <input
                        type="text"
                        value={session.title}
                        onChange={e => onChange({ ...session, title: e.target.value })}
                        className="w-full text-center text-lg font-bold p-3 border-2 rounded-xl mb-4 outline-none transition-colors bg-white text-gray-900 border-gray-200 focus:border-blue-500"
                        autoFocus
                        placeholder="새 연수 제목 입력"
                    />
                    <div className="flex gap-2">
                        <button type="button" disabled={isLoading} onClick={onCancel} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600 active:scale-95 transition-all">취소</button>
                        <button type="submit" disabled={isLoading} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md active:scale-95 transition-all">저장</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditTitleModal;
