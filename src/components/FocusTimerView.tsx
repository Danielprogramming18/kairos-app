import React, { useState, useEffect, useCallback } from 'react';
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
import { soundManager } from '../utils/soundEffects';
import { usePlatform } from '../app/PlatformContext';
import { createEntityId } from '../domain/models';
import {
  computeActualElapsedMinutes,
  computeRemainingSeconds,
  createInitialTimerState,
  ExtendedActiveTimerState,
  getPhaseDurationSeconds,
  pauseTimer,
  resetTimer,
  startTimer,
  transitionTimerPhase,
} from '../utils/pomodoroEngine';

const ACTIVE_TIMER_STORAGE_KEY = 'kairos_active_timer_v1';
const PRESET_STORAGE_KEY = 'kairos_pomodoro_preset_v1';

function loadSavedPreset(): 25 | 45 | 60 {
  try {
    const raw = Number(localStorage.getItem(PRESET_STORAGE_KEY));
    if (raw === 25 || raw === 45 || raw === 60) return raw;
  } catch {}
  return 45;
}

function loadSavedTimerState(
  defaultPreset: 25 | 45 | 60,
  activeTaskId?: string
): ExtendedActiveTimerState {
  try {
    const raw = localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ExtendedActiveTimerState;
      if (
        parsed &&
        typeof parsed.durationSeconds === 'number' &&
        (parsed.phase === 'work' || parsed.phase === 'short_break' || parsed.phase === 'long_break')
      ) {
        return {
          ...parsed,
          selectedPresetMinutes:
            parsed.selectedPresetMinutes === 25 ||
            parsed.selectedPresetMinutes === 45 ||
            parsed.selectedPresetMinutes === 60
              ? parsed.selectedPresetMinutes
              : defaultPreset,
          completedWorkCycles: Number(parsed.completedWorkCycles) || 0,
          taskId: activeTaskId || parsed.taskId || null,
        };
      }
    }
  } catch {}
  return createInitialTimerState(defaultPreset, activeTaskId || null);
}

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
  const { container } = usePlatform();

  const [timerState, setTimerState] = useState<ExtendedActiveTimerState>(() =>
    loadSavedTimerState(loadSavedPreset(), activeTaskId)
  );
  const [nowEpochMs, setNowEpochMs] = useState<number>(() => Date.now());

  // Persist active timer state to localStorage & IndexedDB (BUG-20)
  const persistState = useCallback(
    (next: ExtendedActiveTimerState) => {
      setTimerState(next);
      setNowEpochMs(Date.now());
      try {
        localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      container.focus.saveActiveTimerState(next).catch(() => {});
    },
    [container]
  );

  // Hydrate from IndexedDB if available and newer
  useEffect(() => {
    container.focus
      .getActiveTimerState()
      .then((repoState) => {
        if (repoState && repoState.updatedAt > timerState.updatedAt) {
          const ext = repoState as ExtendedActiveTimerState;
          setTimerState((prev) => ({
            ...prev,
            ...ext,
            selectedPresetMinutes: ext.selectedPresetMinutes || prev.selectedPresetMinutes,
            completedWorkCycles: ext.completedWorkCycles ?? prev.completedWorkCycles,
          }));
        }
      })
      .catch(() => {});
  }, [container]);

  // Sync activeTaskId prop and reset timer if switched while paused (BUG-16)
  useEffect(() => {
    if (activeTaskId && activeTaskId !== timerState.taskId) {
      setTimerState((prev) => {
        if (prev.isRunning) {
          return { ...prev, taskId: activeTaskId };
        }
        const durationSeconds = getPhaseDurationSeconds(prev.selectedPresetMinutes, 'work');
        const next: ExtendedActiveTimerState = {
          ...prev,
          phase: 'work',
          taskId: activeTaskId,
          durationSeconds,
          remainingSecondsWhenPaused: durationSeconds,
          startedAtEpochMs: null,
          targetEndEpochMs: null,
          updatedAt: new Date().toISOString(),
        };
        try {
          localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(next));
        } catch {}
        container.focus.saveActiveTimerState(next).catch(() => {});
        return next;
      });
    }
  }, [activeTaskId, container, timerState.taskId]);

  const timeLeft = computeRemainingSeconds(timerState, nowEpochMs);
  const elapsedMinutes = computeActualElapsedMinutes(timerState, nowEpochMs);
  const totalTime = timerState.durationSeconds || timerState.selectedPresetMinutes * 60;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((totalTime - timeLeft) / totalTime) * 100))
  );

  // Timestamp-based tick & visibility sync (BUG-15)
  useEffect(() => {
    if (!timerState.isRunning) return;

    const checkTick = () => {
      const now = Date.now();
      setNowEpochMs(now);
      const rem = computeRemainingSeconds(timerState, now);

      if (rem <= 0) {
        soundManager.playBell();
        if (timerState.phase === 'work') {
          const matchedTask = tasks.find((t) => t.id === timerState.taskId);
          onLogFocusSession({
            id: createEntityId('focus'),
            taskId: timerState.taskId || undefined,
            taskTitle: matchedTask?.title || 'جلسه تمرکز آزاد',
            durationMinutes: timerState.selectedPresetMinutes,
            dateKey: getTodayKey(),
            timestamp: now,
          });
        }
        const next = transitionTimerPhase(timerState, timerState.phase === 'work', 4, now);
        persistState(next);
      }
    };

    checkTick();
    const interval = setInterval(checkTick, 250);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkTick();
      }
    };
    window.addEventListener('focus', checkTick);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', checkTick);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [timerState, tasks, onLogFocusSession, persistState]);

  const handlePresetChange = (mins: 25 | 45 | 60) => {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, String(mins));
    } catch {}
    container.settings
      .saveSettings({
        pomodoroWorkMinutes: mins,
        pomodoroShortBreakMinutes: mins === 25 ? 5 : 15,
      })
      .catch(() => {});

    const next: ExtendedActiveTimerState = {
      ...timerState,
      isRunning: false,
      phase: 'work',
      selectedPresetMinutes: mins,
      durationSeconds: mins * 60,
      remainingSecondsWhenPaused: mins * 60,
      startedAtEpochMs: null,
      targetEndEpochMs: null,
      updatedAt: new Date().toISOString(),
    };
    persistState(next);
  };

  const handleTogglePlay = () => {
    const now = Date.now();
    if (timerState.isRunning) {
      persistState(pauseTimer(timerState, now));
    } else {
      persistState(startTimer(timerState, now));
    }
  };

  const handleReset = () => {
    persistState(resetTimer(timerState, Date.now()));
  };

  const handleSkip = () => {
    persistState(transitionTimerPhase(timerState, false, 4, Date.now()));
  };

  // Manual finish logging actual elapsed minutes instead of full preset (BUG-17)
  const handleFinishEarlyAndLog = () => {
    if (timerState.phase !== 'work' || elapsedMinutes < 1) return;
    const now = Date.now();
    soundManager.playCheck();
    const matchedTask = tasks.find((t) => t.id === timerState.taskId);
    onLogFocusSession({
      id: createEntityId('focus'),
      taskId: timerState.taskId || undefined,
      taskTitle: matchedTask?.title || 'جلسه تمرکز آزاد',
      durationMinutes: elapsedMinutes,
      dateKey: getTodayKey(),
      timestamp: now,
    });
    const next = transitionTimerPhase(timerState, true, 4, now);
    persistState(next);
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
            onChange={(e) => {
              const nextTaskId = e.target.value || null;
              persistState({
                ...timerState,
                taskId: nextTaskId,
                updatedAt: new Date().toISOString(),
              });
            }}
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
            className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleTogglePlay}
            className={`px-8 py-3.5 rounded-2xl text-white font-black text-sm flex items-center gap-2 shadow-xl transition-all scale-105 active:scale-95 ${
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
            className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {timerState.phase === 'work' && elapsedMinutes >= 1 && (
            <button
              type="button"
              onClick={handleFinishEarlyAndLog}
              className="px-4 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition"
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
            <span className="text-xs text-slate-400 font-medium">حالت انتخابی</span>
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-lg font-black text-slate-800 dark:text-white">
                {toPersianNum(timerState.selectedPresetMinutes)} دقیقه / استراحت هوشمند
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
