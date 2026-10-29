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
} from 'lucide-react';
import { toPersianNum } from '../utils/persianDate';
import { NavTabId } from '../types';

export type { NavTabId };

interface NavigationProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  pendingTasksCount: number;
  ideasCount: number;
  usefulInfoCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onSelectTab,
  pendingTasksCount,
  ideasCount,
  usefulInfoCount,
}) => {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const tabs = [
    {
      id: 'dashboard' as NavTabId,
      label: 'امروز (داشبورد هوشمند)',
      shortLabel: 'امروز',
      icon: LayoutDashboard,
      primaryMobile: true,
    },
    {
      id: 'workspace' as NavTabId,
      label: 'کارها (میز کار و مأموریت‌ها)',
      shortLabel: 'کارها',
      icon: CheckSquare,
      badge: pendingTasksCount > 0 ? toPersianNum(pendingTasksCount) : null,
      badgeColor: 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
      primaryMobile: true,
    },
    {
      id: 'calendar' as NavTabId,
      label: 'تقویم سالانه',
      shortLabel: 'تقویم',
      icon: CalendarIcon,
      primaryMobile: true,
    },
    {
      id: 'habits' as NavTabId,
      label: 'پیگیری عادت‌ها',
      shortLabel: 'عادت‌ها',
      icon: CalendarCheck2,
      primaryMobile: true,
    },
    {
      id: 'deep_focus' as NavTabId,
      label: 'تمرکز عمیق',
      shortLabel: 'تمرکز عمیق',
      icon: Minimize2,
      zenHighlight: true,
    },
    {
      id: 'pomodoro' as NavTabId,
      label: 'تایمر پومودورو',
      shortLabel: 'تایمر',
      icon: Timer,
    },
    {
      id: 'useful_info' as NavTabId,
      label: 'یادداشت‌ها و منابع (اطلاعات کاربردی)',
      shortLabel: 'یادداشت‌ها و منابع',
      icon: Bookmark,
      badge: usefulInfoCount > 0 ? toPersianNum(usefulInfoCount) : null,
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'ideas' as NavTabId,
      label: 'ایده‌ها (بانک ایده‌ها)',
      shortLabel: 'ایده‌ها',
      icon: Lightbulb,
      badge: ideasCount > 0 ? toPersianNum(ideasCount) : null,
      badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    {
      id: 'planner' as NavTabId,
      label: 'دستیار هوشمند محلی',
      shortLabel: 'دستیار',
      icon: Sparkles,
      highlight: true,
    },
    {
      id: 'analytics' as NavTabId,
      label: 'گزارش هفتگی (آمار و عملکرد)',
      shortLabel: 'گزارش',
      icon: BarChart3,
    },
    {
      id: 'sync' as NavTabId,
      label: 'پشتیبان و داده‌ها',
      shortLabel: 'پشتیبان',
      icon: CloudCog,
    },
  ];

  const primaryMobileTabs = tabs.filter((t) => t.primaryMobile);
  const secondaryMobileTabs = tabs.filter((t) => !t.primaryMobile);
  const isSecondaryActive = secondaryMobileTabs.some((t) => t.id === activeTab);

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-1">
        {/* Desktop Navigation Bar */}
        <nav
          aria-label="ناوبری اصلی"
          className="hidden lg:flex items-center gap-1 bg-slate-100/90 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm overflow-x-auto no-scrollbar"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                  isActive
                    ? tab.zenHighlight
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-md'
                      : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${tab.highlight && !isActive ? 'text-indigo-500' : ''}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
                      isActive ? 'bg-white/25 text-white' : tab.badgeColor
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Mobile Quick Sub-Header for Active Secondary Tab */}
        <div className="flex lg:hidden items-center justify-between gap-2 pb-1">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {secondaryMobileTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile 5-Destination Fixed Bottom Navigation (امروز، کارها، تقویم، عادت‌ها، بیشتر) */}
      <nav
        aria-label="ناوبری پایین صفحه موبایل"
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 grid grid-cols-5 gap-1"
      >
        {primaryMobileTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id && !moreMenuOpen;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                setMoreMenuOpen(false);
                onSelectTab(tab.id);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{tab.shortLabel}</span>
            </button>
          );
        })}

        <button
          type="button"
          aria-expanded={moreMenuOpen}
          onClick={() => setMoreMenuOpen((prev) => !prev)}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
            moreMenuOpen || isSecondaryActive
              ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
              : 'text-slate-500 dark:text-slate-400'
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
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-black text-slate-800 dark:text-white">
                سایر بخش‌های کایروس
              </h4>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(false)}
                aria-label="بستن منوی بیشتر"
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {secondaryMobileTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(tab.id);
                      setMoreMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 border-slate-200/70 dark:border-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{tab.shortLabel}</span>
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
