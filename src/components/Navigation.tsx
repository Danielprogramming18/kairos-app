import React from 'react';
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
  const tabs = [
    {
      id: 'dashboard' as NavTabId,
      label: 'داشبورد هوشمند',
      shortLabel: 'داشبورد',
      icon: LayoutDashboard,
    },
    {
      id: 'deep_focus' as NavTabId,
      label: 'تمرکز عمیق',
      shortLabel: 'تمرکز عمیق',
      icon: Minimize2,
      zenHighlight: true,
    },
    {
      id: 'calendar' as NavTabId,
      label: 'تقویم سالانه',
      shortLabel: 'تقویم',
      icon: CalendarIcon,
    },
    {
      id: 'workspace' as NavTabId,
      label: 'میز کار و مأموریت‌ها',
      shortLabel: 'میز کار',
      icon: CheckSquare,
      badge: pendingTasksCount > 0 ? toPersianNum(pendingTasksCount) : null,
      badgeColor: 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
    },
    {
      id: 'useful_info' as NavTabId,
      label: 'اطلاعات کاربردی',
      shortLabel: 'اطلاعات کاربردی',
      icon: Bookmark,
      badge: usefulInfoCount > 0 ? toPersianNum(usefulInfoCount) : null,
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    {
      id: 'habits' as NavTabId,
      label: 'پیگیری عادت‌ها',
      shortLabel: 'عادت‌ها',
      icon: CalendarCheck2,
    },
    {
      id: 'planner' as NavTabId,
      label: 'دستیار هوشمند',
      shortLabel: 'دستیار',
      icon: Sparkles,
      highlight: true,
    },
    {
      id: 'pomodoro' as NavTabId,
      label: 'تایمر پومودورو',
      shortLabel: 'تایمر',
      icon: Timer,
    },
    {
      id: 'ideas' as NavTabId,
      label: 'بانک ایده‌ها',
      shortLabel: 'ایده‌ها',
      icon: Lightbulb,
      badge: ideasCount > 0 ? toPersianNum(ideasCount) : null,
      badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    {
      id: 'analytics' as NavTabId,
      label: 'گزارش هفتگی',
      shortLabel: 'گزارش',
      icon: BarChart3,
    },
    {
      id: 'sync' as NavTabId,
      label: 'گیت‌هاب و پشتیبان',
      shortLabel: 'گیت‌هاب',
      icon: CloudCog,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-1">
      {/* Desktop Navigation Tabs */}
      <nav className="hidden lg:flex items-center gap-1 bg-slate-100/90 dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 shadow-sm overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
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

      {/* Mobile / Tablet Horizontal Scrollable Pills */}
      <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-2 no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 active:scale-95 ${
                isActive
                  ? tab.zenHighlight
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-md'
                    : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.shortLabel}</span>
              {tab.badge && (
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] font-black ${
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
  );
};
