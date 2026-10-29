import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Plus,
  Clock,
  Bell,
  ArrowUpLeft,
  Layers,
  Check,
  Trash2,
} from 'lucide-react';
import { Task, Habit, NavTabId } from '../types';
import {
  toPersianNum,
  getTodayKey,
  getFullPersianYearCalendar,
  getPersianParts,
  PERSIAN_WEEKDAYS,
  formatDateKeyToPersian,
} from '../utils/persianDate';

interface CalendarViewProps {
  tasks: Task[];
  habits: Habit[];
  selectedDateKey: string;
  onSelectDateKey: (dateKey: string) => void;
  onToggleTask: (taskId: string) => void;
  onToggleHabitDay: (habitId: string, dateKey: string) => void;
  onAddTask: (task: Omit<Task, 'id' | 'completed'>) => void;
  onDeleteTask: (taskId: string) => void;
  onEnterDayInTab: (dateKey: string, targetTab: NavTabId) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  habits,
  selectedDateKey,
  onSelectDateKey,
  onToggleTask,
  onToggleHabitDay,
  onAddTask,
  onDeleteTask,
  onEnterDayInTab,
}) => {
  const todayKey = getTodayKey();
  const todayParts = useMemo(() => getPersianParts(new Date()), []);
  const [selectedJYear, setSelectedJYear] = useState<number>(todayParts.jYear);
  const yearCalendar = useMemo(
    () => getFullPersianYearCalendar(selectedJYear, new Date()),
    [selectedJYear]
  );

  const [activeMonthIndex, setActiveMonthIndex] = useState<number>(
    Math.max(0, todayParts.jMonth - 1)
  );
  const [viewMode, setViewMode] = useState<'month' | 'full_year'>('month');

  // Quick add form for selected day
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState(45);
  const [newTaskPriority, setNewTaskPriority] = useState(1);
  const [newTaskReminder, setNewTaskReminder] = useState('');

  const currentMonth = yearCalendar[activeMonthIndex] || yearCalendar[0];

  // Tasks & Habits for selectedDateKey
  const selectedDayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.targetDate === selectedDateKey)
        .sort((a, b) => (a.priority || 99) - (b.priority || 99)),
    [tasks, selectedDateKey]
  );

  const selectedDayDoneCount = selectedDayTasks.filter((t) => t.completed).length;
  const selectedDayTotalMinutes = selectedDayTasks.reduce(
    (sum, t) => sum + (Number(t.duration) || 0),
    0
  );

  // Map tasks by dateKey for fast lookup in calendar grid
  const tasksByDate = useMemo(() => {
    const map: Record<string, { total: number; done: number; hasReminder: boolean }> = {};
    for (const t of tasks) {
      if (!map[t.targetDate]) {
        map[t.targetDate] = { total: 0, done: 0, hasReminder: false };
      }
      map[t.targetDate].total += 1;
      if (t.completed) map[t.targetDate].done += 1;
      if (t.reminderTime) map[t.targetDate].hasReminder = true;
    }
    return map;
  }, [tasks]);

  const handleAddTaskForSelectedDay = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;

    onAddTask({
      title: trimmed,
      priority: newTaskPriority || 1,
      duration: newTaskDuration || 45,
      targetDate: selectedDateKey,
      reminderTime: newTaskReminder || undefined,
      category: 'work',
    });

    setNewTaskTitle('');
    setNewTaskReminder('');
    setNewTaskPriority(selectedDayTasks.length + 2);
  };

  const handleSelectDayCell = (dateKey: string, jMonth?: number) => {
    onSelectDateKey(dateKey);
    if (jMonth && viewMode === 'full_year') {
      setActiveMonthIndex(jMonth - 1);
      setViewMode('month');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Year Title, Year Navigator, Month Selector Pills, and View Mode Switcher */}
      <section className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-800 dark:text-white">
                  تقویم جامع برنامه‌ریزی سال {toPersianNum(currentMonth.jYear)}
                </h2>
                {currentMonth.isLeapYear && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    سال کبیسه (اسفند ۳۰ روزه)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                روی هر روز کلیک کن تا خلاصه کارهای آن روز را ببینی یا مستقیماً وارد برنامه آن روز شوی
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Year Navigation Controls (BUG-11) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setSelectedJYear((y) => y - 1)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition flex items-center gap-1"
                title="سال قبل"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>{toPersianNum(selectedJYear - 1)}</span>
              </button>
              <span className="px-2.5 py-1 text-xs font-black text-indigo-600 dark:text-indigo-400">
                سال {toPersianNum(selectedJYear)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedJYear((y) => y + 1)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition flex items-center gap-1"
                title="سال بعد"
              >
                <span>{toPersianNum(selectedJYear + 1)}</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onSelectDateKey(todayKey);
                setSelectedJYear(todayParts.jYear);
                setActiveMonthIndex(todayParts.jMonth - 1);
                setViewMode('month');
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition"
            >
              برو به امروز
            </button>

            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === 'month'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                جدول ماهانه
              </button>
              <button
                type="button"
                onClick={() => setViewMode('full_year')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === 'full_year'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                نمای کل سال (۱۲ ماه)
              </button>
            </div>
          </div>
        </div>

        {/* 12 Months Pills Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-2 border-t border-slate-100 dark:border-slate-800">
          {yearCalendar.map((m, idx) => {
            const isSelectedMonth = idx === activeMonthIndex && viewMode === 'month';
            const isCurrentRealMonth = m.jMonth === todayParts.jMonth;
            const monthTaskCount = m.days.reduce(
              (acc, d) => acc + (tasksByDate[d.key]?.total || 0),
              0
            );

            return (
              <button
                key={m.jMonth}
                type="button"
                onClick={() => {
                  setActiveMonthIndex(idx);
                  setViewMode('month');
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition shrink-0 ${
                  isSelectedMonth
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : isCurrentRealMonth
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <span>{m.monthName}</span>
                {monthTaskCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                      isSelectedMonth
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {toPersianNum(monthTaskCount)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Content: Either Full-Year 12-Month Grid OR Monthly 7-Column Table + Day Inspector */}
      {viewMode === 'full_year' ? (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {yearCalendar.map((month) => (
            <div
              key={month.jMonth}
              className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <h3 className="text-sm font-black text-slate-800 dark:text-white">
                  {month.monthName} {toPersianNum(month.jYear)}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMonthIndex(month.jMonth - 1);
                    setViewMode('month');
                  }}
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  باز کردن جدول ماه
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400 font-bold">
                {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: month.startWeekdayOffset }).map((_, i) => (
                  <div key={`empty_${i}`} className="h-8" />
                ))}
                {month.days.map((d) => {
                  const info = tasksByDate[d.key];
                  const isSelected = d.key === selectedDateKey;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => handleSelectDayCell(d.key, month.jMonth)}
                      className={`h-8 rounded-lg text-xs font-bold flex flex-col items-center justify-center relative transition ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : d.isToday
                          ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500'
                          : info && info.total > 0
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{toPersianNum(d.jDay)}</span>
                      {info && info.total > 0 && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full absolute bottom-0.5 ${
                            isSelected ? 'bg-white' : 'bg-indigo-500'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 7-Column Weekly Table for the Active Month (7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-5">
            {/* Month Header & Prev/Next controls */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={activeMonthIndex <= 0}
                  onClick={() => setActiveMonthIndex((i) => Math.max(0, i - 1))}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 disabled:opacity-30 transition"
                  aria-label="ماه قبل"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <h3 className="text-base sm:text-lg font-black text-slate-800 dark:text-white px-2">
                  {currentMonth.monthName} {toPersianNum(currentMonth.jYear)}
                </h3>
                <button
                  type="button"
                  disabled={activeMonthIndex >= 11}
                  onClick={() => setActiveMonthIndex((i) => Math.min(11, i + 1))}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 disabled:opacity-30 transition"
                  aria-label="ماه بعد"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <span className="text-xs text-slate-400 font-medium">
                {toPersianNum(currentMonth.days.length)} روز
              </span>
            </div>

            {/* Days of Week Header Table */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center">
              {PERSIAN_WEEKDAYS.map((dayName) => (
                <div
                  key={dayName}
                  className="py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold text-slate-500 dark:text-slate-400"
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* 7-Column Calendar Cells */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {Array.from({ length: currentMonth.startWeekdayOffset }).map((_, idx) => (
                <div
                  key={`offset_${idx}`}
                  className="h-20 sm:h-24 rounded-2xl bg-slate-50/40 dark:bg-slate-900/20 border border-dashed border-slate-200/40 dark:border-slate-800/40"
                />
              ))}

              {currentMonth.days.map((day) => {
                const isSelected = day.key === selectedDateKey;
                const taskStat = tasksByDate[day.key];
                const habitsDoneCount = habits.filter((h) => h.completedDates[day.key]).length;

                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => onSelectDateKey(day.key)}
                    className={`h-20 sm:h-24 p-2 rounded-2xl border text-right flex flex-col justify-between transition-all relative group cursor-pointer active:scale-95 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/25 ring-2 ring-indigo-500/40'
                        : day.isToday
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500/50 text-slate-900 dark:text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-sm sm:text-base font-black ${
                          isSelected
                            ? 'text-white'
                            : day.isToday
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : ''
                        }`}
                      >
                        {toPersianNum(day.jDay)}
                      </span>
                      {day.isToday && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-indigo-500 text-white'
                          }`}
                        >
                          امروز
                        </span>
                      )}
                    </div>

                    {/* Task & Habit summary badges inside the cell */}
                    <div className="space-y-1 w-full">
                      {taskStat && taskStat.total > 0 && (
                        <div
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate flex items-center justify-between ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : taskStat.done === taskStat.total
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                          }`}
                        >
                          <span>{toPersianNum(taskStat.total)} کار</span>
                          <span>
                            {toPersianNum(taskStat.done)}/{toPersianNum(taskStat.total)}
                          </span>
                        </div>
                      )}

                      {habitsDoneCount > 0 && (
                        <div className="flex items-center gap-0.5">
                          <span
                            className={`text-[9px] ${
                              isSelected ? 'text-indigo-100' : 'text-emerald-500'
                            }`}
                          >
                            {toPersianNum(habitsDoneCount)} عادت ✓
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Selected Day Summary & Direct Day Entry (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              {/* Day Header */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                    خلاصه و جزئیات روز انتخاب‌شده
                  </span>
                  <h3 className="text-base font-black text-slate-800 dark:text-white mt-0.5">
                    {formatDateKeyToPersian(selectedDateKey)}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {toPersianNum(selectedDayDoneCount)} از {toPersianNum(selectedDayTasks.length)} کار تکمیل شده • مجموع زمان:{' '}
                    {toPersianNum(selectedDayTotalMinutes)} دقیقه
                  </p>
                </div>

                {/* Direct Jump / Enter Day Buttons */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEnterDayInTab(selectedDateKey, 'deep_focus')}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[11px] font-bold flex items-center gap-1 hover:opacity-90 transition shadow-sm"
                  >
                    <span>ورود به تمرکز عمیق این روز</span>
                    <ArrowUpLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnterDayInTab(selectedDateKey, 'workspace')}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1 hover:bg-indigo-100 transition"
                  >
                    <span>باز کردن در میز کار</span>
                    <Layers className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Add Task Directly to this Day */}
              <form
                onSubmit={handleAddTaskForSelectedDay}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-2.5"
              >
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-indigo-500" />
                  <span>ثبت کار جدید در همین تاریخ:</span>
                </div>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="عنوان کار برای این روز..."
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">اولویت</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(Number(e.target.value) || 1)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">مدت (دقیقه)</label>
                    <input
                      type="number"
                      min={5}
                      max={600}
                      value={newTaskDuration}
                      onChange={(e) => setNewTaskDuration(Number(e.target.value) || 45)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-0.5">ساعت یادآور</label>
                    <input
                      type="time"
                      value={newTaskReminder}
                      onChange={(e) => setNewTaskReminder(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs transition shadow-sm"
                >
                  افزودن به {formatDateKeyToPersian(selectedDateKey)}
                </button>
              </form>

              {/* Tasks List for Selected Day */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  لیست کارهای این روز ({toPersianNum(selectedDayTasks.length)}):
                </h4>
                {selectedDayTasks.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    کاری برای این تاریخ ثبت نشده است.
                  </div>
                ) : (
                  selectedDayTasks.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-2 transition ${
                        t.completed
                          ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 opacity-70'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onToggleTask(t.id)}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition ${
                            t.completed
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {t.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                              اولویت {toPersianNum(t.priority)}
                            </span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {toPersianNum(t.duration)} دقیقه
                            </span>
                            {t.reminderTime && (
                              <span className="text-[10px] text-amber-500 flex items-center gap-0.5 font-bold">
                                <Bell className="w-3 h-3" />
                                {toPersianNum(t.reminderTime)}
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-xs font-bold truncate mt-0.5 ${
                              t.completed
                                ? 'line-through text-slate-400'
                                : 'text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {t.title}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(t.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 transition"
                        title="حذف کار"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Habits Check-in for Selected Day */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                وضعیت عادت‌ها در این تاریخ:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {habits.map((h) => {
                  const done = !!h.completedDates[selectedDateKey];
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => onToggleHabitDay(h.id, selectedDateKey)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border transition ${
                        done
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <span>{h.emoji}</span>
                      <span className="truncate max-w-[110px]">{h.title}</span>
                      {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
