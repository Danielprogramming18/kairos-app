import { useState, useEffect, useCallback } from 'react';
import { FocusSession, Task } from '../types';
import { getTodayKey } from '../utils/persianDate';
import { soundManager } from '../utils/soundEffects';
import { createEntityId } from '../domain/models';
import { PlatformContainer } from '../application/repositories';
import {
  computeActualElapsedMinutes,
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
        (parsed.phase === 'work' ||
          parsed.phase === 'short_break' ||
          parsed.phase === 'long_break')
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

export interface GlobalPomodoroController {
  timerState: ExtendedActiveTimerState;
  timeLeft: number;
  elapsedMinutes: number;
  progressPercent: number;
  handleTogglePlay: () => void;
  handleReset: () => void;
  handleSkip: () => void;
  handlePresetChange: (mins: 25 | 45 | 60) => void;
  handleSelectTask: (taskId: string | null) => void;
  handleFinishEarlyAndLog: () => void;
}

interface UseGlobalPomodoroParams {
  container: PlatformContainer;
  tasks: Task[];
  activeTaskId?: string;
  onLogFocusSession: (session: FocusSession) => void;
}

/**
 * Root-level Pomodoro Timer Engine (FIX-09).
 * Runs continuously in `App.tsx` regardless of which tab is mounted so that countdown completion,
 * phase transitions (`work` -> `short_break` / `long_break`), audio chime, and `FocusSession`
 * persistence happen reliably across all views.
 */
export function useGlobalPomodoro({
  container,
  tasks,
  activeTaskId,
  onLogFocusSession,
}: UseGlobalPomodoroParams): GlobalPomodoroController {
  const [timerState, setTimerState] = useState<ExtendedActiveTimerState>(() =>
    loadSavedTimerState(loadSavedPreset(), activeTaskId)
  );
  const [nowEpochMs, setNowEpochMs] = useState<number>(() => Date.now());

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

  // Hydrate from repository if newer
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
          const nextRunning: ExtendedActiveTimerState = {
            ...prev,
            taskId: activeTaskId,
            updatedAt: new Date().toISOString(),
          };
          try {
            localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(nextRunning));
          } catch {}
          container.focus.saveActiveTimerState(nextRunning).catch(() => {});
          return nextRunning;
        }
        const durationSeconds = getPhaseDurationSeconds(prev.selectedPresetMinutes, 'work');
        const nextPaused: ExtendedActiveTimerState = {
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
          localStorage.setItem(ACTIVE_TIMER_STORAGE_KEY, JSON.stringify(nextPaused));
        } catch {}
        container.focus.saveActiveTimerState(nextPaused).catch(() => {});
        return nextPaused;
      });
    }
  }, [activeTaskId, container, timerState.taskId]);

  // Global wall-clock tick & completion handler across all tabs
  useEffect(() => {
    if (!timerState.isRunning) return;

    const checkTick = () => {
      const now = Date.now();
      setNowEpochMs(now);
      const evaluation = evaluateTimerTick(timerState, now, 4);

      if (evaluation.nextState) {
        soundManager.playBell();
        if (evaluation.completedWorkSession) {
          const matchedTask = tasks.find((t) => t.id === timerState.taskId);
          onLogFocusSession({
            id: createEntityId('focus'),
            taskId: timerState.taskId || undefined,
            taskTitle: matchedTask?.title || 'جلسه تمرکز آزاد',
            durationMinutes: evaluation.completedDurationMinutes,
            dateKey: getTodayKey(),
            timestamp: now,
          });
        }
        persistState(evaluation.nextState);
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

  const timeLeft = computeRemainingSeconds(timerState, nowEpochMs);
  const elapsedMinutes = computeActualElapsedMinutes(timerState, nowEpochMs);
  const totalTime = timerState.durationSeconds || timerState.selectedPresetMinutes * 60;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((totalTime - timeLeft) / totalTime) * 100))
  );

  const handlePresetChange = useCallback(
    (mins: 25 | 45 | 60) => {
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
    },
    [container, persistState, timerState]
  );

  const handleTogglePlay = useCallback(() => {
    const now = Date.now();
    if (timerState.isRunning) {
      persistState(pauseTimer(timerState, now));
    } else {
      persistState(startTimer(timerState, now));
    }
  }, [persistState, timerState]);

  const handleReset = useCallback(() => {
    persistState(resetTimer(timerState, Date.now()));
  }, [persistState, timerState]);

  const handleSkip = useCallback(() => {
    persistState(transitionTimerPhase(timerState, false, 4, Date.now()));
  }, [persistState, timerState]);

  const handleSelectTask = useCallback(
    (taskId: string | null) => {
      persistState({
        ...timerState,
        taskId,
        updatedAt: new Date().toISOString(),
      });
    },
    [persistState, timerState]
  );

  const handleFinishEarlyAndLog = useCallback(() => {
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
  }, [elapsedMinutes, onLogFocusSession, persistState, tasks, timerState]);

  return {
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
  };
}
