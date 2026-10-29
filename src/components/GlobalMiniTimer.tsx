import React, { useEffect, useState } from 'react';
import { Timer, Play, Pause, Maximize2 } from 'lucide-react';
import { Task } from '../types';
import { toPersianNum } from '../utils/persianDate';
import {
  ExtendedActiveTimerState,
  computeRemainingSeconds,
  pauseTimer,
  startTimer,
} from '../utils/pomodoroEngine';

const ACTIVE_TIMER_STORAGE_KEY = 'kairos_active_timer_v1';

interface GlobalMiniTimerProps {
  tasks: Task[];
  visible: boolean;
  onOpenFullTimer: () => void;
}

export const GlobalMiniTimer: React.FC<GlobalMiniTimerProps> = ({
  tasks,
  visible,
  onOpenFullTimer,
}) => {
  const [snapshot, setSnapshot] = useState<ExtendedActiveTimerState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    const readTimer = () => {
      try {
        const raw = localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY);
        if (!raw) {
          setSnapshot(null);
          return;
        }
        const parsed = JSON.parse(raw) as ExtendedActiveTimerState;
        if (!parsed || typeof parsed.durationSeconds !== 'number') {
          setSnapshot(null);
          return;
        }
        const rem = computeRemainingSeconds(parsed, Date.now());
        if (!parsed.isRunning && rem >= parsed.durationSeconds) {
          setSnapshot(null);
          return;
        }
        setSnapshot(parsed);
        setSecondsLeft(rem);
      } catch {
        setSnapshot(null);
      }
    };

    readTimer();
    const interval = setInterval(readTimer, 1000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible || !snapshot || secondsLeft <= 0) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formattedTime = `${toPersianNum(String(mins).padStart(2, '0'))}:${toPersianNum(
    String(secs).padStart(2, '0')
  )}`;

  const linkedTask = tasks.find((t) => t.id === snapshot.taskId);

  const handleTogglePauseResume = () => {
    const now = Date.now();
    const next = snapshot.isRunning
      ? pauseTimer(snapshot, now)
      : startTimer(snapshot, now);
    setSnapshot(next);
    setSecondsLeft(computeRemainingSeconds(next, now));
    try {
      localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <div
      role="region"
      aria-label="پخش‌کننده کوچک تایمر تمرکز"
      className="fixed bottom-20 lg:bottom-5 right-4 z-40 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-indigo-500/40 flex items-center gap-3 animate-fade-in"
    >
      <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
        <Timer className="w-4 h-4 text-white" />
      </div>

      <div className="min-w-0 max-w-[180px]">
        <div className="text-[10px] font-bold text-indigo-300 truncate">
          {linkedTask ? linkedTask.title : 'جلسه تمرکز فعال'}
        </div>
        <div className="text-sm font-black font-mono tracking-wider">{formattedTime}</div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleTogglePauseResume}
          aria-label={snapshot.isRunning ? 'توقف موقت تایمر' : 'ادامه تایمر'}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
        >
          {snapshot.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={onOpenFullTimer}
          aria-label="باز کردن صفحه کامل تایمر"
          className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
