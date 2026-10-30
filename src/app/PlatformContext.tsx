/**
 * App Startup Dependency Injection & Platform Provider
 * Detects runtime platform (Web IndexedDB / Android Sketchware Bridge / Windows Desktop Bridge)
 * and provides the active PlatformContainer to the React tree.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PlatformContainer } from '../application/repositories';
import { WebDexiePlatformAdapter } from '../infrastructure/web/dexieAdapter';
import { AndroidBridgePlatformAdapter } from '../infrastructure/android/androidBridgeAdapter';
import { WindowsDesktopPlatformAdapter } from '../infrastructure/desktop/desktopBridgeAdapter';
import {
  FocusSessionEntity,
  HabitEntity,
  MigrationReport,
  NoteEntity,
  nowIso,
  TaskEntity,
} from '../domain/models';
import {
  FocusSession,
  Habit,
  Idea,
  IdeaCategory,
  Task,
  UsefulInfoCategory,
  UsefulInfoItem,
} from '../types';

export function detectRuntimePlatform(): 'web' | 'android_webview' | 'windows_desktop' {
  if (typeof window !== 'undefined') {
    if (window.KairosAndroidBridge && typeof window.KairosAndroidBridge.postMessage === 'function') {
      return 'android_webview';
    }
    if (
      window.__KAIROS_DESKTOP_BRIDGE__ &&
      typeof window.__KAIROS_DESKTOP_BRIDGE__.invoke === 'function'
    ) {
      return 'windows_desktop';
    }
  }
  return 'web';
}

export function createPlatformContainer(
  forcedPlatform?: 'web' | 'android_webview' | 'windows_desktop'
): PlatformContainer {
  const kind = forcedPlatform ?? detectRuntimePlatform();
  if (kind === 'android_webview') {
    return new AndroidBridgePlatformAdapter();
  }
  if (kind === 'windows_desktop') {
    return new WindowsDesktopPlatformAdapter();
  }
  return new WebDexiePlatformAdapter();
}

// ================= CANONICAL <-> UI VIEW MAPPERS (LOSSLESS) =================

export function taskToDomainEntity(task: Task): TaskEntity {
  const now = nowIso();
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.completed
      ? 'done'
      : task.status === 'done'
      ? 'todo'
      : task.status || 'todo',
    completed: task.completed,
    priority: task.priority,
    duration: task.duration,
    targetDate: task.targetDate,
    dueAt: task.dueAt ?? null,
    reminderTime: task.reminderTime ?? null,
    reminded: Boolean(task.reminded),
    projectId: task.projectId ?? null,
    sourceId: task.sourceId ?? null,
    category: task.category || 'work',
    tags: Array.isArray(task.tags) ? [...task.tags] : [],
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.map((s) => ({ ...s })) : [],
    completedAt: task.completed ? task.completedAt ?? now : null,
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
    deletedAt: task.deletedAt ?? null,
    revision: typeof task.revision === 'number' && task.revision >= 1 ? task.revision : 1,
  };
}

export function domainEntityToTask(entity: TaskEntity): Task {
  return {
    id: entity.id,
    title: entity.title,
    description: entity.description,
    priority: entity.priority,
    duration: entity.duration,
    targetDate: entity.targetDate,
    completed: entity.completed,
    status: entity.status,
    category: entity.category,
    reminderTime: entity.reminderTime ?? undefined,
    reminded: entity.reminded,
    dueAt: entity.dueAt ?? null,
    projectId: entity.projectId ?? null,
    sourceId: entity.sourceId ?? null,
    tags: Array.isArray(entity.tags) ? [...entity.tags] : [],
    subtasks: Array.isArray(entity.subtasks) ? entity.subtasks.map((s) => ({ ...s })) : [],
    completedAt: entity.completedAt ?? undefined,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt ?? null,
    revision: entity.revision,
  };
}

export function habitToDomainEntity(habit: Habit): HabitEntity {
  const now = nowIso();
  return {
    id: habit.id,
    title: habit.title,
    category: habit.category,
    emoji: habit.emoji,
    color: habit.color,
    frequencyType:
      habit.frequencyType ?? (habit.weeklyGoal === 7 ? 'daily' : 'weekly_target'),
    weeklyGoal: habit.weeklyGoal,
    targetDaysOfWeek: habit.targetDaysOfWeek,
    startDate: habit.startDate ?? now.slice(0, 10),
    archived: Boolean(habit.archived),
    completedDates: { ...(habit.completedDates || {}) },
    createdAt: habit.createdAt || now,
    updatedAt: habit.updatedAt || now,
    deletedAt: habit.deletedAt ?? null,
    revision: typeof habit.revision === 'number' && habit.revision >= 1 ? habit.revision : 1,
  };
}

export function domainEntityToHabit(entity: HabitEntity): Habit {
  return {
    id: entity.id,
    title: entity.title,
    category: entity.category,
    emoji: entity.emoji,
    color: entity.color,
    weeklyGoal: entity.weeklyGoal,
    frequencyType: entity.frequencyType,
    targetDaysOfWeek: entity.targetDaysOfWeek,
    startDate: entity.startDate,
    archived: entity.archived,
    completedDates: { ...(entity.completedDates || {}) },
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt ?? null,
    revision: entity.revision,
  };
}

export function ideaToDomainNote(idea: Idea): NoteEntity {
  const now = nowIso();
  return {
    id: idea.id,
    kind: 'idea',
    title: idea.title,
    content: idea.note || '',
    category: idea.category || 'project',
    tags: Array.isArray(idea.tags) ? [...idea.tags] : [],
    pinned: false,
    linkedTaskId: idea.linkedTaskId ?? null,
    displayDateLabel: idea.createdAt,
    createdAt: idea.createdAtIso || now,
    updatedAt: idea.updatedAt || now,
    deletedAt: idea.deletedAt ?? null,
    revision: typeof idea.revision === 'number' && idea.revision >= 1 ? idea.revision : 1,
  };
}

export function domainNoteToIdea(note: NoteEntity): Idea {
  const validCategories: IdeaCategory[] = ['project', 'learning', 'business', 'personal'];
  const category: IdeaCategory = validCategories.includes(note.category as IdeaCategory)
    ? (note.category as IdeaCategory)
    : 'project';
  const fallbackLabel = (() => {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric',
      }).format(new Date(note.createdAt));
    } catch {
      return note.createdAt.slice(0, 10);
    }
  })();

  return {
    id: note.id,
    title: note.title,
    note: note.content,
    category,
    createdAt: note.displayDateLabel || fallbackLabel,
    createdAtIso: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt ?? null,
    revision: note.revision,
    tags: Array.isArray(note.tags) ? [...note.tags] : [],
    linkedTaskId: note.linkedTaskId ?? null,
  };
}

export function usefulInfoToDomainNote(info: UsefulInfoItem): NoteEntity {
  const now = nowIso();
  return {
    id: info.id,
    kind: 'useful_info',
    title: info.title,
    content: info.content,
    category: info.category || 'work',
    tags: Array.isArray(info.tags) ? [...info.tags] : [],
    pinned: Boolean(info.pinned),
    displayDateLabel: info.createdAt,
    createdAt: info.createdAtIso || now,
    updatedAt: info.updatedAt || now,
    deletedAt: info.deletedAt ?? null,
    revision: typeof info.revision === 'number' && info.revision >= 1 ? info.revision : 1,
  };
}

export function domainNoteToUsefulInfo(note: NoteEntity): UsefulInfoItem {
  const validCategories: UsefulInfoCategory[] = ['work', 'links', 'code', 'personal'];
  const category: UsefulInfoCategory = validCategories.includes(note.category as UsefulInfoCategory)
    ? (note.category as UsefulInfoCategory)
    : 'work';
  const fallbackLabel = (() => {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric',
      }).format(new Date(note.createdAt));
    } catch {
      return note.createdAt.slice(0, 10);
    }
  })();

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    category,
    pinned: Boolean(note.pinned),
    createdAt: note.displayDateLabel || fallbackLabel,
    createdAtIso: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt ?? null,
    revision: note.revision,
    tags: Array.isArray(note.tags) ? [...note.tags] : [],
  };
}

export function focusSessionToDomainEntity(session: FocusSession): FocusSessionEntity {
  const ts = session.timestamp || Date.now();
  const endedAt = session.endedAt || new Date(ts).toISOString();
  const startedAt =
    session.startedAt || new Date(ts - session.durationMinutes * 60 * 1000).toISOString();
  return {
    id: session.id,
    taskId: session.taskId ?? null,
    taskTitle: session.taskTitle,
    phase: session.phase || 'work',
    plannedMinutes: session.plannedMinutes ?? session.durationMinutes,
    durationMinutes: session.durationMinutes,
    dateKey: session.dateKey,
    startedAt,
    endedAt,
    completedNaturally: session.completedNaturally ?? true,
    createdAt: session.createdAt || endedAt,
    updatedAt: session.updatedAt || endedAt,
    deletedAt: session.deletedAt ?? null,
    revision: typeof session.revision === 'number' && session.revision >= 1 ? session.revision : 1,
  };
}

export function domainEntityToFocusSession(entity: FocusSessionEntity): FocusSession {
  const parsedTs = Date.parse(entity.endedAt);
  const timestamp = Number.isFinite(parsedTs) ? parsedTs : Date.now();
  return {
    id: entity.id,
    taskId: entity.taskId ?? undefined,
    taskTitle: entity.taskTitle,
    durationMinutes: entity.durationMinutes,
    plannedMinutes: entity.plannedMinutes,
    phase: entity.phase,
    dateKey: entity.dateKey,
    timestamp,
    startedAt: entity.startedAt,
    endedAt: entity.endedAt,
    completedNaturally: entity.completedNaturally,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt ?? null,
    revision: entity.revision,
  };
}

interface PlatformContextValue {
  container: PlatformContainer;
  ready: boolean;
  migrationReport: MigrationReport | null;
  bridgeError: string | null;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const container = useMemo(() => createPlatformContainer(), []);
  const [ready, setReady] = useState(false);
  const [migrationReport, setMigrationReport] = useState<MigrationReport | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    container
      .initialize()
      .then((report) => {
        if (!mounted) return;
        setMigrationReport(report);
        setReady(true);
      })
      .catch((err: any) => {
        if (!mounted) return;
        setBridgeError(err?.message || 'خطا در راه‌اندازی لایه ذخیره‌سازی پلتفرم.');
        setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, [container]);

  return (
    <PlatformContext.Provider value={{ container, ready, migrationReport, bridgeError }}>
      {children}
    </PlatformContext.Provider>
  );
};

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatform باید در داخل PlatformProvider فراخوانی شود.');
  }
  return ctx;
}
