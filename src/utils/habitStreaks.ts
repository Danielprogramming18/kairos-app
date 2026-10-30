import { getDateKey } from './persianDate';

export interface StreaksResult {
  current: number;
  best: number;
}

export interface HabitStreakOptions {
  startDate?: string; // YYYY-MM-DD
  targetDaysOfWeek?: number[]; // 0=Saturday .. 6=Friday (Persian week)
}

export interface HabitWindowRateResult {
  doneCount: number;
  expectedCount: number;
  ratePercent: number;
}

export interface DailyHabitProgressResult {
  doneCount: number;
  eligibleCount: number;
  ratePercent: number;
}

/**
 * Converts a JS Date's weekday (`0=Sun..6=Sat`) to the Persian weekday index (`0=Sat..6=Fri`).
 */
export function getPersianWeekdayIndex(date: Date): number {
  return (date.getDay() + 1) % 7;
}

/**
 * Canonical domain eligibility rule for whether a habit is active and expected on `dateKey` (FIX-18).
 * - Never includes archived habits (`habit.archived === true`).
 * - Never includes future dates (`dateKey > todayKey`).
 * - Never includes dates strictly before `habit.startDate` unless the user explicitly checked that date.
 * - Respects `habit.targetDaysOfWeek` when custom weekdays are configured.
 */
export function isHabitEligibleOnDate(
  habit: {
    startDate?: string;
    archived?: boolean;
    targetDaysOfWeek?: number[];
    completedDates?: Record<string, boolean>;
  },
  dateKey: string,
  todayKey: string = getDateKey(new Date())
): boolean {
  if (habit.archived) return false;
  if (dateKey > todayKey) return false;

  const isChecked = Boolean(habit.completedDates?.[dateKey]);
  if (isChecked) return true;

  const validStartDate =
    habit.startDate && /^\d{4}-\d{2}-\d{2}$/.test(habit.startDate)
      ? habit.startDate
      : undefined;

  if (validStartDate && dateKey < validStartDate) {
    return false;
  }

  if (habit.targetDaysOfWeek && habit.targetDaysOfWeek.length > 0) {
    const [y, m, d] = dateKey.split('-').map(Number);
    if (y && m && d) {
      const dt = new Date(y, m - 1, d);
      return habit.targetDaysOfWeek.includes(getPersianWeekdayIndex(dt));
    }
  }

  return true;
}

/**
 * Computes daily habit completion count, eligible denominator, and percentage for a specific `dateKey`.
 * Prevents the `0 of 1` bug on days before a new habit's `startDate`.
 */
export function computeDailyHabitProgress(
  habits: Array<{
    startDate?: string;
    archived?: boolean;
    targetDaysOfWeek?: number[];
    completedDates: Record<string, boolean>;
  }>,
  dateKey: string,
  todayKey: string = getDateKey(new Date())
): DailyHabitProgressResult {
  if (dateKey > todayKey) {
    return { doneCount: 0, eligibleCount: 0, ratePercent: 0 };
  }
  const eligibleHabits = habits.filter((h) => isHabitEligibleOnDate(h, dateKey, todayKey));
  const eligibleCount = eligibleHabits.length;
  const doneCount = eligibleHabits.filter((h) => Boolean(h.completedDates?.[dateKey])).length;
  const ratePercent =
    eligibleCount > 0 ? Math.min(100, Math.round((doneCount / eligibleCount) * 100)) : 0;
  return {
    doneCount,
    eligibleCount,
    ratePercent,
  };
}

/**
 * Calculates how many non-target days lie strictly between `earlier` and `later`.
 */
