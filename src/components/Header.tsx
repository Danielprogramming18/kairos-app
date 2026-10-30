import React, { useState, useEffect } from 'react';
import {
  Compass,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Download,
  Plus,
  Bell,
  BellRing,
  Clock,
  X,
  Database,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { formatPersianDateFull, toPersianNum, getTodayKey } from '../utils/persianDate';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Task, NavTabId } from '../types';

const TAB_TITLES: Record<NavTabId, string> = {
  dashboard: 'امروز (داشبورد اجرای روزانه)',
  workspace: 'میز کار و مأموریت‌ها',
  calendar: 'تقویم سالانه جلالی',
  habits: 'پیگیری عادت‌ها',
  deep_focus: 'محیط تمرکز عمیق',
  pomodoro: 'تایمر پومودورو',
  useful_info: 'یادداشت‌ها و منابع کاربردی',
  ideas: 'بانک ایده‌ها',
  planner: 'دستیار هوشمند محلی',
  analytics: 'گزارش و تحلیل عملکرد',
  sync: 'پشتیبان‌گیری، بازیابی و تنظیمات',
};

interface HeaderProps {
  activeTab?: NavTabId;
  storageStatus?: 'initializing' | 'ready' | 'saving' | 'saved' | 'error';
  soundEnabled: boolean;
  onToggleSound: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenHabitModal: () => void;
  onOpenTaskModal: () => void;
  tasks: Task[];
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestNotificationPermission: () => void;
  onTriggerTestNotification: () => void;
  onSwitchTab: (tab: NavTabId) => void;
  isGitHubConfigured?: boolean;
  isGitHubSyncing?: boolean;
  githubRepoLabel?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab = 'dashboard',
  storageStatus = 'ready',
  soundEnabled,
  onToggleSound,
  isDark,
  onToggleTheme,
  onOpenHabitModal,
  onOpenTaskModal,
  tasks,
  notificationPermission,
  onRequestNotificationPermission,
  onTriggerTestNotification,
  onSwitchTab,
}) => {
  const currentDate = formatPersianDateFull(new Date());
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const todayKey = getTodayKey();
  const tasksWithReminders = tasks.filter(
    (t) => !t.completed && t.targetDate >= todayKey && t.reminderTime
  );
  const pendingTodayCount = tasks.filter(
    (t) => !t.completed && t.targetDate <= todayKey
  ).length;

  useEffect(() => {
    if (!showNotifPanel && !showIOSModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifPanel(false);
        setShowIOSModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNotifPanel, showIOSModal]);

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-3">
          {/* Brand & Contextual Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onSwitchTab('dashboard')}
              className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 hover:bg-indigo-700 transition cursor-pointer"
              aria-label="بازگشت به نمای امروز"
            >
              <Compass className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 truncate">
                  کایروس
                </h1>
                <span className="hidden sm:inline-block text-slate-300 dark:text-slate-700">/</span>
                <span className="hidden sm:inline-block text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                  {TAB_TITLES[activeTab] || 'امروز'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                امروز، {currentDate}
              </p>
            </div>
          </div>

          {/* Right-side Contextual Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
            {/* Local Storage Persistence Status Badge */}
            <button
              type="button"
              onClick={() => onSwitchTab('sync')}
              data-testid="header-storage-indicator"
              title="وضعیت پایگاه‌دادهٔ آفلاین (IndexedDB)"
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                storageStatus === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {storageStatus === 'saving' || storageStatus === 'initializing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              ) : storageStatus === 'error' ? (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              ) : storageStatus === 'saved' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              <span>
                {storageStatus === 'saving'
                  ? 'در حال ذخیره...'
                  : storageStatus === 'error'
                  ? 'خطای ذخیره'
                  : 'ذخیرهٔ آفلاین فعال'}
              </span>
            </button>

            {/* PWA Install Button */}
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                title="نصب نسخه وب‌اپلیکیشن روی دستگاه"
                className="hidden sm:flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>نصب</span>
              </button>
            )}

            {!isInstalled && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSModal(true)}
                title="راهنمای نصب روی آیفون"
                className="hidden sm:flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>نصب iOS</span>
              </button>
            )}

            {/* Notifications & Reminders Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                title="یادآورها و اعلان‌ها"
                aria-label="یادآورها و اعلان‌ها"
                aria-expanded={showNotifPanel}
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition relative cursor-pointer"
              >
                {tasksWithReminders.length > 0 ? (
                  <BellRing className="w-4 h-4 text-amber-500" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {(tasksWithReminders.length > 0 || pendingTodayCount > 0) && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold tabular-nums flex items-center justify-center">
                    {toPersianNum(tasksWithReminders.length || pendingTodayCount)}
                  </span>
                )}
              </button>

              {showNotifPanel && (
                <div
                  role="dialog"
                  aria-label="مرکز یادآورها"
                  className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-4 z-50 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <BellRing className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
                        یادآورهای زمان‌بندی‌شده
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNotifPanel(false)}
                      aria-label="بستن پنل یادآور"
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">
                        اعلان مرورگر:
                      </span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                          notificationPermission === 'granted'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {notificationPermission === 'granted'
                          ? 'فعال'
                          : notificationPermission === 'denied'
                          ? 'مسدود در مرورگر'
                          : 'نیازمند مجوز'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {notificationPermission !== 'granted' &&
                        notificationPermission !== 'unsupported' && (
                          <button
                            type="button"
                            onClick={onRequestNotificationPermission}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition cursor-pointer"
                          >
                            درخواست مجوز اعلان
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => {
                          onTriggerTestNotification();
                          setShowNotifPanel(false);
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>تست یادآور</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    <span className="text-[11px] font-bold text-slate-500 block">
                      یادآورهای پیش‌رو ({toPersianNum(tasksWithReminders.length)}):
                    </span>
                    {tasksWithReminders.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center">
                        یادآور فعالی ثبت نشده است. هنگام ایجاد یا ویرایش کار می‌توانید ساعت یادآور تعیین کنید.
                      </p>
                    ) : (
                      tasksWithReminders.map((t) => (
                        <div
                          key={t.id}
                          className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {t.title}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold text-[11px] tabular-nums shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {toPersianNum(t.reminderTime)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sound Toggle Button */}
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'غیرفعال‌سازی افکت‌های صوتی' : 'فعال‌سازی افکت‌های صوتی'}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              aria-label="تغییر صدای برنامه"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={onToggleTheme}
              title={isDark ? 'تغییر به پوسته روشن' : 'تغییر به پوسته تاریک'}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              aria-label="تغییر پوسته تاریک و روشن"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>

            {/* Primary Creation Actions */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="header-quick-add-task"
                onClick={onOpenTaskModal}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg font-bold text-xs transition cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>کار جدید</span>
              </button>
              <button
                type="button"
                data-testid="header-quick-add-habit"
                onClick={onOpenHabitModal}
                title="ثبت عادت جدید"
                className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-2 rounded-lg font-bold text-xs transition cursor-pointer whitespace-nowrap"
              >
                <span>+ عادت</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* iOS Safari Install Guide Modal */}
      {showIOSModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="راهنمای نصب روی iOS"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <Download className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                نصب کایروس روی آیفون و آیپد
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed text-right">
                برای استفاده تمام‌صفحه و آفلاین روی iOS:
                <br />
                ۱. در مرورگر سافاری روی دکمهٔ اشتراک‌گذاری (<b>Share</b>) بزنید.
                <br />
                ۲. گزینهٔ <b>Add to Home Screen</b> را انتخاب کنید.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
