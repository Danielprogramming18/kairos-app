import React, { useState, useEffect, useMemo } from 'react';
import { X, CheckSquare, Bell, Sparkles, Clock, Calendar, Flag } from 'lucide-react';
import { Task } from '../types';
import {
  getTodayKey,
  getTomorrowKey,
  addDays,
  getDateKey,
  formatDateKeyToPersian,
  toPersianNum,
} from '../utils/persianDate';
import { parseNaturalTaskInput } from '../utils/nlpTaskParser';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

interface TaskModalProps {
  isOpen: boolean;
  taskToEdit: Task | null;
  defaultDateKey?: string;
  onClose: () => void;
  onSave: (taskData: {
    id?: string;
    title: string;
    description?: string;
    priority: number;
    duration: number;
    targetDate: string;
    reminderTime?: string;
    category?: string;
  }) => Promise<boolean> | boolean | void;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  taskToEdit,
  defaultDateKey,
  onClose,
  onSave,
}) => {
  const todayKey = getTodayKey();
  const tomorrowKey = getTomorrowKey();
  const dayAfterTomorrowKey = getDateKey(addDays(new Date(), 2));

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<number>(1);
  const [duration, setDuration] = useState<number>(45);
  const [targetDate, setTargetDate] = useState<string>(defaultDateKey || todayKey);
  const [reminderTime, setReminderTime] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const nlpPreview = useMemo(() => {
    if (!title.trim()) return null;
    const parsed = parseNaturalTaskInput(title);
    return parsed.hasExtractedTokens ? parsed : null;
  }, [title]);

  const handleApplyNlpPreview = () => {
    if (!nlpPreview) return;
    setTitle(nlpPreview.title);
    if (nlpPreview.extractedDateDetected) {
      setTargetDate(nlpPreview.targetDate);
    }
    if (nlpPreview.extractedDurationDetected) {
      setDuration(nlpPreview.duration);
    }
    if (nlpPreview.extractedPriorityDetected) {
      setPriority(nlpPreview.priority);
    }
    if (nlpPreview.extractedReminderDetected && nlpPreview.reminderTime) {
      setReminderTime(nlpPreview.reminderTime);
    }
  };

  useEffect(() => {
    setIsSaving(false);
    if (taskToEdit) {
      setTitle(taskToEdit.title);
      setDescription(taskToEdit.description || '');
      setPriority(taskToEdit.priority || 1);
      setDuration(taskToEdit.duration || 45);
      setTargetDate(taskToEdit.targetDate || todayKey);
      setReminderTime(taskToEdit.reminderTime || '');
    } else {
      setTitle('');
      setDescription('');
      setPriority(1);
      setDuration(45);
      setTargetDate(defaultDateKey || todayKey);
      setReminderTime('');
    }
  }, [taskToEdit, isOpen, defaultDateKey, todayKey]);

  const modalRef = useModalFocusTrap<HTMLDivElement>(
    isOpen,
    onClose,
    '#task-modal-title-input'
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSaving) return;

    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : todayKey;
    const trimmedReminder = reminderTime.trim();
    const validReminder = /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmedReminder)
      ? trimmedReminder
      : undefined;
    const validPriority = Math.max(1, Math.min(20, Math.round(Number(priority) || 1)));
    const validDuration = Math.max(1, Math.min(600, Math.round(Number(duration) || 45)));

    setIsSaving(true);
    try {
      const ok = await onSave({
        id: taskToEdit?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        priority: validPriority,
        duration: validDuration,
        targetDate: validDate,
        reminderTime: validReminder,
        category: 'work',
      });
      if (ok !== false) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <h3
            id="task-modal-title"
            className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2"
          >
            <CheckSquare className="w-5 h-5 text-indigo-500" />
            <span>{taskToEdit ? 'ویرایش کار' : 'ثبت کار جدید'}</span>
          </h3>
          <button
            type="button"
            aria-label="بستن پنجره"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="task-modal-title-input"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              عنوان کار *
            </label>
            <input
              id="task-modal-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: فردا ساعت ۵ عصر ۴۵ دقیقه مرور گزارش اولویت ۱"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />

            {nlpPreview && (
              <div
                data-testid="nlp-extraction-preview"
                className="mt-2.5 p-3 rounded-xl bg-indigo-50/90 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800/70 space-y-2 animate-fade-in"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    پیش‌نمایش استخراج از متن:
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyNlpPreview}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition cursor-pointer"
                  >
                    اعمال مقادیر استخراج‌شده
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200">
                    عنوان: {nlpPreview.title}
                  </span>
                  {nlpPreview.extractedDateDetected && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {nlpPreview.extractedDateLabel}
                    </span>
                  )}
                  {nlpPreview.extractedDurationDetected && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {toPersianNum(nlpPreview.duration)} دقیقه
                    </span>
                  )}
                  {nlpPreview.extractedReminderDetected && nlpPreview.reminderTime && (
                    <span className="px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300 font-bold flex items-center gap-1">
                      <Bell className="w-3 h-3" />
                      ساعت {toPersianNum(nlpPreview.reminderTime)}
                    </span>
                  )}
                  {nlpPreview.extractedPriorityDetected && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold flex items-center gap-1">
                      <Flag className="w-3 h-3" />
                      اولویت {toPersianNum(nlpPreview.priority)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              توضیحات و جزئیات (اختیاری)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="نکات تکمیلی یا گام‌های انجام کار..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          {/* Date Selector with Quick Presets + Custom Date */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              تاریخ انجام ({formatDateKeyToPersian(targetDate)})
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTargetDate(todayKey)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  targetDate === todayKey
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                امروز
              </button>
              <button
                type="button"
                onClick={() => setTargetDate(tomorrowKey)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  targetDate === tomorrowKey
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                فردا
              </button>
              <button
                type="button"
                onClick={() => setTargetDate(dayAfterTomorrowKey)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  targetDate === dayAfterTomorrowKey
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                پس‌فردا
              </button>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => e.target.value && setTargetDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                شمارهٔ اولویت
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                زمان (دقیقه)
              </label>
              <input
                type="number"
                min={1}
                max={600}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10) || 45)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                <Bell className="w-3.5 h-3.5 text-amber-500" />
                <span>ساعت یادآور</span>
              </label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full px-2.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition cursor-pointer"
            >
              {isSaving ? 'در حال ذخیره...' : 'ذخیرهٔ کار'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
