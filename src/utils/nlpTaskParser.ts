import { addDays, getDateKey, toEnglishNum } from './persianDate';

export interface ParsedTaskResult {
  title: string;
  duration: number; // minutes
  priority: number;
  targetDate: string; // YYYY-MM-DD
  reminderTime?: string; // HH:MM (24-hour)
  rawInput: string;
}

/**
 * Parses natural language Persian input into structured task properties.
 * Example inputs:
 * - "فردا ساعت ۵ عصر، ۴۵ دقیقه HTML تمرین کنم"
 * - "امروز ۳۰ دقیقه مطالعه کتاب اولویت ۱"
 * - "پس‌فردا ۱ ساعت کدنویسی CRM مغازه اولویت ۲"
 */
export const parseNaturalTaskInput = (
  input: string,
  referenceDate: Date = new Date()
): ParsedTaskResult => {
  const normalized = toEnglishNum(input.trim());
  let targetDate = getDateKey(referenceDate);
  let duration = 45; // default 45 mins (Pomodoro block)
  let priority = 1; // default priority 1
  let reminderTime: string | undefined = undefined;

  // 1. Detect Date relative to referenceDate (BUG-23: match only standalone tokens bounded by whitespace/punctuation)
  const hasPasFarda = /(^|[\s،,؛:])(پس‌فردا|پس فردا)(?=$|[\s،,؛:])/.test(normalized);
  const hasFarda = !hasPasFarda && /(^|[\s،,؛:])فردا(?=$|[\s،,؛:])/.test(normalized);
  const hasEmrooz = /(^|[\s،,؛:])امروز(?=$|[\s،,؛:])/.test(normalized);

  if (hasPasFarda) {
    targetDate = getDateKey(addDays(referenceDate, 2));
  } else if (hasFarda) {
    targetDate = getDateKey(addDays(referenceDate, 1));
  } else if (hasEmrooz) {
    targetDate = getDateKey(referenceDate);
  }

  // 2. Detect Reminder Time (e.g. "ساعت 5 عصر", "ساعت 17:30", "ساعت 9 صبح")
  const timeMatch = normalized.match(
    /ساعت\s*(\d{1,2})(?::(\d{2}))?(?:\s*(صبح|ظهر|عصر|شب|بعدازظهر|بعد از ظهر))?/
  );
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = timeMatch[3];

    if (period === 'عصر' || period === 'شب' || period === 'بعدازظهر' || period === 'بعد از ظهر') {
      if (hour < 12) hour += 12;
    } else if (period === 'ظهر') {
      // In Persian usage, "ساعت ۱ ظهر" through "ساعت ۴ ظهر" means 13:00..16:00, while "ساعت ۱۲ ظهر" is 12:00
      if (hour >= 1 && hour < 12) hour += 12;
    } else if (period === 'صبح' && hour === 12) {
      hour = 0;
    }

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      reminderTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  // 3. Detect Priority (اولویت ۱ یا اولویت ۲ یا P1 یا P2)
  const priorityMatch = normalized.match(/اولویت\s*(\d+)/i) || normalized.match(/p(\d+)/i);
  if (priorityMatch) {
    priority = Math.max(1, Math.min(20, parseInt(priorityMatch[1], 10)));
  }

  // 4. Detect Duration (e.g. "۴۵ دقیقه", "1 ساعت", "نیم ساعت", "۹۰ دقیقه", "۱.۵ ساعت")
  const decimalHourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*ساعت(?!\s*\d)/);
  if (normalized.includes('نیم ساعت')) {
    duration = 30;
  } else if (normalized.includes('یک ساعت و نیم')) {
    duration = 90;
  } else if (decimalHourMatch && (!timeMatch || normalized.includes('.'))) {
    duration = Math.round(parseFloat(decimalHourMatch[1]) * 60);
  } else if (normalized.includes('دو ساعت')) {
    duration = 120;
  } else if (normalized.includes('یک ساعت')) {
    duration = 60;
  } else {
    const minMatch = normalized.match(/(\d+)\s*دقیقه/);
    if (minMatch) {
      duration = parseInt(minMatch[1], 10);
    } else {
      const durationHourMatch = normalized.match(/(\d+(?:\.\d+)?)\s+ساعت/);
      if (durationHourMatch) {
        duration = Math.round(parseFloat(durationHourMatch[1]) * 60);
      }
    }
  }

  // 5. Clean up title from extracted tokens (BUG-21: only strip reminder time when valid; BUG-23: boundary-safe relative date removal)
  let cleanedTitle = input.replace(
    /(^|[\s،,؛:])(پس‌فردا|پس فردا|فردا|امروز)(?=$|[\s،,؛:])/g,
    '$1'
  );
  if (reminderTime !== undefined) {
    cleanedTitle = cleanedTitle.replace(
      /(?:ساعت\s*[\d۰-۹]{1,2}(?::[\d۰-۹]{2})?(?:\s*(?:عصر|صبح|ظهر|شب|بعدازظهر|بعد از ظهر))?)/g,
      ''
    );
  }
  cleanedTitle = cleanedTitle
    .replace(/(?:[\d۰-۹]+(?:[./٫][\d۰-۹]+)?\s*ساعت)/g, '')
    .replace(/(?:[\d۰-۹]+\s*دقیقه)/g, '')
    .replace(/نیم ساعت|یک ساعت و نیم|دو ساعت|یک ساعت/g, '')
    .replace(/(?:اولویت\s*[\d۰-۹]+|p[\d۰-۹]+)/gi, '')
    .replace(/،/g, ' ')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedTitle) {
    cleanedTitle = input.trim();
  }

  return {
    title: cleanedTitle,
    duration: Math.max(5, duration),
    priority,
    targetDate,
    reminderTime,
    rawInput: input,
  };
};
