import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWeeklyAnalyticsSummary,
  getTaskEffectiveCompletionDateKey,
} from './analyticsCalculator';
import { getWeekDays } from './persianDate';
import { FocusSession, Habit, Task } from '../types';

test('FIX-09: getTaskEffectiveCompletionDateKey uses completedAt date when present and falls back to targetDate for legacy tasks', () => {
  const overdueCompletedToday: Task = {
    id: 't-1',
    title: 'Overdue task completed today',
    priority: 1,
    duration: 45,
    targetDate: '2026-10-20',
    completed: true,
    completedAt: '2026-10-28T09:15:00',
  };
  assert.equal(getTaskEffectiveCompletionDateKey(overdueCompletedToday), '2026-10-28');

  const legacyCompletedTask: Task = {
    id: 't-2',
    title: 'Legacy task without completedAt',
    priority: 2,
    duration: 30,
    targetDate: '2026-10-26',
    completed: true,
    completedAt: null,
  };
  assert.equal(getTaskEffectiveCompletionDateKey(legacyCompletedTask), '2026-10-26');

  const incompleteTask: Task = {
    id: 't-3',
    title: 'Pending task',
    priority: 1,
    duration: 25,
    targetDate: '2026-10-28',
    completed: false,
  };
  assert.equal(getTaskEffectiveCompletionDateKey(incompleteTask), null);
});

test('FIX-09: computeWeeklyAnalyticsSummary attributes overdue task completed today to today and respects habit startDate', () => {
  const referenceToday = new Date(2026, 9, 28, 12, 0, 0); // 2026-10-28
  const weekDays = getWeekDays(0, referenceToday);

  const tasks: Task[] = [
    {
      id: 't-1',
      title: 'Overdue task finished today',
      priority: 1,
      duration: 45,
      targetDate: '2026-10-15',
      completed: true,
      completedAt: '2026-10-28T11:00:00',
    },
  ];

  const habits: Habit[] = [
    {
      id: 'h-1',
      title: 'مطالعه روزانه',
      category: 'learning',
      weeklyGoal: 7,
      emoji: '📚',
      color: '#3b82f6',
      startDate: '2026-10-28',
      completedDates: {
        '2026-10-28': true,
      },
    },
  ];

  const focusSessions: FocusSession[] = [
    {
      id: 'f-1',
      taskId: 't-1',
      taskTitle: 'Overdue task finished today',
      durationMinutes: 45,
      dateKey: '2026-10-28',
      timestamp: referenceToday.getTime(),
    },
  ];

  const summary = computeWeeklyAnalyticsSummary(
    tasks,
    habits,
    focusSessions,
    weekDays,
    referenceToday
  );

  assert.equal(summary.totalTasksCompleted, 1);
  assert.equal(summary.habitSuccessRate, 100);
  assert.equal(summary.totalFocusMinutes, 45);
  assert.equal(summary.topStreak, 1);
  assert.equal(summary.hasAnyActivity, true);
});
