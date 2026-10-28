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

  // 1. Task breakdown request
  if (
    q.includes('تقسیم') ||
    q.includes('خرد') ||
    q.includes('مراحل کوچک') ||
    q.includes('CRM') ||
    q.includes('پروژه')
  ) {
    const projectMatch = q.replace(/لطفاً|پروژه بزرگ|رو به چند مرحله.*|تقسیم کن|خرد کن/g, '').trim();
    const topic = projectMatch.length > 3 && projectMatch.length < 55 ? projectMatch : 'پروژه اصلی امروز';

    return {
      reply: `دانیال جان، بهترین راه برای اینکه مغزت در برابر «${topic}» گارد نگیره، شکستن اون به ۳ اسپرینت کوچک و مشخصه:\n\n۱. گام اول فقط ۱۵ دقیقه آماده‌سازی و نوشتن اسکلت اولیه است (بدون کمال‌گرایی).\n۲. گام دوم ۴۵ دقیقه اجرای بخش اصلی با تایمر پومودورو.\n۳. گام سوم ۳۰ دقیقه تست، بازبینی و بستن پرونده.\n\nمی‌تونی با دکمه زیر هر ۳ مرحله رو یکجا به میز کارت اضافه کنی:`,
      suggestedTasks: [
        {
          title: `گام ۱: آماده‌سازی اولیه و طراحی ساختار (${topic})`,
          description: 'شروع بدون کمال‌گرایی - فقط راه‌اندازی اولیه',
          priority: 1,
          duration: 20,
        },
        {
          title: `گام ۲: اسپرینت تمرکز عمیق روی بخش اصلی (${topic})`,
          description: 'یک پومودوروی ۴۵ دقیقه‌ای با گوشی سایلنت',
          priority: 2,
          duration: 45,
        },
        {
          title: `گام ۳: تست نهایی و جمع‌بندی (${topic})`,
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
    q.includes('حوصله') ||
    q.includes('شروع') ||
    q.includes('خسته')
  ) {
    const topTaskTitle = pendingToday[0]?.title || 'مهم‌ترین کار امروزت';
    return {
      reply: `کاملاً طبیعیه دانیال جان! وقتی کار بزرگ به نظر می‌رسه، مغز برای فرار از استرس سراغ گوشی یا کارهای حاشیه‌ای می‌ره.\n\n🔥 نسخه فوری ضد اهمال‌کاری «کایروس» (قانون ۵ دقیقه):\n۱. به خودت بگو قرار نیست کل «${topTaskTitle}» رو تموم کنم؛ فقط ۵ دقیقه روش کار می‌کنم و بعدش حق دارم متوقف بشم.\n۲. همین الان برو به تب «تمرکز عمیق» و «حالت تک‌کاره» رو روشن کن تا چشمت به بقیه لیست نیفته.\n۳. یک لیوان آب بخور و تایمر رو روی ۱۵ دقیقه بذار.`,
      suggestedTasks: [
        {
          title: `شروع ۵ دقیقه‌ای بدون کمال‌گرایی: ${topTaskTitle}`,
          description: 'فقط باز کردن فایل و انجام اولین قدم کوچک',
          priority: 1,
          duration: 15,
        },
      ],
    };
  }

  // 3. Daily schedule optimization
  if (
    q.includes('برنامه') ||
    q.includes('چینش') ||
    q.includes('امروز') ||
    q.includes('زمان‌بندی') ||
    q.includes('ساعت')
  ) {
    const totalPendingMin = pendingToday.reduce((acc, t) => acc + (Number(t.duration) || 45), 0);
    const listText =
      pendingToday.length > 0
        ? pendingToday
            .slice(0, 4)
            .map((t, i) => `• اولویت ${toPersianNum(i + 1)}: ${t.title} (${toPersianNum(t.duration)} دقیقه)`)
            .join('\n')
        : '• تمام کارهای امروزت انجام شده یا هنوز کاری ثبت نکردی!';

    return {
      reply: `بر اساس وضعیت فعلی میز کار تو در «کایروس»:\n- کارهای انجام‌شده امروز: ${toPersianNum(doneToday.length)} کار\n- کارهای باقی‌مانده: ${toPersianNum(pendingToday.length)} کار (مجموعاً ${toPersianNum(totalPendingMin)} دقیقه)\n- عادت‌های تکمیل‌شده: ${toPersianNum(habitsDone)} از ${toPersianNum(habits.length)}\n\n📅 چینش بلوک‌های پیشنهادی برای ادامه روز:\n${listText}\n\n💡 پیشنهاد مربی: اول از همه «${pendingToday[0]?.title || 'اولویت ۱'}» رو توی تب «تمرکز عمیق» خط بزن و تا قبل از اتمامش سراغ کارهای فرعی نرو.`,
    };
  }

  // 4. Default smart response using local context
  const topTitle = pendingToday[0]?.title || 'تعیین اولویت ۱';
  return {
    reply: `دانیال جان، پیام تو رو بررسی کردم. در حال حاضر ${toPersianNum(pendingToday.length)} کار ناتمام در لیست امروز داری و اولویت شماره ۱ تو «${topTitle}» است.\n\nمی‌خوای این موضوع رو به چند مرحله کوچک‌تر بشکنیم یا به عنوان یک مأموریت جدید با زمان مشخص به میز کارت اضافه کنم؟`,
    suggestedTasks:
      q.length > 4
        ? [
            {
              title: q.slice(0, 70),
              description: 'ثبت‌شده از گفت‌وگو با دستیار هوشمند کایروس',
              priority: pendingToday.length + 1,
              duration: 45,
            },
          ]
        : undefined,
  };
}
