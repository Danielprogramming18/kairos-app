import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeActualElapsedMinutes,
  computeRemainingSeconds,
  createInitialTimerState,
  evaluateTimerTick,
  pauseTimer,
  startTimer,
  transitionTimerPhase,
} from './pomodoroEngine';

test('BUG-15: computeRemainingSeconds uses targetEndEpochMs without background drift', () => {
  const t0 = 1_700_000_000_000;
  const initial = createInitialTimerState(25); // 1500 seconds
  const running = startTimer(initial, t0);

  assert.equal(running.isRunning, true);
  assert.equal(running.targetEndEpochMs, t0 + 1500 * 1000);

  // Simulate browser tab backgrounded for 10 minutes (600,000 ms) without any interval ticks
  const tAfter10Min = t0 + 600_000;
  assert.equal(computeRemainingSeconds(running, tAfter10Min), 900);

  // Pause after 10 minutes -> preserves 900 seconds remaining
  const paused = pauseTimer(running, tAfter10Min);
  assert.equal(paused.isRunning, false);
  assert.equal(paused.remainingSecondsWhenPaused, 900);
  assert.equal(computeRemainingSeconds(paused, tAfter10Min + 500_000), 900);
});

test('BUG-17: computeActualElapsedMinutes logs real elapsed minutes instead of full preset on manual stop', () => {
  const t0 = 1_700_000_000_000;
  const running = startTimer(createInitialTimerState(45), t0);

  // After 10 seconds -> 0 minutes (below 30s threshold)
  assert.equal(computeActualElapsedMinutes(running, t0 + 10_000), 0);

  // After 12 minutes -> 12 minutes (not 45!)
  assert.equal(computeActualElapsedMinutes(running, t0 + 12 * 60_000), 12);
});

test('BUG-19: transitionTimerPhase enters long_break (20m) after 4 completed work cycles', () => {
  let state = createInitialTimerState(25);
  for (let cycle = 1; cycle <= 3; cycle++) {
    state = transitionTimerPhase(state, true, 4);
    assert.equal(state.phase, 'short_break');
    assert.equal(state.completedWorkCycles, cycle);
    state = transitionTimerPhase(state, false, 4);
    assert.equal(state.phase, 'work');
  }

  // 4th completed work session -> long_break (20m = 1200s)
  state = transitionTimerPhase(state, true, 4);
  assert.equal(state.phase, 'long_break');
  assert.equal(state.completedWorkCycles, 4);
  assert.equal(state.durationSeconds, 20 * 60);
});

test('FIX-09: evaluateTimerTick detects work completion across any tab and returns next break state', () => {
  const t0 = 1_700_000_000_000;
  const running = startTimer(createInitialTimerState(25, 't-1', 'کدنویسی ماژول'), t0);

  // Midway through -> not completed
  const midTick = evaluateTimerTick(running, t0 + 500_000);
  assert.equal(midTick.completedWorkSession, false);
  assert.equal(midTick.nextState, null);
  assert.equal(midTick.remainingSeconds, 1000);

  // At or past targetEndEpochMs -> completes work session and transitions to short_break
  const endTick = evaluateTimerTick(running, t0 + 1500 * 1000);
  assert.equal(endTick.completedWorkSession, true);
  assert.equal(endTick.completedDurationMinutes, 25);
  assert.ok(endTick.nextState);
  assert.equal(endTick.nextState?.phase, 'short_break');
  assert.equal(endTick.nextState?.completedWorkCycles, 1);
  assert.equal(endTick.nextState?.isRunning, false);
});

test('FIX-16: createInitialTimerState supports arbitrary custom task durations (e.g. 10 minutes -> 600s) and evaluateTimerTick clamps completedAtEpochMs to targetEndEpochMs', () => {
  const t0 = 1_700_000_000_000;
  // 10-minute task must initialize with 600 seconds (not forced to 45 minutes!)
  const custom10m = createInitialTimerState(10, 't-10m', 'کار ۱۰ دقیقه‌ای');
  assert.equal(custom10m.selectedPresetMinutes, 10);
  assert.equal(custom10m.durationSeconds, 600);
  assert.equal(custom10m.remainingSecondsWhenPaused, 600);

  const running = startTimer(custom10m, t0);
  assert.ok(running.activeSessionId);
  assert.equal(running.targetEndEpochMs, t0 + 600_000);

  // Simulate browser tab waking up 2 hours after the 10-minute timer finished
  const lateWakeupEpoch = t0 + 600_000 + 7_200_000;
  const tick = evaluateTimerTick(running, lateWakeupEpoch);
  assert.equal(tick.completedWorkSession, true);
  assert.equal(tick.completedDurationMinutes, 10);
  assert.equal(tick.completedDurationSeconds, 600);
  assert.equal(tick.completedAtEpochMs, t0 + 600_000);
  assert.equal(tick.completedSessionId, running.activeSessionId);
});

