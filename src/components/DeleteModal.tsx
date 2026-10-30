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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4"
      >
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <Trash2 className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 id="delete-modal-title" className="text-base font-black text-slate-800 dark:text-white">
            {title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            data-autofocus="cancel"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
          >
            لغو
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/25 transition cursor-pointer"
          >
            بله، حذف شود
          </button>
        </div>
      </div>
    </div>
  );
};
