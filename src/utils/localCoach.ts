import { Task, Habit } from '../types';
import { toPersianNum, getTodayKey } from './persianDate';

export interface LocalCoachResponse {
  reply: string;
  suggestedTasks?: Array<{
    title: string;
    description?: string;
    priority: number;
    duration: number;
  }>;
}

export function generateLocalCoachResponse(
  message: string,
  tasks: Task[],
  habits: Habit[]
): LocalCoachResponse {
  const q = message.trim();
  const todayKey = getTodayKey();
  const todayTasks = tasks.filter((t) => t.targetDate <= todayKey);
  const pendingToday = todayTasks
    .filter((t) => !t.completed)
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));
  const doneToday = todayTasks.filter((t) => t.completed);
  const habitsDone = habits.filter((h) => h.completedDates[todayKey]).length;

  // 1. Task breakdown request (BUG-26: prioritized explicit breakdown keywords)
  if (
    q.includes('تقسیم') ||
    q.includes('خرد') ||
    q.includes('مراحل کوچک') ||
    q.includes('چند مرحله') ||
    q.includes('CRM')
  ) {
    const projectMatch = q
      .replace(/لطفاً|پروژه بزرگ|پروژه|رو به چند مرحله.*|تقسیم کن|خرد کن/g, '')
      .trim();
    const topic =
      projectMatch.length > 3 && projectMatch.length < 55
        ? projectMatch
        : 'کار اصلی امروز';

    return {
      reply: `برای اینکه شروع «${topic}» ساده‌تر شود، پیشنهاد می‌کنم آن را به ۳ مرحلهٔ مشخص تقسیم کنید:\n\n۱. مرحلهٔ اول (۲۰ دقیقه): آماده‌سازی اولیه و مشخص کردن چهارچوب کار.\n۲. مرحلهٔ دوم (۴۵ دقیقه): تمرکز روی بخش اصلی در یک جلسهٔ تمرکز.\n۳. مرحلهٔ سوم (۳۰ دقیقه): بازبینی، تکمیل جزئیات و جمع‌بندی نهایی.\n\nبا دکمهٔ زیر می‌توانید این ۳ مرحله را به فهرست کارهای امروز اضافه کنید:`,
      suggestedTasks: [
        {
          title: `گام ۱: آماده‌سازی اولیه و ساختار (${topic})`,
          description: 'شروع بدون کمال‌گرایی — راه‌اندازی اولیه و فهرست رئوس',
          priority: 1,
          duration: 20,
        },
        {
          title: `گام ۲: اجرای بخش اصلی (${topic})`,
          description: 'یک جلسهٔ تمرکز ۴۵ دقیقه‌ای بدون عوامل حواس‌پرتی',
          priority: 2,
          duration: 45,
        },
        {
          title: `گام ۳: بازبینی و جمع‌بندی (${topic})`,
          description: 'بررسی خروجی و ثبت نتیجه',
          priority: 3,
          duration: 30,
        },
      ],
    };
  }

  // 2. Procrastination / Low energy
  if (
    q.includes('اهمال') ||
    q.includes('تنبلی') ||
    q.includes('بی‌انرژی') ||
    q.includes('بی انرژی') ||
    q.includes('حوصله') ||
    q.includes('خسته') ||
    q.includes('انگیزه')
  ) {
    const topTaskTitle = pendingToday[0]?.title || 'مهم‌ترین کار امروز';
    return {
      reply: `وقتی کاری بزرگ یا مبهم به نظر می‌رسد، طبیعی است که ذهن شروع آن را به تعویق بیندازد.\n\nپیشنهاد عملی (قانون ۵ دقیقه):\n۱. هدف را تمام کردن کل «${topTaskTitle}» نگذارید؛ فقط ۱۵ دقیقه شروع اولیه را هدف بگیرید.\n۲. به بخش «تمرکز» بروید و تایمر را روی ۱۵ دقیقه تنظیم کنید.\n۳. فقط اولین قدم کوچک را انجام دهید؛ ادامه دادن پس از شروع بسیار ساده‌تر است.`,
      suggestedTasks: [
        {
          title: `شروع ۱۵ دقیقه‌ای: ${topTaskTitle}`,
          description: 'فقط باز کردن کار و انجام اولین قدم کوچک',
          priority: 1,
          duration: 15,
        },
      ],
    };
  }

  // 3. Daily schedule optimization (BUG-26: match explicit schedule phrases)
  if (
    q.includes('برنامه') ||
    q.includes('چینش') ||
    q.includes('زمان‌بندی') ||
    q.includes('زمان بندی') ||
    q.includes('اولویت‌بندی')
  ) {
    const totalPendingMin = pendingToday.reduce((acc, t) => acc + (Number(t.duration) || 45), 0);
    const listText =
      pendingToday.length > 0
        ? pendingToday
            .slice(0, 4)
            .map(
              (t, i) =>
                `• اولویت ${toPersianNum(i + 1)}: ${t.title} (${toPersianNum(t.duration)} دقیقه)`
            )
            .join('\n')
        : '• تمام کارهای امروز انجام شده یا هنوز کاری ثبت نشده است.';

    return {
      reply: `خلاصهٔ وضعیت امروز شما:\n- کارهای انجام‌شده: ${toPersianNum(doneToday.length)} مورد\n- کارهای باقی‌مانده: ${toPersianNum(pendingToday.length)} مورد (مجموعاً ${toPersianNum(totalPendingMin)} دقیقه)\n- عادت‌های ثبت‌شده امروز: ${toPersianNum(habitsDone)} از ${toPersianNum(habits.length)}\n\nترتیب پیشنهادی برای ادامهٔ روز:\n${listText}\n\nپیشنهاد: ابتدا «${pendingToday[0]?.title || 'اولویت ۱'}» را در بخش «تمرکز» شروع کنید و پیش از اتمام آن سراغ کارهای فرعی نروید.`,
    };
  }

  // 4. Default response using local context
  const topTitle = pendingToday[0]?.title || 'تعیین اولویت ۱';
  return {
    reply: `در حال حاضر ${toPersianNum(pendingToday.length)} کار ناتمام در برنامهٔ امروز دارید و اولویت اول شما «${topTitle}» است.\n\nمی‌خواهید این موضوع را به چند گام کوچک‌تر تقسیم کنیم یا آن را به عنوان یک کار جدید با زمان مشخص به برنامهٔ امروز اضافه کنم؟`,
    suggestedTasks:
      q.length > 4
        ? [
            {
              title: q.slice(0, 70),
              description: 'ایجادشده از بخش کمک به برنامه‌ریزی',
              priority: pendingToday.length + 1,
              duration: 45,
            },
          ]
        : undefined,
  };
}
