import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Volume2,
  VolumeX,
  Timer,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
  Monitor,
  Check,
} from 'lucide-react';
import { formatPersianDateFull, toPersianNum } from '../utils/persianDate';
import {
  getResolvedThemeLabelFa,
  getThemePreferenceLabelFa,
  ResolvedTheme,
  THEME_PREFERENCE_OPTIONS,
  ThemePreference,
} from '../utils/themeManager';

export type { ThemePreference, ResolvedTheme };

interface HeaderProps {
  pageTitle: string;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  onChangeThemePreference: (pref: ThemePreference) => void;
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
  themePreference,
  resolvedTheme,
  onChangeThemePreference,
  soundEnabled,
  onToggleSound,
  onOpenNewTaskModal,
  isStorageReady = true,
  storageStatus = 'idle',
  activeTimerSummary,
}) => {
  const todayStr = formatPersianDateFull(new Date());
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const optionBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isThemeMenuOpen) return;

    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (
        menuContainerRef.current &&
        e.target instanceof Node &&
        !menuContainerRef.current.contains(e.target)
      ) {
        setIsThemeMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsThemeMenuOpen(false);
        triggerBtnRef.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const buttons = optionBtnRefs.current.filter(Boolean) as HTMLButtonElement[];
        if (buttons.length === 0) return;
        const currentIdx = buttons.findIndex((b) => b === document.activeElement);
        e.preventDefault();
        if (e.key === 'ArrowDown') {
          const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % buttons.length;
          buttons[nextIdx]?.focus();
        } else {
          const prevIdx =
            currentIdx <= 0 ? buttons.length - 1 : (currentIdx - 1) % buttons.length;
          buttons[prevIdx]?.focus();
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isThemeMenuOpen]);

  const renderThemeIcon = (pref: ThemePreference, className = 'w-4 h-4') => {
    if (pref === 'light') return <Sun className={className} />;
    if (pref === 'dark') return <Moon className={className} />;
    return <Monitor className={className} />;
  };

  return (
    <header className="sticky top-0 z-30 kairos-glass-chrome border-b transition-colors">
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
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-semibold transition cursor-pointer tabular-nums"
            >
              <Timer className="w-3.5 h-3.5 animate-pulse" />
              <span dir="ltr" className="font-mono tabular-nums">
                {activeTimerSummary.formattedTime}
              </span>
            </button>
          )}

          {/* Quick Add Task CTA */}
          <button
            type="button"
            disabled={!isStorageReady}
            onClick={onOpenNewTaskModal}
            aria-label="افزودن کار جدید"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>کار جدید</span>
          </button>

          {/* Compact Accessible Theme Selector Popover ("انتخاب تم") */}
          <div ref={menuContainerRef} className="relative">
            <button
              ref={triggerBtnRef}
              type="button"
              data-testid="header-theme-trigger"
              aria-label="انتخاب تم"
              aria-haspopup="menu"
              aria-expanded={isThemeMenuOpen}
              title={`انتخاب تم (${getThemePreferenceLabelFa(themePreference)})`}
              onClick={() => {
                setIsThemeMenuOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    setTimeout(() => {
                      const activeIdx = THEME_PREFERENCE_OPTIONS.findIndex(
                        (o) => o.value === themePreference
                      );
                      optionBtnRefs.current[activeIdx >= 0 ? activeIdx : 0]?.focus();
                    }, 0);
                  }
                  return next;
                });
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isThemeMenuOpen
                  ? 'bg-indigo-600/10 border border-indigo-500/45 text-indigo-600 dark:text-indigo-400'
                  : 'kairos-btn-secondary'
              }`}
            >
              {renderThemeIcon(themePreference, 'w-4 h-4')}
              <span className="hidden md:inline text-[11px] font-bold">
                {getThemePreferenceLabelFa(themePreference)}
              </span>
            </button>

            {isThemeMenuOpen && (
              <div
                role="menu"
                aria-label="انتخاب تم"
                data-testid="header-theme-menu"
                className="absolute left-0 mt-2 w-60 rounded-[18px] kairos-glass-popover border p-2 z-50 space-y-1 animate-fade-in"
              >
                <div className="px-2.5 py-1.5 border-b border-token-subtle flex items-center justify-between text-[11px]">
                  <span className="font-black text-token-primary">انتخاب تم</span>
                  <span className="text-token-secondary">
                    نمایش فعلی: {getResolvedThemeLabelFa(resolvedTheme)}
                  </span>
                </div>

                {THEME_PREFERENCE_OPTIONS.map((opt, idx) => {
                  const isActive = themePreference === opt.value;
                  return (
                    <button
                      key={opt.value}
                      ref={(el) => {
                        optionBtnRefs.current[idx] = el;
                      }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      data-testid={`header-theme-option-${opt.value}`}
                      onClick={() => {
                        onChangeThemePreference(opt.value);
                        setIsThemeMenuOpen(false);
                        triggerBtnRef.current?.focus();
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-right flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                        isActive
                          ? 'bg-indigo-600 text-white font-bold shadow-xs'
                          : 'text-token-primary hover:bg-surface-2 font-medium'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {renderThemeIcon(opt.value, 'w-4 h-4 shrink-0')}
                        <span>{opt.labelFa}</span>
                      </span>
                      {isActive && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'قطع صدای اعلان‌ها' : 'وصل صدای اعلان‌ها'}
            title={soundEnabled ? 'صدای اعلان‌ها: روشن' : 'صدای اعلان‌ها: خاموش'}
            className={`p-2 rounded-xl transition cursor-pointer ${
              soundEnabled
                ? 'kairos-btn-secondary'
                : 'bg-surface-1 border border-token-subtle text-token-muted opacity-75'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
