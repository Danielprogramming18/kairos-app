import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Coffee,
  CheckCircle2,
  SkipForward,
  Flame,
  Volume2,
  VolumeX,
  Check,
  Maximize2,
  Minimize2,
  AlertTriangle,
  ListChecks,
  Timer,
  SlidersHorizontal,
} from 'lucide-react';
import { Task, FocusSession } from '../types';
import { toPersianNum, getTodayKey } from '../utils/persianDate';
import { getBreakDurationMinutes } from '../utils/pomodoroEngine';
import { GlobalPomodoroController } from '../app/useGlobalPomodoro';
import { DeepFocusView } from './DeepFocusView';

interface FocusTimerViewProps {
  tasks: Task[];
  focusSessions: FocusSession[];
  soundEnabled: boolean;
  onToggleSound: () => void;
  controller: GlobalPomodoroController;
  initialMode?: 'timer' | 'focus_list';
  onToggleTask?: (id: string) => void;
  onToggleSubtask?: (taskId: string, subtaskId: string) => void;
  onAddSubtask?: (taskId: string, title: string) => void;
  onOpenNewTaskModal?: () => void;
}

const PRESET_MINUTES = [15, 25, 45, 60];

export const FocusTimerView: React.FC<FocusTimerViewProps> = ({
  tasks,
  focusSessions,
  soundEnabled,
  onToggleSound,
  controller,
  initialMode = 'timer',
  onToggleTask,
  onToggleSubtask,
  onAddSubtask,
  onOpenNewTaskModal,
}) => {
  const {
    timerState,
    timeLeft,
    elapsedMinutes,
    elapsedSeconds,
    pendingConfirmation,
    handleTogglePlay,
    handleReset,
    handleSkip,
    handlePresetChange,
    handleSelectTask,
    handleStartFocusOnTask,
    handleFinishEarlyAndLog,
    confirmPendingAndLogPrevious,
    confirmPendingAndDiscardPrevious,
    cancelPendingConfirmation,
  } = controller;

  const [focusViewMode, setFocusViewMode] = useState<'timer' | 'focus_list'>(initialMode);
  const [isZenMode, setIsZenMode] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>(() =>
    String(timerState.selectedPresetMinutes || 45)
  );
  const [showCustomInput, setShowCustomInput] = useState(false);

  const pendingTasks = tasks.filter((t) => !t.completed);
  const activeTask = tasks.find((t) => t.id === timerState.taskId);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${toPersianNum(String(minutes).padStart(2, '0'))}:${toPersianNum(
    String(seconds).padStart(2, '0')
  )}`;

  const totalSeconds = Math.max(1, timerState.durationSeconds);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((totalSeconds - timeLeft) / totalSeconds) * 100))
  );

  const todayKey = getTodayKey();
  const todaySessions = focusSessions.filter(
    (s) => s.dateKey === todayKey && (s.phase === undefined || s.phase === 'work')
  );
  const todayTotalFocusMins = todaySessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  const isCustomPresetActive = !PRESET_MINUTES.includes(timerState.selectedPresetMinutes);

  const handleCustomDurationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(customMinutesInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 240) return;
    handlePresetChange(parsed);
    setShowCustomInput(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Unified Focus Sub-Navigation: Timer vs Distraction-Free Focus List */}
      {!isZenMode && (
        <div className="bg-surface-1 p-2 rounded-2xl border border-token-subtle flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="focus-mode-timer-tab"
              onClick={() => setFocusViewMode('timer')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                focusViewMode === 'timer'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-token-secondary hover:bg-surface-2 hover:text-token-primary'
              }`}
            >
              <Timer className="w-4 h-4" />
              <span>تایمر تمرکز</span>
            </button>

            <button
              type="button"
              data-testid="focus-mode-list-tab"
              onClick={() => setFocusViewMode('focus_list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                focusViewMode === 'focus_list'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-token-secondary hover:bg-surface-2 hover:text-token-primary'
              }`}
            >
              <ListChecks className="w-4 h-4" />
              <span>فهرست کم‌حواس‌پرتی</span>
            </button>
          </div>

          {focusViewMode === 'timer' && (
            <button
              type="button"
              onClick={() => setIsZenMode(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-2 text-token-secondary hover:text-token-primary text-xs font-semibold transition cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>حالت تمام‌صفحه آرام</span>
            </button>
          )}
        </div>
      )}

      {focusViewMode === 'focus_list' && !isZenMode ? (
        <DeepFocusView
          tasks={tasks}
          onToggleTask={onToggleTask || (() => {})}
          onToggleSubtask={onToggleSubtask || (() => {})}
          onAddSubtask={onAddSubtask || (() => {})}
          onStartFocusOnTask={(id, title, dur) => {
            handleStartFocusOnTask(id, title, dur);
            setFocusViewMode('timer');
          }}
          onOpenNewTaskModal={onOpenNewTaskModal || (() => {})}
        />
      ) : (
        <div
          className={`grid grid-cols-1 ${
            isZenMode ? '' : 'lg:grid-cols-12'
          } gap-6 items-start`}
        >
          {/* Main Timer Card */}
          <div
            className={`${
              isZenMode ? 'max-w-xl mx-auto w-full' : 'lg:col-span-7'
            } bg-surface-1 p-6 sm:p-8 rounded-2xl border border-token-subtle shadow-2xs flex flex-col items-center text-center space-y-6 relative overflow-hidden`}
          >
            {/* Top Status & Controls Row */}
            <div className="w-full flex items-center justify-between gap-2">
              <div
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold ${
                  timerState.phase === 'work'
                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                    : timerState.phase === 'long_break'
                    ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                }`}
              >
                {timerState.phase === 'work' ? (
                  <>
                    <Flame className="w-4 h-4" />
                    <span>جلسهٔ تمرکز ({toPersianNum(timerState.selectedPresetMinutes)} دقیقه)</span>
                  </>
                ) : timerState.phase === 'long_break' ? (
                  <>
                    <Coffee className="w-4 h-4" />
                    <span>استراحت طولانی (۲۰ دقیقه)</span>
                  </>
                ) : (
                  <>
                    <Coffee className="w-4 h-4" />
                    <span>
                      استراحت کوتاه (
                      {toPersianNum(
                        getBreakDurationMinutes(timerState.selectedPresetMinutes, 'short_break')
                      )}{' '}
                      دقیقه)
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {isZenMode && (
                  <button
                    type="button"
                    onClick={() => setIsZenMode(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-2 text-token-secondary hover:text-token-primary text-xs font-semibold cursor-pointer"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>خروج از تمام‌صفحه</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onToggleSound}
                  aria-label={soundEnabled ? 'قطع صدای زنگ تایمر' : 'وصل صدای زنگ تایمر'}
                  title={soundEnabled ? 'صدای پایان تایمر: فعال' : 'صدای پایان تایمر: بی‌صدا'}
                  className="p-2 rounded-xl bg-surface-2 text-token-secondary hover:text-token-primary transition cursor-pointer"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Active Session Protection Confirmation Dialog (FIX-16) */}
            {pendingConfirmation && (
              <div
                role="alertdialog"
                aria-label="تأیید تغییر در جلسهٔ تمرکز فعال"
                data-testid="timer-active-session-confirmation"
                className="w-full p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-right space-y-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-token-primary">
                      جلسهٔ تمرکز فعلی در جریان است (
                      {pendingConfirmation.elapsedMinutes > 0
                        ? `${toPersianNum(pendingConfirmation.elapsedMinutes)} دقیقه`
                        : `${toPersianNum(pendingConfirmation.elapsedSeconds)} ثانیه`}{' '}
                      سپری شده)
                    </div>
                    <p className="text-token-secondary leading-relaxed">
                      برای جلوگیری از ثبت زمان کار قبلی به نام کار جدید یا از دست رفتن زمان تمرکز، نحوهٔ ادامه را انتخاب کنید:
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="timer-confirm-cancel-btn"
                    onClick={cancelPendingConfirmation}
                    className="px-3 py-1.5 rounded-lg bg-surface-1 border border-token-subtle text-token-primary text-xs font-semibold cursor-pointer"
                  >
                    ادامهٔ جلسهٔ فعلی
                  </button>
                  <button
                    type="button"
                    data-testid="timer-confirm-discard-btn"
                    onClick={confirmPendingAndDiscardPrevious}
                    className="px-3 py-1.5 rounded-lg bg-surface-2 text-token-secondary hover:text-token-primary text-xs font-semibold cursor-pointer"
                  >
                    صرف‌نظر از زمان سپری‌شده
                  </button>
                  <button
                    type="button"
                    data-testid="timer-confirm-log-btn"
                    onClick={confirmPendingAndLogPrevious}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    ثبت زمان قبلی و اعمال تغییر
                  </button>
                </div>
              </div>
            )}

            {/* Preset Selector & Custom Duration */}
            <div className="w-full space-y-2">
              <div className="flex flex-wrap items-center justify-center gap-1.5 bg-surface-2 p-1.5 rounded-xl border border-token-subtle">
                {PRESET_MINUTES.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setShowCustomInput(false);
                      handlePresetChange(mins);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer tabular-nums ${
                      timerState.selectedPresetMinutes === mins && !showCustomInput
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-token-secondary hover:text-token-primary'
                    }`}
                  >
                    {toPersianNum(mins)} دقیقه
                  </button>
                ))}

                <button
                  type="button"
                  data-testid="timer-custom-duration-toggle"
                  onClick={() => {
                    setCustomMinutesInput(String(timerState.selectedPresetMinutes));
                    setShowCustomInput((prev) => !prev);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer tabular-nums ${
                    isCustomPresetActive || showCustomInput
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-token-secondary hover:text-token-primary'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>
                    {isCustomPresetActive
                      ? `${toPersianNum(timerState.selectedPresetMinutes)} دقیقه (دلخواه)`
                      : 'زمان دلخواه'}
                  </span>
                </button>
              </div>

              {showCustomInput && (
                <form
                  onSubmit={handleCustomDurationSubmit}
                  className="flex items-center justify-center gap-2 pt-1"
                >
                  <label htmlFor="custom-focus-minutes" className="text-xs text-token-secondary">
                    مدت جلسه (۱ تا ۲۴۰ دقیقه):
                  </label>
                  <input
                    id="custom-focus-minutes"
                    type="number"
                    min={1}
                    max={240}
                    value={customMinutesInput}
                    onChange={(e) => setCustomMinutesInput(e.target.value)}
                    className="w-20 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-token-subtle text-xs font-bold text-center text-token-primary tabular-nums"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    اعمال
                  </button>
                </form>
              )}
            </div>

            {/* Active Task Selector */}
            {!isZenMode && (
              <div className="w-full max-w-md space-y-1.5 text-right">
                <label
                  htmlFor="focus-task-select"
                  className="block text-xs font-bold text-token-secondary"
                >
                  کار مرتبط با این جلسهٔ تمرکز:
                </label>
                <select
                  id="focus-task-select"
                  value={timerState.taskId || ''}
                  onChange={(e) => handleSelectTask(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-token-subtle text-xs font-semibold text-token-primary focus:outline-none"
                >
                  <option value="">تمرکز آزاد (بدون کار مشخص)</option>
                  {pendingTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      اولویت {toPersianNum(t.priority)}: {t.title} ({toPersianNum(t.duration)} دقیقه)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Big Clock Display */}
            <div className="py-2 space-y-2">
              <div
                data-testid="focus-timer-clock"
                className="text-6xl sm:text-7xl font-black tracking-wider font-mono text-token-primary tabular-nums select-none"
              >
                {formattedTime}
              </div>
              <p className="text-xs text-token-secondary font-medium">
                {activeTask
                  ? `در حال تمرکز روی: ${activeTask.title}`
                  : 'روی یک کار مشخص تمرکز کنید و عوامل حواس‌پرتی را ببندید'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-md h-2 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  timerState.phase === 'work'
                    ? 'bg-indigo-600'
                    : timerState.phase === 'long_break'
                    ? 'bg-violet-600'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Timer Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleReset}
                title="بازنشانی تایمر"
                aria-label="بازنشانی تایمر"
                className="p-3 rounded-xl bg-surface-2 text-token-secondary hover:text-token-primary transition cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              <button
                type="button"
                data-testid="focus-timer-play-pause"
                onClick={handleTogglePlay}
                className={`flex items-center gap-2.5 px-7 py-3.5 rounded-xl font-bold text-sm text-white shadow-sm transition cursor-pointer ${
                  timerState.isRunning
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {timerState.isRunning ? (
                  <>
                    <Pause className="w-5 h-5" />
                    <span>توقف موقت</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>
                      {elapsedSeconds > 0 ? 'ادامهٔ جلسه' : 'شروع تمرکز'}
                    </span>
                  </>
                )}
              </button>

              {timerState.phase === 'work' && elapsedMinutes > 0 && (
                <button
                  type="button"
                  onClick={handleFinishEarlyAndLog}
                  title="پایان جلسه و ثبت زمان واقعی سپری‌شده"
                  className="flex items-center gap-1.5 px-3.5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer tabular-nums"
                >
                  <Check className="w-4 h-4" />
                  <span>ثبت زمان واقعی ({toPersianNum(elapsedMinutes)} دقیقه)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSkip}
                title="عبور از این مرحله"
                aria-label="عبور از این مرحله"
                className="p-3 rounded-xl bg-surface-2 text-token-secondary hover:text-token-primary transition cursor-pointer"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Side Column: Today's Focus Sessions History */}
          {!isZenMode && (
            <div className="lg:col-span-5 bg-surface-1 p-6 rounded-2xl border border-token-subtle shadow-2xs space-y-5">
              <div className="border-b border-token-subtle pb-4">
                <h3 className="text-base font-bold text-token-primary flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span>سابقهٔ تمرکز امروز</span>
                </h3>
                <p className="text-xs text-token-secondary mt-1">
                  مجموع زمان تمرکز امروز:{' '}
                  <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {toPersianNum(todayTotalFocusMins)} دقیقه
                  </strong>{' '}
                  در {toPersianNum(todaySessions.length)} نوبت
                </p>
              </div>

              {todaySessions.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-xs text-token-muted">
                    هنوز جلسهٔ تمرکزی در امروز ثبت نشده است.
                  </p>
                  <p className="text-[11px] text-token-muted">
                    یک کار را انتخاب کنید و دکمهٔ «شروع تمرکز» را بزنید.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {todaySessions.map((s) => (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-xl bg-surface-2/60 border border-token-subtle flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-token-primary truncate">
                          {s.taskTitle || 'تمرکز آزاد'}
                        </h4>
                        <span className="text-[11px] text-token-muted tabular-nums">
                          {new Date(s.timestamp).toLocaleTimeString('fa-IR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0 tabular-nums">
                        {toPersianNum(s.durationMinutes)} دقیقه
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
