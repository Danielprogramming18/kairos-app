import React, { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Task } from '../types';
import {
  toPersianNum,
  getTodayKey,
  getTomorrowKey,
  formatDateKeyToPersian,
} from '../utils/persianDate';

interface DeepFocusViewProps {
  tasks: Task[];
  selectedDateKey: string;
  onSelectDateKey: (dateKey: string) => void;
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Omit<Task, 'id' | 'completed'>) => void;
  onDeleteTask: (taskId: string) => void;
}

export const DeepFocusView: React.FC<DeepFocusViewProps> = ({
  tasks,
  selectedDateKey,
  onSelectDateKey,
  onToggleTask,
  onAddTask,
  onDeleteTask,
}) => {
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDuration, setQuickDuration] = useState(45);
  const [singleTaskMode, setSingleTaskMode] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);

  const todayKey = getTodayKey();
  const tomorrowKey = getTomorrowKey();

  const dayTasks = tasks
    .filter((t) => {
      if (selectedDateKey === todayKey) {
        return t.targetDate <= todayKey;
      }
      return t.targetDate === selectedDateKey;
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.priority || 99) - (b.priority || 99);
    });

  const completedCount = dayTasks.filter((t) => t.completed).length;
  const totalCount = dayTasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  let visibleTasks = hideCompleted ? dayTasks.filter((t) => !t.completed) : dayTasks;
  if (singleTaskMode) {
    const firstPending = dayTasks.find((t) => !t.completed);
    visibleTasks = firstPending ? [firstPending] : [];
  }

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed) return;

    const nextPriority = dayTasks.filter((t) => !t.completed).length + 1;
    onAddTask({
      title: trimmed,
      priority: nextPriority,
      duration: quickDuration || 45,
      targetDate: selectedDateKey,
      category: 'work',
    });
    setQuickTitle('');
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-2">
      {/* Minimalist Zen Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 shadow-sm space-y-8">
        {/* Clean Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              تمرکز عمیق
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateKeyToPersian(selectedDateKey)} — محیط ایزوله بدون حواس‌پرتی بصری
            </p>
          </div>

          {/* Simple Date & Mode Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectDateKey(todayKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedDateKey === todayKey
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              امروز
            </button>
            <button
              type="button"
              onClick={() => onSelectDateKey(tomorrowKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedDateKey === tomorrowKey
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              فردا
            </button>
            <button
              type="button"
              onClick={() => setSingleTaskMode(!singleTaskMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                singleTaskMode
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              {singleTaskMode ? 'حالت تک‌کاره: فعال' : 'حالت تک‌کاره'}
            </button>
            <button
              type="button"
              onClick={() => setHideCompleted(!hideCompleted)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                hideCompleted
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              {hideCompleted ? 'نمایش انجام‌شده‌ها' : 'مخفی کردن انجام‌شده‌ها'}
            </button>
          </div>
        </div>

        {/* Subtle Progress Line */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>پیشرفت لیست</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {toPersianNum(completedCount)} از {toPersianNum(totalCount)} ({toPersianNum(progressPct)}٪)
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-800 dark:bg-slate-200 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Minimal Quick Add Form */}
        <form onSubmit={handleQuickAdd} className="flex items-center gap-2">
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder="افزودن کار جدید و فشردن Enter..."
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-slate-500 transition"
          />
          <select
            value={quickDuration}
            onChange={(e) => setQuickDuration(Number(e.target.value))}
            aria-label="مدت زمان کار"
            className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value={15}>{toPersianNum(15)} دقیقه</option>
            <option value={30}>{toPersianNum(30)} دقیقه</option>
            <option value={45}>{toPersianNum(45)} دقیقه</option>
            <option value={60}>{toPersianNum(60)} دقیقه</option>
            <option value={90}>{toPersianNum(90)} دقیقه</option>
          </select>
          <button
            type="submit"
            disabled={!quickTitle.trim()}
            aria-label="افزودن کار در تمرکز عمیق"
            className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold disabled:opacity-40 hover:opacity-90 active:scale-95 transition flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            <span>ثبت</span>
          </button>
        </form>

        {/* Pure Distraction-Free Task List */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {visibleTasks.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
              {totalCount > 0 && completedCount === totalCount
                ? 'تمام کارهای این روز انجام شده‌اند.'
                : 'لیست خالی است. کار مورد نظر خود را بالا بنویسید.'}
            </div>
          ) : (
            visibleTasks.map((task, index) => (
              <div
                key={task.id}
                className="py-4 flex items-center justify-between gap-4 group transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onToggleTask(task.id)}
                  className="flex items-start gap-3.5 text-right flex-1 min-w-0 cursor-pointer"
                >
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                      task.completed
                        ? 'bg-slate-800 border-slate-800 dark:bg-slate-200 dark:border-slate-200 text-white dark:text-slate-900'
                        : 'border-slate-300 dark:border-slate-600 group-hover:border-slate-500'
                    }`}
                  >
                    {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-xs font-bold tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                        {toPersianNum(task.priority || index + 1)}.
                      </span>
                      <span
                        className={`text-base font-medium leading-snug transition-all ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </span>
                    </div>

                    {task.description && task.description !== '-' && (
                      <p
                        className={`text-xs mt-1 pr-5 ${
                          task.completed
                            ? 'line-through text-slate-400/70 dark:text-slate-600'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {task.description}
                      </p>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  {task.reminderTime && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      ساعت {toPersianNum(task.reminderTime)}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {toPersianNum(task.duration)} دقیقه
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs text-slate-400 hover:text-rose-500 transition px-1.5 py-0.5"
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
