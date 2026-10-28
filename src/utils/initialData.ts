import { Habit, Task, Idea, UsefulInfoItem } from '../types';
import { addDays, getDateKey, getTodayKey } from './persianDate';

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
      title: 'حمام، روتین پوست و بهداشت شخصی (خلبان خودکار)',
      category: 'health',
      emoji: '🚿',
      color: '#0ea5e9',
      weeklyGoal: 4,
      completedDates: makeHistory([0, -2, -4, -6, -8]),
    },
    {
      id: 'h2',
      title: 'آماده‌سازی و ارسال محتوای کانال ایتا (۱ روز جلوتر)',
      category: 'work',
      emoji: '🎨',
      color: '#8b5cf6',
      weeklyGoal: 7,
      completedDates: makeHistory([0, -1, -2, -3, -4, -5, -6]),
    },
    {
      id: 'h3',
      title: 'اسپرینت کدنویسی فرانت‌اند (HTML/CSS) و پروژه CRM',
      category: 'learning',
      emoji: '💻',
      color: '#6366f1',
      weeklyGoal: 5,
      completedDates: makeHistory([0, -1, -3, -4, -6]),
    },
    {
      id: 'h4',
      title: 'بستن پرونده تکالیف و درس‌های هنرستان',
      category: 'learning',
      emoji: '📚',
      color: '#10b981',
      weeklyGoal: 5,
      completedDates: makeHistory([0, -1, -2, -4, -5]),
    },
    {
      id: 'h5',
      title: 'مرتب کردن اتاق و جمع کردن کیف فردا قبل از خواب',
      category: 'mindfulness',
      emoji: '🧹',
      color: '#f59e0b',
      weeklyGoal: 7,
      completedDates: makeHistory([0, -1, -2, -3, -5, -6]),
    },
    {
      id: 'h6',
      title: 'چیدن اولویت‌های فردا (The One Thing) در ۱۱:۳۰ شب',
      category: 'work',
      emoji: '🎯',
      color: '#ec4899',
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
      title: 'طراحی عکس با هوش مصنوعی و ارسال متن کانال ایتا',
      description: 'گرفتن چند رفرنس برای تخت خواب و ارسال در ساعت ۷ شب برای تایید به موقع',
      priority: 1,
      duration: 60,
      targetDate: todayKey,
      completed: false,
      category: 'work',
      reminderTime: '19:00',
    },
    {
      id: 't2',
      title: 'تکالیف مدرسه و تمرین فتوشاپ پایه یازدهم',
      description: 'بخش‌های عملی کلاس امروز به صورت پینگ‌پنگی (۴۵ دقیقه کار + استراحت)',
      priority: 2,
      duration: 90,
      targetDate: todayKey,
      completed: false,
      category: 'learning',
      reminderTime: '16:30',
    },
    {
      id: 't3',
      title: 'مشاهده دوره HTML/CSS و پیاده‌سازی بخش اول CRM مغازه',
      description: 'تمرکز روی ساختار فرم مشتریان بدون کمال‌گرایی افراطی',
      priority: 3,
      duration: 60,
      targetDate: todayKey,
      completed: false,
      category: 'learning',
    },
  ];
};

export const getInitialIdeas = (): Idea[] => {
  return [
    {
      id: 'id1',
      title: 'ساخت داشبورد معاملات، سود و ضرر با Power BI',
      note: 'بعد از اتمام دوره فعلی یکشنبه‌ها و سه‌شنبه‌ها استارت بخوره',
      category: 'project',
      createdAt: 'پارک‌شده برای ماه بعد',
    },
    {
      id: 'id2',
      title: 'شروع یادگیری زبان پایتون (مکمل هوش مصنوعی و دیتا)',
      note: 'پس از تکمیل دوره ۷ ساعته HTML و ۱۳ ساعته CSS',
      category: 'learning',
      createdAt: 'پارک‌شده در بانک ایده',
    },
    {
      id: 'id3',
      title: 'ثبت‌نام کلاس گیتار',
      note: 'وقتی تایم سه‌شنبه‌های کلاس Power BI آزاد شد',
      category: 'personal',
      createdAt: 'پارک‌شده در بانک ایده',
    },
    {
      id: 'id4',
      title: 'سیستم اتوماسیون پیام‌های مشتریان در اپ CRM مغازه',
      note: 'نسخه ۲ پروژه نرم‌افزار مغازه',
      category: 'business',
      createdAt: 'پارک‌شده در بانک ایده',
    },
  ];
};

export const getInitialUsefulInfos = (): UsefulInfoItem[] => {
  return [
    {
      id: 'info_1',
      title: 'بلوک‌های زمانی طلایی روزانه (کایروس)',
      content:
        '۱. بلوک اول (۱۵:۰۰ تا ۱۶:۰۰): استراحت، ناهار و ریکاوری بعد از مدرسه\n۲. بلوک دوم (۱۶:۰۰ تا ۱۹:۰۰): سنگر تکالیف هنرستان و فتوشاپ (پومودورو ۴۵/۱۵)\n۳. بلوک سوم (۱۹:۰۰ تا ۲۱:۳۰): پروژه کدنویسی CRM و محتوای کانال ایتا\n۴. بلوک چهارم (۲۱:۳۰ تا ۲۳:۳۰): تفریح آزاد، مرتب کردن اتاق و نوشتن ۳ اولویت فردا',
      category: 'personal',
      pinned: true,
      createdAt: 'ثابت',
    },
    {
      id: 'info_2',
      title: 'دستورات پرکاربرد Git برای بروزرسانی پروژه در GitHub',
      content:
        'git status\ngit add .\ngit commit -m "update kairos app"\ngit push origin main',
      category: 'code',
      pinned: true,
      createdAt: 'مرجع کد',
    },
    {
      id: 'info_3',
      title: 'چک‌لیست استاندارد پست‌های کانال ایتا',
      content:
        '• انتخاب عکس باکیفیت و نورپردازی گرم\n• تیتر جذاب در خط اول همراه با ایموجی مناسب\n• درج ابعاد، جنس کلاف و رنگ‌بندی دقیق\n• راه‌های ارتباطی و آدرس مغازه در انتهای متن',
      category: 'work',
      pinned: false,
      createdAt: 'کاری',
    },
    {
      id: 'info_4',
      title: 'منابع و لینک‌های مرجع تمرین فرانت‌اند',
      content:
        'MDN Web Docs: https://developer.mozilla.org\nTailwind CSS Docs: https://tailwindcss.com/docs\nLucide Icons: https://lucide.dev/icons',
      category: 'links',
      pinned: false,
      createdAt: 'لینک‌ها',
    },
  ];
};
