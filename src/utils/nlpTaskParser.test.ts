import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalTaskInput } from './nlpTaskParser';

test('parseNaturalTaskInput extracts duration, tomorrow date, and 5 PM reminderTime', () => {
  const ref = new Date(2026, 9, 25); // 2026-10-25
  const result = parseNaturalTaskInput('فردا ساعت ۵ عصر، ۴۵ دقیقه HTML تمرین کنم', ref);
  assert.equal(result.duration, 45);
  assert.equal(result.targetDate, '2026-10-26');
  assert.equal(result.reminderTime, '17:00');
  assert.ok(result.title.includes('HTML تمرین کنم'));
});

test('parseNaturalTaskInput extracts priority and duration in Persian', () => {
  const ref = new Date(2026, 9, 25);
  const result = parseNaturalTaskInput('امروز ۳۰ دقیقه مطالعه کتاب اولویت ۱', ref);
  assert.equal(result.duration, 30);
  assert.equal(result.priority, 1);
  assert.equal(result.targetDate, '2026-10-25');
  assert.ok(result.title.includes('مطالعه کتاب'));
});

test('parseNaturalTaskInput handles 1 hour duration and day after tomorrow', () => {
  const ref = new Date(2026, 9, 25);
  const result = parseNaturalTaskInput('پس‌فردا ۱ ساعت حل تمرین فتوشاپ اولویت ۲', ref);
  assert.equal(result.duration, 60);
  assert.equal(result.priority, 2);
  assert.equal(result.targetDate, '2026-10-27');
});

test('BUG-22: parseNaturalTaskInput converts "ساعت ۱ ظهر" to 13:00 and keeps "ساعت ۱۲ ظهر" as 12:00', () => {
  const ref = new Date(2026, 9, 25);
  const res1pm = parseNaturalTaskInput('ساعت ۱ ظهر مطالعه الگوریتم', ref);
  assert.equal(res1pm.reminderTime, '13:00');
  assert.equal(res1pm.title, 'مطالعه الگوریتم');

  const res12pm = parseNaturalTaskInput('ساعت ۱۲ ظهر جلسه تیمی', ref);
  assert.equal(res12pm.reminderTime, '12:00');
  assert.equal(res12pm.title, 'جلسه تیمی');
});

test('BUG-24: parseNaturalTaskInput parses decimal hours "۱.۵ ساعت مطالعه" as 90 minutes and cleans title', () => {
  const ref = new Date(2026, 9, 25);
  const res = parseNaturalTaskInput('۱.۵ ساعت مطالعه', ref);
  assert.equal(res.duration, 90);
  assert.equal(res.title, 'مطالعه');
});

test('BUG-21: parseNaturalTaskInput preserves invalid hour text in title when reminderTime is invalid', () => {
  const ref = new Date(2026, 9, 25);
  const res = parseNaturalTaskInput('ساعت ۲۹ جلسه هماهنگی', ref);
  assert.equal(res.reminderTime, undefined);
  assert.equal(res.title, 'ساعت ۲۹ جلسه هماهنگی');
});

test('BUG-23: parseNaturalTaskInput does not corrupt compound words containing فردا or امروز', () => {
  const ref = new Date(2026, 9, 25);
  const res = parseNaturalTaskInput('مطالعه کتاب فردوسی و فردااندیشی ۳۰ دقیقه', ref);
  assert.equal(res.targetDate, '2026-10-25');
  assert.equal(res.title, 'مطالعه کتاب فردوسی و فردااندیشی');
});

