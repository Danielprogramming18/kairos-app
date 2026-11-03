import React from 'react';
import { Trash2 } from 'lucide-react';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

interface DeleteModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteModal: React.FC<DeleteModalProps> = ({
  isOpen,
  title,
  description,
  onClose,
  onConfirm,
}) => {
  const modalRef = useModalFocusTrap<HTMLDivElement>(
    isOpen,
    onClose,
    '[data-autofocus="cancel"]'
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 kairos-modal-backdrop animate-fade-in"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="kairos-modal-panel max-w-sm w-full p-6 text-center space-y-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <Trash2 className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 id="delete-modal-title" className="text-base font-black text-token-primary">
            {title}
          </h3>
          <p className="text-xs text-token-secondary leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            data-autofocus="cancel"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold kairos-btn-secondary transition cursor-pointer"
          >
            لغو
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition cursor-pointer"
          >
            بله، حذف شود
          </button>
        </div>
      </div>
    </div>
  );
};
