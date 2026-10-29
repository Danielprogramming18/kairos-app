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
import { FocusSession, Habit, Idea, Task, UsefulInfoItem } from '../types';

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

// ================= CANONICAL <-> UI VIEW MAPPERS =================

export function taskToDomainEntity(task: Task): TaskEntity {
  const now = nowIso();
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.completed ? 'done' : 'todo',
    completed: task.completed,
    priority: task.priority,
    duration: task.duration,
    targetDate: task.targetDate,
    dueAt: null,
    reminderTime: task.reminderTime ?? null,
    reminded: Boolean(task.reminded),
    projectId: null,
    category: task.category || 'work',
    tags: [],
    subtasks: task.subtasks ?? [],
    completedAt: task.completedAt ?? (task.completed ? now : null),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
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
    category: entity.category,
    reminderTime: entity.reminderTime ?? undefined,
    reminded: entity.reminded,
    subtasks: entity.subtasks,
    completedAt: entity.completedAt ?? undefined,
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
    frequencyType: habit.weeklyGoal === 7 ? 'daily' : 'weekly_target',
    weeklyGoal: habit.weeklyGoal,
    archived: false,
    completedDates: habit.completedDates,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
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
    completedDates: entity.completedDates,
  };
}

export function ideaToDomainNote(idea: Idea): NoteEntity {
  const now = nowIso();
  return {
    id: idea.id,
    kind: 'idea',
    title: idea.title,
    content: idea.note || '',
    category: idea.category,
    tags: [],
    pinned: false,
    displayDateLabel: idea.createdAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
  };
}

export function usefulInfoToDomainNote(info: UsefulInfoItem): NoteEntity {
  const now = nowIso();
  return {
    id: info.id,
    kind: 'useful_info',
    title: info.title,
    content: info.content,
    category: info.category,
    tags: [],
    pinned: Boolean(info.pinned),
    displayDateLabel: info.createdAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
  };
}

export function focusSessionToDomainEntity(session: FocusSession): FocusSessionEntity {
  const endedAt = new Date(session.timestamp || Date.now()).toISOString();
  const startedAt = new Date(
    (session.timestamp || Date.now()) - session.durationMinutes * 60 * 1000
  ).toISOString();
  return {
    id: session.id,
    taskId: session.taskId ?? null,
    taskTitle: session.taskTitle,
    phase: 'work',
    plannedMinutes: session.durationMinutes,
    durationMinutes: session.durationMinutes,
    dateKey: session.dateKey,
    startedAt,
    endedAt,
    completedNaturally: true,
    createdAt: endedAt,
    updatedAt: endedAt,
    deletedAt: null,
    revision: 1,
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
