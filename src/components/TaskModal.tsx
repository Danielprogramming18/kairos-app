import React, { useState, useEffect } from 'react';
import { X, CheckSquare, Bell } from 'lucide-react';
import { Task } from '../types';
import {
  getTodayKey,
  getTomorrowKey,
  addDays,
  getDateKey,
  formatDateKeyToPersian,
} from '../utils/persianDate';

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
  }) => void;
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

  useEffect(() => {
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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: taskToEdit?.id,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      duration,
      targetDate,
      reminderTime: reminderTime.trim() || undefined,
      category: 'work',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-indigo-500" />
            <span>{taskToEdit ? 'ویرایش مأموریت' : 'ثبت مأموریت جدید'}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              عنوان کار *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: دیدن ۴۵ دقیقه دوره CSS یا طراحی بنر ایتا"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              توضیحات و جزئیات (اختیاری)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثلاً: تمرین فلکس‌باکس و پیاده‌سازی روی فرم CRM..."
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
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
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
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
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
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
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
                شماره اولویت
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
                min={5}
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
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/25 transition"
            >
              ذخیره مأموریت
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
