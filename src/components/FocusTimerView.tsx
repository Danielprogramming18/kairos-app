import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  CheckCircle,
  Flame,
  Clock,
  CheckSquare,
} from 'lucide-react';
import { Task, FocusSession } from '../types';
import { toPersianNum, getTodayKey } from '../utils/persianDate';
import { GlobalPomodoroController } from '../app/useGlobalPomodoro';

interface FocusTimerViewProps {
  tasks: Task[];
  focusSessions: FocusSession[];
  controller: GlobalPomodoroController;
}

export const FocusTimerView: React.FC<FocusTimerViewProps> = ({
  tasks,
  focusSessions,
  controller,
}) => {
  const {
    timerState,
    timeLeft,
    elapsedMinutes,
    progressPercent,
    handleTogglePlay,
    handleReset,
    handleSkip,
    handlePresetChange,
    handleSelectTask,
    handleFinishEarlyAndLog,
  } = controller;

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const padM = String(m).padStart(2, '0');
    const padS = String(s).padStart(2, '0');
    return `${padM}:${padS}`;
  };


  // Compute today's focus stats
  const todayKey = getTodayKey();
  const todaySessions = focusSessions.filter((s) => s.dateKey === todayKey);
  const todayTotalFocusMinutes = todaySessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Timer Cockpit */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-6 sm:p-10 text-center space-y-6 relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header Mode Badge & Cycle Counter */}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <span
            className={`px-4 py-1.5 rounded-full text-xs font-black transition-all ${
              timerState.phase === 'work'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 ring-4 ring-indigo-500/15'
                : timerState.phase === 'long_break'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
                : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
            }`}
          >
            {timerState.phase === 'work'
              ? '🎯 حالت تمرکز عمیق (اسپرینت)'
              : timerState.phase === 'long_break'
              ? '🌟 استراحت طولانی (۲۰ دقیقه شارژ کامل پس از ۴ چرخه)'
              : '☕ زمان استراحت کوتاه و ریست مغز'}
          </span>

          <span className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            چرخهٔ انجام‌شده: {toPersianNum(timerState.completedWorkCycles)} (هر ۴ چرخه استراحت طولانی)
          </span>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => handlePresetChange(45)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              timerState.selectedPresetMinutes === 45
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            ۴۵ دقیقه (پومودورو پینگ‌پنگی)
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange(25)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              timerState.selectedPresetMinutes === 25
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            ۲۵ دقیقه (کلاسیک)
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange(60)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              timerState.selectedPresetMinutes === 60
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            ۶۰ دقیقه (اسپرینت عمیق)
          </button>
        </div>

        {/* Circular Display */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 mx-auto flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {/* Background Ring */}
            <circle
              cx="50"
              cy="50"
              r="44"
              className="text-slate-100 dark:text-slate-800/80"
              strokeWidth="5"
              stroke="currentColor"
              fill="transparent"
            />
            {/* Active Progress Ring */}
            <circle
              cx="50"
              cy="50"
              r="44"
              className={`transition-all duration-300 ease-out ${
                timerState.phase === 'work'
                  ? 'text-indigo-600 dark:text-indigo-500'
                  : timerState.phase === 'long_break'
                  ? 'text-violet-500'
                  : 'text-emerald-500'
              }`}
              strokeWidth="5"
              strokeDasharray={276.46}
              strokeDashoffset={276.46 - (progressPercent / 100) * 276.46}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
            />
          </svg>

          {/* Center Digital Clock */}
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
            <span
              className="text-4xl sm:text-5xl font-black tracking-tight text-slate-800 dark:text-white font-mono"
              dir="ltr"
            >
              {formatSeconds(timeLeft)}
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              {timerState.phase === 'work'
                ? 'تمرکز کامل بدون حواس‌پرتی'
                : 'استراحت، آب خوردن و کشش بدن'}
            </span>
          </div>
        </div>

        {/* Connected Task Selector */}
        <div className="max-w-md mx-auto">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 text-right">
            اتصال به مأموریت کاری (اختیاری):
          </label>
          <select
            value={timerState.taskId || ''}
            onChange={(e) => handleSelectTask(e.target.value || null)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">جلسه تمرکز آزاد (بدون اتصال به مأموریت خاص)</option>
            {tasks
              .filter((t) => !t.completed)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  اولویت {toPersianNum(t.priority)}: {t.title} ({toPersianNum(t.duration)} دقیقه)
                </option>
              ))}
          </select>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleReset}
            title="بازنشانی زمان"
            aria-label="بازنشانی زمان تایمر"
            className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleTogglePlay}
            className={`px-8 py-3.5 rounded-2xl text-white font-black text-sm flex items-center gap-2 shadow-xl transition-all scale-105 active:scale-95 cursor-pointer ${
              timerState.isRunning
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
            }`}
          >
            {timerState.isRunning ? (
              <>
                <Pause className="w-5 h-5 fill-white" />
                <span>توقف موقت</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-white" />
                <span>شروع اسپرینت</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSkip}
            title="رفتن به مرحله بعد"
            aria-label="رفتن به مرحله بعد پومودورو"
            className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {timerState.phase === 'work' && elapsedMinutes >= 1 && (
            <button
              type="button"
              onClick={handleFinishEarlyAndLog}
              className="px-4 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
              title="ثبت زمان واقعی سپری‌شده و پایان اسپرینت"
            >
              <CheckSquare className="w-4 h-4" />
              <span>ثبت {toPersianNum(elapsedMinutes)} دقیقه کار واقعی</span>
            </button>
          )}
        </div>
      </div>

      {/* Focus Stats & History */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">مجموع تمرکز امروز</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(todayTotalFocusMinutes)}
              </h3>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">دقیقه</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">جلسات کامل‌شده امروز</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(todaySessions.length)}
              </h3>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">جلسه پومودورو</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">حالت انتخابی</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-lg font-black text-slate-800 dark:text-white tabular-nums">
                {toPersianNum(timerState.selectedPresetMinutes)} دقیقه / استراحت هوشمند
              </h3>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Today's Focus Sessions Log / Actionable Empty State */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>گزارش جلسات تمرکز امروز</span>
          </h3>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
            {toPersianNum(todaySessions.length)} جلسه ثبت‌شده
          </span>
        </div>

        {todaySessions.length === 0 ? (
          <div
            data-testid="pomodoro-empty-state"
            className="py-8 px-4 text-center space-y-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800"
          >
            <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
              هنوز جلسه تمرکزی در امروز ثبت نشده است
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              یک مأموریت کاری انتخاب کنید یا اسپرینت آزاد را آغاز نمایید تا زمان تمرکز عمیق شما در کارنامه ثبت شود.
            </p>
            {!timerState.isRunning && (
              <button
                type="button"
                onClick={handleTogglePlay}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>شروع اولین اسپرینت تمرکز</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {todaySessions.map((session) => {
              const linkedTask = tasks.find((t) => t.id === session.taskId);
              return (
                <div
                  key={session.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {linkedTask ? linkedTask.title : 'جلسه تمرکز آزاد'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      ثبت‌شده در تاریخ امروز
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-black tabular-nums shrink-0">
                    {toPersianNum(session.durationMinutes)} دقیقه
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
