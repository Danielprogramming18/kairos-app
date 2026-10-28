import React, { useState } from 'react';
import {
  Compass,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Download,
  Plus,
  Wifi,
  WifiOff,
  Bell,
  BellRing,
  Clock,
  X,
  GitBranch,
  RefreshCw,
} from 'lucide-react';
import { formatPersianDateFull, toPersianNum, getTodayKey } from '../utils/persianDate';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Task, NavTabId } from '../types';

interface HeaderProps {
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
  isGitHubConfigured,
  isGitHubSyncing,
  githubRepoLabel,
}) => {
  const currentDate = formatPersianDateFull(new Date());
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const todayKey = getTodayKey();
  const tasksWithReminders = tasks.filter(
    (t) => !t.completed && t.targetDate >= todayKey && t.reminderTime
  );
  const pendingTodayCount = tasks.filter(
    (t) => !t.completed && t.targetDate <= todayKey
  ).length;

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/85 dark:bg-slate-900/85 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-20 flex items-center justify-between gap-3">
          {/* Logo & Brand Name (کایروس) */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 shrink-0">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-indigo-600 to-violet-500 dark:from-indigo-400 dark:to-violet-300 bg-clip-text text-transparent">
                  کایروس | دستیار هوشمند تمرکز
                </h1>
                <button
                  type="button"
                  onClick={() => onSwitchTab('deep_focus')}
                  className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition cursor-pointer"
                >
                  حالت تمرکز عمیق
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px] sm:max-w-none">
                امروز، {currentDate}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 relative">
            {/* GitHub Sync Status Button */}
            <button
              type="button"
              onClick={() => onSwitchTab('sync')}
              title={
                isGitHubConfigured
                  ? `متصل به مخزن گیت‌هاب (${githubRepoLabel || 'data.json'})`
                  : 'تنظیم همگام‌سازی خودکار با مخزن خصوصی GitHub'
              }
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer active:scale-95 ${
                isGitHubConfigured
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
              }`}
            >
              {isGitHubSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              ) : (
                <GitBranch className="w-3.5 h-3.5" />
              )}
              <span>
                {isGitHubConfigured
                  ? isGitHubSyncing
                    ? 'سینک GitHub...'
                    : 'متصل به GitHub'
                  : 'سینک GitHub'}
              </span>
            </button>

            {/* Online / Offline status badge */}
            <div
              title={
                isOnline
                  ? 'برنامه متصل و آنلاین است'
                  : 'حالت آفلاین: اطلاعات روی حافظه محلی ذخیره می‌شود'
              }
              className={`hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'آنلاین' : 'آفلاین'}</span>
            </div>

            {/* PWA Install Button */}
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                title="نصب نسخه PWA روی کامپیوتر یا گوشی"
                className="hidden sm:flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>نصب برنامه</span>
              </button>
            )}

            {!isInstalled && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSModal(true)}
                title="راهنمای نصب روی آیفون"
                className="hidden sm:flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl text-xs font-bold transition"
              >
                <Download className="w-4 h-4" />
                <span>نصب iOS</span>
              </button>
            )}

            {/* Notifications & Reminders Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                title="یادآورها و اعلان‌های هوشمند"
                aria-label="یادآورها و اعلان‌ها"
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition relative active:scale-95"
              >
                {tasksWithReminders.length > 0 ? (
                  <BellRing className="w-5 h-5 text-amber-500 animate-bounce" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}
                {(tasksWithReminders.length > 0 || pendingTodayCount > 0) && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                    {toPersianNum(tasksWithReminders.length || pendingTodayCount)}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {showNotifPanel && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 z-50 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <BellRing className="w-4 h-4 text-indigo-500" />
                      <h4 className="text-xs font-black text-slate-800 dark:text-white">
                        مرکز یادآور و نوتیفیکیشن کایروس
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNotifPanel(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Permission & Test Controls */}
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">
                        وضعیت اعلان مرورگر:
                      </span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${
                          notificationPermission === 'granted'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {notificationPermission === 'granted'
                          ? 'فعال شده ✓'
                          : notificationPermission === 'denied'
                          ? 'مسدود در مرورگر'
                          : 'نیازمند تأیید'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {notificationPermission !== 'granted' &&
                        notificationPermission !== 'unsupported' && (
                          <button
                            type="button"
                            onClick={onRequestNotificationPermission}
                            className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition"
                          >
                            فعال‌سازی نوتیفیکیشن
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => {
                          onTriggerTestNotification();
                          setShowNotifPanel(false);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition flex items-center justify-center gap-1"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>تست فوری یادآور</span>
                      </button>
                    </div>
                  </div>

                  {/* Scheduled Reminders List */}
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    <span className="text-[11px] font-bold text-slate-500 block">
                      یادآورهای زمان‌بندی‌شده ({toPersianNum(tasksWithReminders.length)}):
                    </span>
                    {tasksWithReminders.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">
                        هنوز ساعتی برای یادآوری کارها تنظیم نشده است. هنگام ساخت کار یا در تقویم ساعت یادآور را مشخص کن.
                      </p>
                    ) : (
                      tasksWithReminders.map((t) => (
                        <div
                          key={t.id}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
                            {t.title}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[11px] shrink-0 flex items-center gap-1">
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

            {/* Sound toggle button */}
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'غیرفعال‌سازی افکت‌های صوتی' : 'فعال‌سازی افکت‌های صوتی'}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-95"
              aria-label="تغییر صدای برنامه"
            >
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-indigo-500" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-400" />
              )}
            </button>

            {/* Theme toggle button */}
            <button
              type="button"
              onClick={onToggleTheme}
              title={isDark ? 'تغییر به پوسته روشن' : 'تغییر به پوسته تاریک'}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-95"
              aria-label="تغییر پوسته تاریک و روشن"
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-700" />
              )}
            </button>

            {/* Quick add action buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onOpenTaskModal}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3 sm:px-4 py-2 rounded-xl font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/25 transition"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                <span>کار جدید</span>
              </button>
              <button
                type="button"
                onClick={onOpenHabitModal}
                title="ثبت عادت روزانه جدید"
                className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-xl font-bold text-xs transition active:scale-95"
              >
                <span>+ عادت</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* iOS Safari Install Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
              <Download className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="text-base font-black text-slate-800 dark:text-white">
                نصب کایروس روی آیفون و آیپد
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-right">
                برای استفاده تمام‌صفحه و آفلاین روی iOS:
                <br />
                ۱. در مرورگر سافاری روی دکمه‌ی اشتراک‌گذاری (<b>Share</b>) بزنید.
                <br />
                ۲. گزینه <b>Add to Home Screen</b> را انتخاب کنید.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
