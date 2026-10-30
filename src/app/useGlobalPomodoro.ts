import { useCallback, useEffect, useRef, useState } from 'react';
import { createEntityId } from '../domain/models';
import { PlatformContainer } from '../application/repositories';
import { FocusSession, Task } from '../types';
import { getDateKey, toPersianNum } from '../utils/persianDate';
import {
  clampFocusMinutes,
  computeActualElapsedMinutes,
  computeActualElapsedSeconds,
  computeRemainingSeconds,
  createInitialTimerState,
  evaluateTimerTick,
  ExtendedActiveTimerState,
  getPhaseDurationSeconds,
  pauseTimer,
  resetTimer,
  startTimer,
  transitionTimerPhase,
} from '../utils/pomodoroEngine';
import { playAlertBeep, playSuccessSound } from '../utils/soundEffects';

const ACTIVE_TIMER_STORAGE_KEY = 'kairos_active_timer_v1';

function loadInitialTimerState(): ExtendedActiveTimerState {
  try {
    const raw = localStorage.getItem(ACTIVE_TIMER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.durationSeconds === 'number') {
        const safePreset = clampFocusMinutes(parsed.selectedPresetMinutes, 45);
        return {
          ...createInitialTimerState(safePreset),
          ...parsed,
          selectedPresetMinutes: safePreset,
          completedWorkCycles: Number(parsed.completedWorkCycles) || 0,
        };
      }
    }
  } catch {
    // Fallback to clean state
  }
  return createInitialTimerState(45);
}

export interface PendingTimerConfirmation {
  kind: 'switch_task' | 'change_duration' | 'reset' | 'skip';
  elapsedSeconds: number;
  elapsedMinutes: number;
  currentTaskId: string | null;
  currentTaskTitle?: string;
  targetTaskId?: string | null;
  targetTaskTitle?: string;
  targetDurationMinutes?: number;
}

export interface GlobalPomodoroController {
  timerState: ExtendedActiveTimerState;
  timeLeft: number;
  elapsedSeconds: number;
  elapsedMinutes: number;
  pendingConfirmation: PendingTimerConfirmation | null;
  handleTogglePlay: () => void;
  handleReset: () => void;
  handleSkip: () => void;
  handlePresetChange: (mins: number) => void;
  handleSelectTask: (taskId: string, suggestedDurationMinutes?: number) => void;
  handleStartFocusOnTask: (taskId: string, taskTitle: string, durationMinutes?: number) => void;
  handleFinishEarlyAndLog: () => void;
  confirmPendingAndLogPrevious: () => void;
  confirmPendingAndDiscardPrevious: () => void;
  cancelPendingConfirmation: () => void;
}

interface UseGlobalPomodoroOptions {
  tasks: Task[];
  soundEnabled: boolean;
  container: PlatformContainer;
  onLogSession: (session: FocusSession) => void;
  onShowToast: (message: string) => void;
}

