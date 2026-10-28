import React, { useState } from 'react';
import {
  Sparkles,
  Zap,
  Target,
  Flame,
  CheckCircle2,
  CalendarArrowUp,
  Clock,
  ArrowRight,
  Send,
  Timer,
  AlertCircle,
} from 'lucide-react';
import { Task, Habit } from '../types';
import { toPersianNum, getTodayKey, getTomorrowKey } from '../utils/persianDate';
import { calculateStreaks } from '../utils/habitStreaks';
import { parseNaturalTaskInput } from '../utils/nlpTaskParser';

interface DashboardViewProps {
  tasks: Task[];
  habits: Habit[];
  onToggleTask: (taskId: string) => void;
  onToggleHabitToday: (habitId: string) => void;
  onAddTask: (task: Omit<Task, 'id' | 'completed'>) => void;
  onMoveOverdueToToday: () => void;
  onMoveOverdueToTomorrow: () => void;
  onSwitchTab: (tab: any) => void;
  onStartFocusOnTask: (taskId: string, taskTitle: string, duration: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  habits,
  onToggleTask,
  onToggleHabitToday,
  onAddTask,
  onMoveOverdueToToday,
  onMoveOverdueToTomorrow,
  onSwitchTab,
  onStartFocusOnTask,
}) => {
  const todayKey = getTodayKey();
  const [nlpInput, setNlpInput] = useState('');
  const [isSubmittingNlp, setIsSubmittingNlp] = useState(false);

  // Compute metrics
  const todayTasks = tasks.filter((t) => t.targetDate <= todayKey);
  const overdueTasks = tasks.filter((t) => t.targetDate < todayKey && !t.completed);
  const todayCompletedTasks = todayTasks.filter((t) => t.completed);
  const tasksPercent =
    todayTasks.length > 0 ? Math.round((todayCompletedTasks.length / todayTasks.length) * 100) : 0;

  // Habits metrics
  const totalHabits = habits.length;
  const completedHabitsToday = habits.filter((h) => h.completedDates[todayKey]).length;
  const habitsPercent =
    totalHabits > 0 ? Math.round((completedHabitsToday / totalHabits) * 100) : 0;

  // Find priority 1 task (The One Thing)
  const pendingTodaySorted = [...todayTasks]
    .filter((t) => !t.completed)
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));
  const topTask = pendingTodaySorted[0] || todayTasks[0];

  // Best streak
  let maxStreak = 0;
  habits.forEach((h) => {
    const s = calculateStreaks(h.completedDates);
    if (s.current > maxStreak) maxStreak = s.current;
  });

  // Time budget
  const totalMinutes = todayTasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);
  const doneMinutes = todayCompletedTasks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0);

  // Handle Natural Language submission (100% Local & Instant for GitHub Pages)
  const handleNlpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nlpInput.trim();
    if (!trimmed) return;

    setIsSubmittingNlp(true);
    const localParsed = parseNaturalTaskInput(trimmed);

    onAddTask({
      title: localParsed.title,
      description: 'ثبت‌شده با پردازشگر زبان طبیعی کایروس',
      priority: localParsed.priority,
      duration: localParsed.duration,
      targetDate: localParsed.targetDate,
      reminderTime: localParsed.reminderTime,
      category: 'work',
    });
    setNlpInput('');
    setIsSubmittingNlp(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Quick NLP Input Bar */}
      <section className="bg-gradient-to-r from-indigo-900/40 via-violet-900/30 to-slate-900/50 p-5 sm:p-6 rounded-3xl border border-indigo-500/20 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                ثبت سریع مأموریت با زبان طبیعی (NLP)
              </h3>
              <p className="text-xs text-slate-300">
                با هر جمله‌ای بنویس؛ سیستم زمان، اولویت و روز را تشخیص می‌دهد.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-300">
            <span>مثال: «فردا ساعت ۵ عصر، ۴۵ دقیقه HTML تمرین کنم اولویت ۱»</span>
          </div>
        </div>

        <form onSubmit={handleNlpSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={nlpInput}
              onChange={(e) => setNlpInput(e.target.value)}
              placeholder="مثلاً: فردا ۴۵ دقیقه تمرین فتوشاپ اولویت ۱..."
              className="w-full px-4 py-3 rounded-2xl bg-white/10 dark:bg-slate-950/60 border border-white/20 dark:border-slate-800 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {nlpInput && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-500/30">
                اینتر بزنید ↵
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmittingNlp || !nlpInput.trim()}
            className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition shrink-0"
          >
            <span>{isSubmittingNlp ? 'پردازش...' : 'ثبت هوشمند'}</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </section>

      {/* 2. Overdue Alert Banner if any */}
      {overdueTasks.length > 0 && (
        <section className="bg-amber-500/10 border border-amber-500/30 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400">
                {toPersianNum(overdueTasks.length)} مأموریت از روزهای قبل باقی مانده است!
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                بدون عذاب وجدان می‌توانی آنها را به امروز یا فردا منتقل کنی تا ذهنت آرام بماند.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onMoveOverdueToToday}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition shadow-sm"
            >
              انتقال به امروز
            </button>
            <button
              onClick={onMoveOverdueToTomorrow}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition"
            >
              انتقال به فردا
            </button>
          </div>
        </section>
      )}

      {/* 3. 4 Main KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Missions Progress */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              پیشرفت مأموریت‌های امروز
            </span>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(todayCompletedTasks.length)} از {toPersianNum(todayTasks.length)}
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                {toPersianNum(tasksPercent)}٪
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {toPersianNum(doneMinutes)} از {toPersianNum(totalMinutes)} دقیقه انجام شده
            </p>
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
                strokeDasharray={`${tasksPercent}, 100`}
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

        {/* Card 2: The One Thing (Priority 1) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1 min-w-0 pr-1">
            <span className="text-xs font-bold text-rose-500 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 fill-rose-500" />
              اولویت ۱ (The One Thing)
            </span>
            <h2 className="text-sm font-black text-slate-800 dark:text-white truncate">
              {topTask ? topTask.title : 'هنوز ثبت نشده'}
            </h2>
            <p className="text-[11px] text-slate-400">
              {topTask
                ? topTask.completed
                  ? 'انجام شد ✅'
                  : `سهمیه: ${toPersianNum(topTask.duration)} دقیقه`
                : 'تمرکز اصلی روز'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Today's Habits Progress */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              عادت‌های تکمیل‌شده امروز
            </span>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(completedHabitsToday)} از {toPersianNum(totalHabits)}
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {toPersianNum(habitsPercent)}٪
              </span>
            </div>
            <p className="text-[11px] text-slate-400">بالاترین زنجیره: {toPersianNum(maxStreak)} روز</p>
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
                className="text-emerald-500 transition-all duration-700 ease-out"
                strokeDasharray={`${habitsPercent}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.8"
                strokeLinecap="round"
              />
            </svg>
            <CheckCircle2 className="w-5 h-5 text-emerald-500 absolute" />
          </div>
        </div>

        {/* Card 4: Best Streak & Motivation */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              زنجیره پیوستگی
            </span>
            <div className="flex items-baseline gap-1.5">
              <h2 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(maxStreak)}
              </h2>
              <span className="text-xs font-bold text-amber-500">روز متوالی</span>
            </div>
            <p className="text-[11px] text-slate-400">«استمرار کلید نتایج بزرگ است»</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Flame className="w-6 h-6" />
          </div>
        </div>
      </section>

      {/* 4. Dual Section: Quick Habit Check + Today's Missions List */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Today's Missions list */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-500" />
                مأموریت‌های امروز (The One Thing & Priorities)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                کارهای انجام‌شده خط می‌خورند تا حس دستاورد حفظ شود.
              </p>
            </div>
            <button
              onClick={() => onSwitchTab('workspace')}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <span>مشاهده تمام میز کار</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>

          <div className="space-y-2.5">
            {todayTasks.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                امروز هنوز مأموریتی ثبت نکرده‌ای! از کادر بالای صفحه با زبان طبیعی بنویس یا کار جدید اضافه کن.
              </div>
            ) : (
              todayTasks.slice(0, 5).map((task) => {
                const isP1 = Number(task.priority) === 1;
                return (
                  <div
                    key={task.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      task.completed
                        ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800/60 opacity-70'
                        : isP1
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500/30 ring-1 ring-indigo-500/10'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => onToggleTask(task.id)}
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                          task.completed
                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                            : 'bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-transparent hover:border-indigo-500'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-black px-2 py-0.2 rounded-md ${
                              isP1
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {isP1 ? '🔥 اولویت ۱' : `اولویت ${toPersianNum(task.priority)}`}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                            <Clock className="w-3 h-3" />
                            {toPersianNum(task.duration)} دقیقه
                          </span>
                        </div>
                        <h4
                          className={`text-sm font-bold truncate mt-0.5 ${
                            task.completed
                              ? 'line-through text-slate-400 dark:text-slate-500 decoration-2 decoration-emerald-500/70'
                              : 'text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {task.title}
                        </h4>
                      </div>
                    </div>

                    {!task.completed && (
                      <button
                        onClick={() => onStartFocusOnTask(task.id, task.title, task.duration)}
                        title="شروع تایمر تمرکز روی این کار"
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 transition flex items-center gap-1 text-xs font-bold shrink-0"
                      >
                        <Timer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">تمرکز</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Today's Habit Check-in Widget */}
        <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                عادت‌های امروز
              </h3>
              <button
                onClick={() => onSwitchTab('habits')}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                جدول هفتگی
              </button>
            </div>

            <div className="space-y-2">
              {habits.slice(0, 6).map((habit) => {
                const isDone = !!habit.completedDates[todayKey];
                const streaks = calculateStreaks(habit.completedDates);
                return (
                  <div
                    key={habit.id}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isDone
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/70 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg shrink-0">{habit.emoji}</span>
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {habit.title}
                        </h5>
                        <span className="text-[10px] text-slate-400">
                          زنجیره: {toPersianNum(streaks.current)} روز
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleHabitToday(habit.id)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                        isDone
                          ? 'text-white shadow-md'
                          : 'bg-slate-200 dark:bg-slate-700 text-transparent hover:bg-slate-300'
                      }`}
                      style={{
                        backgroundColor: isDone ? habit.color : undefined,
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => onSwitchTab('planner')}
            className="w-full mt-4 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>چیدن برنامه روزانه با هوش مصنوعی</span>
          </button>
        </div>
      </section>
    </div>
  );
};
