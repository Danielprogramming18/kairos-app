/**
 * Persian numbers, Jalali calendar generator (multi-year & leap-year aware), and date helper utilities
 */

export const PERSIAN_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const PERSIAN_WEEKDAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
];

export const toPersianNum = (num: number | string | null | undefined): string => {
  if (num === null || num === undefined) return '';
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(num).replace(/\d/g, (x) => persianDigits[Number(x)]);
};

export const toEnglishNum = (str: string): string => {
  if (!str) return '';
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = str;
  persianDigits.forEach((p, idx) => {
    res = res.replaceAll(p, String(idx));
  });
  arabicDigits.forEach((a, idx) => {
    res = res.replaceAll(a, String(idx));
  });
  return res;
};

export const getDateKey = (date: Date = new Date()): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const getTodayKey = (): string => getDateKey(new Date());

export const getTomorrowKey = (): string => getDateKey(addDays(new Date(), 1));

export interface WeekDayItem {
  date: Date;
  key: string;
  weekdayName: string;
  weekdayFull: string;
  dayNumber: string;
  monthName: string;
  isToday: boolean;
  isFuture: boolean;
}

export const getWeekDays = (offset = 0, referenceDate: Date = new Date()): WeekDayItem[] => {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  // In Iran calendar, Saturday (day 6 in JS Date) is the start of the week.
  const dayOfWeek = today.getDay();
  const diffToSaturday = (dayOfWeek + 1) % 7;
  const startOfCurrentWeek = addDays(today, -diffToSaturday + offset * 7);

  const days: WeekDayItem[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(startOfCurrentWeek, i);
    d.setHours(0, 0, 0, 0);
    days.push({
      date: d,
      key: getDateKey(d),
      weekdayName: new Intl.DateTimeFormat('fa-IR', { weekday: 'short' }).format(d),
      weekdayFull: new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(d),
      dayNumber: new Intl.DateTimeFormat('fa-IR', { day: 'numeric' }).format(d),
      monthName: new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(d),
      isToday: getDateKey(d) === getDateKey(today),
      isFuture: d.getTime() > today.getTime(),
    });
  }
  return days;
};