function countTargetDaysGap(
  earlier: Date,
  later: Date,
  targetDaysOfWeek?: number[]
): number {
  const diffDays = Math.round((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
  if (!targetDaysOfWeek || targetDaysOfWeek.length === 0 || diffDays <= 1) {
    return diffDays;
  }
  const targetSet = new Set(targetDaysOfWeek);
  let missedTargetDays = 0;
  for (let offset = 1; offset < diffDays; offset++) {
    const d = new Date(earlier);
    d.setDate(d.getDate() + offset);
    if (targetSet.has(getPersianWeekdayIndex(d))) {
      missedTargetDays++;
    }
  }
  return missedTargetDays + 1;
}

/**
 * Calculates current streak (`current`) and all-time best streak (`best`) for a habit
 * based on its completed dates dictionary `{ [YYYY-MM-DD]: true }`, `weeklyGoal` (1..7),
 * and optional `startDate` / `targetDaysOfWeek` (BUG-27, FIX-09, FIX-18).
 */
export const calculateStreaks = (
  completedDatesDict: Record<string, boolean> = {},
  today: Date = new Date(),
  weeklyGoal: number = 7,
  options?: HabitStreakOptions
): StreaksResult => {
  const normToday = new Date(today);
  normToday.setHours(0, 0, 0, 0);

  const clampedGoal = Math.max(1, Math.min(7, Math.round(weeklyGoal || 7)));
  const maxAllowedRestGap =
    options?.targetDaysOfWeek && options.targetDaysOfWeek.length > 0
      ? 0
      : 7 - clampedGoal; // 0 for daily (goal=7), 2 for goal=5, 4 for goal=3

  const startDateKey =
    options?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(options.startDate)
      ? options.startDate
      : undefined;

  const sortedKeys = Object.keys(completedDatesDict)
    .filter((k) => Boolean(completedDatesDict[k]) && (!startDateKey || k >= startDateKey))
    .sort();

  if (sortedKeys.length === 0) {
    return { current: 0, best: 0 };
  }

  // Parse sorted completed dates
  const completedDates: Date[] = [];
  for (const key of sortedKeys) {
    const parts = key.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) continue;
    const [y, m, d] = parts;
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    if (dt.getTime() <= normToday.getTime()) {
      completedDates.push(dt);
    }
  }

  if (completedDates.length === 0) {
    return { current: 0, best: 0 };
  }

  // Calculate best all-time streak respecting maxAllowedRestGap / targetDaysOfWeek
  let bestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const curDate of completedDates) {
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const effectiveGap = countTargetDaysGap(prevDate, curDate, options?.targetDaysOfWeek);
      if (effectiveGap >= 1 && effectiveGap <= maxAllowedRestGap + 1) {
        tempStreak++;
      } else if (effectiveGap > maxAllowedRestGap + 1) {
        tempStreak = 1;
      }
    }
    if (tempStreak > bestStreak) {
      bestStreak = tempStreak;
    }
    prevDate = curDate;
  }

  // Calculate current active streak walking backwards from the latest completion <= today
  const lastCompleted = completedDates[completedDates.length - 1];
  const effectiveSinceLast = countTargetDaysGap(
    lastCompleted,
    normToday,
    options?.targetDaysOfWeek
  );

  let currentStreak = 0;
  if (effectiveSinceLast <= maxAllowedRestGap + 1) {
    currentStreak = 1;
    for (let i = completedDates.length - 1; i > 0; i--) {
      const cur = completedDates[i];
      const prev = completedDates[i - 1];
      const effectiveGap = countTargetDaysGap(prev, cur, options?.targetDaysOfWeek);
      if (effectiveGap >= 1 && effectiveGap <= maxAllowedRestGap + 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    current: currentStreak,
    best: Math.max(bestStreak, currentStreak),
  };
};

/**
 * Calculates accurate completion rate for a habit over a given list of date keys (`YYYY-MM-DD`),
 * respecting `habit.startDate`, `habit.archived`, `todayKey` (never penalizing future days or days before the habit existed),
 * and `habit.weeklyGoal` (FIX-09, FIX-18).
 */
export function calculateHabitWindowRate(
  habit: {
    completedDates: Record<string, boolean>;
    startDate?: string;
    archived?: boolean;
    weeklyGoal?: number;
    targetDaysOfWeek?: number[];
  },
  dayKeys: string[],
  todayKey: string = getDateKey(new Date())
): HabitWindowRateResult {
  if (habit.archived) {
    return { doneCount: 0, expectedCount: 0, ratePercent: 0 };
  }

  let doneCount = 0;
  let activeDaysInWindow = 0;

  for (const key of dayKeys) {
    if (key > todayKey) continue; // Future day
    const isChecked = Boolean(habit.completedDates?.[key]);
    if (isChecked) {
      doneCount++;
    }
    if (isHabitEligibleOnDate(habit, key, todayKey)) {
      activeDaysInWindow++;
    }
  }

  const weeklyGoal = Math.max(1, Math.min(7, Math.round(habit.weeklyGoal || 7)));
  // Expected count scales with active eligible days since startDate, capped by weeklyGoal per 7-day block
  const maxGoalForWindow = Math.ceil((dayKeys.length / 7) * weeklyGoal);
  const expectedCount = Math.min(activeDaysInWindow, maxGoalForWindow);

  if (expectedCount <= 0) {
    return {
      doneCount,
      expectedCount: doneCount > 0 ? doneCount : 0,
      ratePercent: doneCount > 0 ? 100 : 0,
    };
  }

  const ratePercent = Math.min(100, Math.round((doneCount / expectedCount) * 100));
  return {
    doneCount,
    expectedCount,
    ratePercent,
  };
}