export function useGlobalPomodoro({
  tasks,
  soundEnabled,
  container,
  onLogSession,
  onShowToast,
}: UseGlobalPomodoroOptions): GlobalPomodoroController {
  const [timerState, setTimerState] = useState<ExtendedActiveTimerState>(loadInitialTimerState);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingTimerConfirmation | null>(null);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const onLogSessionRef = useRef(onLogSession);
  onLogSessionRef.current = onLogSession;

  const onShowToastRef = useRef(onShowToast);
  onShowToastRef.current = onShowToast;

  const loggedSessionIdsRef = useRef<Set<string>>(new Set());

  // Hydrate active timer from PlatformContainer on mount if present
  useEffect(() => {
    let mounted = true;
    container.focus
      .getActiveTimerState()
      .then((persisted) => {
        if (!mounted || !persisted) return;
        setTimerState((prev) => {
          const persistedMs = Date.parse(persisted.updatedAt || '');
          const prevMs = Date.parse(prev.updatedAt || '');
          if (Number.isFinite(persistedMs) && (!Number.isFinite(prevMs) || persistedMs > prevMs)) {
            return {
              ...prev,
              ...persisted,
            };
          }
          return prev;
        });
      })
      .catch(() => {
        // Ignore hydration error
      });
    return () => {
      mounted = false;
    };
  }, [container]);

  // Persist active timer state to both localStorage (fast synchronous snapshot) and Repository
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(timerState));
    } catch {
      // Ignore storage quota errors
    }
    container.focus.saveActiveTimerState(timerState).catch(() => {
      // Ignore async persistence error
    });
  }, [timerState, container]);

  // Helper to log a work session idempotently
  const logWorkSessionFromState = useCallback(
    (
      stateSnapshot: ExtendedActiveTimerState,
      durationMins: number,
      durationSecs: number,
      endedAtEpochMs: number,
      completedNaturally: boolean
    ) => {
      if (durationMins <= 0 && durationSecs < 30) return false;
      const effectiveMins = Math.max(1, durationMins);
      const sessionId =
        stateSnapshot.activeSessionId ||
        `fs_${stateSnapshot.startedAtEpochMs || endedAtEpochMs}_${stateSnapshot.taskId || 'general'}`;

      if (loggedSessionIdsRef.current.has(sessionId)) {
        return false;
      }
      loggedSessionIdsRef.current.add(sessionId);

      const linkedTask = tasksRef.current.find((t) => t.id === stateSnapshot.taskId);
      const endedDate = new Date(endedAtEpochMs);
      const startedAtMs =
        stateSnapshot.startedAtEpochMs && stateSnapshot.startedAtEpochMs < endedAtEpochMs
          ? stateSnapshot.startedAtEpochMs
          : endedAtEpochMs - durationSecs * 1000;

      onLogSessionRef.current({
        id: sessionId,
        taskId: linkedTask?.id,
        taskTitle: linkedTask?.title || stateSnapshot.taskTitle || 'تمرکز آزاد',
        durationMinutes: effectiveMins,
        durationSeconds: durationSecs,
        plannedMinutes: Math.max(1, Math.round(stateSnapshot.durationSeconds / 60)),
        phase: 'work',
        dateKey: getDateKey(endedDate),
        timestamp: endedAtEpochMs,
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: endedDate.toISOString(),
        completedNaturally,
      });
      return true;
    },
    []
  );

  // Global tick loop: runs in App root regardless of active tab
  useEffect(() => {
    const evaluateNow = () => {
      const now = Date.now();
      setNowTick(now);

      setTimerState((current) => {
        if (!current.isRunning) return current;
        const tick = evaluateTimerTick(current, now, 4);
        if (!tick.completedPhase || !tick.nextState) {
          return current;
        }

        const completionEpochMs = tick.completedAtEpochMs ?? now;

        // Timer phase just completed!
        if (tick.completedWorkSession) {
          if (soundEnabledRef.current) playSuccessSound();
          logWorkSessionFromState(
            {
              ...current,
              activeSessionId: tick.completedSessionId || current.activeSessionId,
            },
            tick.completedDurationMinutes,
            tick.completedDurationSeconds,
            completionEpochMs,
            true
          );

          const isLong = tick.nextState.phase === 'long_break';
          onShowToastRef.current(
            isLong
              ? `۴ چرخهٔ تمرکز کامل شد (${toPersianNum(tick.completedDurationMinutes)} دقیقه ثبت شد). زمان استراحت طولانی است.`
              : `جلسهٔ تمرکز (${toPersianNum(tick.completedDurationMinutes)} دقیقه) ثبت شد. زمان استراحت کوتاه است.`
          );
        } else {
          if (soundEnabledRef.current) playAlertBeep();
          onShowToastRef.current('زمان استراحت به پایان رسید؛ آمادهٔ شروع مرحلهٔ بعدی هستید.');
        }

        return tick.nextState;
      });
    };

    evaluateNow();

    if (!timerState.isRunning) return;

    const interval = setInterval(evaluateNow, 500);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        evaluateNow();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [timerState.isRunning, logWorkSessionFromState]);

  const timeLeft = computeRemainingSeconds(timerState, nowTick);
  const elapsedSeconds = computeActualElapsedSeconds(timerState, nowTick);
  const elapsedMinutes = computeActualElapsedMinutes(timerState, nowTick);

  const hasProtectableWorkProgress =
    timerState.phase === 'work' && (timerState.isRunning || elapsedSeconds >= 15);

  const handleTogglePlay = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    setTimerState((prev) => (prev.isRunning ? pauseTimer(prev, now) : startTimer(prev, now)));
  }, []);

  const applyImmediateReset = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    setTimerState((prev) => resetTimer(prev, now));
    setPendingConfirmation(null);
  }, []);

  const handleReset = useCallback(() => {
    const now = Date.now();
    const curElapsedSec = computeActualElapsedSeconds(timerState, now);
    if (timerState.phase === 'work' && (timerState.isRunning || curElapsedSec >= 15)) {
      const linkedTask = tasksRef.current.find((t) => t.id === timerState.taskId);
      setPendingConfirmation({
        kind: 'reset',
        elapsedSeconds: curElapsedSec,
        elapsedMinutes: computeActualElapsedMinutes(timerState, now),
        currentTaskId: timerState.taskId || null,
        currentTaskTitle: linkedTask?.title || timerState.taskTitle || 'تمرکز آزاد',
      });
      return;
    }
    applyImmediateReset();
  }, [timerState, applyImmediateReset]);

  const applyImmediateSkip = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    setTimerState((prev) => transitionTimerPhase(prev, false, 4, now));
    setPendingConfirmation(null);
  }, []);

  const handleSkip = useCallback(() => {
    const now = Date.now();
    const curElapsedSec = computeActualElapsedSeconds(timerState, now);
    if (timerState.phase === 'work' && (timerState.isRunning || curElapsedSec >= 15)) {
      const linkedTask = tasksRef.current.find((t) => t.id === timerState.taskId);
      setPendingConfirmation({
        kind: 'skip',
        elapsedSeconds: curElapsedSec,
        elapsedMinutes: computeActualElapsedMinutes(timerState, now),
        currentTaskId: timerState.taskId || null,
        currentTaskTitle: linkedTask?.title || timerState.taskTitle || 'تمرکز آزاد',
      });
      return;
    }
    applyImmediateSkip();
  }, [timerState, applyImmediateSkip]);

  const applyImmediateDuration = useCallback((mins: number) => {
    const safeMins = clampFocusMinutes(mins, 45);
    const now = Date.now();
    setNowTick(now);
    setTimerState((prev) => {
      const durationSeconds = getPhaseDurationSeconds(safeMins, 'work');
      return {
        ...prev,
        isRunning: false,
        phase: 'work',
        activeSessionId: null,
        selectedPresetMinutes: safeMins,
        durationSeconds,
        remainingSecondsWhenPaused: durationSeconds,
        startedAtEpochMs: null,
        targetEndEpochMs: null,
        updatedAt: new Date(now).toISOString(),
      };
    });
    setPendingConfirmation(null);
  }, []);

  const handlePresetChange = useCallback(
    (mins: number) => {
      const safeMins = clampFocusMinutes(mins, 45);
      const now = Date.now();
      const curElapsedSec = computeActualElapsedSeconds(timerState, now);
      if (timerState.phase === 'work' && (timerState.isRunning || curElapsedSec >= 15)) {
        const linkedTask = tasksRef.current.find((t) => t.id === timerState.taskId);
        setPendingConfirmation({
          kind: 'change_duration',
          elapsedSeconds: curElapsedSec,
          elapsedMinutes: computeActualElapsedMinutes(timerState, now),
          currentTaskId: timerState.taskId || null,
          currentTaskTitle: linkedTask?.title || timerState.taskTitle || 'تمرکز آزاد',
          targetDurationMinutes: safeMins,
        });
        return;
      }
      applyImmediateDuration(safeMins);
    },
    [timerState, applyImmediateDuration]
  );

  const applyTaskAndDurationSelection = useCallback(
    (taskId: string, taskTitle?: string, durationMinutes?: number) => {
      const now = Date.now();
      setNowTick(now);
      const taskObj = tasksRef.current.find((t) => t.id === taskId);
      const resolvedTitle = taskTitle || taskObj?.title;
      const resolvedMinutes =
        durationMinutes !== undefined && durationMinutes > 0
          ? clampFocusMinutes(durationMinutes, 45)
          : taskObj?.duration && taskObj.duration > 0
          ? clampFocusMinutes(taskObj.duration, 45)
          : undefined;

      setTimerState((prev) => {
        const nextPreset = resolvedMinutes ?? prev.selectedPresetMinutes;
        const durationSeconds = getPhaseDurationSeconds(nextPreset, 'work');
        return {
          ...prev,
          isRunning: false,
          phase: 'work',
          activeSessionId: null,
          taskId: taskId || null,
          taskTitle: resolvedTitle,
          selectedPresetMinutes: nextPreset,
          durationSeconds,
          remainingSecondsWhenPaused: durationSeconds,
          startedAtEpochMs: null,
          targetEndEpochMs: null,
          updatedAt: new Date(now).toISOString(),
        };
      });
      setPendingConfirmation(null);
    },
    []
  );

  const handleSelectTask = useCallback(
    (taskId: string, suggestedDurationMinutes?: number) => {
      const now = Date.now();
      const curElapsedSec = computeActualElapsedSeconds(timerState, now);
      const normalizedNewId = taskId || null;
      const normalizedOldId = timerState.taskId || null;

      if (
        normalizedNewId !== normalizedOldId &&
        timerState.phase === 'work' &&
        (timerState.isRunning || curElapsedSec >= 15)
      ) {
        const currentTask = tasksRef.current.find((t) => t.id === normalizedOldId);
        const targetTask = tasksRef.current.find((t) => t.id === normalizedNewId);
        setPendingConfirmation({
          kind: 'switch_task',
          elapsedSeconds: curElapsedSec,
          elapsedMinutes: computeActualElapsedMinutes(timerState, now),
          currentTaskId: normalizedOldId,
          currentTaskTitle: currentTask?.title || timerState.taskTitle || 'تمرکز آزاد',
          targetTaskId: normalizedNewId,
          targetTaskTitle: targetTask?.title || 'تمرکز آزاد',
          targetDurationMinutes:
            suggestedDurationMinutes ??
            (targetTask?.duration ? clampFocusMinutes(targetTask.duration, 45) : undefined),
        });
        return;
      }

      const targetTask = tasksRef.current.find((t) => t.id === normalizedNewId);
      applyTaskAndDurationSelection(
        taskId,
        targetTask?.title,
        suggestedDurationMinutes ?? targetTask?.duration
      );
    },
    [timerState, applyTaskAndDurationSelection]
  );

  const handleStartFocusOnTask = useCallback(
    (taskId: string, taskTitle: string, durationMinutes?: number) => {
      const now = Date.now();
      const curElapsedSec = computeActualElapsedSeconds(timerState, now);
      const safeDuration =
        durationMinutes !== undefined && durationMinutes > 0
          ? clampFocusMinutes(durationMinutes, 45)
          : undefined;

      // If timer is already running or has active work progress on another task/duration, ask user how to handle active session
      if (
        timerState.phase === 'work' &&
        (timerState.isRunning || curElapsedSec >= 15) &&
        (timerState.taskId !== taskId ||
          (safeDuration !== undefined && timerState.selectedPresetMinutes !== safeDuration))
      ) {
        const currentTask = tasksRef.current.find((t) => t.id === timerState.taskId);
        setPendingConfirmation({
          kind: 'switch_task',
          elapsedSeconds: curElapsedSec,
          elapsedMinutes: computeActualElapsedMinutes(timerState, now),
          currentTaskId: timerState.taskId || null,
          currentTaskTitle: currentTask?.title || timerState.taskTitle || 'تمرکز آزاد',
          targetTaskId: taskId,
          targetTaskTitle: taskTitle,
          targetDurationMinutes: safeDuration,
        });
        return;
      }

      // Otherwise apply the task and its exact duration immediately
      applyTaskAndDurationSelection(taskId, taskTitle, safeDuration);
    },
    [timerState, applyTaskAndDurationSelection]
  );

  const executePendingAction = useCallback(
    (conf: PendingTimerConfirmation) => {
      if (conf.kind === 'reset') {
        applyImmediateReset();
      } else if (conf.kind === 'skip') {
        applyImmediateSkip();
      } else if (conf.kind === 'change_duration' && conf.targetDurationMinutes !== undefined) {
        applyImmediateDuration(conf.targetDurationMinutes);
      } else if (conf.kind === 'switch_task') {
        applyTaskAndDurationSelection(
          conf.targetTaskId || '',
          conf.targetTaskTitle,
          conf.targetDurationMinutes
        );
      } else {
        setPendingConfirmation(null);
      }
    },
    [
      applyImmediateReset,
      applyImmediateSkip,
      applyImmediateDuration,
      applyTaskAndDurationSelection,
    ]
  );

  const confirmPendingAndLogPrevious = useCallback(() => {
    if (!pendingConfirmation) return;
    const now = Date.now();
    const curElapsedSec = computeActualElapsedSeconds(timerState, now);
    const curElapsedMin = Math.max(
      1,
      computeActualElapsedMinutes(timerState, now) || Math.ceil(curElapsedSec / 60)
    );
    if (curElapsedSec >= 15) {
      logWorkSessionFromState(
        {
          ...timerState,
          activeSessionId: timerState.activeSessionId || createEntityId('fs'),
        },
        curElapsedMin,
        curElapsedSec,
        now,
        false
      );
      onShowToastRef.current(
        `${toPersianNum(curElapsedMin)} دقیقه تمرکز برای «${
          pendingConfirmation.currentTaskTitle || 'جلسهٔ قبلی'
        }» ثبت شد.`
      );
    }
    executePendingAction(pendingConfirmation);
  }, [pendingConfirmation, timerState, logWorkSessionFromState, executePendingAction]);

  const confirmPendingAndDiscardPrevious = useCallback(() => {
    if (!pendingConfirmation) return;
    executePendingAction(pendingConfirmation);
  }, [pendingConfirmation, executePendingAction]);

  const cancelPendingConfirmation = useCallback(() => {
    setPendingConfirmation(null);
  }, []);

  const handleFinishEarlyAndLog = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    const actualMins = computeActualElapsedMinutes(timerState, now);
    const actualSecs = computeActualElapsedSeconds(timerState, now);
    if (actualMins <= 0 || actualSecs < 30) {
      onShowToastRef.current('حداقل ۳۰ ثانیه تمرکز برای ثبت در تاریخچه لازم است.');
      return;
    }

    if (soundEnabledRef.current) playSuccessSound();
    logWorkSessionFromState(
      {
        ...timerState,
        activeSessionId: timerState.activeSessionId || createEntityId('fs'),
      },
      actualMins,
      actualSecs,
      now,
      false
    );

    const linkedTask = tasksRef.current.find((t) => t.id === timerState.taskId);
    onShowToastRef.current(
      `${toPersianNum(actualMins)} دقیقه تمرکز واقعی${
        linkedTask ? ` روی «${linkedTask.title}»` : ''
      } ثبت شد.`
    );
    setTimerState((prev) => transitionTimerPhase(prev, true, 4, now));
    setPendingConfirmation(null);
  }, [timerState, logWorkSessionFromState]);

  void hasProtectableWorkProgress;

  return {
    timerState,
    timeLeft,
    elapsedSeconds,
    elapsedMinutes,
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
  };
}
