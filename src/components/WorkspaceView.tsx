import React, { useState } from 'react';
import {
  Target,
  Crown,
  Clock,
  Award,
  CalendarArrowUp,
  ArrowDownToDot,
  Plus,
  Sparkles,
  TrendingUp,
  Layers,
  Edit3,
  Trash2,
  CalendarPlus,
  CheckCircle,
  Timer,
  Bell,
} from 'lucide-react';
import { Task } from '../types';
import {
  toPersianNum,
  getTodayKey,
  getTomorrowKey,
  addDays,
  getDateKey,
  formatDateKeyToPersian,
} from '../utils/persianDate';

interface WorkspaceViewProps {
  tasks: Task[];
  selectedDateKey?: string;
  onToggleTask: (taskId: string) => void;
  onMoveTaskDay: (taskId: string, targetDay: 'today' | 'tomorrow') => void;
  onMoveAllPendingToTomorrow: () => void;
  onApplyTomorrowToToday: () => void;
  onOpenTaskModal: (taskId?: string) => void;
  onDeleteTask: (taskId: string) => void;
  onSwitchTab: (tab: any) => void;
  onStartFocusOnTask: (taskId: string, taskTitle: string, duration: number) => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  tasks,
  selectedDateKey,
  onToggleTask,
  onMoveTaskDay,
  onMoveAllPendingToTomorrow,
  onApplyTomorrowToToday,
  onOpenTaskModal,
  onDeleteTask,
  onSwitchTab,
  onStartFocusOnTask,
}) => {
  const todayKey = getTodayKey();
  const tomorrowKey = getTomorrowKey();
  const hasCustomDate =
    !!selectedDateKey && selectedDateKey !== todayKey && selectedDateKey !== tomorrowKey;

  const [filter, setFilter] = useState<'all' | 'today' | 'overdue' | 'tomorrow' | 'custom'>(
    hasCustomDate ? 'custom' : 'all'
  );
  const [visibleCount, setVisibleCount] = useState<number>(50);

  // Metrics (BUG-07 & BUG-30)
  const overdueTasks = tasks.filter((t) => t.targetDate < todayKey && !t.completed);
  const todayTasks = tasks.filter(
    (t) => t.targetDate === todayKey || (t.targetDate < todayKey && !t.completed)
  );
  const todayDone = todayTasks.filter((t) => t.completed);
  const todayPercent =
    todayTasks.length > 0
      ? Math.min(100, Math.round((todayDone.length / todayTasks.length) * 100))
      : 0;

  // The One Thing (Priority 1)
  const sortedToday = [...todayTasks].sort((a, b) => (a.priority || 99) - (b.priority || 99));
  const oneThing = sortedToday.find((t) => !t.completed) || sortedToday[0];

  // Time budget
  const totalMinutes = todayTasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
  const doneMinutes = todayDone.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);

  // Overall success rate
  const allDoneCount = tasks.filter((t) => t.completed).length;
  const overallRate =
    tasks.length > 0 ? Math.min(100, Math.round((allDoneCount / tasks.length) * 100)) : 0;

  // Filter display tasks
  let displayTasks = tasks.filter((t) => {
    if (filter === 'today') return t.targetDate === todayKey;
    if (filter === 'overdue') return t.targetDate < todayKey && !t.completed;
    if (filter === 'tomorrow') return t.targetDate === tomorrowKey;
    if (filter === 'custom' && selectedDateKey) return t.targetDate === selectedDateKey;
    return true;
  });

  // Sort by targetDate then priority
  displayTasks.sort((a, b) => {
    if (a.targetDate !== b.targetDate) return a.targetDate.localeCompare(b.targetDate);
    return (a.priority || 99) - (b.priority || 99);
  });

  const visibleTasks = displayTasks.slice(0, visibleCount);
  const hasMoreTasks = displayTasks.length > visibleCount;

  // 7-day past history for missions
  const past7Days = [];
  const refToday = new Date();
  refToday.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const d = addDays(refToday, -i);
    past7Days.push({
      key: getDateKey(d),
      weekdayName: new Intl.DateTimeFormat('fa-IR', { weekday: 'short' }).format(d),
      isToday: i === 0,
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's progress */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              پیشرفت مأموریت‌های امروز
            </span>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(todayDone.length)} از {toPersianNum(todayTasks.length)}
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                {toPersianNum(todayPercent)}٪
              </span>
            </div>
            <p className="text-[11px] text-slate-400">بر اساس اولویت‌های ثبت‌شده</p>
          </div>
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100 dark:text-slate-800"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.8"
              />
              <path
                className="text-indigo-500 transition-all duration-700 ease-out"
                strokeDasharray={`${todayPercent}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.8"
                strokeLinecap="round"
              />
            </svg>
            <Target className="w-5 h-5 text-indigo-500 absolute" />
          </div>
        </div>

        {/* The One Thing */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1 min-w-0 pr-1">
            <span className="text-xs font-medium text-rose-500 flex items-center gap-1 font-bold">
              <Crown className="w-3.5 h-3.5" />
              اولویت ۱ (مهم‌ترین کار)
            </span>
            <h2 className="text-sm font-black text-slate-800 dark:text-white truncate">
              {oneThing ? oneThing.title : 'ثبت نشده'}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              {oneThing
                ? oneThing.completed
                  ? 'تکمیل شده ✅'
                  : `سهمیه: ${toPersianNum(oneThing.duration)} دقیقه`
                : 'تمرکز اصلی روز'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
            <Crown className="w-6 h-6" />
          </div>
        </div>

        {/* Time Budget */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              سهمیه زمانی امروز
            </span>
            <div className="flex items-baseline gap-1.5">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(totalMinutes)}
              </h2>
              <span className="text-xs font-semibold text-amber-500">دقیقه</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {toPersianNum(doneMinutes)} دقیقه انجام شده
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Overall Success Rate */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              درصد موفقیت کل کارها
            </span>
            <div className="flex items-baseline gap-1.5">
              <h2 className="text-2xl font-black text-emerald-500">
                {toPersianNum(overallRate)}٪
              </h2>
              <span className="text-xs text-slate-400">
                ({toPersianNum(allDoneCount)} از {toPersianNum(tasks.length)})
              </span>
            </div>
            <p className="text-[11px] text-slate-400">برآیند کل مأموریت‌ها</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </section>

      {/* 2. Main Workspace Layout */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Tasks list and actions */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-500" />
                لیست اولویت‌بندی مأموریت‌ها
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                کارهای انجام‌شده حذف نمی‌شوند؛ خط می‌خورند تا حس پیشرفتت کامل حفظ شود.
              </p>
            </div>

            {/* Quick Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onMoveAllPendingToTomorrow}
                title="انتقال تمام کارهای ناتمام امروز به فردا"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition"
              >
                <CalendarArrowUp className="w-4 h-4" />
                <span>انتقال ناتمام‌ها به فردا</span>
              </button>

              <button
                onClick={onApplyTomorrowToToday}
                title="آوردن برنامه فردا به لیست امروز"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition"
              >
                <ArrowDownToDot className="w-4 h-4" />
                <span>شروع برنامه فردا از همین الان</span>
              </button>

              <button
                onClick={() => onOpenTaskModal()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition"
              >
                <Plus className="w-4 h-4" />
                <span>کار جدید</span>
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  filter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                همه کارها
              </button>
              <button
                type="button"
                onClick={() => setFilter('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  filter === 'today'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                فقط امروز
              </button>
              <button
                type="button"
                onClick={() => setFilter('overdue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  filter === 'overdue'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span>عقب‌افتاده</span>
                {overdueTasks.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px]">
                    {toPersianNum(overdueTasks.length)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFilter('tomorrow')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  filter === 'tomorrow'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                برنامه فردا
              </button>
              {hasCustomDate && selectedDateKey && (
                <button
                  type="button"
                  onClick={() => setFilter('custom')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    filter === 'custom'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {formatDateKeyToPersian(selectedDateKey)}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSwitchTab('planner')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>چیدن برنامه با دستیار هوشمند</span>
            </button>
          </div>

          {/* Tasks List */}
          <div className="space-y-3">
            {visibleTasks.map((task) => {
              const isTomorrow = task.targetDate === tomorrowKey;
              const isToday = task.targetDate === todayKey;
              const isOverdue = task.targetDate < todayKey && !task.completed;
              const isP1 = Number(task.priority) === 1;

              return (
                <div
                  key={task.id}
                  className={`group p-4 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    task.completed
                      ? 'bg-slate-50/70 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800/60 opacity-75'
                      : isP1
                      ? 'bg-white dark:bg-slate-900 border-indigo-500/40 shadow-sm ring-1 ring-indigo-500/15'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                        task.completed
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                          : 'bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-transparent hover:border-indigo-500'
                      }`}
                    >
                      <CheckCircle className="w-4 h-4 stroke-[2.5]" />
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[11px] font-black px-2.5 py-0.5 rounded-lg ${
                            isP1
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          {isP1 ? '🔥 اولویت ۱ (The One Thing)' : `اولویت ${toPersianNum(task.priority || 1)}`}
                        </span>

                        {isTomorrow ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-500">
                            برنامه فردا
                          </span>
                        ) : isToday ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            امروز
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            {formatDateKeyToPersian(task.targetDate)}
                          </span>
                        )}

                        {isOverdue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500">
                            مانده از قبل
                          </span>
                        )}

                        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {toPersianNum(task.duration)} دقیقه
                        </span>

                        {task.reminderTime && (
                          <span className="text-[11px] font-bold text-amber-500 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md">
                            <Bell className="w-3 h-3" />
                            یادآور: {toPersianNum(task.reminderTime)}
                          </span>
                        )}
                      </div>

                      <h4
                        className={`text-sm font-bold transition-all ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500 decoration-2 decoration-emerald-500/70'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </h4>

                      {task.description && (
                        <p
                          className={`text-xs leading-relaxed ${
                            task.completed
                              ? 'line-through text-slate-400/70 dark:text-slate-500/70'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    {!task.completed && (
                      <button
                        onClick={() => onStartFocusOnTask(task.id, task.title, task.duration)}
                        title="شروع تایمر تمرکز روی این مأموریت"
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 flex items-center gap-1 transition"
                      >
                        <Timer className="w-3.5 h-3.5" />
                        <span>تمرکز</span>
                      </button>
                    )}

                    {!isTomorrow ? (
                      <button
                        onClick={() => onMoveTaskDay(task.id, 'tomorrow')}
                        title="انتقال این کار به فردا"
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/15 text-slate-600 dark:text-slate-300 hover:text-amber-500 flex items-center gap-1 transition"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        <span>فردا</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onMoveTaskDay(task.id, 'today')}
                        title="آوردن به لیست امروز"
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 text-slate-600 dark:text-slate-300 hover:text-emerald-500 flex items-center gap-1 transition"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>امروز</span>
                      </button>
                    )}

                    <button
                      onClick={() => onOpenTaskModal(task.id)}
                      title="ویرایش کار"
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onDeleteTask(task.id)}
                      title="حذف کار"
                      className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {hasMoreTasks && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + 50)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  نمایش موارد بیشتر ({toPersianNum(displayTasks.length - visibleCount)} مورد دیگر)
                </button>
              </div>
            )}

            {displayTasks.length === 0 && (
              <div className="py-12 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mx-auto flex items-center justify-center text-slate-400">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-slate-700 dark:text-slate-200">
                    هیچ مأموریتی در این بخش ثبت نشده!
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    با استفاده از «دستیار برنامه‌ریز» اولویت‌هایت را بچین یا مستقیم کار جدید اضافه کن.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    onClick={() => onSwitchTab('planner')}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    رفتن به دستیار برنامه‌ریز
                  </button>
                  <button
                    onClick={() => onOpenTaskModal()}
                    className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition"
                  >
                    <Plus className="w-4 h-4" />
                    ثبت دستی
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 7-day task graph & Danial's flexible blocks guide */}
        <div className="space-y-6">
          {/* 7-day success rate chart */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-1">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                نمودار پیشرفت و تحقق مأموریت‌ها
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                درصد تحقق مأموریت‌ها در ۷ روز اخیر
              </p>
            </div>

            <div className="grid grid-cols-7 gap-2 items-end h-40 pt-6 px-1 border-b border-slate-100 dark:border-slate-800">
              {past7Days.map((d) => {
                const dayTasks = tasks.filter((t) => t.targetDate === d.key);
                const doneCount = dayTasks.filter((t) => t.completed).length;
                const pct = dayTasks.length > 0 ? Math.round((doneCount / dayTasks.length) * 100) : 0;
                const heightPct = Math.max(pct, 8);

                let colorClass = 'bg-indigo-500';
                if (pct >= 80) colorClass = 'bg-emerald-500';
                else if (pct === 0) colorClass = 'bg-slate-200 dark:bg-slate-800';

                return (
                  <div key={d.key} className="flex flex-col items-center justify-end h-full">
                    <span
                      className={`text-[10px] font-bold mb-1 ${
                        d.isToday ? 'text-indigo-500' : 'text-slate-400'
                      }`}
                    >
                      {toPersianNum(pct)}٪
                    </span>
                    <div className="w-full max-w-[28px] h-24 bg-slate-100 dark:bg-slate-800/70 rounded-lg p-1 flex items-end">
                      <div
                        className={`w-full rounded-md transition-all duration-500 ${colorClass}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span
                      className={`mt-1.5 text-[10px] font-bold ${
                        d.isToday ? 'text-indigo-500' : 'text-slate-400'
                      }`}
                    >
                      {d.weekdayName}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span>نرخ موفقیت امروز:</span>
              <span className="font-bold text-indigo-500">{toPersianNum(todayPercent)}٪</span>
            </div>
          </div>

          {/* Danial's flexible time blocks guide */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-500" />
                قطب‌نمای بلوک‌های روزانه دانیال
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-500">
                منعطف
              </span>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
                <div className="font-bold text-slate-700 dark:text-slate-200">
                  ۱. فرود و شارژ (حدود ۳ تا ۴ عصر)
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ناهار + نهایتاً ۴۰ دقیقه چرت عصرگاهی برای ریست مغز
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
                <div className="font-bold text-slate-700 dark:text-slate-200">
                  ۲. سنگر مدرسه و تکالیف (حدود ۴ تا ۷ عصر)
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  پومودوروی پینگ‌پنگی (۴۵ دقیقه درس + استراحت و چایی)
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
                <div className="font-bold text-slate-700 dark:text-slate-200">
                  ۳. شلیک ایتا و پروژه/کلاس (۷ تا ۹:۳۰ شب)
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ارسال طرح ایتا + کدنویسی HTML/CSS و CRM (یا کلاس Power BI)
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50">
                <div className="font-bold text-slate-700 dark:text-slate-200">
                  ۴. تفریح خالص و خلبان بقا (۹:۳۰ تا ۱۲ شب)
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  استراحت بدون عذاب وجدان + حمام/بهداشت + چیدن اولویت فردا
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
