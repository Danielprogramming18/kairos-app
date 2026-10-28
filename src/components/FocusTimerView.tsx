import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, SkipForward, Timer, CheckCircle, Flame, Clock } from 'lucide-react';
import { Task, FocusSession } from '../types';
import { toPersianNum, getTodayKey } from '../utils/persianDate';
import { soundManager } from '../utils/soundEffects';

interface FocusTimerViewProps {
  tasks: Task[];
  focusSessions: FocusSession[];
  onLogFocusSession: (session: FocusSession) => void;
  activeTaskId?: string;
}

export const FocusTimerView: React.FC<FocusTimerViewProps> = ({
  tasks,
  focusSessions,
  onLogFocusSession,
  activeTaskId,
}) => {
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [selectedPreset, setSelectedPreset] = useState<45 | 25 | 60>(45);
  const [timeLeft, setTimeLeft] = useState<number>(45 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentTaskId, setCurrentTaskId] = useState<string>(activeTaskId || '');

  const totalTime = mode === 'work' ? selectedPreset * 60 : (selectedPreset === 45 ? 15 : 5) * 60;
  const progressPercent = Math.round(((totalTime - timeLeft) / totalTime) * 100);

  useEffect(() => {
    if (activeTaskId) {
      setCurrentTaskId(activeTaskId);
    }
  }, [activeTaskId]);

  useEffect(() => {
    let timer: any = null;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      // Completed!
      soundManager.playBell();
      if (mode === 'work') {
        const matchedTask = tasks.find((t) => t.id === currentTaskId);
        onLogFocusSession({
          id: 'focus_' + Date.now(),
          taskId: currentTaskId || undefined,
          taskTitle: matchedTask?.title || 'جلسه تمرکز آزاد',
          durationMinutes: selectedPreset,
          dateKey: getTodayKey(),
          timestamp: Date.now(),
        });
        setMode('break');
        setTimeLeft((selectedPreset === 45 ? 15 : 5) * 60);
      } else {
        setMode('work');
        setTimeLeft(selectedPreset * 60);
      }
      setIsRunning(false);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning, timeLeft, mode, selectedPreset, currentTaskId, tasks, onLogFocusSession]);

  const handlePresetChange = (mins: 45 | 25 | 60) => {
    setSelectedPreset(mins);
    setIsRunning(false);
    setMode('work');
    setTimeLeft(mins * 60);
  };

  const handleTogglePlay = () => {
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(mode === 'work' ? selectedPreset * 60 : (selectedPreset === 45 ? 15 : 5) * 60);
  };

  const handleSkip = () => {
    setIsRunning(false);
    if (mode === 'work') {
      setMode('break');
      setTimeLeft((selectedPreset === 45 ? 15 : 5) * 60);
    } else {
      setMode('work');
      setTimeLeft(selectedPreset * 60);
    }
  };

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

        {/* Header Mode Badge */}
        <div className="flex items-center justify-center gap-3">
          <span
            className={`px-4 py-1.5 rounded-full text-xs font-black transition-all ${
              mode === 'work'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 ring-4 ring-indigo-500/15'
                : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
            }`}
          >
            {mode === 'work' ? '🎯 حالت تمرکز عمیق (اسپرینت)' : '☕ زمان استراحت و ریست مغز'}
          </span>
        </div>

        {/* Preset Selector */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => handlePresetChange(45)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              selectedPreset === 45
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            ۴۵ دقیقه (پومودورو پینگ‌پنگی)
          </button>
          <button
            onClick={() => handlePresetChange(25)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              selectedPreset === 25
                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            ۲۵ دقیقه (کلاسیک)
          </button>
          <button
            onClick={() => handlePresetChange(60)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              selectedPreset === 60
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
              className={`transition-all duration-700 ease-out ${
                mode === 'work' ? 'text-indigo-600 dark:text-indigo-500' : 'text-emerald-500'
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
            <span className="text-4xl sm:text-5xl font-black tracking-tight text-slate-800 dark:text-white" dir="ltr">
              {formatSeconds(timeLeft)}
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              {mode === 'work' ? 'تمرکز کامل بدون حواس‌پرتی' : 'استراحت و کشش بدن'}
            </span>
          </div>
        </div>

        {/* Connected Task Selector */}
        <div className="max-w-md mx-auto">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 text-right">
            اتصال به مأموریت کاری (اختیاری):
          </label>
          <select
            value={currentTaskId}
            onChange={(e) => setCurrentTaskId(e.target.value)}
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
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={handleReset}
            title="بازنشانی زمان"
            className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={handleTogglePlay}
            className={`px-8 py-3.5 rounded-2xl text-white font-black text-sm flex items-center gap-2 shadow-xl transition-all scale-105 active:scale-95 ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
            }`}
          >
            {isRunning ? (
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
            onClick={handleSkip}
            title="رفتن به مرحله بعد"
            className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Focus Stats & History */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium">مجموع تمرکز امروز</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(todayTotalFocusMinutes)}
              </h3>
              <span className="text-xs text-indigo-500 font-bold">دقیقه</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium">جلسات کامل‌شده امروز</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                {toPersianNum(todaySessions.length)}
              </h3>
              <span className="text-xs text-emerald-500 font-bold">جلسه پومودورو</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium">حالت پیش‌فرض</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-lg font-black text-slate-800 dark:text-white">
                ۴۵ / ۱۵ پینگ‌پنگی
              </h3>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
};
