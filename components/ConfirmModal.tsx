import React from 'react';

export interface ConfirmRequest {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean; // true = red confirm button (destructive actions)
    onConfirm: () => void;
}

interface ConfirmModalProps {
    request: ConfirmRequest | null;
    onClose: () => void;
}

/**
 * Generic confirm modal used in place of window.confirm().
 * Keeps visual language consistent with the rest of the app (rounded-2xl,
 * animate-pop-in, etc.) instead of relying on the browser's native dialog.
 */
const ConfirmModal: React.FC<ConfirmModalProps> = ({ request, onClose }) => {
    if (!request) return null;

    const handleConfirm = () => {
        request.onConfirm();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl animate-pop-in">
                <h3 className="text-lg font-bold mb-2 text-gray-800">{request.title}</h3>
                {request.message && (
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed">{request.message}</p>
                )}
                <div className="flex gap-2 mt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600 active:scale-95 transition-all"
                    >
                        {request.cancelLabel || '취소'}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`flex-1 py-3 rounded-xl font-bold shadow-md active:scale-95 transition-all text-white ${
                            request.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                    >
                        {request.confirmLabel || '확인'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
