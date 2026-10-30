/**
 * Canonical Domain Entities & Value Objects for Kairos (کایروس)
 * Offline-First Clean Architecture — Domain Layer (Zero UI / Zero Storage Coupling)
 */

export type EntityId = string;
export type ISODateTimeString = string; // UTC ISO-8601 e.g. '2026-03-29T12:00:00.000Z'
export type LocalDateKey = string; // 'YYYY-MM-DD' in user's local timezone

export interface AuditableEntity {
  id: EntityId;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  deletedAt?: ISODateTimeString | null;
  revision: number;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived';

export interface SubtaskEntity {
  id: EntityId;
  title: string;
  completed: boolean;
}

export interface TaskEntity extends AuditableEntity {
  title: string;
  description?: string;
  status: TaskStatus;
  completed: boolean;
  priority: number; // 1 = highest priority (Ivy Lee / The One Thing)
  duration: number; // estimated minutes
  targetDate: LocalDateKey; // scheduled local date 'YYYY-MM-DD'
  dueAt?: ISODateTimeString | null;
  reminderTime?: string | null; // 'HH:MM' 24h local time
  reminded?: boolean;
  projectId?: EntityId | null;
  sourceId?: EntityId | null; // optional origin ID (e.g. converted from idea/assistant)
  category: string;
  tags: string[];
  subtasks: SubtaskEntity[];
  completedAt?: ISODateTimeString | null;
}

export interface ProjectEntity extends AuditableEntity {
  title: string;
  description?: string;
  color: string;
  icon?: string;
  archived: boolean;
}

export type HabitCategoryId = 'health' | 'learning' | 'work' | 'mindfulness' | 'finance';

export type HabitFrequencyType = 'daily' | 'weekly_target' | 'custom_days';

export interface HabitEntity extends AuditableEntity {
  title: string;
  category: HabitCategoryId;
  emoji: string;
  color: string;
  frequencyType: HabitFrequencyType;
  weeklyGoal: number; // 1..7
  targetDaysOfWeek?: number[]; // 0..6
  startDate?: LocalDateKey; // 'YYYY-MM-DD'
  archived: boolean;
  /**
   * Denormalized map of 'YYYY-MM-DD' -> true for fast UI rendering and legacy compatibility.
   * Canonical logs are also stored in HabitEntryEntity table.
   */
  completedDates: Record<LocalDateKey, boolean>;
}

export interface HabitEntryEntity extends AuditableEntity {
  habitId: EntityId;
  dateKey: LocalDateKey; // 'YYYY-MM-DD'
  completed: boolean;
  value?: number;
  note?: string;
}

export type NoteKind = 'idea' | 'useful_info' | 'journal';

export interface NoteEntity extends AuditableEntity {
  kind: NoteKind;
  title: string;
  content: string;
  category: string;
  tags: string[];
  pinned: boolean;
  linkedTaskId?: EntityId | null;
  displayDateLabel?: string;
}

export type FocusSessionPhase = 'work' | 'short_break' | 'long_break';

export interface FocusSessionEntity extends AuditableEntity {
  taskId?: EntityId | null;
  taskTitle?: string;
  phase: FocusSessionPhase;
  plannedMinutes: number;
  durationMinutes: number;
  dateKey: LocalDateKey;
  startedAt: ISODateTimeString;
  endedAt: ISODateTimeString;
  completedNaturally: boolean;
}

export interface ActiveTimerState {
  isRunning: boolean;
  phase: FocusSessionPhase;
  taskId?: EntityId | null;
  taskTitle?: string;
  durationSeconds: number;
  remainingSecondsWhenPaused: number;
  startedAtEpochMs: number | null;
  targetEndEpochMs: number | null;
  updatedAt: ISODateTimeString;
}

export interface UserSettingsEntity {
  id: 'default';
  theme: 'dark' | 'light' | 'system';
  soundEnabled: boolean;
  pomodoroWorkMinutes: number;
  pomodoroShortBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroCyclesBeforeLongBreak: number;
  calendarPreference: 'jalali' | 'gregorian';
  updatedAt: ISODateTimeString;
}

export interface MigrationInvalidRecordDetail {
  collection: 'tasks' | 'habits' | 'ideas' | 'usefulInfos' | 'focusSessions' | 'trash';
  index: number;
  reason: string;
  rawPreview: string;
}

export interface MigrationReport {
  migratedAt: ISODateTimeString;
  fromSchemaVersion: number;
  toSchemaVersion: number;
  status?: 'migrated' | 'clean_first_run' | 'already_migrated' | 'failed';
  counts: {
    tasks: number;
    habits: number;
    habitEntries: number;
    notes: number;
    focusSessions: number;
  };
  skippedInvalidRecords: number;
  corruptedKeys?: string[];
  invalidRecords?: MigrationInvalidRecordDetail[];
  verifiedCountsMatch?: boolean;
  recoverySnapshotKey: string;
  errorMessage?: string;
}

export interface BackupPayloadV2 {
  tasks: TaskEntity[];
  habits: HabitEntity[];
  habitEntries: HabitEntryEntity[];
  notes: NoteEntity[];
  focusSessions: FocusSessionEntity[];
  settings?: UserSettingsEntity;
}

export interface BackupEnvelopeV2 {
  appId?: 'kairos';
  app: 'Kairos';
  formatVersion?: 2;
  schemaVersion: 2;
  exportedAt: ISODateTimeString;
  platform: 'web' | 'android_webview' | 'windows_desktop';
  encrypted?: false;
  checksum: string;
  payload: BackupPayloadV2;
}

/**
 * Generates a collision-resistant UUID v4 string using Web Crypto API with safe fallback.
 */
export function createEntityId(prefix?: string): EntityId {
  let uuid: string;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID();
  } else {
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export function nowIso(): ISODateTimeString {
  return new Date().toISOString();
}
