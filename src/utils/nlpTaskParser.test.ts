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
