import { Habit, Task, Idea, UsefulInfoItem } from '../types';
import { addDays, getDateKey, getTodayKey } from './persianDate';

/**
 * Neutral optional sample data for Kairos (کایروس).
 * Never injected automatically on first run; only used if explicitly requested in tests or demo mode.
 */
export const getInitialHabits = (): Habit[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const makeHistory = (daysOffsets: number[]) => {
    const map: Record<string, boolean> = {};
    daysOffsets.forEach((offset) => {
      map[getDateKey(addDays(today, offset))] = true;
    });
    return map;
  };

  return [
    {
      id: 'h1',
      title: 'پیاده‌روی و فعالیت بدنی روزانه',
      category: 'health',
      emoji: '🏃',
      color: '#0ea5e9',
      weeklyGoal: 5,
      completedDates: makeHistory([0, -2, -4, -6]),
    },
    {
      id: 'h2',
      title: 'مطالعهٔ روزانه (حداقل ۲۰ صفحه)',
      category: 'learning',
      emoji: '📚',
      color: '#6366f1',
      weeklyGoal: 6,
      completedDates: makeHistory([0, -1, -2, -3, -5]),
    },
    {
      id: 'h3',
      title: 'مرور برنامه و نوشتن ۳ اولویت فردا',
      category: 'work',
      emoji: '🎯',
      color: '#10b981',
      weeklyGoal: 7,
      completedDates: makeHistory([0, -1, -2, -3, -4]),
    },
  ];
};

export const getInitialTasks = (): Task[] => {
  const todayKey = getTodayKey();
  return [
    {
      id: 't1',
      title: 'تکمیل گزارش هفتگی پروژه',
      description: 'جمع‌بندی شاخص‌های اصلی و ارسال نسخهٔ نهایی',
      priority: 1,
      duration: 45,
      targetDate: todayKey,
      completed: false,
      category: 'work',
      reminderTime: '10:00',
    },
    {
      id: 't2',
      title: 'مطالعه و یادداشت‌برداری فصل سوم دورهٔ آموزشی',
      description: 'یک جلسهٔ تمرکز ۴۵ دقیقه‌ای همراه با تمرین عملی',
      priority: 2,
      duration: 45,
      targetDate: todayKey,
      completed: false,
      category: 'learning',
      reminderTime: '16:30',
    },
    {
      id: 't3',
      title: 'بررسی و پاسخ به پیام‌های کاری',
      description: 'پاسخ‌گویی متمرکز در یک بازهٔ ۳۰ دقیقه‌ای',
      priority: 3,
      duration: 30,
      targetDate: todayKey,
      completed: false,
      category: 'work',
    },
  ];
};

export const getInitialIdeas = (): Idea[] => {
  return [
    {
      id: 'id1',
      title: 'طراحی داشبورد گزارش‌گیری مالی شخصی',
      note: 'دسته‌بندی هزینه‌های ماهانه و نمودار روند پس‌انداز',
      category: 'project',
      createdAt: 'یادداشت نمونه',
    },
    {
      id: 'id2',
      title: 'یادگیری مقدمات تحلیل داده با پایتون',
      note: 'پس از اتمام دورهٔ آموزشی فعلی',
      category: 'learning',
      createdAt: 'یادداشت نمونه',
    },
  ];
};

export const getInitialUsefulInfos = (): UsefulInfoItem[] => {
  return [
    {
      id: 'info_1',
      title: 'الگوی برنامه‌ریزی روزانه با ۳ اولویت اصلی',
      content:
        '۱. هر شب حداکثر ۳ کار مهم برای فردا مشخص کنید.\n۲. کارها را به ترتیب اهمیت از ۱ تا ۳ شماره‌گذاری کنید.\n۳. صبح روز بعد از اولویت ۱ شروع کنید و تا پیش از پایان آن سراغ کار بعدی نروید.',
      category: 'personal',
      pinned: true,
      createdAt: 'مرجع نمونه',
    },
    {
      id: 'info_2',
      title: 'دستورات پرکاربرد Git',
      content:
        'git status\ngit add .\ngit commit -m "feat: update project"\ngit push origin main',
      category: 'code',
      pinned: true,
      createdAt: 'مرجع نمونه',
    },
  ];
};
