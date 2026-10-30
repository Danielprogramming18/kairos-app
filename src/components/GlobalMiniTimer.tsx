import React from 'react';
import { Timer, Play, Pause, Maximize2, SkipForward } from 'lucide-react';
import { Task } from '../types';
import { toPersianNum } from '../utils/persianDate';
import { GlobalPomodoroController } from '../app/useGlobalPomodoro';

interface GlobalMiniTimerProps {
  tasks: Task[];
  visible: boolean;
  controller: GlobalPomodoroController;
  onOpenFullTimer: () => void;
}

export const GlobalMiniTimer: React.FC<GlobalMiniTimerProps> = ({
  tasks,
  visible,
  controller,
  onOpenFullTimer,
}) => {
  const { timerState, timeLeft, handleTogglePlay, handleSkip } = controller;

  // Hide mini-player only when on full timer tab or when timer is idle at full initial work duration
  const isIdleWork =
    !timerState.isRunning &&
    timerState.phase === 'work' &&
    timeLeft >= timerState.durationSeconds &&
    timerState.completedWorkCycles === 0;

  if (!visible || isIdleWork || timeLeft <= 0) return null;

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const formattedTime = `${toPersianNum(String(mins).padStart(2, '0'))}:${toPersianNum(
    String(secs).padStart(2, '0')
  )}`;

  const linkedTask = tasks.find((t) => t.id === timerState.taskId);
  const phaseLabel =
    timerState.phase === 'work'
      ? linkedTask
        ? linkedTask.title
        : 'جلسه تمرکز فعال'
      : timerState.phase === 'long_break'
      ? '🌟 استراحت طولانی (شارژ کامل)'
      : '☕ زمان استراحت کوتاه';

  return (
    <div
      role="region"
      aria-label="پخش‌کننده کوچک تایمر تمرکز"
      className="fixed bottom-20 lg:bottom-5 right-4 z-40 bg-slate-900 dark:bg-slate-800 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-indigo-500/40 flex items-center gap-3 animate-fade-in"
    >
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          timerState.phase === 'work'
            ? 'bg-indigo-600'
            : timerState.phase === 'long_break'
            ? 'bg-violet-600'
            : 'bg-emerald-600'
        }`}
      >
        <Timer className="w-4 h-4 text-white" />
      </div>

      <div className="min-w-0 max-w-[190px]">
        <div className="text-[10px] font-bold text-indigo-300 truncate">{phaseLabel}</div>
        <div className="text-sm font-black font-mono tracking-wider">{formattedTime}</div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleTogglePlay}
          aria-label={timerState.isRunning ? 'توقف موقت تایمر' : 'ادامه تایمر'}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
        >
          {timerState.isRunning ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          aria-label="رفتن به مرحله بعد"
          title="رفتن به مرحله بعد"
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
        >
          <SkipForward className="w-3.5 h-3.5" />
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

