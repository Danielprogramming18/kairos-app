/**
 * Web Platform Adapter — IndexedDB (Dexie) Implementation + Safe Legacy Migration
 * Implements the full Clean Architecture PlatformContainer for Web / PWA.
 */

import Dexie, { type Table } from 'dexie';
import {
  ActiveTimerState,
  BackupEnvelopeV2,
  createEntityId,
  EntityId,
  FocusSessionEntity,
  HabitCategoryId,
  HabitEntity,
  HabitEntryEntity,
  LocalDateKey,
  MigrationReport,
  NoteEntity,
  NoteKind,
  nowIso,
  TaskEntity,
  UserSettingsEntity,
} from '../../domain/models';
import {
  AppLifecycleService,
  BackupService,
  BackupValidationResult,
  FocusRepository,
  HabitRepository,
  NoteRepository,
  NotificationService,
  PlatformContainer,
  SettingsRepository,
  TaskFilter,
  TaskRepository,
} from '../../application/repositories';

export const LEGACY_STORAGE_KEYS = {
  HABITS: 'nazmyar_habits_v1',
  TASKS: 'nazmyar_danial_tasks_v1',
  IDEAS: 'nazmyar_danial_ideas_v1',
  FOCUS_SESSIONS: 'nazmyar_focus_sessions_v1',
  USEFUL_INFO: 'nazmyar_useful_info_v1',
  THEME: 'nazmyar_theme',
  SOUND: 'nazmyar_sound',
  GITHUB_CONFIG: 'kairos_github_config_v1',
  GITHUB_SHA: 'kairos_github_last_sha_v1',
} as const;

export const MIGRATION_MARKER_KEY = 'kairos_indexeddb_migrated_v2';
export const MIGRATION_RECOVERY_SNAPSHOT_KEY = 'kairos_migration_recovery_v1';

export interface KeyValueRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class KairosWebDatabase extends Dexie {
  tasks!: Table<TaskEntity, string>;
  habits!: Table<HabitEntity, string>;
  habitEntries!: Table<HabitEntryEntity, string>;
  notes!: Table<NoteEntity, string>;
  focusSessions!: Table<FocusSessionEntity, string>;
  settings!: Table<UserSettingsEntity, string>;
  kvState!: Table<KeyValueRecord, string>;

  constructor(dbName = 'kairos_offline_db_v2') {
    super(dbName);
    this.version(1).stores({
      tasks: 'id, targetDate, completed, status, priority, category, updatedAt, deletedAt',
      habits: 'id, category, archived, updatedAt, deletedAt',
      habitEntries: 'id, habitId, dateKey, [habitId+dateKey], updatedAt, deletedAt',
      notes: 'id, kind, category, pinned, updatedAt, deletedAt',
      focusSessions: 'id, dateKey, taskId, startedAt, updatedAt, deletedAt',
      settings: 'id',
      kvState: 'key',
    });
  }
}

function computeSimpleChecksum(payload: unknown): string {
  const str = JSON.stringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function safeParseJsonArray(raw: string | null): { items: unknown[]; hadError: boolean } {
  if (!raw || !raw.trim()) return { items: [], hadError: false };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { items: parsed, hadError: false };
    }
    return { items: [], hadError: true };
  } catch {
    return { items: [], hadError: true };
  }
}

/**
 * Safely migrates legacy localStorage keys (`nazmyar_*`) into IndexedDB (`KairosWebDatabase`).
 * - Idempotent: will not duplicate records if called multiple times.
 * - Non-destructive: preserves original `nazmyar_*` keys and writes a raw recovery snapshot.
 * - Transactional: atomic commit across all object stores.
 */
