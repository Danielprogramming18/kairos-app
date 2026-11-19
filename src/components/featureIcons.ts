import { BarChart3, BookOpen, CalendarDays, CheckSquare, Compass, FolderKanban, LayoutDashboard, Settings, Sparkles, Timer, type LucideIcon } from 'lucide-react';
import type { FeatureId } from './planningNavigation';
export const FEATURE_ICONS: Record<FeatureId, LucideIcon> = {
  dashboard: LayoutDashboard, workspace: CheckSquare, projects: FolderKanban, calendar: CalendarDays,
  pomodoro: Timer, habits: Sparkles, useful_info: BookOpen, events: CalendarDays,
  tracking: BarChart3, capacity: Compass, planner: Compass, analytics: BarChart3, sync: Settings,
};
