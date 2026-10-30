import { FocusSession, Habit, Task } from '../types';
import { getDateKey, WeekDayItem } from './persianDate';
import { calculateHabitWindowRate, calculateStreaks } from './habitStreaks';

export interface DailyAnalyticsPoint extends WeekDayItem {
  doneTasksCount: number;
  dayHabitsDone: number;
  dayFocusMins: number;
}

export interface WeeklyAnalyticsSummary {
  totalTasksCompleted: number;
  totalPossibleHabits: number;
  totalHabitsDone: number;
  habitSuccessRate: number;
  totalFocusMinutes: number;
  focusHours: number;
  focusRemainingMins: number;
  topStreak: number;
  topStreakHabit: string;
  dailyBreakdown: DailyAnalyticsPoint[];
  hasAnyActivity: boolean;
}

/**
 * Returns the effective `YYYY-MM-DD` date key on which a task was completed (FIX-09).
 * - Uses `task.completedAt` when available (so completing an overdue task today counts toward today's productivity).
 * - Falls back to `task.targetDate` for legacy completed tasks that do not have `completedAt`.
 */
export function getTaskEffectiveCompletionDateKey(task: Task): string | null {
  if (!task.completed) return null;
  if (task.completedAt && typeof task.completedAt === 'string') {
    const trimmed = task.completedAt.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return getDateKey(parsed);
    }
  }
  return task.targetDate || null;
}

/**
 * Computes weekly analytics summary from tasks, habits, and focusSessions over `weekDays` (FIX-09).
 */
export function computeWeeklyAnalyticsSummary(
  tasks: Task[],
  habits: Habit[],
  focusSessions: FocusSession[],
  weekDays: WeekDayItem[],
  referenceToday: Date = new Date()
): WeeklyAnalyticsSummary {
  const todayKey = getDateKey(referenceToday);
  const weekKeys = weekDays.map((d) => d.key);

  let totalTasksCompleted = 0;
  let totalFocusMinutes = 0;

  const dailyBreakdown: DailyAnalyticsPoint[] = weekDays.map((d) => {
    const doneTasksInDay = tasks.filter(
      (t) => t.completed && getTaskEffectiveCompletionDateKey(t) === d.key
    );
    totalTasksCompleted += doneTasksInDay.length;

    let dayHabitsDone = 0;
    if (!d.isFuture) {
      habits.forEach((h) => {
        if (h.completedDates?.[d.key]) {
          dayHabitsDone++;
        }
      });
    }

    const daySessions = focusSessions.filter((s) => s.dateKey === d.key);
    const dayFocusMins = daySessions.reduce(
      (sum, s) => sum + Math.max(0, Number(s.durationMinutes) || 0),
      0
    );
    totalFocusMinutes += dayFocusMins;

    return {
      ...d,
      doneTasksCount: doneTasksInDay.length,
      dayHabitsDone,
      dayFocusMins,
    };
  });

  // Compute habit success rate respecting each habit's startDate and weeklyGoal
  let totalPossibleHabits = 0;
  let totalHabitsDone = 0;
  habits.forEach((h) => {
    const rate = calculateHabitWindowRate(h, weekKeys, todayKey);
    totalHabitsDone += rate.doneCount;
    totalPossibleHabits += rate.expectedCount;
  });

  const habitSuccessRate =
    totalPossibleHabits > 0
      ? Math.min(100, Math.round((totalHabitsDone / totalPossibleHabits) * 100))
      : 0;

  // Best active streak
  let topStreak = 0;
  let topStreakHabit = '—';
  habits.forEach((h) => {
    const s = calculateStreaks(h.completedDates, referenceToday, h.weeklyGoal, {
      startDate: h.startDate,
    });
    if (s.current > topStreak) {
      topStreak = s.current;
      topStreakHabit = h.title;
    }
  });

  const focusHours = Math.floor(totalFocusMinutes / 60);
  const focusRemainingMins = totalFocusMinutes % 60;
  const hasAnyActivity =
    totalTasksCompleted > 0 || totalHabitsDone > 0 || totalFocusMinutes > 0;

  return {
    totalTasksCompleted,
    totalPossibleHabits,
    totalHabitsDone,
    habitSuccessRate,
    totalFocusMinutes,
    focusHours,
    focusRemainingMins,
    topStreak,
    topStreakHabit,
    dailyBreakdown,
    hasAnyActivity,
  };
}
