import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronLeft,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  ArrowUpLeft,
  Grid,
  Columns,
  Play,
} from 'lucide-react';
import { Task, Habit, NavTabId } from '../types';
import {
  getFullPersianYearCalendar,
  getPersianParts,
  toPersianNum,
  PERSIAN_WEEKDAYS,
  getTodayKey,
  formatDateKeyToPersian,
} from '../utils/persianDate';

interface CalendarViewProps {
  tasks: Task[];
  habits: Habit[];
  selectedDateKey: string;
  onSelectDateKey: (dateKey: string) => void;
  onOpenNewTaskForDate: (dateKey: string) => void;
  onToggleTask: (taskId: string) => void;
  onEnterDayInTab: (dateKey: string, tab: NavTabId) => void;
  onStartFocusOnTask?: (taskId: string, taskTitle: string, duration: number) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  habits,
  selectedDateKey,
  onSelectDateKey,
  onOpenNewTaskForDate,
  onToggleTask,
  onEnterDayInTab,
  onStartFocusOnTask,
}) => {
  const today = useMemo(() => new Date(), []);
  const currentPersian = useMemo(() => getPersianParts(today), [today]);

  const [selectedJYear, setSelectedJYear] = useState<number>(currentPersian.jYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentPersian.jMonth);
  const [viewMode, setViewMode] = useState<'single_month' | 'full_year'>('single_month');

  // Generate 12-month Jalali calendar for selectedJYear
  const yearMonths = useMemo(
    () => getFullPersianYearCalendar(selectedJYear, today),
    [selectedJYear, today]
  );

  // Map tasks by targetDate
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach((t) => {
      if (!map[t.targetDate]) map[t.targetDate] = [];
      map[t.targetDate].push(t);
    });
    return map;
  }, [tasks]);

  // Map habits completed count by date
  const habitsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    habits.forEach((h) => {
      Object.keys(h.completedDates).forEach((dateKey) => {
        if (h.completedDates[dateKey]) {
          map[dateKey] = (map[dateKey] || 0) + 1;
        }
      });
    });
    return map;
  }, [habits]);

  const activeMonthData =
    yearMonths.find((m) => m.jMonth === selectedMonth) || yearMonths[0];

  const selectedDayTasks = (tasksByDate[selectedDateKey] || []).sort(
    (a, b) => (a.priority || 99) - (b.priority || 99)
  );
  const selectedDayHabitsDone = habits.filter((h) => h.completedDates[selectedDateKey]);

  const handleJumpToToday = () => {
    const todayKey = getTodayKey();
    setSelectedJYear(currentPersian.jYear);
    setSelectedMonth(currentPersian.jMonth);
    onSelectDateKey(todayKey);
  };

  const handlePrevMonth = () => {
    if (selectedMonth > 1) {
      setSelectedMonth((m) => m - 1);
    } else {
      setSelectedJYear((y) => y - 1);
      setSelectedMonth(12);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth < 12) {
      setSelectedMonth((m) => m + 1);
    } else {
      setSelectedJYear((y) => y + 1);
      setSelectedMonth(1);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Year / Month Selector & View Switcher */}
      <div className="bg-surface-1 p-5 sm:p-6 rounded-2xl border border-token-subtle shadow-2xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-token-primary">
                  تقویم سال {toPersianNum(selectedJYear)} خورشیدی
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="سال قبل"
                    title="سال قبل"
                    onClick={() => setSelectedJYear((y) => y - 1)}
                    className="px-2 py-0.5 rounded-lg bg-surface-2 text-xs font-bold text-token-secondary hover:bg-indigo-600 hover:text-white transition cursor-pointer"
                  >
                    − سال قبل
                  </button>
                  <button
                    type="button"
                    aria-label="سال بعد"
                    title="سال بعد"
                    onClick={() => setSelectedJYear((y) => y + 1)}
                    className="px-2 py-0.5 rounded-lg bg-surface-2 text-xs font-bold text-token-secondary hover:bg-indigo-600 hover:text-white transition cursor-pointer"
                  >
                    سال بعد +
                  </button>
                </div>
              </div>
              <p className="text-xs text-token-secondary">
                یک روز را انتخاب کنید تا کارهای آن روز را ببینید، کار جدید ثبت کنید یا در نمای کارها باز کنید
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={handleJumpToToday}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/20 transition cursor-pointer"
            >
              برو به امروز
            </button>

            <div className="flex items-center bg-surface-2 p-1 rounded-xl border border-token-subtle">
              <button
                type="button"
                onClick={() => setViewMode('single_month')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'single_month'
                    ? 'bg-surface-1 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-token-secondary'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>نمای ماهانه</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('full_year')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  viewMode === 'full_year'
                    ? 'bg-surface-1 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-token-secondary'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>نمای ۱۲ ماه سال</span>
              </button>
            </div>
          </div>
        </div>

        {/* 12 Months Quick Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {yearMonths.map((m) => {
            const isCurrentMonth = m.jMonth === currentPersian.jMonth;
            const isSelected = m.jMonth === selectedMonth;
            const monthTaskCount = m.days.reduce(
              (acc, d) => acc + (tasksByDate[d.key]?.length || 0),
              0
            );

            return (
              <button
                key={m.jMonth}
                type="button"
                onClick={() => {
                  setSelectedMonth(m.jMonth);
                  setViewMode('single_month');
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : isCurrentMonth
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25'
                    : 'bg-surface-2 text-token-secondary hover:text-token-primary'
                }`}
              >
                <span>{m.monthName}</span>
                {monthTaskCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                      isSelected
                        ? 'bg-white/25 text-white'
                        : 'bg-surface-1 text-token-secondary'
                    }`}
                  >
                    {toPersianNum(monthTaskCount)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content: Calendar Grid + Selected Day Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Calendar Grid */}
        <div className="lg:col-span-7 xl:col-span-8">
          {viewMode === 'single_month' ? (
            <div className="bg-surface-1 p-5 sm:p-6 rounded-2xl border border-token-subtle shadow-2xs space-y-5">
              {/* Month Header Navigation */}
              <div className="flex items-center justify-between border-b border-token-subtle pb-4">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="ماه قبل"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-2 text-xs font-semibold text-token-secondary hover:text-token-primary cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>ماه قبل</span>
                </button>

                <div className="text-center">
                  <h3 className="text-base sm:text-lg font-bold text-token-primary">
                    {activeMonthData.monthName} {toPersianNum(selectedJYear)}
                  </h3>
                  <span className="text-[11px] text-token-muted tabular-nums">
                    {toPersianNum(activeMonthData.days.length)} روزه
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="ماه بعد"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-surface-2 text-xs font-semibold text-token-secondary hover:text-token-primary cursor-pointer"
                >
                  <span>ماه بعد</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-2 text-center">
                {PERSIAN_WEEKDAYS.map((w, idx) => (
                  <div
                    key={w}
                    className={`text-xs font-bold py-1 ${
                      idx === 6 ? 'text-red-500' : 'text-token-muted'
                    }`}
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: activeMonthData.startWeekdayOffset }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="h-16 sm:h-20 rounded-xl opacity-20" />
                ))}

                {activeMonthData.days.map((day) => {
                  const dayTasks = tasksByDate[day.key] || [];
                  const doneCount = dayTasks.filter((t) => t.completed).length;
                  const pendingCount = dayTasks.length - doneCount;
                  const habitsDoneCount = habitsByDate[day.key] || 0;
                  const isSelected = day.key === selectedDateKey;
                  const isFriday = day.weekdayIndex === 6;

                  return (
                    <button
                      key={day.key}
                      type="button"
                      data-testid={`calendar-day-${day.key}`}
                      onClick={() => onSelectDateKey(day.key)}
                      className={`h-16 sm:h-20 p-2 rounded-xl border text-right flex flex-col justify-between transition relative group cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                          : day.isToday
                          ? 'bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                          : 'bg-surface-2/60 border-token-subtle hover:border-indigo-400 text-token-primary'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`text-xs sm:text-sm font-bold tabular-nums ${
                            isSelected
                              ? 'text-white'
                              : day.isToday
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : isFriday
                              ? 'text-red-500'
                              : ''
                          }`}
                        >
                          {toPersianNum(day.jDay)}
                        </span>

                        {day.isToday && (
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              isSelected
                                ? 'bg-white text-indigo-700'
                                : 'bg-indigo-600 text-white'
                            }`}
                          >
                            امروز
                          </span>
                        )}
                      </div>

                      {/* Task & Habit Indicators */}
                      <div className="flex flex-wrap items-center gap-1 mt-auto tabular-nums">
                        {pendingCount > 0 && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {toPersianNum(pendingCount)} کار
                          </span>
                        )}
                        {doneCount > 0 && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                              isSelected
                                ? 'bg-emerald-300/30 text-white'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            ✓{toPersianNum(doneCount)}
                          </span>
                        )}
                        {habitsDoneCount > 0 && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected ? 'bg-sky-200' : 'bg-sky-500'
                            }`}
                            title={`${toPersianNum(habitsDoneCount)} عادت ثبت‌شده`}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 12-Month Full Year Overview */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {yearMonths.map((month) => (
                <div
                  key={month.jMonth}
                  className="bg-surface-1 p-4 rounded-2xl border border-token-subtle shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-token-subtle pb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth(month.jMonth);
                        setViewMode('single_month');
                      }}
                      className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {month.monthName}
                    </button>
                    <span className="text-[10px] text-token-muted tabular-nums">
                      {toPersianNum(month.days.length)} روز
                    </span>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-token-muted font-bold">
                    {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((d, i) => (
                      <span key={i} className={i === 6 ? 'text-red-500' : ''}>
                        {d}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: month.startWeekdayOffset }).map((_, idx) => (
                      <div key={idx} className="h-7" />
                    ))}
                    {month.days.map((day) => {
                      const hasTasks = (tasksByDate[day.key]?.length || 0) > 0;
                      const isSelected = day.key === selectedDateKey;
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => {
                            onSelectDateKey(day.key);
                            setSelectedMonth(month.jMonth);
                          }}
                          className={`h-7 rounded-lg text-[11px] font-bold flex items-center justify-center relative transition cursor-pointer tabular-nums ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : day.isToday
                              ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-500'
                              : hasTasks
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'hover:bg-surface-2 text-token-primary'
                          }`}
                        >
                          {toPersianNum(day.jDay)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Panel: Selected Day Inspector & Actions */}
        <div className="lg:col-span-5 xl:col-span-4 bg-surface-1 p-5 sm:p-6 rounded-2xl border border-token-subtle shadow-2xs space-y-5 sticky top-24">
          <div className="border-b border-token-subtle pb-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                برنامهٔ روز انتخاب‌شده
              </span>
              {selectedDateKey === getTodayKey() && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  امروز
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-bold text-token-primary">
              {formatDateKeyToPersian(selectedDateKey)}
            </h3>

            {/* Quick Day Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                data-testid="calendar-add-task-for-day-btn"
                onClick={() => onOpenNewTaskForDate(selectedDateKey)}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن کار در این روز</span>
              </button>

              <button
                type="button"
                data-testid="calendar-open-in-workspace-btn"
                onClick={() => onEnterDayInTab(selectedDateKey, 'workspace')}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-surface-2 hover:opacity-90 text-token-primary text-xs font-semibold border border-token-subtle transition cursor-pointer"
              >
                <span>باز کردن در کارها</span>
                <ArrowUpLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tasks Scheduled for Selected Day */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-token-secondary">
                کارهای این روز ({toPersianNum(selectedDayTasks.length)})
              </h4>
            </div>

            {selectedDayTasks.length === 0 ? (
              <div className="p-6 rounded-xl bg-surface-2/60 border border-dashed border-token-subtle text-center space-y-2">
                <p className="text-xs text-token-muted">
                  هیچ کاری برای این تاریخ ثبت نشده است.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenNewTaskForDate(selectedDateKey)}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  + ثبت اولین کار برای این روز
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {selectedDayTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`p-3 rounded-xl border flex items-start justify-between gap-2.5 transition ${
                      task.completed
                        ? 'bg-surface-2/40 border-token-subtle opacity-60'
                        : 'bg-surface-2/60 border-token-subtle'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      className="mt-0.5 text-indigo-600 dark:text-indigo-400 shrink-0 cursor-pointer"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 tabular-nums">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                          اولویت {toPersianNum(task.priority)}
                        </span>
                        <span className="text-[10px] text-token-muted flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {toPersianNum(task.duration)} دقیقه
                        </span>
                      </div>
                      <p
                        className={`text-xs font-bold ${
                          task.completed
                            ? 'line-through text-token-muted'
                            : 'text-token-primary'
                        }`}
                      >
                        {task.title}
                      </p>
                    </div>
                    {!task.completed && onStartFocusOnTask && (
                      <button
                        type="button"
                        onClick={() => onStartFocusOnTask(task.id, task.title, task.duration)}
                        title="شروع تمرکز"
                        className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition cursor-pointer shrink-0"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Habits Completed on Selected Day */}
          <div className="pt-3 border-t border-token-subtle space-y-2">
            <h4 className="text-xs font-bold text-token-secondary flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>عادت‌های ثبت‌شده در این روز ({toPersianNum(selectedDayHabitsDone.length)})</span>
            </h4>
            {selectedDayHabitsDone.length === 0 ? (
              <p className="text-[11px] text-token-muted">
                عادتی در این تاریخ تیک نخورده است.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedDayHabitsDone.map((h) => (
                  <span
                    key={h.id}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                  >
                    {h.emoji} {h.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
