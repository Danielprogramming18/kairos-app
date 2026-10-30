/**
 * Timestamp-based Pomodoro & Focus Engine (BUG-15 .. BUG-20, FIX-09, FIX-16)
 * Zero background drift: computes remaining time from epoch timestamps (`startedAtEpochMs`, `targetEndEpochMs`)
 * rather than relying on `setInterval` decrementing a counter.
 * Supports presets (15, 25, 45, 60) and any custom duration (1..240 minutes),
 * deterministic `activeSessionId` for idempotent logging, and accurate completion timestamps.
 */

import { ActiveTimerState, createEntityId, FocusSessionPhase, nowIso } from '../domain/models';

export type PresetOrCustomMinutes = number;

export interface ExtendedActiveTimerState extends ActiveTimerState {
  selectedPresetMinutes: PresetOrCustomMinutes;
  completedWorkCycles: number;
  activeSessionId?: string | null;
}

export function clampFocusMinutes(minutes: number, fallback = 45): number {
  const num = Number(minutes);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(1, Math.min(240, Math.round(num)));
}

export function getBreakDurationMinutes(
  presetMinutes: number,
  phase: 'short_break' | 'long_break'
): number {
  if (phase === 'long_break') return 20;
  if (presetMinutes <= 25) return 5;
  if (presetMinutes < 45) return 10;
  return 15;
}

export function getPhaseDurationSeconds(
  presetMinutes: number,
  phase: FocusSessionPhase
): number {
  const safeMinutes = clampFocusMinutes(presetMinutes, 45);
  if (phase === 'work') return safeMinutes * 60;
  return getBreakDurationMinutes(safeMinutes, phase) * 60;
}

export function createInitialTimerState(
  presetMinutes: number = 45,
  taskId?: string | null,
  taskTitle?: string
): ExtendedActiveTimerState {
  const safeMinutes = clampFocusMinutes(presetMinutes, 45);
  const durationSeconds = safeMinutes * 60;
  return {
    isRunning: false,
    phase: 'work',
    selectedPresetMinutes: safeMinutes,
    completedWorkCycles: 0,
    activeSessionId: null,
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
 * Computes exact elapsed seconds in the current timer phase.
 */
export function computeActualElapsedSeconds(
  state: ActiveTimerState,
  nowEpochMs: number = Date.now()
): number {
  const remaining = computeRemainingSeconds(state, nowEpochMs);
  return Math.max(0, Math.min(state.durationSeconds, state.durationSeconds - remaining));
}

/**
 * Computes actual elapsed minutes for manual stop/finish (BUG-17).
 * Returns 0 if less than 30 seconds have elapsed; otherwise returns at least 1 minute up to planned duration.
 */
export function computeActualElapsedMinutes(
  state: ActiveTimerState,
  nowEpochMs: number = Date.now()
): number {
  const elapsedSeconds = computeActualElapsedSeconds(state, nowEpochMs);
  if (elapsedSeconds < 30) return 0;
  const plannedMinutes = Math.max(1, Math.round(state.durationSeconds / 60));
  return Math.min(plannedMinutes, Math.max(1, Math.round(elapsedSeconds / 60)));
}

export function startTimer(
  state: ExtendedActiveTimerState,
  nowEpochMs: number = Date.now()
): ExtendedActiveTimerState {
  const remaining = computeRemainingSeconds(state, nowEpochMs);
  const effectiveRemaining = remaining > 0 ? remaining : state.durationSeconds;
  const activeSessionId =
    state.phase === 'work'
      ? state.activeSessionId || createEntityId('fs')
      : null;
  return {
    ...state,
    isRunning: true,
    activeSessionId,
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
    activeSessionId: null,
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
      activeSessionId: null,
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
    activeSessionId: null,
    durationSeconds: workDuration,
    remainingSecondsWhenPaused: workDuration,
    startedAtEpochMs: null,
    targetEndEpochMs: null,
    updatedAt: new Date(nowEpochMs).toISOString(),
  };
}

export interface TimerTickEvaluation {
  remainingSeconds: number;
  completedPhase: FocusSessionPhase | null;
  completedWorkSession: boolean;
  completedDurationMinutes: number;
  completedDurationSeconds: number;
  completedAtEpochMs: number | null;
  completedSessionId: string | null;
  nextState: ExtendedActiveTimerState | null;
}

/**
 * Pure evaluator for the global root timer loop (FIX-09, FIX-16).
 * Evaluates whether an active timer has reached 0 at `nowEpochMs` regardless of which UI tab is mounted.
 * Uses `state.targetEndEpochMs` as the true completion timestamp so reopening a backgrounded tab hours later
 * records the session on the actual date/time it completed.
 */
export function evaluateTimerTick(
  state: ExtendedActiveTimerState,
  nowEpochMs: number = Date.now(),
  cyclesBeforeLongBreak = 4
): TimerTickEvaluation {
  const remainingSeconds = computeRemainingSeconds(state, nowEpochMs);
  if (!state.isRunning || remainingSeconds > 0) {
    return {
      remainingSeconds,
      completedPhase: null,
      completedWorkSession: false,
      completedDurationMinutes: 0,
      completedDurationSeconds: 0,
      completedAtEpochMs: null,
      completedSessionId: null,
      nextState: null,
    };
  }

  const completedWorkSession = state.phase === 'work';
  const completedDurationSeconds = Math.max(
    60,
    Math.round(state.durationSeconds || state.selectedPresetMinutes * 60)
  );
  const completedDurationMinutes = Math.max(1, Math.round(completedDurationSeconds / 60));
  const completedAtEpochMs =
    typeof state.targetEndEpochMs === 'number' && state.targetEndEpochMs > 0
      ? Math.min(nowEpochMs, state.targetEndEpochMs)
      : nowEpochMs;
  const completedSessionId =
    completedWorkSession && state.activeSessionId
      ? state.activeSessionId
      : completedWorkSession
      ? `fs_auto_${state.startedAtEpochMs || completedAtEpochMs}_${state.taskId || 'general'}`
      : null;

  const nextState = transitionTimerPhase(
    state,
    completedWorkSession,
    cyclesBeforeLongBreak,
    nowEpochMs
  );

  return {
    remainingSeconds: 0,
    completedPhase: state.phase,
    completedWorkSession,
    completedDurationMinutes,
    completedDurationSeconds,
    completedAtEpochMs,
    completedSessionId,
    nextState,
  };
}