export async function migrateLegacyLocalStorageToIndexedDB(
  db: KairosWebDatabase,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined
): Promise<MigrationReport | null> {
  const existingMarker = await db.kvState.get(MIGRATION_MARKER_KEY);
  if (existingMarker && existingMarker.value) {
    return existingMarker.value as MigrationReport;
  }

  if (!storage) {
    return null;
  }

  const rawTasks = storage.getItem(LEGACY_STORAGE_KEYS.TASKS);
  const rawHabits = storage.getItem(LEGACY_STORAGE_KEYS.HABITS);
  const rawIdeas = storage.getItem(LEGACY_STORAGE_KEYS.IDEAS);
  const rawUsefulInfos = storage.getItem(LEGACY_STORAGE_KEYS.USEFUL_INFO);
  const rawFocus = storage.getItem(LEGACY_STORAGE_KEYS.FOCUS_SESSIONS);
  const rawTheme = storage.getItem(LEGACY_STORAGE_KEYS.THEME);
  const rawSound = storage.getItem(LEGACY_STORAGE_KEYS.SOUND);

  // 1. Save non-destructive raw recovery snapshot before touching anything
  try {
    const existingSnapshot = storage.getItem(MIGRATION_RECOVERY_SNAPSHOT_KEY);
    if (!existingSnapshot) {
      storage.setItem(
        MIGRATION_RECOVERY_SNAPSHOT_KEY,
        JSON.stringify({
          snapshotAt: nowIso(),
          raw: {
            [LEGACY_STORAGE_KEYS.TASKS]: rawTasks,
            [LEGACY_STORAGE_KEYS.HABITS]: rawHabits,
            [LEGACY_STORAGE_KEYS.IDEAS]: rawIdeas,
            [LEGACY_STORAGE_KEYS.USEFUL_INFO]: rawUsefulInfos,
            [LEGACY_STORAGE_KEYS.FOCUS_SESSIONS]: rawFocus,
            [LEGACY_STORAGE_KEYS.THEME]: rawTheme,
            [LEGACY_STORAGE_KEYS.SOUND]: rawSound,
          },
        })
      );
    }
  } catch {
    // Ignore quota errors on snapshot write; original keys remain untouched anyway
  }

  const now = nowIso();
  let skippedInvalidRecords = 0;

  // Parse Tasks
  const parsedTasks = safeParseJsonArray(rawTasks);
  if (parsedTasks.hadError) skippedInvalidRecords++;
  const taskEntities: TaskEntity[] = [];
  for (const raw of parsedTasks.items) {
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      skippedInvalidRecords++;
      continue;
    }
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createEntityId('t');
    const completed = Boolean(item.completed);
    const priority =
      typeof item.priority === 'number' && Number.isFinite(item.priority)
        ? Math.max(1, Math.round(item.priority))
        : 1;
    const duration =
      typeof item.duration === 'number' && Number.isFinite(item.duration)
        ? Math.max(5, Math.round(item.duration))
        : 45;
    const targetDate =
      typeof item.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.targetDate)
        ? item.targetDate
        : now.slice(0, 10);

    taskEntities.push({
      id,
      title,
      description: typeof item.description === 'string' ? item.description : undefined,
      status: completed ? 'done' : 'todo',
      completed,
      priority,
      duration,
      targetDate,
      dueAt: null,
      reminderTime: typeof item.reminderTime === 'string' ? item.reminderTime : null,
      reminded: Boolean(item.reminded),
      projectId: null,
      category: typeof item.category === 'string' && item.category ? item.category : 'work',
      tags: [],
      subtasks: Array.isArray(item.subtasks)
        ? item.subtasks
            .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
            .map((s) => ({
              id: typeof s.id === 'string' ? s.id : createEntityId('sub'),
              title: typeof s.title === 'string' ? s.title : '',
              completed: Boolean(s.completed),
            }))
        : [],
      completedAt:
        typeof item.completedAt === 'string' ? item.completedAt : completed ? now : null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
    });
  }

  // Parse Habits & Habit Entries
  const parsedHabits = safeParseJsonArray(rawHabits);
  if (parsedHabits.hadError) skippedInvalidRecords++;
  const habitEntities: HabitEntity[] = [];
  const habitEntryEntities: HabitEntryEntity[] = [];

  for (const raw of parsedHabits.items) {
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      skippedInvalidRecords++;
      continue;
    }
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createEntityId('h');
    const validCategories: HabitCategoryId[] = [
      'health',
      'learning',
      'work',
      'mindfulness',
      'finance',
    ];
    const category: HabitCategoryId = validCategories.includes(item.category as HabitCategoryId)
      ? (item.category as HabitCategoryId)
      : 'health';
    const weeklyGoal =
      typeof item.weeklyGoal === 'number' && item.weeklyGoal >= 1 && item.weeklyGoal <= 7
        ? Math.round(item.weeklyGoal)
        : 7;

    const completedDates: Record<string, boolean> = {};
    if (item.completedDates && typeof item.completedDates === 'object') {
      for (const [dateKey, val] of Object.entries(item.completedDates as Record<string, unknown>)) {
        if (val && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          completedDates[dateKey] = true;
          habitEntryEntities.push({
            id: `he_${id}_${dateKey}`,
            habitId: id,
            dateKey,
            completed: true,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            revision: 1,
          });
        }
      }
    }

    habitEntities.push({
      id,
      title,
      category,
      emoji: typeof item.emoji === 'string' && item.emoji ? item.emoji : '✨',
      color: typeof item.color === 'string' && item.color ? item.color : '#6366f1',
      frequencyType: weeklyGoal === 7 ? 'daily' : 'weekly_target',
      weeklyGoal,
      archived: false,
      completedDates,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
    });
  }

  // Parse Ideas & Useful Info into unified Notes store
  const noteEntities: NoteEntity[] = [];
  const parsedIdeas = safeParseJsonArray(rawIdeas);
  if (parsedIdeas.hadError) skippedInvalidRecords++;
  for (const raw of parsedIdeas.items) {
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      skippedInvalidRecords++;
      continue;
    }
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createEntityId('id');
    noteEntities.push({
      id,
      kind: 'idea',
      title,
      content: typeof item.note === 'string' ? item.note : '',
      category: typeof item.category === 'string' ? item.category : 'project',
      tags: [],
      pinned: false,
      displayDateLabel: typeof item.createdAt === 'string' ? item.createdAt : undefined,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
    });
  }

  const parsedUseful = safeParseJsonArray(rawUsefulInfos);
  if (parsedUseful.hadError) skippedInvalidRecords++;
  for (const raw of parsedUseful.items) {
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      skippedInvalidRecords++;
      continue;
    }
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createEntityId('info');
    noteEntities.push({
      id,
      kind: 'useful_info',
      title,
      content: typeof item.content === 'string' ? item.content : '',
      category: typeof item.category === 'string' ? item.category : 'work',
      tags: [],
      pinned: Boolean(item.pinned),
      displayDateLabel: typeof item.createdAt === 'string' ? item.createdAt : undefined,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
    });
  }

  // Parse Focus Sessions
  const focusEntities: FocusSessionEntity[] = [];
  const parsedFocus = safeParseJsonArray(rawFocus);
  if (parsedFocus.hadError) skippedInvalidRecords++;
  for (const raw of parsedFocus.items) {
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createEntityId('fs');
    const durationMinutes =
      typeof item.durationMinutes === 'number' && item.durationMinutes > 0
        ? Math.round(item.durationMinutes)
        : 25;
    const ts =
      typeof item.timestamp === 'number' && Number.isFinite(item.timestamp)
        ? item.timestamp
        : Date.now();
    const endedAt = new Date(ts).toISOString();
    const startedAt = new Date(ts - durationMinutes * 60 * 1000).toISOString();
    const dateKey =
      typeof item.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.dateKey)
        ? item.dateKey
        : endedAt.slice(0, 10);

    focusEntities.push({
      id,
      taskId: typeof item.taskId === 'string' ? item.taskId : null,
      taskTitle: typeof item.taskTitle === 'string' ? item.taskTitle : undefined,
      phase: 'work',
      plannedMinutes: durationMinutes,
      durationMinutes,
      dateKey,
      startedAt,
      endedAt,
      completedNaturally: true,
      createdAt: endedAt,
      updatedAt: endedAt,
      deletedAt: null,
      revision: 1,
    });
  }

  const report: MigrationReport = {
    migratedAt: now,
    fromSchemaVersion: 1,
    toSchemaVersion: 2,
    counts: {
      tasks: taskEntities.length,
      habits: habitEntities.length,
      habitEntries: habitEntryEntities.length,
      notes: noteEntities.length,
      focusSessions: focusEntities.length,
    },
    skippedInvalidRecords,
    recoverySnapshotKey: MIGRATION_RECOVERY_SNAPSHOT_KEY,
  };

  await db.transaction(
    'rw',
    [db.tasks, db.habits, db.habitEntries, db.notes, db.focusSessions, db.settings, db.kvState],
    async () => {
      if (taskEntities.length > 0) await db.tasks.bulkPut(taskEntities);
      if (habitEntities.length > 0) await db.habits.bulkPut(habitEntities);
      if (habitEntryEntities.length > 0) await db.habitEntries.bulkPut(habitEntryEntities);
      if (noteEntities.length > 0) await db.notes.bulkPut(noteEntities);
      if (focusEntities.length > 0) await db.focusSessions.bulkPut(focusEntities);

      const existingSettings = await db.settings.get('default');
      if (!existingSettings) {
        await db.settings.put({
          id: 'default',
          theme: rawTheme === 'light' ? 'light' : 'dark',
          soundEnabled: rawSound !== 'false',
          pomodoroWorkMinutes: 45,
          pomodoroShortBreakMinutes: 10,
          pomodoroLongBreakMinutes: 20,
          pomodoroCyclesBeforeLongBreak: 4,
          calendarPreference: 'jalali',
          updatedAt: now,
        });
      }

      await db.kvState.put({
        key: MIGRATION_MARKER_KEY,
        value: report,
        updatedAt: now,
      });
    }
  );

  return report;
}

