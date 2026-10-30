import React, { useState } from 'react';
import {
  Target,
  Check,
  Clock,
  Timer,
  Plus,
  Sparkles,
  Eye,
  EyeOff,
  ListChecks,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Task } from '../types';
import { toPersianNum, getTodayKey, formatDateKeyToPersian } from '../utils/persianDate';

interface DeepFocusViewProps {
  tasks: Task[];
  onToggleTask: (id: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onStartFocusOnTask: (taskId: string, taskTitle: string, duration: number) => void;
  onOpenNewTaskModal: () => void;
}

export const DeepFocusView: React.FC<DeepFocusViewProps> = ({
  tasks,
  onToggleTask,
  onToggleSubtask,
  onAddSubtask,
  onStartFocusOnTask,
  onOpenNewTaskModal,
}) => {
  const [singleTaskMode, setSingleTaskMode] = useState(false);
  const [subtaskInputs, setSubtaskInputs] = useState<Record<string, string>>({});

  const todayKey = getTodayKey();

  // Only show tasks scheduled for today or overdue
  const relevantTasks = tasks
    .filter((t) => t.targetDate <= todayKey)
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const pendingTasks = relevantTasks.filter((t) => !t.completed);
  const completedTodayTasks = relevantTasks.filter((t) => t.completed);

  // The #1 Top Priority Task
  const theOneThing = pendingTasks[0] || null;
  const secondaryTasks = pendingTasks.slice(1);

  const handleAddSubtaskSubmit = (e: React.FormEvent, taskId: string) => {
    e.preventDefault();
    const val = subtaskInputs[taskId];
    if (!val || !val.trim()) return;
    onAddSubtask(taskId, val.trim());
    setSubtaskInputs((prev) => ({ ...prev, [taskId]: '' }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Focus Header */}
      <div className="bg-surface-1 p-5 sm:p-6 rounded-2xl border border-token-subtle shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold">
            <Target className="w-3.5 h-3.5" />
            <span>فهرست تمرکز امروز (تک‌کاره و کم‌حواس‌پرتی)</span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-token-primary">
            مهم‌ترین کار امروز شما چیست؟
          </h2>
          <p className="text-xs text-token-secondary leading-relaxed">
            تا زمانی که اولویت شماره ۱ به پایان نرسیده، ذهن خود را درگیر کارهای فرعی نکنید.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => setSingleTaskMode((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              singleTaskMode
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-surface-2 text-token-secondary border-token-subtle hover:text-token-primary'
            }`}
          >
            {singleTaskMode ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>نمایش فقط اولویت ۱: روشن</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>نمایش فقط اولویت ۱</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNewTaskModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-2 text-token-primary border border-token-subtle hover:opacity-90 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>کار جدید</span>
          </button>
        </div>
      </div>

      {/* Primary Hero Card: Priority #1 */}
      {theOneThing ? (
        <div className="bg-surface-1 p-6 sm:p-8 rounded-2xl border-2 border-indigo-500/50 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                اولویت شماره ۱ امروز
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-surface-2 text-token-secondary text-xs font-semibold flex items-center gap-1 tabular-nums">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                {toPersianNum(theOneThing.duration)} دقیقه
              </span>
              {theOneThing.targetDate < todayKey && (
                <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  عقب‌افتاده از {formatDateKeyToPersian(theOneThing.targetDate)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                onStartFocusOnTask(theOneThing.id, theOneThing.title, theOneThing.duration)
              }
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Timer className="w-4 h-4" />
              <span>شروع تایمر ({toPersianNum(theOneThing.duration)} دقیقه)</span>
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg sm:text-xl font-bold text-token-primary leading-snug">
              {theOneThing.title}
            </h3>
            {theOneThing.description && (
              <p className="text-xs sm:text-sm text-token-secondary leading-relaxed">
                {theOneThing.description}
              </p>
            )}
          </div>

          {/* Subtasks inside Priority #1 */}
          <div className="p-4 rounded-xl bg-surface-2/60 border border-token-subtle space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-token-secondary">
              <span className="flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-indigo-500" />
                <span>خرد کردن کار به قدم‌های کوچک:</span>
              </span>
              {theOneThing.subtasks && theOneThing.subtasks.length > 0 && (
                <span className="text-indigo-600 dark:text-indigo-400 tabular-nums">
                  {toPersianNum(theOneThing.subtasks.filter((s) => s.completed).length)} از{' '}
                  {toPersianNum(theOneThing.subtasks.length)} انجام شده
                </span>
              )}
            </div>

            {theOneThing.subtasks && theOneThing.subtasks.length > 0 && (
              <div className="space-y-1.5">
                {theOneThing.subtasks.map((st) => (
                  <div
                    key={st.id}
                    onClick={() => onToggleSubtask(theOneThing.id, st.id)}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-1 border border-token-subtle cursor-pointer hover:border-indigo-400 transition"
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        st.completed
                          ? 'bg-emerald-600 text-white'
                          : 'border border-slate-400'
                      }`}
                    >
                      {st.completed && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        st.completed
                          ? 'line-through text-token-muted'
                          : 'text-token-primary'
                      }`}
                    >
                      {st.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => handleAddSubtaskSubmit(e, theOneThing.id)}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={subtaskInputs[theOneThing.id] || ''}
                onChange={(e) =>
                  setSubtaskInputs((prev) => ({
                    ...prev,
                    [theOneThing.id]: e.target.value,
                  }))
                }
                placeholder="اولین قدم کوچک برای شروع این کار چیست؟ بنویسید..."
                className="flex-1 px-3 py-2 rounded-lg bg-surface-1 border border-token-subtle text-xs text-token-primary focus:outline-none"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                افزودن گام
              </button>
            </form>
          </div>

          <div className="pt-1 flex items-center justify-end">
            <button
              type="button"
              onClick={() => onToggleTask(theOneThing.id)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>این اولویت را کامل انجام دادم</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-surface-1 p-10 rounded-2xl border border-token-subtle text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-token-primary">
            تمام اولویت‌های امروز انجام شده‌اند!
          </h3>
          <p className="text-xs text-token-secondary max-w-md mx-auto">
            هیچ کار ناتمامی برای امروز باقی نمانده است. می‌توانید استراحت کنید یا اولویت‌های فردا را ثبت نمایید.
          </p>
        </div>
      )}

      {/* Next Priorities Queue (Hidden when Single-Task Mode is ON) */}
      {!singleTaskMode && secondaryTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-token-secondary">
              اولویت‌های بعدی امروز (پس از اتمام اولویت شماره ۱)
            </h3>
            <span className="text-[11px] text-token-muted tabular-nums">
              {toPersianNum(secondaryTasks.length)} کار در نوبت
            </span>
          </div>

          <div className="space-y-2">
            {secondaryTasks.map((task) => (
              <div
                key={task.id}
                className="p-4 rounded-xl bg-surface-1 border border-token-subtle flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onToggleTask(task.id)}
                    aria-label={`تکمیل کار ${task.title}`}
                    className="w-5 h-5 rounded-lg border-2 border-slate-300 dark:border-slate-600 hover:border-indigo-500 shrink-0 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 tabular-nums">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-2 text-token-secondary">
                        اولویت {toPersianNum(task.priority)}
                      </span>
                      <span className="text-[11px] text-token-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {toPersianNum(task.duration)} دقیقه
                      </span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-token-primary truncate">
                      {task.title}
                    </h4>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartFocusOnTask(task.id, task.title, task.duration)}
                  className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-indigo-600 hover:text-white text-token-secondary text-xs font-semibold transition shrink-0 cursor-pointer"
                >
                  تمرکز
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Today Summary */}
      {completedTodayTasks.length > 0 && (
        <div className="bg-surface-2/40 p-4 rounded-2xl border border-token-subtle space-y-2">
          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>کارهای تکمیل‌شدهٔ امروز ({toPersianNum(completedTodayTasks.length)})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {completedTodayTasks.map((t) => (
              <span
                key={t.id}
                onClick={() => onToggleTask(t.id)}
                className="text-xs line-through text-token-muted bg-surface-1 px-3 py-1 rounded-lg border border-token-subtle cursor-pointer"
              >
                ✓ {t.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
