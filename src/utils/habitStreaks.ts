import { addDays, getDateKey } from './persianDate';

export interface StreaksResult {
  current: number;
  best: number;
}

/**
 * Calculates current streak and all-time best streak for a habit
 * based on its completed dates dictionary { [YYYY-MM-DD]: true } and `weeklyGoal` (1..7) (BUG-27).
 * - For daily habits (`weeklyGoal === 7`), requires consecutive daily completions.
 * - For flexible weekly habits (`weeklyGoal < 7`), allows up to `7 - weeklyGoal` rest days between check-ins
 *   without breaking the active chain.
 */
export const calculateStreaks = (
  completedDatesDict: Record<string, boolean> = {},
  today: Date = new Date(),
  weeklyGoal: number = 7
): StreaksResult => {
  const normToday = new Date(today);
  normToday.setHours(0, 0, 0, 0);

  const clampedGoal = Math.max(1, Math.min(7, Math.round(weeklyGoal || 7)));
  const maxAllowedRestGap = 7 - clampedGoal; // 0 for daily (goal=7), 2 for goal=5, 4 for goal=3

  const sortedKeys = Object.keys(completedDatesDict)
    .filter((k) => completedDatesDict[k])
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

  // Calculate best all-time streak respecting maxAllowedRestGap
  let bestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const curDate of completedDates) {
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffMs = curDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays >= 1 && diffDays <= maxAllowedRestGap + 1) {
        tempStreak++;
      } else if (diffDays > maxAllowedRestGap + 1) {
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
  const daysSinceLastCompletion = Math.round(
    (normToday.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24)
  );

  // If the user hasn't missed more than (maxAllowedRestGap + 1) days including today, the streak is still alive
  let currentStreak = 0;
  if (daysSinceLastCompletion <= maxAllowedRestGap + 1) {
    currentStreak = 1;
    for (let i = completedDates.length - 1; i > 0; i--) {
      const cur = completedDates[i];
      const prev = completedDates[i - 1];
      const diffDays = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 1 && diffDays <= maxAllowedRestGap + 1) {
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
