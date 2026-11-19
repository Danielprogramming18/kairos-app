import React, { useState } from 'react';
import { MoreHorizontal, PanelRightClose, PanelRightOpen, Settings2 } from 'lucide-react';
import type { NavTabId } from '../types';
import { usePlanning } from '../app/PlanningContext';
import { normalizeMenuLayout, orderedMain } from '../utils/menuLayout';
import { NAV_LABELS, type FeatureId } from './planningNavigation';
import { FEATURE_ICONS } from './featureIcons';
import { toPersianNum } from '../utils/persianDate';

export type { NavTabId };
interface NavigationProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  pendingTasksCount: number;
  ideasCount: number;
  usefulInfoCount?: number;
  trashCount?: number;
}
const COLLAPSED_KEY = 'kairos_sidebar_collapsed_v1';

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, pendingTasksCount, ideasCount, usefulInfoCount = 0 }) => {
  const { state } = usePlanning();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const desktop = normalizeMenuLayout(state.layout.desktop, 'desktop');
  const mobile = normalizeMenuLayout(state.layout.mobile, 'mobile');
  const desktopMain = orderedMain(desktop), mobileMain = orderedMain(mobile);
  const active = activeTab === 'deep_focus' ? 'pomodoro' : activeTab === 'ideas' ? 'useful_info' : activeTab;
  const badge = (id: FeatureId) => id === 'workspace' ? pendingTasksCount : id === 'useful_info' ? ideasCount + usefulInfoCount : 0;
  const toggle = () => setCollapsed(value => {
    try { localStorage.setItem(COLLAPSED_KEY, String(!value)); } catch { /* Layout still works without localStorage. */ }
    return !value;
  });
  const desktopButton = (id: FeatureId) => {
    const Icon = FEATURE_ICONS[id], selected = active === id;
    return <button key={id} type="button" onClick={() => onSelectTab(id)} aria-current={selected ? 'page' : undefined} title={collapsed ? NAV_LABELS[id] : undefined}
      className={`w-full flex items-center gap-2.5 rounded-xl py-2.5 text-xs font-semibold cursor-pointer transition ${collapsed ? 'justify-center px-2' : 'px-3 text-right'} ${selected ? 'bg-indigo-600 text-white' : 'text-token-secondary hover:bg-surface-2 hover:text-token-primary'}`}>
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <><span className="min-w-0 flex-1 truncate">{NAV_LABELS[id]}</span>{badge(id) > 0 && <span className="rounded-full bg-surface-2 text-token-primary px-1.5 text-[10px]">{toPersianNum(badge(id))}</span>}</>}
    </button>;
  };
  const moreActive = active === 'more' || active === 'customize' || !mobileMain.includes(active as FeatureId);
  const desktopMoreActive = active === 'more' || (active !== 'customize' && !desktopMain.includes(active as FeatureId));
  return <>
    <aside aria-label="ناوبری اصلی دسکتاپ" className={`hidden lg:flex flex-col shrink-0 border rounded-[18px] kairos-glass-chrome sticky top-20 h-[calc(100dvh-6rem)] min-h-96 select-none transition-[width] duration-200 ${collapsed ? 'w-20' : 'w-60'}`}>
      <div className={`px-4 h-16 shrink-0 flex items-center border-b border-token-subtle ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <div className="flex items-center gap-2 min-w-0"><div className="w-8 h-8 rounded-xl bg-indigo-600 text-white grid place-items-center font-black">ک</div><div><div className="text-sm font-bold text-token-primary">کایروس</div><small className="text-token-muted text-[10px]">فضای کار و تمرکز شخصی</small></div></div>}
        <button type="button" onClick={toggle} aria-label={collapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'} className="p-1.5 rounded-lg text-token-secondary hover:bg-surface-2 cursor-pointer">
          {collapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
        </button>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-4 space-y-1">
        {desktop.pinned.length > 0 && <div className="space-y-1 pb-3 mb-3 border-b border-token-subtle">{!collapsed && <p className="px-3 pb-1 text-[10px] text-token-muted">سنجاق‌شده‌ها</p>}{desktopMain.filter(id => desktop.pinned.includes(id)).map(desktopButton)}</div>}
        {desktopMain.filter(id => !desktop.pinned.includes(id)).map(desktopButton)}
        <button type="button" onClick={() => onSelectTab('more')} aria-current={desktopMoreActive ? 'page' : undefined} title={collapsed ? 'بیشتر' : undefined}
          className={`w-full flex items-center gap-2.5 rounded-xl py-2.5 text-xs font-semibold cursor-pointer ${collapsed ? 'justify-center px-2' : 'px-3'} ${desktopMoreActive ? 'bg-indigo-600 text-white' : 'text-token-secondary hover:bg-surface-2'}`}>
          <MoreHorizontal className="w-4 h-4 shrink-0" />{!collapsed && <span>بیشتر</span>}
        </button>
      </nav>
      <div className="shrink-0 p-2.5 border-t border-token-subtle"><button type="button" onClick={() => onSelectTab('customize')} title="شخصی‌سازی منو" aria-label="شخصی‌سازی منو" aria-current={active === 'customize' ? 'page' : undefined} className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs text-token-secondary hover:bg-surface-2 cursor-pointer ${collapsed ? 'justify-center' : ''}`}><Settings2 className="w-4 h-4 shrink-0" />{!collapsed && <span>شخصی‌سازی منو</span>}</button></div>
    </aside>
    <nav aria-label="ناوبری پایین موبایل" className="lg:hidden fixed bottom-0 inset-x-0 z-40 kairos-glass-chrome border-t px-2 pt-1.5 pb-[max(.375rem,env(safe-area-inset-bottom))] flex items-center justify-around">
      {mobileMain.map(id => {
        const Icon = FEATURE_ICONS[id], selected = active === id;
        return <button type="button" key={id} onClick={() => onSelectTab(id)} aria-current={selected ? 'page' : undefined} className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-[11px] font-semibold cursor-pointer ${selected ? 'text-indigo-600 dark:text-indigo-400' : 'text-token-secondary'}`}><Icon className="w-5 h-5" /><span className="w-full truncate">{NAV_LABELS[id]}</span>{badge(id) > 0 && <span className="absolute top-0 right-2 rounded-full bg-indigo-600 text-white px-1 text-[9px]">{toPersianNum(badge(id))}</span>}</button>;
      })}
      <button type="button" onClick={() => onSelectTab('more')} aria-label="بیشتر" aria-current={moreActive ? 'page' : undefined} className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-[11px] font-semibold cursor-pointer ${moreActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-token-secondary'}`}><MoreHorizontal className="w-5 h-5" /><span>بیشتر</span></button>
    </nav>
  </>;
};
