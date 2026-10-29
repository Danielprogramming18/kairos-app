/**
 * Timestamp-based Pomodoro Engine (BUG-15 .. BUG-20)
 * Zero background drift: computes remaining time from epoch timestamps (`startedAtEpochMs`, `targetEndEpochMs`)
 * rather than relying on `setInterval` decrementing a counter.
 */

import { ActiveTimerState, FocusSessionPhase, nowIso } from '../domain/models';

export interface ExtendedActiveTimerState extends ActiveTimerState {
  selectedPresetMinutes: 25 | 45 | 60;
  completedWorkCycles: number;
}

export function getBreakDurationMinutes(
  presetMinutes: 25 | 45 | 60,
  phase: 'short_break' | 'long_break'
): number {
  if (phase === 'long_break') return 20;
  return presetMinutes === 25 ? 5 : 15;
}

export function getPhaseDurationSeconds(
  presetMinutes: 25 | 45 | 60,
  phase: FocusSessionPhase
): number {
  if (phase === 'work') return presetMinutes * 60;
  return getBreakDurationMinutes(presetMinutes, phase) * 60;
}

export function createInitialTimerState(
  presetMinutes: 25 | 45 | 60 = 45,
  taskId?: string | null,
  taskTitle?: string
): ExtendedActiveTimerState {
  const durationSeconds = presetMinutes * 60;
  return {
    isRunning: false,
    phase: 'work',
    selectedPresetMinutes: presetMinutes,
    completedWorkCycles: 0,
    taskId: taskId ?? null,
    taskTitle,
    durationSeconds,
    remainingSecondsWhenPaused: durationSeconds,
    startedAtEpochMs: null,
    targetEndEpochMs: null,
    updatedAt: nowIso(),
  };
}

/**
 * Computes exact remaining seconds at `nowEpochMs` without drift when tab/WebView is backgrounded (BUG-15).
 */
export function computeRemainingSeconds(
  state: ActiveTimerState,
  nowEpochMs: number = Date.now()
): number {
  if (state.isRunning && typeof state.targetEndEpochMs === 'number') {
    const diffMs = state.targetEndEpochMs - nowEpochMs;
    return Math.max(0, Math.ceil(diffMs / 1000));
  }
  return Math.max(0, Math.round(state.remainingSecondsWhenPaused));
}

/**
 * Computes actual elapsed minutes for manual stop/finish (BUG-17).
 * Returns 0 if less than 30 seconds have elapsed; otherwise returns at least 1 minute up to planned duration.
 */
export function computeActualElapsedMinutes(
  state: ActiveTimerState,
  nowEpochMs: number = Date.now()
): number {
  const remaining = computeRemainingSeconds(state, nowEpochMs);
  const elapsedSeconds = Math.max(0, state.durationSeconds - remaining);
  if (elapsedSeconds < 30) return 0;
  const plannedMinutes = Math.round(state.durationSeconds / 60);
  return Math.min(plannedMinutes, Math.max(1, Math.round(elapsedSeconds / 60)));
}

export function startTimer(
  state: ExtendedActiveTimerState,
  nowEpochMs: number = Date.now()
): ExtendedActiveTimerState {
  const remaining = computeRemainingSeconds(state, nowEpochMs);
  const effectiveRemaining = remaining > 0 ? remaining : state.durationSeconds;
  return {
    ...state,
    isRunning: true,
    remainingSecondsWhenPaused: effectiveRemaining,
    startedAtEpochMs: state.startedAtEpochMs ?? nowEpochMs,
    targetEndEpochMs: nowEpochMs + effectiveRemaining * 1000,
    updatedAt: new Date(nowEpochMs).toISOString(),
  };
}

export function pauseTimer(
  state: ExtendedActiveTimerState,
  nowEpochMs: number = Date.now()
): ExtendedActiveTimerState {
  const remaining = computeRemainingSeconds(state, nowEpochMs);
  return {
    ...state,
    isRunning: false,
    remainingSecondsWhenPaused: remaining,
    targetEndEpochMs: null,
    updatedAt: new Date(nowEpochMs).toISOString(),
  };
}

export function resetTimer(
  state: ExtendedActiveTimerState,
  nowEpochMs: number = Date.now()
): ExtendedActiveTimerState {
  const durationSeconds = getPhaseDurationSeconds(state.selectedPresetMinutes, state.phase);
  return {
    ...state,
    isRunning: false,
    durationSeconds,
    remainingSecondsWhenPaused: durationSeconds,
    startedAtEpochMs: null,
    targetEndEpochMs: null,
    updatedAt: new Date(nowEpochMs).toISOString(),
  };
}

/**
 * Transitions the timer to the next phase after completion or skip.
 * Every 4th completed work session triggers `long_break` (20 minutes) (BUG-19).
 */
export function transitionTimerPhase(
  state: ExtendedActiveTimerState,
  countWorkCycle: boolean,
  cyclesBeforeLongBreak = 4,
  nowEpochMs: number = Date.now()
): ExtendedActiveTimerState {
  if (state.phase === 'work') {
    const nextCycles = countWorkCycle ? state.completedWorkCycles + 1 : state.completedWorkCycles;
    const isLongBreak =
      countWorkCycle && nextCycles > 0 && nextCycles % cyclesBeforeLongBreak === 0;
    const nextPhase: FocusSessionPhase = isLongBreak ? 'long_break' : 'short_break';
    const nextDuration = getPhaseDurationSeconds(state.selectedPresetMinutes, nextPhase);

    return {
      ...state,
      isRunning: false,
      phase: nextPhase,
      completedWorkCycles: nextCycles,
      durationSeconds: nextDuration,
      remainingSecondsWhenPaused: nextDuration,
      startedAtEpochMs: null,
      targetEndEpochMs: null,
      updatedAt: new Date(nowEpochMs).toISOString(),
    };
  }

  const workDuration = getPhaseDurationSeconds(state.selectedPresetMinutes, 'work');
  return {
    ...state,
    isRunning: false,
    phase: 'work',
    durationSeconds: workDuration,
    remainingSecondsWhenPaused: workDuration,
    startedAtEpochMs: null,
    targetEndEpochMs: null,
    updatedAt: new Date(nowEpochMs).toISOString(),
  };
}
