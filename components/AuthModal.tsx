import React from 'react';

interface AuthModalProps {
    isLoading: boolean;
    authInput: string;
    onChangeAuthInput: (v: string) => void;
    authError: boolean;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isLoading, authInput, onChangeAuthInput, authError, onSubmit, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
                <h3 className="text-xl font-bold text-center mb-4 text-gray-800">인증번호 입력</h3>
                <form onSubmit={onSubmit}>
                    <input
                        type="tel"
                        value={authInput}
                        onChange={e => onChangeAuthInput(e.target.value)}
                        className={`w-full text-center text-4xl font-bold py-4 border-2 rounded-xl mb-4 outline-none transition-colors bg-white text-gray-900 ${authError ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-blue-500'}`}
                        autoFocus
                    />
                    {authError && <p className="text-red-500 text-xs text-center mb-4 font-bold">인증번호가 일치하지 않습니다.</p>}
                    <div className="flex gap-2">
                        <button type="button" disabled={isLoading} onClick={onCancel} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600 active:scale-95 transition-all">취소</button>
                        <button type="submit" disabled={isLoading} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md active:scale-95 transition-all">확인</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AuthModal;
