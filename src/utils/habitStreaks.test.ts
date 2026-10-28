import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStreaks } from './habitStreaks';

test('calculateStreaks calculates zero streak for empty history', () => {
  const res = calculateStreaks({}, new Date(2026, 9, 25));
  assert.equal(res.current, 0);
  assert.equal(res.best, 0);
});

test('calculateStreaks counts active streak including today', () => {
  const history = {
    '2026-10-25': true, // today
    '2026-10-24': true, // yesterday
    '2026-10-23': true, // 2 days ago
  };
  const res = calculateStreaks(history, new Date(2026, 9, 25));
  assert.equal(res.current, 3);
  assert.equal(res.best, 3);
});

test('calculateStreaks preserves streak if done yesterday but not yet today', () => {
  const history = {
    '2026-10-24': true, // yesterday
    '2026-10-23': true, // 2 days ago
  };
  const res = calculateStreaks(history, new Date(2026, 9, 25));
  assert.equal(res.current, 2);
  assert.equal(res.best, 2);
});

test('calculateStreaks calculates historic best streak', () => {
  const history = {
    '2026-10-01': true,
    '2026-10-02': true,
    '2026-10-03': true,
    '2026-10-04': true,
    '2026-10-05': true, // 5 day streak in past
    '2026-10-25': true, // 1 day today
  };
  const res = calculateStreaks(history, new Date(2026, 9, 25));
  assert.equal(res.current, 1);
  assert.equal(res.best, 5);
});
