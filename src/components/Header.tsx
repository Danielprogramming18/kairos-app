import React from 'react';
import {
  Plus,
  Sun,
  Moon,
  Monitor,
  Volume2,
  VolumeX,
  Timer,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { formatPersianDateFull, toPersianNum } from '../utils/persianDate';

export type ThemePreference = 'light' | 'dark' | 'system';

interface HeaderProps {
  pageTitle: string;
  isDark: boolean;
  themePreference?: ThemePreference;
  onToggleTheme: () => void;
  onSelectThemePreference?: (pref: ThemePreference) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenNewTaskModal: () => void;
  isStorageReady?: boolean;
  storageStatus?: 'initializing' | 'idle' | 'ready' | 'saving' | 'saved' | 'error';
  activeTimerSummary?: {
    isRunning: boolean;
    formattedTime: string;
    phaseLabel: string;
    onOpenTimer: () => void;
  } | null;
}

export const Header: React.FC<HeaderProps> = ({
  pageTitle,
  isDark,
  themePreference = isDark ? 'dark' : 'light',
  onToggleTheme,
  onSelectThemePreference,
  soundEnabled,
  onToggleSound,
  onOpenNewTaskModal,
  isStorageReady = true,
  storageStatus = 'idle',
  activeTimerSummary,
}) => {
  const todayStr = formatPersianDateFull(new Date());

  return (
    <header className="sticky top-0 z-30 bg-surface-1/95 backdrop-blur-md border-b border-token-subtle transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Right: Current Section Title & Date */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base sm:text-lg font-bold text-token-primary tracking-tight truncate">
                {pageTitle}
              </h1>
              {storageStatus === 'saving' && (
                <span
                  aria-live="polite"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-token-secondary"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline">در حال ذخیره...</span>
                </span>
              )}
              {storageStatus === 'error' && (
                <span
                  aria-live="assertive"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">خطا در ذخیره</span>
                </span>
              )}
            </div>
            <p className="text-xs text-token-secondary truncate">{todayStr}</p>
          </div>
        </div>

        {/* Left: Primary Action & Compact Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Active Timer Indicator Pill (if running or active) */}
          {activeTimerSummary && (
            <button
              type="button"
              onClick={activeTimerSummary.onOpenTimer}
              title={`رفتن به تایمر (${activeTimerSummary.phaseLabel})`}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-semibold transition cursor-pointer tabular-nums"
            >
              <Timer className="w-3.5 h-3.5 animate-pulse" />
              <span>{toPersianNum(activeTimerSummary.formattedTime)}</span>
            </button>
          )}

          {/* Quick Add Task CTA */}
          <button
            type="button"
            disabled={!isStorageReady}
            onClick={onOpenNewTaskModal}
            aria-label="افزودن کار جدید"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>کار جدید</span>
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'قطع صدای اعلان‌ها' : 'وصل صدای اعلان‌ها'}
            title={soundEnabled ? 'صدای اعلان‌ها: روشن' : 'صدای اعلان‌ها: خاموش'}
            className={`p-2 rounded-lg border transition cursor-pointer ${
              soundEnabled
                ? 'bg-surface-2 border-token-subtle text-token-primary'
                : 'bg-surface-1 border-token-subtle text-token-muted opacity-75'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* 3-Mode Theme Switcher (روشن / تاریک / هماهنگ با دستگاه) */}
          {onSelectThemePreference ? (
            <div
              role="group"
              aria-label="انتخاب پوستهٔ نمایش"
              className="inline-flex items-center p-0.5 rounded-lg bg-surface-2 border border-token-subtle"
            >
              <button
                type="button"
                onClick={() => onSelectThemePreference('light')}
                aria-label="پوستهٔ روشن"
                aria-pressed={themePreference === 'light'}
                title="پوستهٔ روشن"
                className={`p-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  themePreference === 'light'
                    ? 'bg-surface-1 text-indigo-600 shadow-2xs'
                    : 'text-token-secondary hover:text-token-primary'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSelectThemePreference('dark')}
                aria-label="پوستهٔ تاریک"
                aria-pressed={themePreference === 'dark'}
                title="پوستهٔ تاریک"
                className={`p-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  themePreference === 'dark'
                    ? 'bg-surface-1 text-indigo-500 shadow-2xs'
                    : 'text-token-secondary hover:text-token-primary'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onSelectThemePreference('system')}
                aria-label="هماهنگ با دستگاه"
                aria-pressed={themePreference === 'system'}
                title="هماهنگ با تنظیمات دستگاه"
                className={`p-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                  themePreference === 'system'
                    ? 'bg-surface-1 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-token-secondary hover:text-token-primary'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'تغییر به پوستهٔ روشن' : 'تغییر به پوستهٔ تاریک'}
              title={isDark ? 'پوستهٔ روشن' : 'پوستهٔ تاریک'}
              className="p-2 rounded-lg bg-surface-2 border border-token-subtle text-token-primary hover:bg-surface-1 transition cursor-pointer"
            >
              {isDark ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
