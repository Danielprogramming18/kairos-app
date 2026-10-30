import React, { useState } from 'react';
import { BarChart3, CheckCircle, Clock, Trophy, Copy, Check, TrendingUp } from 'lucide-react';
import { Task, Habit, FocusSession } from '../types';
import { toPersianNum, getWeekDays, getRollingLastNDays } from '../utils/persianDate';
import { computeWeeklyAnalyticsSummary } from '../utils/analyticsCalculator';

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
  const [rangeMode, setRangeMode] = useState<'current_week' | 'rolling_7'>('current_week');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const selectedDays =
    rangeMode === 'current_week' ? getWeekDays(0) : getRollingLastNDays(7);
  const rangeLabel =
    rangeMode === 'current_week' ? 'در هفتهٔ جاری (شنبه تا جمعه)' : 'در ۷ روز اخیر';

  const {
    totalTasksCompleted,
    completedTasksEstimatedMinutes,
    totalHabitsDone,
    habitSuccessRate,
    totalFocusMinutes,
    focusHours,
    focusRemainingMins,
    topStreak,
    topStreakHabit,
    bestAllTimeStreak,
    bestAllTimeStreakHabit,
    dailyBreakdown,
  } = computeWeeklyAnalyticsSummary(tasks, habits, focusSessions, selectedDays);

  const maxDayFocus = Math.max(60, ...dailyBreakdown.map((d) => d.dayFocusMins));

  const reportText = `📊 گزارش عملکرد کایروس (${rangeMode === 'current_week' ? 'هفتهٔ جاری' : '۷ روز اخیر'})
-----------------------------------
✅ کارهای انجام‌شده: ${toPersianNum(totalTasksCompleted)} کار (مجموع زمان تخمینی: ${toPersianNum(completedTasksEstimatedMinutes)} دقیقه)
🎯 نرخ تحقق عادت‌ها: ${toPersianNum(habitSuccessRate)}٪ (${toPersianNum(totalHabitsDone)} ثبت)
⏱ زمان واقعی تمرکز (تایمر): ${toPersianNum(focusHours)} ساعت و ${toPersianNum(focusRemainingMins)} دقیقه (${toPersianNum(totalFocusMinutes)} دقیقه)
🔥 بهترین زنجیرهٔ فعال فعلی: ${toPersianNum(topStreak)} روز (${topStreakHabit})
🏆 بهترین رکورد کل: ${toPersianNum(bestAllTimeStreak)} روز (${bestAllTimeStreakHabit})`;

  const handleCopyReport = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('امکان کپی خودکار در کلیپ‌بورد وجود ندارد.');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Range Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-black text-slate-800 dark:text-white">
            گزارش عملکرد و پیوستگی
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            مقایسهٔ کارهای انجام‌شده، عادت‌ها و زمان واقعی ثبت‌شده در جلسات تمرکز
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setRangeMode('current_week')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              rangeMode === 'current_week'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            هفتهٔ جاری (شنبه تا جمعه)
          </button>
          <button
            type="button"
            onClick={() => setRangeMode('rolling_7')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              rangeMode === 'rolling_7'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            ۷ روز اخیر
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              کارهای انجام‌شده
            </span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(totalTasksCompleted)}
              </h3>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">کار</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {rangeLabel} • تخمین: {toPersianNum(completedTasksEstimatedMinutes)} دقیقه
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              تحقق اهداف عادت‌ها
            </span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(habitSuccessRate)}٪
              </h3>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">تحقق</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {toPersianNum(totalHabitsDone)} ثبت {rangeLabel}
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              زمان واقعی تمرکز (تایمر)
            </span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(totalFocusMinutes)}
              </h3>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-bold">دقیقه</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              معادل {toPersianNum(focusHours)} ساعت و {toPersianNum(focusRemainingMins)} دقیقه
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              زنجیرهٔ فعال / رکورد کل
            </span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(topStreak)}
              </h3>
              <span className="text-xs text-rose-600 dark:text-rose-400 font-bold">
                روز (رکورد: {toPersianNum(bestAllTimeStreak)})
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
              {topStreakHabit}
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <Trophy className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 7-Day Focus & Task Chart */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              نمودار روزانهٔ تمرکز و کارهای انجام‌شده ({rangeMode === 'current_week' ? 'هفتهٔ جاری' : '۷ روز اخیر'})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              مقایسهٔ زمان ثبت‌شده در تایمر تمرکز (دقیقه) و کارهای تکمیل‌شده در هر روز
            </p>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-44 pt-6 px-2 border-b border-slate-100 dark:border-slate-800">
          {dailyBreakdown.map((d) => {
            const heightPct = d.isFuture
              ? 0
              : Math.max(8, Math.min(100, Math.round((d.dayFocusMins / maxDayFocus) * 100)));
            return (
              <div
                key={d.key}
                className="flex flex-col items-center justify-end h-full group relative"
              >
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap pointer-events-none z-10 shadow-sm">
                  {toPersianNum(d.dayFocusMins)} دقیقه تمرکز • {toPersianNum(d.doneTasksCount)} کار
                </div>
                <span
                  className={`text-[10px] font-bold mb-1 tabular-nums ${
                    d.isToday
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {toPersianNum(d.dayFocusMins)}د
                </span>
                <div className="w-full max-w-[36px] h-24 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 flex items-end overflow-hidden border border-slate-200/60 dark:border-slate-700/50">
                  <div
                    className={`w-full rounded-lg transition-all duration-500 ${
                      d.dayFocusMins > 0
                        ? 'bg-indigo-600 dark:bg-indigo-500'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span
                  className={`mt-2 text-xs font-bold ${
                    d.isToday
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {d.weekdayName}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Card with Copy */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              خلاصهٔ متنی گزارش
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              خلاصهٔ قابل کپی برای مرور هفتگی پیشرفت
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition cursor-pointer"
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

        {copyError && (
          <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{copyError}</p>
        )}

        <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap select-all font-medium">
          {reportText}
        </div>
      </div>
    </div>
  );
};
