import React, { useEffect, useState } from 'react';
import {
  CheckSquare,
  Plus,
  Check,
  Clock,
  Trash2,
  Edit2,
  ListChecks,
  Timer,
  CalendarDays,
  ArrowUp,
  ArrowDown,
  Search,
  Bell,
  X,
} from 'lucide-react';
import { Task } from '../types';
import {
  toPersianNum,
  getTodayKey,
  getTomorrowKey,
  formatDateKeyToPersian,
} from '../utils/persianDate';

interface WorkspaceViewProps {
  tasks: Task[];
  selectedDateKey?: string;
  activeDateFilter?: string | null;
  onClearDateFilter?: () => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onEditTask: (task: Task) => void;
  onOpenNewTaskModal: (defaultDateKey?: string) => void;
  onStartFocusOnTask: (taskId: string, taskTitle: string, duration: number) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onMovePriority?: (taskId: string, direction: 'up' | 'down') => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  tasks,
  selectedDateKey,
  activeDateFilter,
  onClearDateFilter,
  onToggleTask,
  onDeleteTask,
  onEditTask,
  onOpenNewTaskModal,
  onStartFocusOnTask,
  onToggleSubtask,
  onAddSubtask,
  onMovePriority,
}) => {
  const todayKey = getTodayKey();
  const tomorrowKey = getTomorrowKey();

  const effectiveContextDate = activeDateFilter || undefined;
  const hasCustomDate =
    Boolean(effectiveContextDate) &&
    effectiveContextDate !== todayKey &&
    effectiveContextDate !== tomorrowKey;

  const computeFilterForDate = (
    dateKey?: string | null
  ): 'all' | 'today' | 'overdue' | 'tomorrow' | 'custom' | 'completed' => {
    if (!dateKey) return 'all';
    if (dateKey === todayKey) return 'today';
    if (dateKey === tomorrowKey) return 'tomorrow';
    return 'custom';
  };

  const [filter, setFilter] = useState<
    'all' | 'today' | 'overdue' | 'tomorrow' | 'custom' | 'completed'
  >(() => computeFilterForDate(effectiveContextDate));
  const [searchQuery, setSearchQuery] = useState('');
  const [subtaskInputs, setSubtaskInputs] = useState<Record<string, string>>({});
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(50);

  // Sync filter whenever user navigates from Calendar with a specific date
  useEffect(() => {
    if (effectiveContextDate) {
      setFilter(computeFilterForDate(effectiveContextDate));
    }
  }, [effectiveContextDate, todayKey, tomorrowKey]);

  const overdueCount = tasks.filter((t) => !t.completed && t.targetDate < todayKey).length;

  // Determine the active date context for "Add Task" button inside WorkspaceView
  const activeContextDateForNewTask =
    filter === 'today'
      ? todayKey
      : filter === 'tomorrow'
      ? tomorrowKey
      : filter === 'custom' && effectiveContextDate
      ? effectiveContextDate
      : effectiveContextDate || todayKey;

  const filteredTasks = tasks
    .filter((t) => {
      if (filter === 'today') return t.targetDate === todayKey;
      if (filter === 'overdue') return !t.completed && t.targetDate < todayKey;
      if (filter === 'tomorrow') return t.targetDate === tomorrowKey;
      if (filter === 'custom' && effectiveContextDate)
        return t.targetDate === effectiveContextDate;
      if (filter === 'completed') return t.completed;
      return true;
    })
    .filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  // Progress of current filtered list
  const scopedCompletedCount = filteredTasks.filter((t) => t.completed).length;
  const completionRate =
    filteredTasks.length > 0
      ? Math.min(100, Math.round((scopedCompletedCount / filteredTasks.length) * 100))
      : 0;

  const handleAddSubtaskSubmit = (e: React.FormEvent, taskId: string) => {
    e.preventDefault();
    const val = subtaskInputs[taskId];
    if (!val || !val.trim()) return;
    onAddSubtask(taskId, val.trim());
    setSubtaskInputs((prev) => ({ ...prev, [taskId]: '' }));
  };

  const getPriorityBadgeStyle = (priority: number) => {
    if (priority === 1) {
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25';
    }
    if (priority === 2) {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25';
    }
    if (priority === 3) {
      return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25';
    }
    return 'bg-surface-2 text-token-secondary border-token-subtle';
  };

  const currentHeadingLabel =
    filter === 'today'
      ? `کارهای امروز (${formatDateKeyToPersian(todayKey)})`
      : filter === 'tomorrow'
      ? `کارهای فردا (${formatDateKeyToPersian(tomorrowKey)})`
      : filter === 'custom' && effectiveContextDate
      ? `کارهای تاریخ ${formatDateKeyToPersian(effectiveContextDate)}`
      : filter === 'overdue'
      ? 'کارهای عقب‌افتاده'
      : filter === 'completed'
      ? 'کارهای انجام‌شده'
      : 'فهرست کارها';

  void selectedDateKey;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header & Progress Bar */}
      <div className="bg-surface-1 p-5 sm:p-6 rounded-2xl border border-token-subtle shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2
              data-testid="workspace-heading"
              className="text-base sm:text-lg font-bold text-token-primary flex items-center gap-2"
            >
              <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>{currentHeadingLabel}</span>
            </h2>
            <p className="text-xs text-token-secondary mt-1">
              مدیریت کارها بر پایهٔ اولویت، تاریخ انجام و زمان تخمینی
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenNewTaskModal(activeContextDateForNewTask)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>کار جدید</span>
          </button>
        </div>

        {/* Active Calendar Date Context Banner */}
        {effectiveContextDate && (
          <div
            data-testid="workspace-date-context-banner"
            className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 font-semibold text-indigo-700 dark:text-indigo-300">
              <CalendarDays className="w-4 h-4 shrink-0" />
              <span>فیلتر تاریخ فعال: {formatDateKeyToPersian(effectiveContextDate)}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFilter('all');
                onClearDateFilter?.();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-1 text-token-secondary hover:text-token-primary border border-token-subtle text-[11px] font-semibold cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>نمایش همهٔ کارها</span>
            </button>
          </div>
        )}

        {/* Overall Progress */}
        <div className="space-y-1.5 pt-1 tabular-nums">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-token-secondary">پیشرفت فهرست فعلی</span>
            <span className="text-indigo-600 dark:text-indigo-400">
              {toPersianNum(completionRate)}٪ ({toPersianNum(scopedCompletedCount)} از{' '}
              {toPersianNum(filteredTasks.length)})
            </span>
          </div>
          <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-token-muted absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="جستجو در عنوان یا توضیحات کار"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در عنوان یا توضیحات کار..."
              className="w-full pr-10 pl-3 py-2 rounded-xl bg-surface-2 border border-token-subtle text-xs text-token-primary placeholder:text-token-muted focus:bg-surface-1"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'همه' },
              { id: 'today', label: 'امروز' },
              ...(overdueCount > 0 || filter === 'overdue'
                ? [{ id: 'overdue', label: `عقب‌افتاده (${toPersianNum(overdueCount)})` }]
                : []),
              { id: 'tomorrow', label: 'فردا' },
              ...(hasCustomDate && effectiveContextDate
                ? [
                    {
                      id: 'custom',
                      label: `تاریخ: ${formatDateKeyToPersian(effectiveContextDate)}`,
                    },
                  ]
                : []),
              { id: 'completed', label: 'انجام‌شده' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                data-testid={`workspace-filter-${f.id}`}
                onClick={() => setFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                  filter === f.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-surface-2 text-token-secondary hover:text-token-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="bg-surface-1 p-10 rounded-2xl border border-dashed border-token-subtle text-center space-y-3">
            <p className="text-sm font-bold text-token-primary">
              کاری در این بخش وجود ندارد
            </p>
            <p className="text-xs text-token-secondary">
              برای شروع برنامه‌ریزی، دکمهٔ «کار جدید» را بزنید.
            </p>
            <button
              type="button"
              onClick={() => onOpenNewTaskModal(activeContextDateForNewTask)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>افزودن کار برای این بخش</span>
            </button>
          </div>
        ) : (
          filteredTasks.slice(0, visibleCount).map((task, idx) => {
            const subtasks = task.subtasks || [];
            const doneSubtasks = subtasks.filter((s) => s.completed).length;
            const isExpanded = expandedTaskId === task.id;
            const isToday = task.targetDate === todayKey;
            const isTomorrow = task.targetDate === tomorrowKey;
            const isOverdue = !task.completed && task.targetDate < todayKey;

            return (
              <div
                key={task.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 ${
                  task.completed
                    ? 'bg-surface-2/40 border-token-subtle opacity-70'
                    : 'bg-surface-1 border-token-subtle shadow-2xs hover:border-indigo-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Complete Checkbox */}
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      aria-label={
                        task.completed
                          ? `بازگرداندن کار ${task.title}`
                          : `تکمیل کار ${task.title}`
                      }
                      className={`mt-1 w-6 h-6 rounded-lg flex items-center justify-center transition shrink-0 cursor-pointer ${
                        task.completed
                          ? 'bg-emerald-600 text-white'
                          : 'border-2 border-slate-300 dark:border-slate-600 hover:border-indigo-500'
                      }`}
                    >
                      {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Priority Badge */}
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md border tabular-nums ${getPriorityBadgeStyle(
                            task.priority
                          )}`}
                        >
                          اولویت {toPersianNum(task.priority)}
                        </span>

                        {/* Date Badge */}
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md flex items-center gap-1 ${
                            isOverdue
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                              : isToday
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : isTomorrow
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                              : 'bg-surface-2 text-token-secondary'
                          }`}
                        >
                          <CalendarDays className="w-3 h-3" />
                          {isOverdue
                            ? `عقب‌افتاده (${formatDateKeyToPersian(task.targetDate)})`
                            : isToday
                            ? 'امروز'
                            : isTomorrow
                            ? 'فردا'
                            : formatDateKeyToPersian(task.targetDate)}
                        </span>

                        {/* Duration Badge */}
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-2 text-token-secondary flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3 text-indigo-500" />
                          {toPersianNum(task.duration)} دقیقه
                        </span>

                        {/* Reminder Time Badge */}
                        {task.reminderTime && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center gap-1 tabular-nums">
                            <Bell className="w-3 h-3" />
                            ساعت {toPersianNum(task.reminderTime)}
                          </span>
                        )}

                        {subtasks.length > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center gap-1 tabular-nums">
                            <ListChecks className="w-3 h-3" />
                            {toPersianNum(doneSubtasks)}/{toPersianNum(subtasks.length)} گام
                          </span>
                        )}
                      </div>

                      <h4
                        className={`text-sm sm:text-base font-bold leading-snug ${
                          task.completed
                            ? 'line-through text-token-muted'
                            : 'text-token-primary'
                        }`}
                      >
                        {task.title}
                      </h4>

                      {task.description && (
                        <p className="text-xs text-token-secondary leading-relaxed">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!task.completed && (
                      <button
                        type="button"
                        onClick={() => onStartFocusOnTask(task.id, task.title, task.duration)}
                        title="شروع جلسهٔ تمرکز روی این کار"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white text-xs font-semibold transition cursor-pointer"
                      >
                        <Timer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">تمرکز</span>
                      </button>
                    )}

                    {onMovePriority && !task.completed && (
                      <div className="hidden sm:flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMovePriority(task.id, 'up')}
                          title="افزایش اولویت"
                          aria-label="افزایش اولویت"
                          className="p-1.5 rounded-lg hover:bg-surface-2 text-token-muted disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === filteredTasks.length - 1}
                          onClick={() => onMovePriority(task.id, 'down')}
                          title="کاهش اولویت"
                          aria-label="کاهش اولویت"
                          className="p-1.5 rounded-lg hover:bg-surface-2 text-token-muted disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                      title="مدیریت زیرکارها (چک‌لیست)"
                      aria-label="مدیریت زیرکارها"
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        isExpanded
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-surface-2 text-token-muted'
                      }`}
                    >
                      <ListChecks className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      title="ویرایش"
                      aria-label={`ویرایش کار ${task.title}`}
                      className="p-1.5 rounded-lg hover:bg-surface-2 text-token-muted hover:text-indigo-500 transition cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      title="حذف"
                      aria-label={`حذف کار ${task.title}`}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-token-muted hover:text-red-500 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expandable Subtasks Checklist */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-token-subtle space-y-2.5">
                    <div className="text-xs font-bold text-token-secondary flex items-center justify-between">
                      <span>گام‌های اجرایی کوچک (Subtasks):</span>
                      <span className="text-[11px] text-indigo-600 dark:text-indigo-400 tabular-nums">
                        {toPersianNum(doneSubtasks)} از {toPersianNum(subtasks.length)} تکمیل شده
                      </span>
                    </div>

                    {subtasks.length > 0 && (
                      <div className="space-y-1.5">
                        {subtasks.map((st) => (
                          <div
                            key={st.id}
                            onClick={() => onToggleSubtask(task.id, st.id)}
                            className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-2/60 hover:bg-surface-2 cursor-pointer transition"
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
                              className={`text-xs font-medium ${
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
                      onSubmit={(e) => handleAddSubtaskSubmit(e, task.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={subtaskInputs[task.id] || ''}
                        onChange={(e) =>
                          setSubtaskInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        placeholder="افزودن گام کوچک..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-surface-2 border border-token-subtle text-xs text-token-primary focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        افزودن گام
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })
        )}

        {filteredTasks.length > visibleCount && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 50)}
              className="px-5 py-2.5 rounded-xl bg-surface-2 text-token-primary text-xs font-semibold hover:opacity-90 transition cursor-pointer"
            >
              نمایش موارد بیشتر ({toPersianNum(filteredTasks.length - visibleCount)} مورد باقی‌مانده)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
