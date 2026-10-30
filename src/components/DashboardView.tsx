import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  Plus,
  Sparkles,
  ArrowLeft,
  Calendar,
  Target,
  Play,
  Bell,
  Flag,
} from 'lucide-react';
import { Habit, Task, Idea, NavTabId } from '../types';
import { toPersianNum, getTodayKey, formatDateKeyToPersian } from '../utils/persianDate';
import { parseNaturalTaskInput } from '../utils/nlpTaskParser';
import { calculateStreaks, computeDailyHabitProgress } from '../utils/habitStreaks';

interface DashboardViewProps {
  habits: Habit[];
  tasks: Task[];
  ideas: Idea[];
  onToggleHabitToday: (habitId: string) => void;
  onToggleTask: (taskId: string) => void;
  onQuickAddTask: (taskData: {
    title: string;
    priority: number;
    duration: number;
    targetDate?: string;
    reminderTime?: string;
  }) => Promise<boolean> | void;
  onNavigateTab: (tab: NavTabId) => void;
  onStartFocusOnTask: (taskId: string, taskTitle: string, duration: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  habits,
  tasks,
  onToggleHabitToday,
  onToggleTask,
  onQuickAddTask,
  onNavigateTab,
  onStartFocusOnTask,
}) => {
  const [quickTaskInput, setQuickTaskInput] = useState('');
  const [isSubmittingQuickTask, setIsSubmittingQuickTask] = useState(false);

  const todayKey = getTodayKey();

  // Live NLP preview for Quick Add Input with editable overrides (FIX-09, FIX-17)
  const rawNlpPreview = useMemo(() => {
    if (!quickTaskInput.trim()) return null;
    return parseNaturalTaskInput(quickTaskInput);
  }, [quickTaskInput]);

  const [overrideTitle, setOverrideTitle] = useState('');
  const [overrideDate, setOverrideDate] = useState(todayKey);
  const [overrideDuration, setOverrideDuration] = useState(45);
  const [overridePriority, setOverridePriority] = useState(1);
  const [overrideReminder, setOverrideReminder] = useState('');

  useEffect(() => {
    if (!rawNlpPreview) {
      setOverrideTitle('');
      setOverrideDate(todayKey);
      setOverrideDuration(45);
      setOverridePriority(1);
      setOverrideReminder('');
      return;
    }
    setOverrideTitle(rawNlpPreview.title);
    setOverrideDate(rawNlpPreview.targetDate || todayKey);
    setOverrideDuration(rawNlpPreview.duration || 45);
    setOverridePriority(rawNlpPreview.priority || 1);
    setOverrideReminder(rawNlpPreview.reminderTime || '');
  }, [rawNlpPreview, todayKey]);

  // Strictly today's scheduled tasks + overdue tasks
  const todayTasks = tasks
    .filter((t) => t.targetDate === todayKey || (!t.completed && t.targetDate < todayKey))
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const pendingTasks = todayTasks.filter((t) => !t.completed);
  const completedTasks = todayTasks.filter((t) => t.completed);

  // Top 3 priorities for today
  const topPriorities = pendingTasks.slice(0, 3);
  const remainingTodayTasks = pendingTasks.slice(3);

  // Unified habit progress for today respecting startDate and eligibility
  const todayHabitStats = computeDailyHabitProgress(habits, todayKey, todayKey);
  const habitsCompletedToday = todayHabitStats.doneCount;
  const totalEligibleHabitsToday = todayHabitStats.eligibleCount;
  const habitsProgress = todayHabitStats.ratePercent;

  // Task progress percentage
  const totalTodayCount = todayTasks.length;
  const tasksProgress =
    totalTodayCount > 0
      ? Math.min(100, Math.round((completedTasks.length / totalTodayCount) * 100))
      : 0;

  const totalPendingMinutes = pendingTasks.reduce(
    (acc, curr) => acc + (Number(curr.duration) || 45),
    0
  );

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskInput.trim() || isSubmittingQuickTask) return;

    const finalTitle = (overrideTitle || rawNlpPreview?.title || quickTaskInput).trim();
    if (!finalTitle) return;

    setIsSubmittingQuickTask(true);
    try {
      const result = await onQuickAddTask({
        title: finalTitle,
        priority: Math.max(1, Math.min(20, Number(overridePriority) || 1)),
        duration: Math.max(5, Math.min(480, Number(overrideDuration) || 45)),
        targetDate: /^\d{4}-\d{2}-\d{2}$/.test(overrideDate) ? overrideDate : todayKey,
        reminderTime: /^([01]\d|2[0-3]):([0-5]\d)$/.test(overrideReminder.trim())
          ? overrideReminder.trim()
          : undefined,
      });
      if (result !== false) {
        setQuickTaskInput('');
      }
    } finally {
      setIsSubmittingQuickTask(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Calm Overview Summary Row + Quick Task Capture */}
      <section className="bg-surface-1 border border-token-subtle rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-token-primary">
              نمای کلی امروز
            </h2>
            <p className="text-xs text-token-secondary">
              {pendingTasks.length > 0
                ? `${toPersianNum(pendingTasks.length)} کار در برنامهٔ امروز باقی مانده است (حدود ${toPersianNum(
                    totalPendingMinutes
                  )} دقیقه).`
                : completedTasks.length > 0
                ? 'تمام کارهای برنامه‌ریزی‌شدهٔ امروز تکمیل شده‌اند.'
                : 'هنوز کاری برای امروز ثبت نشده است. اولین کار امروز را در کادر زیر بنویسید.'}
            </p>
          </div>

          {/* Compact KPI Pills */}
          <div className="flex flex-wrap items-center gap-2.5 tabular-nums">
            <div className="px-3.5 py-2 rounded-xl bg-surface-2 border border-token-subtle flex items-center gap-2.5">
              <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="text-xs">
                <span className="text-token-secondary ml-1.5">کارهای امروز:</span>
                <span className="font-bold text-token-primary">
                  {toPersianNum(completedTasks.length)} از {toPersianNum(totalTodayCount)}
                </span>
                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mr-1.5">
                  ({toPersianNum(tasksProgress)}٪)
                </span>
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-surface-2 border border-token-subtle flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-xs">
                <span className="text-token-secondary ml-1.5">عادت‌های امروز:</span>
                <span className="font-bold text-token-primary">
                  {toPersianNum(habitsCompletedToday)} از {toPersianNum(totalEligibleHabitsToday)}
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mr-1.5">
                  ({toPersianNum(habitsProgress)}٪)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Smart NLP Quick Add Input */}
        <form onSubmit={handleQuickAddSubmit} className="space-y-2">
          <p className="text-[11px] text-token-secondary">
            کارت را بنویس؛ زمان و تاریخ پیشنهادی را قبل از ثبت بررسی کن.
          </p>
          <div className="relative flex items-center">
            <input
              type="text"
              aria-label="ثبت سریع کار جدید"
              value={quickTaskInput}
              onChange={(e) => setQuickTaskInput(e.target.value)}
              placeholder="مثلاً: فردا ساعت ۱۴:۳۰ ارسال گزارش پروژه ۳۰ دقیقه اولویت ۱..."
              className="w-full pl-28 pr-4 py-3 rounded-xl bg-surface-2 border border-token-subtle text-xs sm:text-sm text-token-primary placeholder:text-token-muted focus:bg-surface-1 transition"
            />
            <button
              type="submit"
              disabled={!quickTaskInput.trim() || isSubmittingQuickTask}
              className="absolute left-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmittingQuickTask ? 'در حال ثبت...' : 'ثبت کار'}</span>
            </button>
          </div>

          {/* Editable NLP Extraction Preview Bar */}
          {rawNlpPreview && (
            <div
              data-testid="dashboard-nlp-preview"
              className="p-3 rounded-xl bg-surface-2 border border-token-subtle space-y-2.5 text-[11px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>پیش‌نمایش قابل ویرایش پیش از ثبت:</span>
                </span>
                <span className="text-token-muted">
                  تاریخ: {formatDateKeyToPersian(overrideDate)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <div className="sm:col-span-5">
                  <label className="block text-[10px] text-token-muted mb-0.5">عنوان کار</label>
                  <input
                    type="text"
                    aria-label="ویرایش عنوان پیشنهادی"
                    value={overrideTitle}
                    onChange={(e) => setOverrideTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface-1 border border-token-subtle text-xs font-semibold text-token-primary"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[10px] text-token-muted mb-0.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>تاریخ</span>
                  </label>
                  <input
                    type="date"
                    aria-label="ویرایش تاریخ پیشنهادی"
                    value={overrideDate}
                    onChange={(e) => e.target.value && setOverrideDate(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-surface-1 border border-token-subtle text-xs text-token-primary tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-token-muted mb-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>مدت (دقیقه)</span>
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    aria-label="ویرایش مدت پیشنهادی"
                    value={overrideDuration}
                    onChange={(e) => setOverrideDuration(parseInt(e.target.value, 10) || 45)}
                    className="w-full px-2 py-1.5 rounded-lg bg-surface-1 border border-token-subtle text-xs text-token-primary tabular-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-token-muted mb-0.5 flex items-center gap-1">
                    <Flag className="w-3 h-3" />
                    <span>اولویت</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    aria-label="ویرایش اولویت پیشنهادی"
                    value={overridePriority}
                    onChange={(e) => setOverridePriority(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-2 py-1.5 rounded-lg bg-surface-1 border border-token-subtle text-xs text-token-primary tabular-nums"
                  />
                </div>
              </div>

              {overrideReminder && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 text-violet-700 dark:text-violet-300 font-semibold">
                    <Bell className="w-3 h-3" />
                    ساعت یادآور:
                  </span>
                  <input
                    type="time"
                    aria-label="ویرایش ساعت یادآور پیشنهادی"
                    value={overrideReminder}
                    onChange={(e) => setOverrideReminder(e.target.value)}
                    className="px-2 py-1 rounded-md bg-surface-1 border border-token-subtle text-xs text-token-primary tabular-nums"
                  />
                </div>
              )}
            </div>
          )}
        </form>
      </section>

      {/* 2. Main 2-Column Workspace Grid: Today's Priorities (Right) + Today's Habits (Left) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right Column (7 cols): Top 3 Priorities & Today's Queue */}
        <div className="lg:col-span-7 bg-surface-1 border border-token-subtle rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-token-subtle pb-3.5">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-token-primary">
                اولویت‌های اصلی امروز
              </h3>
              <p className="text-xs text-token-secondary mt-0.5">
                تمرکز روی حداکثر ۳ کار مهم پیش از سراغ رفتن به کارهای فرعی
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('workspace')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>همهٔ کارها</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {topPriorities.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl bg-surface-2/60 border border-dashed border-token-subtle space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-token-primary">
                  {completedTasks.length > 0
                    ? 'تمام کارهای امروز را به پایان رساندید!'
                    : 'فهرست اولویت‌های امروز خالی است'}
                </p>
                <p className="text-xs text-token-secondary">
                  می‌توانید از کادر بالا یک کار جدید ثبت کنید یا به بخش کارها بروید.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topPriorities.map((task, idx) => {
                const isOverdue = task.targetDate < todayKey;
                return (
                  <div
                    key={task.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition flex items-center justify-between gap-3 ${
                      idx === 0
                        ? 'bg-indigo-500/[0.05] border-indigo-500/30'
                        : 'bg-surface-2/50 border-token-subtle hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onToggleTask(task.id)}
                        aria-label={`تکمیل کار ${task.title}`}
                        className="mt-0.5 text-token-muted hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shrink-0"
                      >
                        <Circle className="w-5 h-5" />
                      </button>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md tabular-nums ${
                              idx === 0
                                ? 'bg-indigo-600 text-white'
                                : 'bg-surface-1 border border-token-subtle text-token-secondary'
                            }`}
                          >
                            اولویت {toPersianNum(task.priority)}
                          </span>
                          {isOverdue && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400">
                              عقب‌افتاده
                            </span>
                          )}
                          <h4 className="text-xs sm:text-sm font-bold text-token-primary truncate">
                            {task.title}
                          </h4>
                        </div>

                        {task.description && (
                          <p className="text-xs text-token-secondary line-clamp-1">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 text-[11px] text-token-muted tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {toPersianNum(task.duration)} دقیقه
                          </span>
                          {task.reminderTime && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <Bell className="w-3 h-3" />
                              ساعت {toPersianNum(task.reminderTime)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onStartFocusOnTask(task.id, task.title, task.duration)}
                      aria-label={`شروع تمرکز روی ${task.title}`}
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>تمرکز</span>
                    </button>
                  </div>
                );
              })}

              {remainingTodayTasks.length > 0 && (
                <div className="pt-2 flex items-center justify-between text-xs text-token-secondary px-1">
                  <span>
                    + {toPersianNum(remainingTodayTasks.length)} کار دیگر در فهرست امروز
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('workspace')}
                    className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                  >
                    مشاهدهٔ همه
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Completed Today Summary */}
          {completedTasks.length > 0 && (
            <div className="pt-3 border-t border-token-subtle space-y-2">
              <div className="text-xs font-semibold text-token-muted">
                انجام‌شده‌های امروز ({toPersianNum(completedTasks.length)})
              </div>
              <div className="space-y-1.5">
                {completedTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2/40 text-xs text-token-muted"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      className="flex items-center gap-2 truncate cursor-pointer hover:text-token-primary"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="line-through truncate">{task.title}</span>
                    </button>
                    <span className="text-[11px] tabular-nums shrink-0">
                      {toPersianNum(task.duration)} دقیقه
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Left Column (5 cols): Today's Habits Check-in */}
        <div className="lg:col-span-5 bg-surface-1 border border-token-subtle rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-token-subtle pb-3.5">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-token-primary">
                ثبت عادت‌های امروز
              </h3>
              <p className="text-xs text-token-secondary mt-0.5">
                تکرار روزانهٔ عادت‌های کوچک و پیوسته
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('habits')}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>جدول هفتگی</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {habits.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl bg-surface-2/60 border border-dashed border-token-subtle space-y-3">
              <Sparkles className="w-7 h-7 text-indigo-500 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-token-primary">هنوز عادتی تعریف نشده است</p>
                <p className="text-xs text-token-secondary">
                  از بخش عادت‌ها، اولین عادت روزانهٔ خود را بسازید.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('habits')}
                className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
              >
                رفتن به بخش عادت‌ها
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {habits.map((habit) => {
                const isDoneToday = Boolean(habit.completedDates[todayKey]);
                const streak = calculateStreaks(
                  habit.completedDates,
                  new Date(),
                  habit.weeklyGoal,
                  {
                    startDate: habit.startDate,
                    targetDaysOfWeek: habit.targetDaysOfWeek,
                  }
                );
                return (
                  <button
                    key={habit.id}
                    type="button"
                    onClick={() => onToggleHabitToday(habit.id)}
                    aria-pressed={isDoneToday}
                    className={`w-full p-3 rounded-xl border text-right transition flex items-center justify-between gap-3 cursor-pointer ${
                      isDoneToday
                        ? 'bg-emerald-500/[0.06] border-emerald-500/30'
                        : 'bg-surface-2/50 border-token-subtle hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg shrink-0">{habit.emoji}</span>
                      <div className="min-w-0">
                        <div
                          className={`text-xs font-bold truncate ${
                            isDoneToday
                              ? 'line-through text-token-muted'
                              : 'text-token-primary'
                          }`}
                        >
                          {habit.title}
                        </div>
                        <div className="text-[11px] text-token-muted tabular-nums flex items-center gap-2 mt-0.5">
                          <span>هدف: {toPersianNum(habit.weeklyGoal)} روز در هفته</span>
                          {streak.current > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              • زنجیرهٔ فعلی: {toPersianNum(streak.current)} روز
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition ${
                        isDoneToday
                          ? 'bg-emerald-600 text-white animate-pop'
                          : 'border border-token-subtle bg-surface-1 text-transparent'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
