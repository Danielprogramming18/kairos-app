export type HabitCategory = 'health' | 'learning' | 'work' | 'mindfulness' | 'finance';

export interface Habit {
  id: string;
  title: string;
  category: HabitCategory;
  emoji: string;
  color: string;
  weeklyGoal: number; // 1 to 7
  completedDates: Record<string, boolean>; // 'YYYY-MM-DD' -> true
}

export type TaskPriority = 1 | 2 | 3 | 4 | 5 | number;

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: number;
  duration: number; // in minutes
  targetDate: string; // 'YYYY-MM-DD'
  completed: boolean;
  category?: string;
  reminderTime?: string; // 'HH:MM' in 24h format
  reminded?: boolean;
  subtasks?: { id: string; title: string; completed: boolean }[];
  completedAt?: string;
}

export type IdeaCategory = 'project' | 'learning' | 'business' | 'personal';

export interface Idea {
  id: string;
  title: string;
  note?: string;
  category: IdeaCategory;
  createdAt: string;
}

export type UsefulInfoCategory = 'work' | 'links' | 'code' | 'personal';

export interface UsefulInfoItem {
  id: string;
  title: string;
  content: string;
  category: UsefulInfoCategory;
  pinned?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface FocusSession {
  id: string;
  taskId?: string;
  taskTitle?: string;
  durationMinutes: number;
  dateKey: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  suggestedTasks?: Array<{
    title: string;
    description?: string;
    priority: number;
    duration: number;
  }>;
}

export type NavTabId =
  | 'deep_focus'
  | 'dashboard'
  | 'calendar'
  | 'habits'
  | 'workspace'
  | 'useful_info'
  | 'planner'
  | 'pomodoro'
  | 'ideas'
  | 'analytics'
  | 'sync';

export interface GitHubSyncConfig {
  owner: string;
  repo: string;
  path: string; // default 'data.json'
  branch: string; // default 'main'
  token: string; // Fine-grained PAT stored ONLY in localStorage
  autoSync: boolean;
}

export interface KairosDataFile {
  app: 'Kairos';
  version: '4.0';
  updatedAt: string;
  deviceId: string;
  data: {
    habits: Habit[];
    tasks: Task[];
    ideas: Idea[];
    focusSessions: FocusSession[];
    usefulInfos: UsefulInfoItem[];
  };
}
