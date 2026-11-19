import type { NavTabId } from '../types';

export type FeatureId = Exclude<NavTabId, 'more' | 'customize' | 'ideas' | 'deep_focus'>;
export interface FeatureDescription {
  id: FeatureId;
  title: string;
  description: string;
  group: 'daily' | 'planning' | 'records' | 'settings';
  keywords?: string;
}
export const FEATURES: FeatureDescription[] = [
  { id: 'dashboard', title: 'امروز', description: 'کارها، عادت‌ها و برنامهٔ تأییدشدهٔ امروز.', group: 'daily' },
  { id: 'workspace', title: 'کارها', description: 'ثبت، ویرایش و پیگیری کارهای روزانه.', group: 'daily' },
  { id: 'projects', title: 'پروژه‌ها', description: 'هدف‌ها، مرحله‌ها، جست‌وجو و قالب‌های کار.', group: 'planning', keywords: 'قالب کپی مرحله هدف جستجو' },
  { id: 'calendar', title: 'تقویم', description: 'کارها و بازه‌های برنامه‌ریزی در روزهای تقویم.', group: 'daily' },
  { id: 'pomodoro', title: 'تمرکز', description: 'تایمر تمرکز و ثبت جلسهٔ کار.', group: 'daily', keywords: 'پومودورو تایمر' },
  { id: 'habits', title: 'عادت‌ها', description: 'پیگیری تکرار عادت‌ها و هدف هفتگی.', group: 'records' },
  { id: 'useful_info', title: 'یادداشت‌ها', description: 'نگهداری یادداشت‌ها و ایده‌های شخصی.', group: 'records', keywords: 'ایده' },
  { id: 'events', title: 'رویدادها', description: 'قرارها و امتحان‌ها با شمارش معکوس داخل برنامه.', group: 'planning' },
  { id: 'tracking', title: 'شاخص‌ها', description: 'ثبت اندازه‌گیری دلخواه و مشاهدهٔ روند آن.', group: 'records', keywords: 'پیگیری نمودار مقدار' },
  { id: 'capacity', title: 'بررسی ظرفیت', description: 'وقت آزاد، تعهد ثابت و زمان پیشنهادی انجام کار.', group: 'planning', keywords: 'قبل از قول دادن تخمین برنامه ریزی زمانبندی' },
  { id: 'planner', title: 'کمک به برنامه‌ریزی', description: 'مرور و تنظیم اولویت‌های برنامهٔ روزانه.', group: 'planning' },
  { id: 'analytics', title: 'گزارش‌ها', description: 'مرور کارهای انجام‌شده و سابقهٔ تمرکز.', group: 'records' },
  { id: 'sync', title: 'تنظیمات', description: 'پشتیبان، بازیابی و تنظیمات برنامه.', group: 'settings', keywords: 'بکاپ بازیابی تم صدا' },
];
export const FEATURE_IDS = FEATURES.map(feature => feature.id);
export const FEATURE_GROUP_LABELS = { daily: 'روز و تمرکز', planning: 'برنامه‌ریزی', records: 'ثبت و پیگیری', settings: 'برنامه' };
export const NAV_LABELS: Record<string, string> = Object.fromEntries([
  ...FEATURES.map(feature => [feature.id, feature.title]),
  ['more', 'بیشتر'], ['customize', 'شخصی‌سازی منو'],
]);
