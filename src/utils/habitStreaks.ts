import { addDays, getDateKey } from './persianDate';

export interface StreaksResult {
  current: number;
  best: number;
}

/**
 * Calculates current streak and all-time best streak for a habit
 * based on its completed dates dictionary { [YYYY-MM-DD]: true }.
 */
export const calculateStreaks = (
  completedDatesDict: Record<string, boolean> = {},
  today: Date = new Date()
): StreaksResult => {
  const normToday = new Date(today);
  normToday.setHours(0, 0, 0, 0);

  const todayKey = getDateKey(normToday);
  const yesterdayKey = getDateKey(addDays(normToday, -1));

  let currentStreak = 0;
  // If completed today, start counting from today; otherwise if yesterday was completed, start from yesterday
  let checkDate = completedDatesDict[todayKey]
    ? normToday
    : completedDatesDict[yesterdayKey]
    ? addDays(normToday, -1)
    : null;

  if (checkDate) {
    while (completedDatesDict[getDateKey(checkDate)]) {
      currentStreak++;
      checkDate = addDays(checkDate, -1);
    }
  }

  // Calculate best all-time streak
  const sortedKeys = Object.keys(completedDatesDict)
    .filter((k) => completedDatesDict[k])
    .sort();

  let bestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const key of sortedKeys) {
    const parts = key.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) continue;
    const [y, m, d] = parts;
    const curDate = new Date(y, m - 1, d);
    curDate.setHours(0, 0, 0, 0);

    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffMs = curDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        tempStreak = 1;
      }
    }
    if (tempStreak > bestStreak) {
      bestStreak = tempStreak;
    }
    prevDate = curDate;
  }

  return {
    current: currentStreak,
    best: Math.max(bestStreak, currentStreak),
  };
};
