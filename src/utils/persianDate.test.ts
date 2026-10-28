import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toPersianNum,
  toEnglishNum,
  getDateKey,
  addDays,
  getFullPersianYearCalendar,
  getPersianParts,
} from './persianDate';

test('toPersianNum converts English digits to Persian digits', () => {
  assert.equal(toPersianNum(12345), '۱۲۳۴۵');
  assert.equal(toPersianNum('0'), '۰');
  assert.equal(toPersianNum(null), '');
});

test('toEnglishNum converts Persian and Arabic digits to English', () => {
  assert.equal(toEnglishNum('۱۲۳۴۵'), '12345');
  assert.equal(toEnglishNum('٤٥٦'), '456');
});

test('getDateKey returns YYYY-MM-DD format', () => {
  const d = new Date(2026, 9, 25); // Oct 25, 2026
  assert.equal(getDateKey(d), '2026-10-25');
});

test('addDays correctly shifts days', () => {
  const d = new Date(2026, 9, 25);
  const next = addDays(d, 2);
  assert.equal(getDateKey(next), '2026-10-27');
});

test('getPersianParts extracts accurate Jalali year, month, and day', () => {
  const d = new Date(2026, 9, 25); // Oct 25, 2026 -> 3 Aban 1405
  const parts = getPersianParts(d);
  assert.equal(parts.jYear, 1405);
  assert.equal(parts.jMonth, 8);
  assert.equal(parts.jDay, 3);
  assert.equal(parts.monthName, 'آبان');
});

test('getFullPersianYearCalendar generates all 12 months until end of year', () => {
  const d = new Date(2026, 9, 25);
  const months = getFullPersianYearCalendar(d);
  assert.equal(months.length, 12);
  assert.equal(months[0].monthName, 'فروردین');
  assert.equal(months[0].days.length, 31);
  assert.equal(months[6].monthName, 'مهر');
  assert.equal(months[6].days.length, 30);
  assert.equal(months[11].monthName, 'اسفند');
  assert.ok(months[11].days.length >= 29);
});
