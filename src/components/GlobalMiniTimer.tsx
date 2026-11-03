import React, { useEffect, useRef, useState } from 'react';
import {
  Timer,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  RotateCcw,
  Check,
  Coffee,
} from 'lucide-react';
import { Task } from '../types';
import { toPersianNum } from '../utils/persianDate';
import {
  formatTimerClockLatin,
  isFloatingTimerSessionActive,
} from '../utils/pomodoroEngine';
import { GlobalPomodoroController } from '../app/useGlobalPomodoro';

interface GlobalMiniTimerProps {
  tasks: Task[];
  visible: boolean;
  activeRouteKey?: string;
  isModalOpen?: boolean;
  hasActiveToast?: boolean;
  controller: GlobalPomodoroController;
  onOpenFullTimer: () => void;
}

export const GlobalMiniTimer: React.FC<GlobalMiniTimerProps> = ({
  tasks,
  visible,
  activeRouteKey,
  isModalOpen = false,
  hasActiveToast = false,
  controller,
  onOpenFullTimer,
}) => {
  const {
    timerState,
    timeLeft,
    elapsedMinutes,
    handleTogglePlay,
    handleReset,
    handleFinishEarlyAndLog,
  } = controller;

  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<'reset' | 'finish' | null>(null);
  const [isTextInputFocusedOnMobile, setIsTextInputFocusedOnMobile] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const capsuleBtnRef = useRef<HTMLButtonElement>(null);

  // Reset to collapsed state whenever route/tab changes or visibility toggles
  useEffect(() => {
    setIsExpanded(false);
    setConfirmingAction(null);
  }, [activeRouteKey, visible]);

  // Collapse if a primary modal dialog opens so we never sit above or compete with important dialogs
  useEffect(() => {
    if (isModalOpen && isExpanded) {
      setIsExpanded(false);
      setConfirmingAction(null);
    }
  }, [isModalOpen, isExpanded]);

  // Detect active text input / virtual keyboard on mobile viewports so capsule doesn't cover active fields
  useEffect(() => {
    const checkActiveElement = () => {
      if (typeof window === 'undefined' || window.innerWidth >= 1024) {
        setIsTextInputFocusedOnMobile(false);
        return;
      }
      const el = document.activeElement;
      const isEditable =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      setIsTextInputFocusedOnMobile(Boolean(isEditable));
    };

    document.addEventListener('focusin', checkActiveElement);
    document.addEventListener('focusout', checkActiveElement);
    return () => {
      document.removeEventListener('focusin', checkActiveElement);
      document.removeEventListener('focusout', checkActiveElement);
    };
  }, []);

  const collapseAndRestoreFocus = () => {
    setIsExpanded(false);
    setConfirmingAction(null);
    requestAnimationFrame(() => {
      capsuleBtnRef.current?.focus();
    });
  };

  // Close expanded panel on outside click or Escape key without stopping the timer
  useEffect(() => {
    if (!isExpanded) return;

    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setIsExpanded(false);
        setConfirmingAction(null);
        requestAnimationFrame(() => {
          capsuleBtnRef.current?.focus();
        });
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        collapseAndRestoreFocus();
      }
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  const isSessionActive = isFloatingTimerSessionActive(timerState, timeLeft);

  if (!visible || !isSessionActive || isModalOpen || isTextInputFocusedOnMobile) {
    return null;
  }

  // Strictly Latin digits in MM:SS (or HH:MM:SS when >= 1 hour)
  const formattedTimeLatin = formatTimerClockLatin(timeLeft);
  const isExtendedHours = timeLeft >= 3600;

  const linkedTask = tasks.find((t) => t.id === timerState.taskId);
  const isWorkPhase = timerState.phase === 'work';
  const taskOrPhaseTitle = isWorkPhase
    ? linkedTask?.title || timerState.taskTitle || 'جلسهٔ تمرکز آزاد'
    : timerState.phase === 'long_break'
    ? 'استراحت طولانی'
    : 'استراحت کوتاه';

  const statusLabelFa = timerState.isRunning ? 'در حال اجرا' : 'متوقف موقت';
  const phaseKindLabelFa = isWorkPhase ? 'تمرکز' : 'استراحت';

  // Accessible static label (does NOT include ticking seconds so screen readers aren't spammed every second)
  const accessibleCapsuleLabel = `تایمر ${phaseKindLabelFa} (${statusLabelFa}) — ${
    isExpanded ? 'بستن پنل کنترل تایمر' : 'باز کردن پنل کنترل تایمر'
  }`;

  const totalSeconds = Math.max(1, timerState.durationSeconds);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((totalSeconds - timeLeft) / totalSeconds) * 100))
  );

  const positionPositioningClasses = hasActiveToast
    ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-20'
    : 'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-6';

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="ویجت شناور تایمر تمرکز"
      data-testid="global-mini-timer"
      className={`fixed ${positionPositioningClasses} right-4 lg:right-auto lg:left-6 z-30 flex flex-col items-end lg:items-start transition-all duration-200`}
    >
      {/* Expanded Popover Panel */}
      {isExpanded && (
        <div
          id="global-mini-timer-panel"
          role="dialog"
          aria-modal="false"
          aria-label="پنل کنترل تایمر شناور"
          data-testid="global-mini-timer-panel"
          className="mb-2.5 w-[min(308px,calc(100vw-2rem))] rounded-[18px] kairos-glass-popover border p-4 space-y-3.5 animate-fade-in"
        >
          {/* Header Row: Task/Phase Info + Collapse Button */}
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    timerState.isRunning
                      ? isWorkPhase
                        ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {timerState.isRunning ? (
                    isWorkPhase ? (
                      <Timer className="w-3 h-3 shrink-0" />
                    ) : (
                      <Coffee className="w-3 h-3 shrink-0" />
                    )
                  ) : (
                    <Pause className="w-3 h-3 shrink-0" />
                  )}
                  <span>
                    {phaseKindLabelFa} • {statusLabelFa}
                  </span>
                </span>
              </div>

              <div
                data-testid="global-mini-timer-task-title"
                className="text-xs font-bold text-token-primary truncate"
                title={taskOrPhaseTitle}
              >
                {taskOrPhaseTitle}
              </div>
            </div>

            <button
              type="button"
              data-testid="global-mini-timer-collapse-btn"
              onClick={collapseAndRestoreFocus}
              aria-label="جمع کردن پنل تایمر"
              title="جمع کردن پنل تایمر (Escape)"
              className="p-1.5 rounded-xl kairos-btn-secondary text-token-secondary hover:text-token-primary shrink-0 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Countdown Time Display (Latin Digits, LTR, Tabular-Nums) & Progress Bar */}
          <div className="p-3 rounded-xl bg-surface-2/85 border border-token-subtle space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-token-secondary">
                زمان باقی‌مانده:
              </span>
              <span
                dir="ltr"
                data-testid="global-mini-timer-panel-time"
                className="text-2xl font-black font-mono tabular-nums tracking-tight text-token-primary select-none"
              >
                {formattedTimeLatin}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200/80 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  !timerState.isRunning
                    ? 'bg-amber-500'
                    : isWorkPhase
                    ? 'bg-indigo-600 dark:bg-indigo-500'
                    : 'bg-emerald-600 dark:bg-emerald-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Primary Controls: Pause/Resume & Open Full Focus Page */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="global-mini-timer-toggle-play"
              onClick={handleTogglePlay}
              className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 text-white shadow-xs transition cursor-pointer shrink-0 ${
                timerState.isRunning
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {timerState.isRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5 shrink-0" />
                  <span>توقف موقت</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>ادامه</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="global-mini-timer-open-full"
              onClick={() => {
                setIsExpanded(false);
                setConfirmingAction(null);
                onOpenFullTimer();
              }}
              className="flex-1 py-2 px-2.5 rounded-xl text-xs font-bold kairos-btn-secondary flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">باز کردن صفحهٔ تمرکز</span>
            </button>
          </div>

          {/* Separated & Accidental-Touch Protected Session Reset / Finish Controls */}
          <div className="pt-2.5 border-t border-token-subtle">
            {confirmingAction === null ? (
              <div className="flex items-center justify-between gap-2">
                {isWorkPhase && elapsedMinutes > 0 ? (
                  <button
                    type="button"
                    data-testid="global-mini-timer-request-finish"
                    onClick={() => setConfirmingAction('finish')}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>ثبت و پایان ({toPersianNum(elapsedMinutes)} دقیقه)</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-token-muted">کنترل جلسه</span>
                )}

                <button
                  type="button"
                  data-testid="global-mini-timer-request-reset"
                  onClick={() => setConfirmingAction('reset')}
                  className="text-[11px] font-semibold text-token-secondary hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>بازنشانی تایمر</span>
                </button>
              </div>
            ) : (
              <div
                data-testid="global-mini-timer-confirm-box"
                className="p-2 rounded-xl bg-surface-2 border border-token-subtle flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="font-bold text-token-primary truncate">
                  {confirmingAction === 'finish'
                    ? `ثبت ${toPersianNum(elapsedMinutes)} دقیقه و پایان؟`
                    : 'تایمر بازنشانی شود؟'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid="global-mini-timer-confirm-yes"
                    onClick={() => {
                      const action = confirmingAction;
                      setConfirmingAction(null);
                      setIsExpanded(false);
                      if (action === 'finish') {
                        handleFinishEarlyAndLog();
                      } else {
                        handleReset(true);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-white font-bold cursor-pointer ${
                      confirmingAction === 'finish'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    تأیید
                  </button>
                  <button
                    type="button"
                    data-testid="global-mini-timer-confirm-no"
                    onClick={() => setConfirmingAction(null)}
                    className="px-2 py-1 rounded-lg kairos-btn-secondary font-semibold cursor-pointer"
                  >
                    لغو
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapsed Floating Capsule Trigger (Target: ~96-106px width, 46px height, comfortable touch area) */}
      <button
        ref={capsuleBtnRef}
        type="button"
        data-testid="global-mini-timer-capsule"
        data-timer-state={timerState.isRunning ? 'running' : 'paused'}
        aria-label={accessibleCapsuleLabel}
        aria-expanded={isExpanded}
        aria-controls={isExpanded ? 'global-mini-timer-panel' : undefined}
        onClick={() => {
          setIsExpanded((prev) => {
            const next = !prev;
            if (!next) setConfirmingAction(null);
            return next;
          });
        }}
        className={`h-[46px] ${
          isExtendedHours ? 'w-[120px]' : 'w-[102px]'
        } px-3 rounded-full kairos-glass-floating border flex items-center justify-between gap-2 cursor-pointer select-none ${
          isExpanded
            ? 'ring-2 ring-indigo-500/50'
            : !timerState.isRunning
            ? 'border-amber-500/45'
            : ''
        }`}
      >
        {/* Icon & Non-Color Pause Indicator */}
        <span
          aria-hidden="true"
          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
            !timerState.isRunning
              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-dashed border-amber-500/60'
              : isWorkPhase
              ? 'bg-indigo-600 text-white'
              : 'bg-emerald-600 text-white'
          }`}
        >
          {timerState.isRunning ? (
            <Timer className="w-3.5 h-3.5" />
          ) : (
            <Pause className="w-3.5 h-3.5" />
          )}
        </span>

        {/* Remaining Time in Latin Digits, LTR, Tabular-Nums (aria-hidden so SR doesn't read every tick) */}
        <span
          dir="ltr"
          aria-hidden="true"
          data-testid="global-mini-timer-capsule-time"
          className="text-sm font-black font-mono tabular-nums tracking-tight text-token-primary leading-none"
        >
          {formattedTimeLatin}
        </span>
      </button>
    </div>
  );
};