export const formatPersianDateFull = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat('fa-IR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

export const formatDateKeyToPersian = (dateKey: string): string => {
  const d = parseDateKey(dateKey);
  return formatPersianDateFull(d);
};

export interface PersianDateParts {
  jYear: number;
  jMonth: number; // 1..12
  jDay: number; // 1..31
  monthName: string;
  weekdayIndex: number; // 0 (Saturday) .. 6 (Friday)
  weekdayFull: string;
}

const latnFormatter = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

export const getPersianParts = (date: Date): PersianDateParts => {
  const parts = latnFormatter.formatToParts(date);
  let jYear = 1405;
  let jMonth = 1;
  let jDay = 1;

  for (const p of parts) {
    if (p.type === 'year') jYear = parseInt(toEnglishNum(p.value), 10);
    if (p.type === 'month') jMonth = parseInt(toEnglishNum(p.value), 10);
    if (p.type === 'day') jDay = parseInt(toEnglishNum(p.value), 10);
  }

  // JS getDay(): Sat=6 -> 0, Sun=0 -> 1, Mon=1 -> 2, ..., Fri=5 -> 6
  const weekdayIndex = (date.getDay() + 1) % 7;
  const monthName = PERSIAN_MONTH_NAMES[jMonth - 1] || '';
  const weekdayFull = PERSIAN_WEEKDAYS[weekdayIndex] || '';

  return {
    jYear,
    jMonth,
    jDay,
    monthName,
    weekdayIndex,
    weekdayFull,
  };
};

/**
 * Finds the exact Gregorian Date (at 00:00:00 local time) corresponding to 1 Farvardin of `targetJYear`.
 * Works accurately across any year (e.g. 1350..1450) without cumulative drift (BUG-14).
 */
export const getStartOfPersianYear = (targetJYear: number): Date => {
  const approxGregorianYear = targetJYear + 621;
  let cursor = new Date(approxGregorianYear, 2, 17); // March 17
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 15; i++) {
    const p = getPersianParts(cursor);
    if (p.jYear === targetJYear && p.jMonth === 1 && p.jDay === 1) {
      return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return cursor;
};

/**
 * Determines whether a Jalali year (`jYear`) is a leap year (30-day Esfand) (BUG-12).
 * Uses exact astronomical/ICU calendar verification on the 366th day of the Jalali year.
 */
export const isJalaliLeapYear = (jYear: number): boolean => {
  const startOfYear = getStartOfPersianYear(jYear);
  const day366 = addDays(startOfYear, 365); // 0-indexed offset 365 is the 366th day of the year
  const parts = getPersianParts(day366);
  return parts.jYear === jYear && parts.jMonth === 12 && parts.jDay === 30;
};

/**
 * Returns the exact number of days in a given Jalali month (1..12) of `jYear` (BUG-12).
 */
export const getJalaliMonthLength = (jYear: number, jMonth: number): number => {
  if (jMonth >= 1 && jMonth <= 6) return 31;
  if (jMonth >= 7 && jMonth <= 11) return 30;
  if (jMonth === 12) return isJalaliLeapYear(jYear) ? 30 : 29;
  return 30;
};

export interface CalendarDayCell {
  key: string; // 'YYYY-MM-DD'
  date: Date;
  jYear: number;
  jMonth: number;
  jDay: number;
  monthName: string;
  weekdayIndex: number; // 0=Sat .. 6=Fri
  weekdayFull: string;
  isToday: boolean;
  isPast: boolean;
}

export interface CalendarMonthData {
  jYear: number;
  jMonth: number; // 1..12
  monthName: string;
  isLeapYear: boolean;
  startWeekdayOffset: number; // 0..6 empty cells before day 1
  days: CalendarDayCell[];
}

/**
 * Generates all 12 months of the specified Persian year (`yearOrDate`).
 * Accepts either a Jalali year number (e.g. 1403, 1404, 1405) or a reference `Date` (BUG-11, BUG-12, BUG-14).
 */
export const getFullPersianYearCalendar = (
  yearOrDate: Date | number = new Date(),
  todayReference: Date = new Date()
): CalendarMonthData[] => {
  const today = new Date(todayReference);
  today.setHours(0, 0, 0, 0);
  const todayKey = getDateKey(today);

  const targetJYear =
    typeof yearOrDate === 'number' ? yearOrDate : getPersianParts(yearOrDate).jYear;

  let cursor = getStartOfPersianYear(targetJYear);
  const leap = isJalaliLeapYear(targetJYear);

  const monthsMap = new Map<number, CalendarDayCell[]>();
  for (let m = 1; m <= 12; m++) {
    monthsMap.set(m, []);
  }

  // Iterate through the entire Persian year (365 days in normal year, 366 in leap year)
  for (let i = 0; i < 367; i++) {
    const p = getPersianParts(cursor);
    if (p.jYear > targetJYear) break;
    if (p.jYear === targetJYear) {
      const key = getDateKey(cursor);
      const cell: CalendarDayCell = {
        key,
        date: new Date(cursor),
        jYear: p.jYear,
        jMonth: p.jMonth,
        jDay: p.jDay,
        monthName: p.monthName,
        weekdayIndex: p.weekdayIndex,
        weekdayFull: p.weekdayFull,
        isToday: key === todayKey,
        isPast: cursor.getTime() < today.getTime(),
      };
      monthsMap.get(p.jMonth)?.push(cell);
    }
    cursor = addDays(cursor, 1);
  }

  const result: CalendarMonthData[] = [];
  for (let m = 1; m <= 12; m++) {
    const days = monthsMap.get(m) || [];
    const startWeekdayOffset = days.length > 0 ? days[0].weekdayIndex : 0;
    result.push({
      jYear: targetJYear,
      jMonth: m,
      monthName: PERSIAN_MONTH_NAMES[m - 1],
      isLeapYear: leap,
      startWeekdayOffset,
      days,
    });
  }

  return result;
};
