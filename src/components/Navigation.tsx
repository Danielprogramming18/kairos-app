import React, { useState } from 'react';
import {
  LayoutDashboard,
  Calendar as CalendarIcon,
  CalendarCheck2,
  CheckSquare,
  Sparkles,
  Timer,
  Lightbulb,
  BarChart3,
  CloudCog,
  Minimize2,
  Bookmark,
  MoreHorizontal,
  X,
  HardDrive,
} from 'lucide-react';
import { toPersianNum } from '../utils/persianDate';
import { NavTabId } from '../types';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export type { NavTabId };

interface NavigationProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  pendingTasksCount: number;
  ideasCount: number;
  usefulInfoCount: number;
  trashCount?: number;
}

interface NavItemConfig {
  id: NavTabId;
  label: string;
  shortLabel: string;
  group: 'execution' | 'focus' | 'knowledge' | 'system';
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | null;
  badgeColor?: string;
  primaryMobile?: boolean;
}

const GROUP_LABELS: Record<NavItemConfig['group'], string> = {
  execution: 'برنامه‌ریزی و اجرا',
  focus: 'تمرکز و زمان',
  knowledge: 'دانش و بازتاب',
  system: 'سامانه و داده',
};

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  pendingTasksCount,
  ideasCount,
  usefulInfoCount,
  trashCount = 0,
}) => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreModalRef = useModalFocusTrap<HTMLDivElement>(moreMenuOpen, () =>
    setMoreMenuOpen(false)
  );

  const tabs: NavItemConfig[] = [
    {
      id: 'dashboard',
      label: 'امروز (داشبورد)',
      shortLabel: 'امروز',
      group: 'execution',
      icon: LayoutDashboard,
      primaryMobile: true,
    },
    {
      id: 'workspace',
      label: 'کارها (میز کار)',
      shortLabel: 'کارها',
      group: 'execution',
      icon: CheckSquare,
      badge: pendingTasksCount > 0 ? toPersianNum(pendingTasksCount) : null,
      badgeColor: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
      primaryMobile: true,
    },
    {
      id: 'calendar',
      label: 'تقویم سالانه',
      shortLabel: 'تقویم',
      group: 'execution',
      icon: CalendarIcon,
    },
    {
      id: 'habits',
      label: 'پیگیری عادت‌ها',
      shortLabel: 'عادت‌ها',
      group: 'execution',
      icon: CalendarCheck2,
      primaryMobile: true,
    },
    {
      id: 'pomodoro',
      label: 'تایمر پومودورو',
      shortLabel: 'پومودورو',
      group: 'focus',
      icon: Timer,
      primaryMobile: true,
    },
    {
      id: 'deep_focus',
      label: 'تمرکز عمیق',
      shortLabel: 'تمرکز عمیق',
      group: 'focus',
      icon: Minimize2,
    },
    {
      id: 'useful_info',
      label: 'یادداشت‌ها و منابع',
      shortLabel: 'یادداشت‌ها',
      group: 'knowledge',
      icon: Bookmark,
      badge: usefulInfoCount > 0 ? toPersianNum(usefulInfoCount) : null,
      badgeColor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    },
    {
      id: 'ideas',
      label: 'ایده‌ها (بانک ایده‌ها)',
      shortLabel: 'ایده‌ها',
      group: 'knowledge',
      icon: Lightbulb,
      badge: ideasCount > 0 ? toPersianNum(ideasCount) : null,
      badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    },
    {
      id: 'planner',
      label: 'دستیار هوشمند محلی',
      shortLabel: 'دستیار',
      group: 'knowledge',
      icon: Sparkles,
    },
    {
      id: 'analytics',
      label: 'گزارش هفتگی و آمار',
      shortLabel: 'گزارش',
      group: 'knowledge',
      icon: BarChart3,
    },
    {
      id: 'sync',
      label: 'پشتیبان و داده‌ها',
      shortLabel: 'پشتیبان',
      group: 'system',
      icon: CloudCog,
      badge: trashCount > 0 ? toPersianNum(trashCount) : null,
      badgeColor: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
    },
  ];

  const groups: NavItemConfig['group'][] = ['execution', 'focus', 'knowledge', 'system'];
  const primaryMobileTabs = tabs.filter((t) => t.primaryMobile);
  const secondaryMobileTabs = tabs.filter((t) => !t.primaryMobile);
  const isSecondaryActive = secondaryMobileTabs.some((t) => t.id === activeTab);

  return (
    <>
      {/* Desktop RTL Sidebar Navigation (256px fixed width on lg+) */}
      <aside
        aria-label="ناوبری اصلی"
        data-testid="desktop-sidebar-nav"
        className="hidden lg:flex lg:flex-col w-64 shrink-0 sticky top-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-4"
      >
        {groups.map((groupKey) => {
          const groupTabs = tabs.filter((t) => t.group === groupKey);
          return (
            <div key={groupKey} className="space-y-1">
              <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                {GROUP_LABELS[groupKey]}
              </div>
              {groupTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`nav-tab-${tab.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => onSelectTab(tab.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </span>
                    {tab.badge && (
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums shrink-0 ${
                          isActive ? 'bg-white/20 text-white' : tab.badgeColor
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        {/* Calm Offline Engine & Keyboard Shortcut Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 px-2.5 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>مخزن آفلاین IndexedDB</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
              Alt+N
            </span>
            <span>کار جدید</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
              Alt+F
            </span>
            <span>تمرکز</span>
          </div>
        </div>
      </aside>

      {/* Mobile 5-Destination Fixed Bottom Navigation (امروز، کارها، پومودورو، عادت‌ها، بیشتر) */}
      <nav
        aria-label="ناوبری پایین صفحه موبایل"
        data-testid="mobile-bottom-nav"
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1 grid grid-cols-5 gap-1"
      >
        {primaryMobileTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id && !moreMenuOpen;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`mobile-nav-tab-${tab.id}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                setMoreMenuOpen(false);
                onSelectTab(tab.id);
              }}
              className={`min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold transition cursor-pointer relative ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{tab.shortLabel}</span>
              {tab.badge && (
                <span className="absolute top-1 right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-indigo-600 text-white text-[9px] font-bold tabular-nums flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          data-testid="mobile-nav-more"
          aria-expanded={moreMenuOpen}
          onClick={() => setMoreMenuOpen((prev) => !prev)}
          className={`min-h-[48px] flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-bold transition cursor-pointer ${
            moreMenuOpen || isSecondaryActive
              ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <MoreHorizontal className="w-4 h-4 mb-0.5" />
          <span>بیشتر</span>
        </button>
      </nav>

      {/* Mobile "More" Sheet */}
      {moreMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="سایر بخش‌های کایروس"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMoreMenuOpen(false);
          }}
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/60 backdrop-blur-xs flex items-end justify-center p-4"
        >
          <div
            ref={moreModalRef}
            tabIndex={-1}
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
              <h4 className="text-sm font-black text-slate-900 dark:text-white">
                سایر بخش‌های کایروس
              </h4>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(false)}
                aria-label="بستن منوی بیشتر"
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {secondaryMobileTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    data-testid={`mobile-sheet-tab-${tab.id}`}
                    onClick={() => {
                      onSelectTab(tab.id);
                      setMoreMenuOpen(false);
                    }}
                    className={`min-h-[44px] flex items-center justify-between gap-2 p-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200/70 dark:border-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{tab.shortLabel}</span>
                    </span>
                    {tab.badge && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                          isActive ? 'bg-white/20 text-white' : tab.badgeColor
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
