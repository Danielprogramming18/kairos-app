import { FocusSession, Habit, Task } from '../types';
import { getDateKey, WeekDayItem } from './persianDate';
import {
  calculateHabitWindowRate,
  calculateStreaks,
  computeDailyHabitProgress,
} from './habitStreaks';

export interface DailyAnalyticsPoint extends WeekDayItem {
  doneTasksCount: number;
  doneTasksEstimatedMins: number;
  dayHabitsDone: number;
  dayHabitsEligible: number;
  dayFocusMins: number;
}

export interface WeeklyAnalyticsSummary {
  totalTasksCompleted: number;
  completedTasksEstimatedMinutes: number;
  totalPossibleHabits: number;
  totalHabitsDone: number;
  habitSuccessRate: number;
  totalFocusMinutes: number;
  focusHours: number;
  focusRemainingMins: number;
  topStreak: number;
  topStreakHabit: string;
  bestAllTimeStreak: number;
  bestAllTimeStreakHabit: string;
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
 * Computes analytics summary from tasks, habits, and focusSessions over `weekDays` (current week or rolling 7 days) (FIX-09, FIX-18).
 * Clearly separates estimated task minutes (`completedTasksEstimatedMinutes`) from actual logged focus minutes (`totalFocusMinutes`).
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
  const activeHabits = habits.filter((h) => !h.archived);

  let totalTasksCompleted = 0;
  let completedTasksEstimatedMinutes = 0;
  let totalFocusMinutes = 0;

  const dailyBreakdown: DailyAnalyticsPoint[] = weekDays.map((d) => {
    const doneTasksInDay = tasks.filter(
      (t) => t.completed && getTaskEffectiveCompletionDateKey(t) === d.key
    );
    totalTasksCompleted += doneTasksInDay.length;
    const dayEstimatedMins = doneTasksInDay.reduce(
      (sum, t) => sum + Math.max(0, Number(t.duration) || 0),
      0
    );
    completedTasksEstimatedMinutes += dayEstimatedMins;

    const dayHabitProg = d.isFuture
      ? { doneCount: 0, eligibleCount: 0, ratePercent: 0 }
      : computeDailyHabitProgress(activeHabits, d.key, todayKey);

    const daySessions = focusSessions.filter(
      (s) => s.dateKey === d.key && (s.phase === undefined || s.phase === 'work')
    );
    const dayFocusMins = daySessions.reduce(
      (sum, s) => sum + Math.max(0, Number(s.durationMinutes) || 0),
      0
    );
    totalFocusMinutes += dayFocusMins;

    return {
      ...d,
      doneTasksCount: doneTasksInDay.length,
      doneTasksEstimatedMins: dayEstimatedMins,
      dayHabitsDone: dayHabitProg.doneCount,
      dayHabitsEligible: dayHabitProg.eligibleCount,
      dayFocusMins,
    };
  });

  // Compute habit success rate respecting each habit's startDate, targetDaysOfWeek, and weeklyGoal
  let totalPossibleHabits = 0;
  let totalHabitsDone = 0;
  activeHabits.forEach((h) => {
    const rate = calculateHabitWindowRate(h, weekKeys, todayKey);
    totalHabitsDone += rate.doneCount;
    totalPossibleHabits += rate.expectedCount;
  });

  const habitSuccessRate =
    totalPossibleHabits > 0
      ? Math.min(100, Math.round((totalHabitsDone / totalPossibleHabits) * 100))
      : 0;

  // Best active streak & best all-time streak
  let topStreak = 0;
  let topStreakHabit = '—';
  let bestAllTimeStreak = 0;
  let bestAllTimeStreakHabit = '—';

  activeHabits.forEach((h) => {
    const s = calculateStreaks(h.completedDates, referenceToday, h.weeklyGoal, {
      startDate: h.startDate,
      targetDaysOfWeek: h.targetDaysOfWeek,
    });
    if (s.current > topStreak) {
      topStreak = s.current;
      topStreakHabit = h.title;
    }
    if (s.best > bestAllTimeStreak) {
      bestAllTimeStreak = s.best;
      bestAllTimeStreakHabit = h.title;
    }
  });

  const focusHours = Math.floor(totalFocusMinutes / 60);
  const focusRemainingMins = totalFocusMinutes % 60;
  const hasAnyActivity =
    totalTasksCompleted > 0 || totalHabitsDone > 0 || totalFocusMinutes > 0;

  return {
    totalTasksCompleted,
    completedTasksEstimatedMinutes,
    totalPossibleHabits,
    totalHabitsDone,
    habitSuccessRate,
    totalFocusMinutes,
    focusHours,
    focusRemainingMins,
    topStreak,
    topStreakHabit,
    bestAllTimeStreak,
    bestAllTimeStreakHabit,
    dailyBreakdown,
    hasAnyActivity,
  };
}
