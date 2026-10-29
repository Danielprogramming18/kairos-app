import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStreaks } from './habitStreaks';

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
