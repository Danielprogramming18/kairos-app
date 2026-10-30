/**
 * Application Layer — Repository & Platform Service Contracts
 * All UI and Use-Case code talks exclusively to these interfaces.
 */

import {
  ActiveTimerState,
  BackupEnvelopeV2,
  EntityId,
  FocusSessionEntity,
  HabitEntity,
  HabitEntryEntity,
  LocalDateKey,
  MigrationReport,
  NoteEntity,
  NoteKind,
  TaskEntity,
  UserSettingsEntity,
} from '../domain/models';

export interface SaveMutationOptions {
  expectedRevision?: number;
}

export interface TaskFilter {
  includeDeleted?: boolean;
  targetDate?: LocalDateKey;
  completed?: boolean;
  category?: string;
}

export interface TaskRepository {
  listTasks(filter?: TaskFilter): Promise<TaskEntity[]>;
  getTaskById(id: EntityId): Promise<TaskEntity | null>;
  upsertTask(task: TaskEntity, options?: SaveMutationOptions): Promise<TaskEntity>;
  upsertTasksBatch(tasks: TaskEntity[]): Promise<TaskEntity[]>;
  softDeleteTask(id: EntityId): Promise<void>;
  restoreTask(id: EntityId): Promise<TaskEntity | null>;
  hardDeleteTask(id: EntityId): Promise<void>;
}

export interface HabitRepository {
  listHabits(includeDeleted?: boolean): Promise<HabitEntity[]>;
  getHabitById(id: EntityId): Promise<HabitEntity | null>;
  upsertHabit(habit: HabitEntity, options?: SaveMutationOptions): Promise<HabitEntity>;
  toggleHabitDate(habitId: EntityId, dateKey: LocalDateKey): Promise<HabitEntity | null>;
  listHabitEntries(habitId?: EntityId): Promise<HabitEntryEntity[]>;
  softDeleteHabit(id: EntityId): Promise<void>;
  restoreHabit(id: EntityId): Promise<HabitEntity | null>;
  hardDeleteHabit(id: EntityId): Promise<void>;
}

export interface NoteRepository {
  listNotes(kind?: NoteKind, includeDeleted?: boolean): Promise<NoteEntity[]>;
  upsertNote(note: NoteEntity, options?: SaveMutationOptions): Promise<NoteEntity>;
  softDeleteNote(id: EntityId): Promise<void>;
  restoreNote(id: EntityId): Promise<NoteEntity | null>;
  hardDeleteNote(id: EntityId): Promise<void>;
}

export interface FocusRepository {
  listFocusSessions(includeDeleted?: boolean): Promise<FocusSessionEntity[]>;
  logFocusSession(session: FocusSessionEntity): Promise<FocusSessionEntity>;
  getActiveTimerState(): Promise<ActiveTimerState | null>;
  saveActiveTimerState(state: ActiveTimerState | null): Promise<void>;
}

export interface SettingsRepository {
  getSettings(): Promise<UserSettingsEntity>;
  saveSettings(settings: Partial<UserSettingsEntity>): Promise<UserSettingsEntity>;
}

export interface BackupValidationResult {
  valid: boolean;
  errors: string[];
  envelope?: BackupEnvelopeV2;
  encrypted?: boolean;
  migratedFromLegacy?: boolean;
}

export interface BackupService {
  exportBackup(): Promise<BackupEnvelopeV2>;
  validateBackupJson(rawJson: string): Promise<BackupValidationResult>;
  restoreBackup(
    envelope: BackupEnvelopeV2,
    strategy: 'replace' | 'merge'
  ): Promise<{ restoredCounts: Record<string, number>; snapshotKey?: string }>;
  hasPreRestoreSnapshot?(): Promise<{ exists: boolean; createdAt?: string }>;
  rollbackLastRestore?(): Promise<{ restoredCounts: Record<string, number> }>;
}

export interface NotificationService {
  getPermissionStatus(): Promise<'granted' | 'denied' | 'default' | 'unsupported'>;
  requestPermission(): Promise<'granted' | 'denied' | 'default' | 'unsupported'>;
  scheduleTaskReminder(task: TaskEntity): Promise<void>;
  cancelTaskReminder(taskId: EntityId): Promise<void>;
}

export interface AppLifecycleService {
  getPlatformKind(): 'web' | 'android_webview' | 'windows_desktop';
  getStorageHealth(): Promise<{
    engine: 'indexeddb_dexie' | 'android_sqlite_bridge' | 'windows_sqlite_bridge';
    healthy: boolean;
    migrationReport?: MigrationReport | null;
    errorMessage?: string;
  }>;
}

export interface PlatformContainer {
  tasks: TaskRepository;
  habits: HabitRepository;
  notes: NoteRepository;
  focus: FocusRepository;
  settings: SettingsRepository;
  backup: BackupService;
  notifications: NotificationService;
  lifecycle: AppLifecycleService;
  initialize(): Promise<MigrationReport | null>;
}
