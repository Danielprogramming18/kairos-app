import React, { useState } from 'react';
import { BarChart3, CheckCircle, Flame, Clock, Trophy, Download, Copy, Check } from 'lucide-react';
import { Task, Habit, FocusSession } from '../types';
import { toPersianNum, getWeekDays } from '../utils/persianDate';
import { calculateStreaks } from '../utils/habitStreaks';

interface AnalyticsViewProps {
  tasks: Task[];
  habits: Habit[];
  focusSessions: FocusSession[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  tasks,
  habits,
  focusSessions,
}) => {
  const [copied, setCopied] = useState(false);
  const weekDays = getWeekDays(0);

  // Compute 7-day stats
  let totalTasksCompleted = 0;
  let totalPossibleHabits = 0;
  let totalHabitsDone = 0;
  let totalFocusMinutes = 0;

  weekDays.forEach((d) => {
    // Tasks completed in this week
    const doneTasksInDay = tasks.filter((t) => t.targetDate === d.key && t.completed);
    totalTasksCompleted += doneTasksInDay.length;

    // Habits
    if (!d.isFuture) {
      habits.forEach((h) => {
        totalPossibleHabits++;
        if (h.completedDates[d.key]) totalHabitsDone++;
      });
    }

    // Focus sessions
    const daySessions = focusSessions.filter((s) => s.dateKey === d.key);
    totalFocusMinutes += daySessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  });

  const habitSuccessRate =
    totalPossibleHabits > 0 ? Math.round((totalHabitsDone / totalPossibleHabits) * 100) : 0;

  // Best streak currently
  let topStreak = 0;
  let topStreakHabit = '—';
  habits.forEach((h) => {
    const s = calculateStreaks(h.completedDates);
    if (s.current > topStreak) {
      topStreak = s.current;
      topStreakHabit = h.title;
    }
  });

  const focusHours = Math.floor(totalFocusMinutes / 60);
  const focusRemainingMins = totalFocusMinutes % 60;

  // Generate Report Text
  const reportText = `📊 گزارش عملکرد هفتگی نظم‌یار دانیال
-----------------------------------
✅ مأموریت‌های تکمیل شده در هفته: ${toPersianNum(totalTasksCompleted)} کار
🎯 نرخ تحقق عادت‌های روزانه: ${toPersianNum(habitSuccessRate)}٪ (${toPersianNum(totalHabitsDone)} ثبت)
⏱ مجموع زمان تمرکز پومودورو: ${toPersianNum(focusHours)} ساعت و ${toPersianNum(focusRemainingMins)} دقیقه
🔥 بهترین زنجیره پیوستگی فعال: ${toPersianNum(topStreak)} روز (${topStreakHabit})
-----------------------------------
«قدم‌های کوچک روزانه، نتایج بزرگ می‌سازند.»`;

  const handleCopyReport = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium">مأموریت‌های تکمیل‌شده</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(totalTasksCompleted)}
              </h3>
              <span className="text-xs text-emerald-500 font-bold">کار</span>
            </div>
            <p className="text-[11px] text-slate-400">در ۷ روز اخیر</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium">تحقق اهداف عادت‌ها</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(habitSuccessRate)}٪
              </h3>
              <span className="text-xs text-indigo-500 font-bold">موفقیت</span>
            </div>
            <p className="text-[11px] text-slate-400">{toPersianNum(totalHabitsDone)} ثبت در هفته</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium">زمان تمرکز پومودورو</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(totalFocusMinutes)}
              </h3>
              <span className="text-xs text-amber-500 font-bold">دقیقه</span>
            </div>
            <p className="text-[11px] text-slate-400">
              معادل {toPersianNum(focusHours)} ساعت و {toPersianNum(focusRemainingMins)} دقیقه
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium">بهترین زنجیره استمرار</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(topStreak)}
              </h3>
              <span className="text-xs text-rose-500 font-bold">روز متوالی</span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[130px]">{topStreakHabit}</p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <Trophy className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Summary Card with Copy & Export */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              کارنامه و بازتاب هفتگی دانیال
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              خلاصه متنی قابل کپی یا ذخیره برای بررسی هفتگی پیشرفت شخصی
            </p>
          </div>

          <button
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span>کپی شد!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>کپی متن گزارش</span>
              </>
            )}
          </button>
        </div>

        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap select-all font-medium">
          {reportText}
        </div>
      </div>
    </div>
  );
};
