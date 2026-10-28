import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeUtf8ToBase64,
  decodeBase64ToUtf8,
  mergeKairosData,
} from './githubSync';

test('encodeUtf8ToBase64 and decodeBase64ToUtf8 preserve Persian text and emojis', () => {
  const sample = JSON.stringify({
    app: 'کایروس | دستیار هوشمند تمرکز 🎯',
    items: ['اطلاعات کاربردی', 'تمرکز عمیق', 'تقویم سالانه ۱۴۰۵'],
  });
  const encoded = encodeUtf8ToBase64(sample);
  const decoded = decodeBase64ToUtf8(encoded);
  assert.equal(decoded, sample);
});

test('mergeKairosData preserves tasks, usefulInfos, and habit checkmarks from both devices on SHA conflict', () => {
  const localData = {
    habits: [
      {
        id: 'h1',
        title: 'ورزش',
        category: 'health' as const,
        emoji: '🏃',
        color: '#10b981',
        weeklyGoal: 5,
        completedDates: { '2026-10-27': true },
      },
    ],
    tasks: [
      {
        id: 't_laptop',
        title: 'کار ثبت‌شده در لپ‌تاپ',
        priority: 1,
        duration: 45,
        targetDate: '2026-10-28',
        completed: false,
      },
    ],
    ideas: [],
    focusSessions: [],
    usefulInfos: [
      {
        id: 'u1',
        title: 'کد گیت',
        content: 'git push',
        category: 'code' as const,
        createdAt: 'امروز',
      },
    ],
  };

  const remoteData = {
    habits: [
      {
        id: 'h1',
        title: 'ورزش',
        category: 'health' as const,
        emoji: '🏃',
        color: '#10b981',
        weeklyGoal: 5,
        completedDates: { '2026-10-28': true },
      },
    ],
    tasks: [
      {
        id: 't_phone',
        title: 'کار ثبت‌شده در گوشی',
        priority: 2,
        duration: 30,
        targetDate: '2026-10-28',
        completed: true,
      },
    ],
    ideas: [],
    focusSessions: [],
    usefulInfos: [
      {
        id: 'u2',
        title: 'لینک مهم',
        content: 'https://github.com',
        category: 'links' as const,
        createdAt: 'دیروز',
      },
    ],
  };

  const merged = mergeKairosData(localData, remoteData, true);
  assert.equal(merged.tasks.length, 2);
  assert.equal(merged.usefulInfos.length, 2);
  assert.equal(merged.habits[0].completedDates['2026-10-27'], true);
  assert.equal(merged.habits[0].completedDates['2026-10-28'], true);
});