export class WebDexiePlatformAdapter implements PlatformContainer {
  public readonly db: KairosWebDatabase;
  public readonly tasks: TaskRepository;
  public readonly habits: HabitRepository;
  public readonly notes: NoteRepository;
  public readonly focus: FocusRepository;
  public readonly settings: SettingsRepository;
  public readonly backup: BackupService;
  public readonly notifications: NotificationService;
  public readonly lifecycle: AppLifecycleService;
  private lastMigrationReport: MigrationReport | null = null;

  constructor(db?: KairosWebDatabase) {
    this.db = db ?? new KairosWebDatabase();

    this.tasks = {
      listTasks: async (filter?: TaskFilter): Promise<TaskEntity[]> => {
        const all = await this.db.tasks.toArray();
        return all
          .filter((t) => {
            if (!filter?.includeDeleted && t.deletedAt) return false;
            if (filter?.targetDate !== undefined && t.targetDate !== filter.targetDate) return false;
            if (filter?.completed !== undefined && t.completed !== filter.completed) return false;
            if (filter?.category !== undefined && t.category !== filter.category) return false;
            return true;
          })
          .sort((a, b) => (a.priority || 99) - (b.priority || 99));
      },

      getTaskById: async (id: EntityId): Promise<TaskEntity | null> => {
        const task = await this.db.tasks.get(id);
        return task ?? null;
      },

      upsertTask: async (task: TaskEntity): Promise<TaskEntity> => {
        const existing = await this.db.tasks.get(task.id);
        const now = nowIso();
        const next: TaskEntity = {
          ...task,
          status: task.completed ? 'done' : task.status === 'done' ? 'todo' : task.status || 'todo',
          createdAt: existing?.createdAt ?? task.createdAt ?? now,
          updatedAt: now,
          deletedAt: task.deletedAt ?? null,
          revision: (existing?.revision ?? 0) + 1,
        };
        await this.db.tasks.put(next);
        return next;
      },

      upsertTasksBatch: async (tasksToSave: TaskEntity[]): Promise<TaskEntity[]> => {
        const now = nowIso();
        const prepared = tasksToSave.map((t) => ({
          ...t,
          createdAt: t.createdAt || now,
          updatedAt: now,
          deletedAt: t.deletedAt ?? null,
          revision: (t.revision || 0) + 1,
        }));
        await this.db.tasks.bulkPut(prepared);
        return prepared;
      },

      softDeleteTask: async (id: EntityId): Promise<void> => {
        const existing = await this.db.tasks.get(id);
        if (!existing) return;
        const now = nowIso();
        await this.db.tasks.put({
          ...existing,
          deletedAt: now,
          updatedAt: now,
          revision: (existing.revision || 0) + 1,
        });
      },

      restoreTask: async (id: EntityId): Promise<TaskEntity | null> => {
        const existing = await this.db.tasks.get(id);
        if (!existing) return null;
        const now = nowIso();
        const restored: TaskEntity = {
          ...existing,
          deletedAt: null,
          updatedAt: now,
          revision: (existing.revision || 0) + 1,
        };
        await this.db.tasks.put(restored);
        return restored;
      },
    };

    this.habits = {
      listHabits: async (includeDeleted = false): Promise<HabitEntity[]> => {
        const all = await this.db.habits.toArray();
        return all.filter((h) => includeDeleted || !h.deletedAt);
      },

      getHabitById: async (id: EntityId): Promise<HabitEntity | null> => {
        const h = await this.db.habits.get(id);
        return h ?? null;
      },

      upsertHabit: async (habit: HabitEntity): Promise<HabitEntity> => {
        const existing = await this.db.habits.get(habit.id);
        const now = nowIso();
        const next: HabitEntity = {
          ...habit,
          createdAt: existing?.createdAt ?? habit.createdAt ?? now,
          updatedAt: now,
          deletedAt: habit.deletedAt ?? null,
          revision: (existing?.revision ?? 0) + 1,
        };
        await this.db.habits.put(next);
        return next;
      },

      toggleHabitDate: async (
        habitId: EntityId,
        dateKey: LocalDateKey
      ): Promise<HabitEntity | null> => {
        return this.db.transaction('rw', [this.db.habits, this.db.habitEntries], async () => {
          const habit = await this.db.habits.get(habitId);
          if (!habit) return null;
          const now = nowIso();
          const entryId = `he_${habitId}_${dateKey}`;
          const wasCompleted = Boolean(habit.completedDates[dateKey]);
          const nextCompleted = !wasCompleted;

          const updatedDates = { ...habit.completedDates };
          if (nextCompleted) {
            updatedDates[dateKey] = true;
          } else {
            delete updatedDates[dateKey];
          }

          const updatedHabit: HabitEntity = {
            ...habit,
            completedDates: updatedDates,
            updatedAt: now,
            revision: (habit.revision || 0) + 1,
          };

          await this.db.habits.put(updatedHabit);
          await this.db.habitEntries.put({
            id: entryId,
            habitId,
            dateKey,
            completed: nextCompleted,
            createdAt: now,
            updatedAt: now,
            deletedAt: nextCompleted ? null : now,
            revision: 1,
          });

          return updatedHabit;
        });
      },

      listHabitEntries: async (habitId?: EntityId): Promise<HabitEntryEntity[]> => {
        const all = habitId
          ? await this.db.habitEntries.where('habitId').equals(habitId).toArray()
          : await this.db.habitEntries.toArray();
        return all.filter((e) => !e.deletedAt && e.completed);
      },

      softDeleteHabit: async (id: EntityId): Promise<void> => {
        const existing = await this.db.habits.get(id);
        if (!existing) return;
        const now = nowIso();
        await this.db.habits.put({
          ...existing,
          deletedAt: now,
          updatedAt: now,
          revision: (existing.revision || 0) + 1,
        });
      },
    };

    this.notes = {
      listNotes: async (kind?: NoteKind, includeDeleted = false): Promise<NoteEntity[]> => {
        const all = await this.db.notes.toArray();
        return all.filter((n) => {
          if (!includeDeleted && n.deletedAt) return false;
          if (kind && n.kind !== kind) return false;
          return true;
        });
      },

      upsertNote: async (note: NoteEntity): Promise<NoteEntity> => {
        const existing = await this.db.notes.get(note.id);
        const now = nowIso();
        const next: NoteEntity = {
          ...note,
          createdAt: existing?.createdAt ?? note.createdAt ?? now,
          updatedAt: now,
          deletedAt: note.deletedAt ?? null,
          revision: (existing?.revision ?? 0) + 1,
        };
        await this.db.notes.put(next);
        return next;
      },

      softDeleteNote: async (id: EntityId): Promise<void> => {
        const existing = await this.db.notes.get(id);
        if (!existing) return;
        const now = nowIso();
        await this.db.notes.put({
          ...existing,
          deletedAt: now,
          updatedAt: now,
          revision: (existing.revision || 0) + 1,
        });
      },
    };

    this.focus = {
      listFocusSessions: async (includeDeleted = false): Promise<FocusSessionEntity[]> => {
        const all = await this.db.focusSessions.toArray();
        return all
          .filter((s) => includeDeleted || !s.deletedAt)
          .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
      },

      logFocusSession: async (session: FocusSessionEntity): Promise<FocusSessionEntity> => {
        const now = nowIso();
        const next: FocusSessionEntity = {
          ...session,
          createdAt: session.createdAt || now,
          updatedAt: now,
          deletedAt: null,
          revision: (session.revision || 0) + 1,
        };
        await this.db.focusSessions.put(next);
        return next;
      },

      getActiveTimerState: async (): Promise<ActiveTimerState | null> => {
        const row = await this.db.kvState.get('active_timer_state');
        return (row?.value as ActiveTimerState) ?? null;
      },

      saveActiveTimerState: async (state: ActiveTimerState | null): Promise<void> => {
        if (!state) {
          await this.db.kvState.delete('active_timer_state');
          return;
        }
        await this.db.kvState.put({
          key: 'active_timer_state',
          value: state,
          updatedAt: nowIso(),
        });
      },
    };

    this.settings = {
      getSettings: async (): Promise<UserSettingsEntity> => {
        const s = await this.db.settings.get('default');
        if (s) return s;
        const fallback: UserSettingsEntity = {
          id: 'default',
          theme: 'dark',
          soundEnabled: true,
          pomodoroWorkMinutes: 45,
          pomodoroShortBreakMinutes: 10,
          pomodoroLongBreakMinutes: 20,
          pomodoroCyclesBeforeLongBreak: 4,
          calendarPreference: 'jalali',
          updatedAt: nowIso(),
        };
        await this.db.settings.put(fallback);
        return fallback;
      },

      saveSettings: async (
        partial: Partial<UserSettingsEntity>
      ): Promise<UserSettingsEntity> => {
        const current = await this.settings.getSettings();
        const updated: UserSettingsEntity = {
          ...current,
          ...partial,
          id: 'default',
          updatedAt: nowIso(),
        };
        await this.db.settings.put(updated);
        return updated;
      },
    };

    this.backup = {
      exportBackup: async (): Promise<BackupEnvelopeV2> => {
        const [tasks, habits, habitEntries, notes, focusSessions, settings] = await Promise.all([
          this.tasks.listTasks({ includeDeleted: true }),
          this.habits.listHabits(true),
          this.habits.listHabitEntries(),
          this.notes.listNotes(undefined, true),
          this.focus.listFocusSessions(true),
          this.settings.getSettings(),
        ]);

        const payload = {
          tasks,
          habits,
          habitEntries,
          notes,
          focusSessions,
          settings,
        };

        return {
          app: 'Kairos',
          schemaVersion: 2,
          exportedAt: nowIso(),
          platform: 'web',
          checksum: computeSimpleChecksum(payload),
          payload,
        };
      },

      validateBackupJson: async (rawJson: string): Promise<BackupValidationResult> => {
        const errors: string[] = [];
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(rawJson);
        } catch {
          return { valid: false, errors: ['فایل انتخاب‌شده یک JSON معتبر نیست.'] };
        }

        if (!parsed || typeof parsed !== 'object') {
          return { valid: false, errors: ['ساختار ریشهٔ فایل پشتیبان نامعتبر است.'] };
        }

        // Support both V2 envelope and legacy v4.0 data.json envelope
        if (parsed.schemaVersion === 2 && parsed.payload && typeof parsed.payload === 'object') {
          const payload = parsed.payload as Record<string, unknown>;
          if (!Array.isArray(payload.tasks)) errors.push('آرایهٔ tasks در فایل پشتیبان وجود ندارد.');
          if (!Array.isArray(payload.habits)) errors.push('آرایهٔ habits در فایل پشتیبان وجود ندارد.');
          if (!Array.isArray(payload.notes)) errors.push('آرایهٔ notes در فایل پشتیبان وجود ندارد.');
          if (errors.length > 0) return { valid: false, errors };
          return {
            valid: true,
            errors: [],
            envelope: parsed as unknown as BackupEnvelopeV2,
          };
        }

        // Check Legacy v4.0 / direct object format
        const legacyData =
          parsed.data && typeof parsed.data === 'object'
            ? (parsed.data as Record<string, unknown>)
            : parsed;

        if (!Array.isArray(legacyData.tasks) || !Array.isArray(legacyData.habits)) {
          return {
            valid: false,
            errors: ['فایل پشتیبان فاقد لیست وظایف (tasks) یا عادت‌ها (habits) معتبر است.'],
          };
        }

        const now = nowIso();
        const convertedTasks: TaskEntity[] = (legacyData.tasks as Record<string, unknown>[])
          .filter((t) => Boolean(t && typeof t === 'object' && typeof t.title === 'string'))
          .map((t) => ({
            id: typeof t.id === 'string' ? t.id : createEntityId('t'),
            title: String(t.title),
            description: typeof t.description === 'string' ? t.description : undefined,
            status: t.completed ? 'done' : 'todo',
            completed: Boolean(t.completed),
            priority: typeof t.priority === 'number' ? t.priority : 1,
            duration: typeof t.duration === 'number' ? t.duration : 45,
            targetDate: typeof t.targetDate === 'string' ? t.targetDate : now.slice(0, 10),
            reminderTime: typeof t.reminderTime === 'string' ? t.reminderTime : null,
            reminded: Boolean(t.reminded),
            category: typeof t.category === 'string' ? t.category : 'work',
            tags: [],
            subtasks: [],
            completedAt: typeof t.completedAt === 'string' ? t.completedAt : null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            revision: 1,
          }));

        const convertedHabits: HabitEntity[] = (legacyData.habits as Record<string, unknown>[])
          .filter((h) => Boolean(h && typeof h === 'object' && typeof h.title === 'string'))
          .map((h) => ({
            id: typeof h.id === 'string' ? h.id : createEntityId('h'),
            title: String(h.title),
            category: (typeof h.category === 'string' ? h.category : 'health') as HabitCategoryId,
            emoji: typeof h.emoji === 'string' ? h.emoji : '✨',
            color: typeof h.color === 'string' ? h.color : '#6366f1',
            frequencyType: 'daily',
            weeklyGoal: typeof h.weeklyGoal === 'number' ? h.weeklyGoal : 7,
            archived: false,
            completedDates:
              h.completedDates && typeof h.completedDates === 'object'
                ? (h.completedDates as Record<string, boolean>)
                : {},
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            revision: 1,
          }));

        const convertedNotes: NoteEntity[] = [];
        if (Array.isArray(legacyData.ideas)) {
          for (const idea of legacyData.ideas as Record<string, unknown>[]) {
            if (idea && typeof idea.title === 'string') {
              convertedNotes.push({
                id: typeof idea.id === 'string' ? idea.id : createEntityId('id'),
                kind: 'idea',
                title: idea.title,
                content: typeof idea.note === 'string' ? idea.note : '',
                category: typeof idea.category === 'string' ? idea.category : 'project',
                tags: [],
                pinned: false,
                displayDateLabel: typeof idea.createdAt === 'string' ? idea.createdAt : undefined,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
                revision: 1,
              });
            }
          }
        }
        if (Array.isArray(legacyData.usefulInfos)) {
          for (const info of legacyData.usefulInfos as Record<string, unknown>[]) {
            if (info && typeof info.title === 'string') {
              convertedNotes.push({
                id: typeof info.id === 'string' ? info.id : createEntityId('info'),
                kind: 'useful_info',
                title: info.title,
                content: typeof info.content === 'string' ? info.content : '',
                category: typeof info.category === 'string' ? info.category : 'work',
                tags: [],
                pinned: Boolean(info.pinned),
                displayDateLabel: typeof info.createdAt === 'string' ? info.createdAt : undefined,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
                revision: 1,
              });
            }
          }
        }

        const convertedFocus: FocusSessionEntity[] = Array.isArray(legacyData.focusSessions)
          ? (legacyData.focusSessions as Record<string, unknown>[]).map((fs) => ({
              id: typeof fs.id === 'string' ? fs.id : createEntityId('fs'),
              taskId: typeof fs.taskId === 'string' ? fs.taskId : null,
              taskTitle: typeof fs.taskTitle === 'string' ? fs.taskTitle : undefined,
              phase: 'work',
              plannedMinutes: typeof fs.durationMinutes === 'number' ? fs.durationMinutes : 25,
              durationMinutes: typeof fs.durationMinutes === 'number' ? fs.durationMinutes : 25,
              dateKey: typeof fs.dateKey === 'string' ? fs.dateKey : now.slice(0, 10),
              startedAt: now,
              endedAt: now,
              completedNaturally: true,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              revision: 1,
            }))
          : [];

        const payload = {
          tasks: convertedTasks,
          habits: convertedHabits,
          habitEntries: [],
          notes: convertedNotes,
          focusSessions: convertedFocus,
        };

        return {
          valid: true,
          errors: [],
          envelope: {
            app: 'Kairos',
            schemaVersion: 2,
            exportedAt: now,
            platform: 'web',
            checksum: computeSimpleChecksum(payload),
            payload,
          },
        };
      },

      restoreBackup: async (
        envelope: BackupEnvelopeV2,
        strategy: 'replace' | 'merge'
      ): Promise<{ restoredCounts: Record<string, number> }> => {
        const { tasks, habits, habitEntries, notes, focusSessions, settings } = envelope.payload;
        await this.db.transaction(
          'rw',
          [
            this.db.tasks,
            this.db.habits,
            this.db.habitEntries,
            this.db.notes,
            this.db.focusSessions,
            this.db.settings,
          ],
          async () => {
            if (strategy === 'replace') {
              await Promise.all([
                this.db.tasks.clear(),
                this.db.habits.clear(),
                this.db.habitEntries.clear(),
                this.db.notes.clear(),
                this.db.focusSessions.clear(),
              ]);
            }
            if (tasks.length > 0) await this.db.tasks.bulkPut(tasks);
            if (habits.length > 0) await this.db.habits.bulkPut(habits);
            if (habitEntries && habitEntries.length > 0) {
              await this.db.habitEntries.bulkPut(habitEntries);
            }
            if (notes.length > 0) await this.db.notes.bulkPut(notes);
            if (focusSessions.length > 0) await this.db.focusSessions.bulkPut(focusSessions);
            if (settings) await this.db.settings.put(settings);
          }
        );

        return {
          restoredCounts: {
            tasks: tasks.length,
            habits: habits.length,
            notes: notes.length,
            focusSessions: focusSessions.length,
          },
        };
      },
    };

    this.notifications = {
      getPermissionStatus: async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
        return Notification.permission;
      },
      requestPermission: async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
        return Notification.requestPermission();
      },
      scheduleTaskReminder: async () => {
        // On Web, reminders are checked when the tab is open via the foreground scheduler
      },
      cancelTaskReminder: async () => {},
    };

    this.lifecycle = {
      getPlatformKind: () => 'web',
      getStorageHealth: async () => ({
        engine: 'indexeddb_dexie',
        healthy: true,
        migrationReport: this.lastMigrationReport,
      }),
    };
  }

  async initialize(): Promise<MigrationReport | null> {
    this.lastMigrationReport = await migrateLegacyLocalStorageToIndexedDB(this.db);
    return this.lastMigrationReport;
  }
}
