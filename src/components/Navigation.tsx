import React, { useState } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  Timer,
  Sparkles,
  BookOpen,
  BarChart3,
  Settings,
  Compass,
  MoreHorizontal,
  X,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { NavTabId } from '../types';
import { toPersianNum } from '../utils/persianDate';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';

export type { NavTabId };

interface NavigationProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  pendingTasksCount: number;
  ideasCount: number;
  usefulInfoCount?: number;
  trashCount?: number;
}

interface NavItemConfig {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  group: 'primary' | 'secondary';
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'kairos_sidebar_collapsed_v1';

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  pendingTasksCount,
  ideasCount,
  usefulInfoCount = 0,
}) => {
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  // Normalize activeTab so unified destinations highlight their parent item
  const normalizedActiveTab: NavTabId =
    activeTab === 'deep_focus'
      ? 'pomodoro'
      : activeTab === 'ideas'
      ? 'useful_info'
      : activeTab;

  const navItems: NavItemConfig[] = [
    {
      id: 'dashboard',
      label: 'امروز',
      icon: LayoutDashboard,
      group: 'primary',
    },
    {
      id: 'workspace',
      label: 'کارها',
      icon: CheckSquare,
      badge: pendingTasksCount > 0 ? pendingTasksCount : undefined,
      group: 'primary',
    },
    {
      id: 'calendar',
      label: 'تقویم',
      icon: CalendarDays,
      group: 'primary',
    },
    {
      id: 'pomodoro',
      label: 'تمرکز',
      icon: Timer,
      group: 'primary',
    },
    {
      id: 'habits',
      label: 'عادت‌ها',
      icon: Sparkles,
      group: 'primary',
    },
    {
      id: 'useful_info',
      label: 'یادداشت‌ها',
      icon: BookOpen,
      badge: ideasCount > 0 ? ideasCount : undefined,
      group: 'primary',
    },
    {
      id: 'planner',
      label: 'کمک به برنامه‌ریزی',
      icon: Compass,
      group: 'secondary',
    },
    {
      id: 'analytics',
      label: 'گزارش‌ها',
      icon: BarChart3,
      group: 'secondary',
    },
    {
      id: 'sync',
      label: 'تنظیمات',
      icon: Settings,
      group: 'secondary',
    },
  ];

  // Primary 4 items for Mobile Bottom Bar + "More" sheet button (max 5 items)
  const mobileBarPrimaryIds: NavTabId[] = ['dashboard', 'workspace', 'pomodoro', 'habits'];
  const mobilePrimaryItems = navItems.filter((item) => mobileBarPrimaryIds.includes(item.id));
  const mobileMoreItems = navItems.filter((item) => !mobileBarPrimaryIds.includes(item.id));
  const isMoreTabActive = mobileMoreItems.some((item) => item.id === normalizedActiveTab);

  const handleSelectFromMore = (tab: NavTabId) => {
    onSelectTab(tab);
    setMoreDrawerOpen(false);
  };

  const moreSheetRef = useModalFocusTrap<HTMLDivElement>(
    moreDrawerOpen,
    () => setMoreDrawerOpen(false)
  );

  return (
    <>
      {/* 1. Desktop Right Sidebar (RTL Collapsible Architecture) */}
      <aside
        aria-label="ناوبری اصلی دسکتاپ"
        className={`hidden lg:flex flex-col shrink-0 border-l border-token-subtle bg-surface-1 min-h-screen sticky top-0 select-none transition-all duration-200 ${
          isCollapsed ? 'w-20' : 'w-60'
        }`}
      >
        {/* Brand Identity & Collapse Toggle */}
        <div
          className={`px-4 h-16 flex items-center border-b border-token-subtle ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-xs shrink-0">
              ک
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="text-sm font-bold text-token-primary leading-tight truncate">
                  کایروس
                </div>
                <div className="text-[11px] text-token-muted truncate">
                  فضای کار و تمرکز شخصی
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'}
            title={isCollapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'}
            className="p-1.5 rounded-lg text-token-secondary hover:text-token-primary hover:bg-surface-2 transition cursor-pointer shrink-0"
          >
            {isCollapsed ? (
              <PanelRightOpen className="w-4 h-4" />
            ) : (
              <PanelRightClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto">
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-2.5 pb-1 text-[11px] font-semibold text-token-muted">
                بخش‌های اصلی
              </div>
            )}
            {navItems
              .filter((i) => i.group === 'primary')
              .map((item) => {
                const Icon = item.icon;
                const isActive = normalizedActiveTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={isCollapsed ? item.label : undefined}
                    className={`w-full flex items-center ${
                      isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                    } py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer relative ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-token-secondary hover:bg-surface-2 hover:text-token-primary'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-white' : 'text-token-muted'
                        }`}
                      />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </span>
                    {!isCollapsed && item.badge !== undefined && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold tabular-nums ${
                          isActive
                            ? 'bg-white text-indigo-700'
                            : 'bg-surface-2 text-token-secondary'
                        }`}
                      >
                        {toPersianNum(item.badge)}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          <div className="space-y-1 pt-2 border-t border-token-subtle">
            {!isCollapsed && (
              <div className="px-2.5 pb-1 text-[11px] font-semibold text-token-muted">
                ابزارها و تحلیل
              </div>
            )}
            {navItems
              .filter((i) => i.group === 'secondary')
              .map((item) => {
                const Icon = item.icon;
                const isActive = normalizedActiveTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={isCollapsed ? item.label : undefined}
                    className={`w-full flex items-center ${
                      isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                    } py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-token-secondary hover:bg-surface-2 hover:text-token-primary'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-white' : 'text-token-muted'
                        }`}
                      />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </span>
                    {!isCollapsed && item.badge !== undefined && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold tabular-nums ${
                          isActive
                            ? 'bg-white text-indigo-700'
                            : 'bg-surface-2 text-token-secondary'
                        }`}
                      >
                        {toPersianNum(item.badge)}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </nav>
      </aside>

      {/* 2. Mobile Bottom Navigation Bar (5 Primary Destinations) */}
      <nav
        aria-label="ناوبری پایین موبایل"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-1/95 backdrop-blur-md border-t border-token-subtle px-2 py-1.5 flex items-center justify-around"
      >
        {mobilePrimaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = normalizedActiveTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMoreDrawerOpen(false);
                onSelectTab(item.id);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl text-[11px] font-semibold transition cursor-pointer ${
                isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-token-secondary'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="absolute top-1 right-2 px-1.5 py-0.2 text-[9px] rounded-full bg-indigo-600 text-white font-bold tabular-nums">
                  {toPersianNum(item.badge)}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreDrawerOpen((prev) => !prev)}
          aria-expanded={moreDrawerOpen}
          aria-label="سایر بخش‌ها"
          className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-xl text-[11px] font-semibold transition cursor-pointer ${
            isMoreTabActive || moreDrawerOpen
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-token-secondary'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span>بیشتر</span>
        </button>
      </nav>

      {/* 3. Mobile "More" Drawer Sheet */}
      {moreDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="سایر بخش‌های کایروس"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMoreDrawerOpen(false);
          }}
          className="lg:hidden fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-end justify-center p-3"
        >
          <div
            ref={moreSheetRef}
            tabIndex={-1}
            className="w-full max-w-md bg-surface-1 border border-token-subtle rounded-2xl p-4 shadow-2xl space-y-3 mb-14"
          >
            <div className="flex items-center justify-between pb-2 border-b border-token-subtle">
              <span className="text-xs font-bold text-token-primary">سایر بخش‌ها</span>
              <button
                type="button"
                aria-label="بستن منو"
                onClick={() => setMoreDrawerOpen(false)}
                className="p-1 rounded-lg text-token-muted hover:text-token-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mobileMoreItems.map((item) => {
                const Icon = item.icon;
                const isActive = normalizedActiveTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectFromMore(item.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-surface-2 border-token-subtle text-token-primary'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
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
