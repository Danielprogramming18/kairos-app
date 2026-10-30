import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHabitWindowRate, calculateStreaks } from './habitStreaks';

test('calculateStreaks calculates zero streak for empty history', () => {
  const res = calculateStreaks({}, new Date('2026-10-25T12:00:00'));
  assert.equal(res.current, 0);
  assert.equal(res.best, 0);
});

test('calculateStreaks counts active streak including today', () => {
  const today = new Date(2026, 9, 25); // 2026-10-25
  const dict = {
    '2026-10-23': true,
    '2026-10-24': true,
    '2026-10-25': true,
  };
  const res = calculateStreaks(dict, today);
  assert.equal(res.current, 3);
  assert.equal(res.best, 3);
});

test('calculateStreaks preserves streak if done yesterday but not yet today', () => {
  const today = new Date(2026, 9, 25); // 2026-10-25
  const dict = {
    '2026-10-23': true,
    '2026-10-24': true,
  };
  const res = calculateStreaks(dict, today);
  assert.equal(res.current, 2);
  assert.equal(res.best, 2);
});

test('calculateStreaks calculates historic best streak', () => {
  const today = new Date(2026, 9, 25);
  const dict = {
    '2026-10-01': true,
    '2026-10-02': true,
    '2026-10-03': true,
    '2026-10-04': true,
    '2026-10-25': true,
  };
  const res = calculateStreaks(dict, today);
  assert.equal(res.current, 1);
  assert.equal(res.best, 4);
});

test('BUG-27: calculateStreaks preserves streak across allowed rest days when weeklyGoal < 7', () => {
  const today = new Date(2026, 9, 25); // 2026-10-25
  // Habit with weeklyGoal = 5 (allows up to 2 rest days between completions)
  const dict = {
    '2026-10-20': true,
    '2026-10-22': true, // 1 rest day on 10-21
    '2026-10-25': true, // 2 rest days on 10-23, 10-24
  };
  const resFlexible = calculateStreaks(dict, today, 5);
  assert.equal(resFlexible.current, 3);
  assert.equal(resFlexible.best, 3);

  // For a strict daily habit (weeklyGoal = 7), the same history has current = 1
  const resStrict = calculateStreaks(dict, today, 7);
  assert.equal(resStrict.current, 1);
});

test('FIX-09: calculateHabitWindowRate does not penalize days prior to habit startDate or future days', () => {
  const weekKeys = [
    '2026-10-24',
    '2026-10-25',
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
  ];
  const todayKey = '2026-10-28';

  // Habit created on 2026-10-27 and completed on 10-27 and 10-28
  const newlyCreatedHabit = {
    startDate: '2026-10-27',
    weeklyGoal: 7,
    completedDates: {
      '2026-10-27': true,
      '2026-10-28': true,
    },
  };

  const rate = calculateHabitWindowRate(newlyCreatedHabit, weekKeys, todayKey);
  assert.equal(rate.doneCount, 2);
  assert.equal(rate.expectedCount, 2);
  assert.equal(rate.ratePercent, 100);
});

test('FIX-09: calculateStreaks respects custom targetDaysOfWeek without breaking on non-target days', () => {
  // 2026-10-24 is Saturday (Persian index 0), 2026-10-26 is Monday (Persian index 2), 2026-10-28 is Wednesday (Persian index 4)
  const today = new Date(2026, 9, 28); // 2026-10-28
  const dict = {
    '2026-10-24': true,
    '2026-10-26': true,
    '2026-10-28': true,
  };
  const res = calculateStreaks(dict, today, 3, {
    startDate: '2026-10-24',
    targetDaysOfWeek: [0, 2, 4],
  });
  assert.equal(res.current, 3);
  assert.equal(res.best, 3);
});

