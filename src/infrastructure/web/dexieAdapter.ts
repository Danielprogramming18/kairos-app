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
  MigrationInvalidRecordDetail,
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
import {
  computeBackupChecksum,
  validateAndPreviewBackupPayload,
  validateBackupEnvelopeObject,
} from '../../utils/backupCrypto';

export const LEGACY_STORAGE_KEYS = {
  HABITS: 'nazmyar_habits_v1',
  TASKS: 'nazmyar_danial_tasks_v1',
  IDEAS: 'nazmyar_danial_ideas_v1',
  FOCUS_SESSIONS: 'nazmyar_focus_sessions_v1',
  USEFUL_INFO: 'nazmyar_useful_info_v1',
  TRASH: 'nazmyar_trash_v1',
  THEME: 'nazmyar_theme',
  SOUND: 'nazmyar_sound',
  GITHUB_CONFIG: 'kairos_github_config_v1',
  GITHUB_SHA: 'kairos_github_last_sha_v1',
} as const;

export const MIGRATION_MARKER_KEY = 'kairos_indexeddb_migrated_v2';
export const MIGRATION_RECOVERY_SNAPSHOT_KEY = 'kairos_migration_recovery_v1';
export const PRE_RESTORE_SNAPSHOT_KEY = 'kairos_pre_restore_snapshot_v2';
export const CROSS_TAB_SYNC_CHANNEL = 'kairos_db_sync_v2';

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

function notifyCrossTabSync(operation: string) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CROSS_TAB_SYNC_CHANNEL);
      ch.postMessage({ operation, timestamp: Date.now() });
      ch.close();
    }
  } catch {
    // BroadcastChannel is optional in non-browser test runners
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

interface LegacyParseResult {
  keyExists: boolean;
  items: unknown[];
  hadParseError: boolean;
}

/**
 * Distinguishes between "data does not exist (raw === null)" vs "reading/parsing failed".
 */
function inspectLegacyJsonArray(raw: string | null): LegacyParseResult {
  if (raw === null || raw === undefined) {
    return { keyExists: false, items: [], hadParseError: false };
  }
  if (!raw.trim()) {
    return { keyExists: true, items: [], hadParseError: false };
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { keyExists: true, items: parsed, hadParseError: false };
    }
    return { keyExists: true, items: [], hadParseError: true };
  } catch {
    return { keyExists: true, items: [], hadParseError: true };
  }
}

/**
 * Safely migrates legacy localStorage keys (`nazmyar_*`) into IndexedDB (`KairosWebDatabase`).
 * - Versioned & Idempotent: will not duplicate records or re-seed if called multiple times.
 * - Non-destructive: preserves original `nazmyar_*` keys and writes a verified raw recovery snapshot.
 * - Verifies post-write counts inside IndexedDB before marking migration complete.
 */
export async function migrateLegacyLocalStorageToIndexedDB(
  db: KairosWebDatabase,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined
): Promise<MigrationReport | null> {
  const existingMarker = await db.kvState.get(MIGRATION_MARKER_KEY);
  if (existingMarker && existingMarker.value) {
    const prev = existingMarker.value as MigrationReport;
    return {
      ...prev,
      status: 'already_migrated',
    };
  }

  if (!storage) {
    return null;
  }

  const rawTasks = storage.getItem(LEGACY_STORAGE_KEYS.TASKS);
  const rawHabits = storage.getItem(LEGACY_STORAGE_KEYS.HABITS);
  const rawIdeas = storage.getItem(LEGACY_STORAGE_KEYS.IDEAS);
  const rawUsefulInfos = storage.getItem(LEGACY_STORAGE_KEYS.USEFUL_INFO);
  const rawFocus = storage.getItem(LEGACY_STORAGE_KEYS.FOCUS_SESSIONS);
  const rawTrash = storage.getItem(LEGACY_STORAGE_KEYS.TRASH);
  const rawTheme = storage.getItem(LEGACY_STORAGE_KEYS.THEME);
  const rawSound = storage.getItem(LEGACY_STORAGE_KEYS.SOUND);

  const hasAnyLegacyData =
    rawTasks !== null ||
    rawHabits !== null ||
    rawIdeas !== null ||
    rawUsefulInfos !== null ||
    rawFocus !== null ||
    rawTrash !== null;

  const now = nowIso();

  // 1. If any legacy data exists, create and verify a recovery snapshot BEFORE migrating.
  if (hasAnyLegacyData) {
    const existingSnapshot = storage.getItem(MIGRATION_RECOVERY_SNAPSHOT_KEY);
    if (!existingSnapshot) {
      const snapshotPayload = JSON.stringify({
        snapshotAt: now,
        raw: {
          [LEGACY_STORAGE_KEYS.TASKS]: rawTasks,
          [LEGACY_STORAGE_KEYS.HABITS]: rawHabits,
          [LEGACY_STORAGE_KEYS.IDEAS]: rawIdeas,
          [LEGACY_STORAGE_KEYS.USEFUL_INFO]: rawUsefulInfos,
          [LEGACY_STORAGE_KEYS.FOCUS_SESSIONS]: rawFocus,
          [LEGACY_STORAGE_KEYS.TRASH]: rawTrash,
          [LEGACY_STORAGE_KEYS.THEME]: rawTheme,
          [LEGACY_STORAGE_KEYS.SOUND]: rawSound,
        },
      });
      try {
        storage.setItem(MIGRATION_RECOVERY_SNAPSHOT_KEY, snapshotPayload);
        const verifyRead = storage.getItem(MIGRATION_RECOVERY_SNAPSHOT_KEY);
        if (!verifyRead || !verifyRead.includes('"snapshotAt"')) {
          throw new Error('Snapshot read-back verification failed.');
        }
      } catch (err: any) {
        throw new Error(
          `خطا در ایجاد اسنپ‌شات پشتیبان پیش از مهاجرت (${err?.message || 'Storage Error'})؛ عملیات متوقف شد تا داده‌های اصلی دست‌نخورده بمانند.`
        );
      }
    }
  }

  let skippedInvalidRecords = 0;
  const corruptedKeys: string[] = [];
  const invalidRecords: MigrationInvalidRecordDetail[] = [];

  // Parse Tasks
  const parsedTasks = inspectLegacyJsonArray(rawTasks);
  if (parsedTasks.hadParseError) {
    skippedInvalidRecords++;
    corruptedKeys.push(LEGACY_STORAGE_KEYS.TASKS);
  }
  const taskEntitiesMap = new Map<string, TaskEntity>();
  for (let i = 0; i < parsedTasks.items.length; i++) {
    const raw = parsedTasks.items[i];
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'tasks',
        index: i,
        reason: 'رکورد وظیفه یک شیء معتبر نیست.',
        rawPreview: String(raw).slice(0, 120),
      });
      continue;
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'tasks',
        index: i,
        reason: 'عنوان وظیفه خالی یا نامعتبر است.',
        rawPreview: JSON.stringify(raw).slice(0, 120),
      });
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

    taskEntitiesMap.set(id, {
      id,
      title,
      description: typeof item.description === 'string' ? item.description : undefined,
      status: completed ? 'done' : 'todo',
      completed,
      priority,
      duration,
      targetDate,
      dueAt: typeof item.dueAt === 'string' ? item.dueAt : null,
      reminderTime: typeof item.reminderTime === 'string' ? item.reminderTime : null,
      reminded: Boolean(item.reminded),
      projectId: typeof item.projectId === 'string' ? item.projectId : null,
      sourceId: typeof item.sourceId === 'string' ? item.sourceId : null,
      category: typeof item.category === 'string' && item.category ? item.category : 'work',
      tags: Array.isArray(item.tags)
        ? item.tags.filter((t): t is string => typeof t === 'string')
        : [],
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
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && item.revision >= 1 ? Math.round(item.revision) : 1,
    });
  }

  // Parse Habits & Habit Entries
  const parsedHabits = inspectLegacyJsonArray(rawHabits);
  if (parsedHabits.hadParseError) {
    skippedInvalidRecords++;
    corruptedKeys.push(LEGACY_STORAGE_KEYS.HABITS);
  }
  const habitEntitiesMap = new Map<string, HabitEntity>();
  const habitEntryEntitiesMap = new Map<string, HabitEntryEntity>();

  for (let i = 0; i < parsedHabits.items.length; i++) {
    const raw = parsedHabits.items[i];
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'habits',
        index: i,
        reason: 'رکورد عادت یک شیء معتبر نیست.',
        rawPreview: String(raw).slice(0, 120),
      });
      continue;
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'habits',
        index: i,
        reason: 'عنوان عادت خالی یا نامعتبر است.',
        rawPreview: JSON.stringify(raw).slice(0, 120),
      });
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
          const entryId = `he_${id}_${dateKey}`;
          habitEntryEntitiesMap.set(entryId, {
            id: entryId,
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

    habitEntitiesMap.set(id, {
      id,
      title,
      category,
      emoji: typeof item.emoji === 'string' && item.emoji ? item.emoji : '✨',
      color: typeof item.color === 'string' && item.color ? item.color : '#6366f1',
      frequencyType: weeklyGoal === 7 ? 'daily' : 'weekly_target',
      weeklyGoal,
      startDate: typeof item.startDate === 'string' ? item.startDate : now.slice(0, 10),
      archived: Boolean(item.archived),
      completedDates,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && item.revision >= 1 ? Math.round(item.revision) : 1,
    });
  }

  // Parse Ideas & Useful Info into unified Notes store
  const noteEntitiesMap = new Map<string, NoteEntity>();
  const parsedIdeas = inspectLegacyJsonArray(rawIdeas);
  if (parsedIdeas.hadParseError) {
    skippedInvalidRecords++;
    corruptedKeys.push(LEGACY_STORAGE_KEYS.IDEAS);
  }
  for (let i = 0; i < parsedIdeas.items.length; i++) {
    const raw = parsedIdeas.items[i];
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'ideas',
        index: i,
        reason: 'رکورد ایده یک شیء معتبر نیست.',
        rawPreview: String(raw).slice(0, 120),
      });
      continue;
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'ideas',
        index: i,
        reason: 'عنوان ایده خالی یا نامعتبر است.',
        rawPreview: JSON.stringify(raw).slice(0, 120),
      });
      continue;
    }
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createEntityId('id');
    noteEntitiesMap.set(id, {
      id,
      kind: 'idea',
      title,
      content: typeof item.note === 'string' ? item.note : '',
      category: typeof item.category === 'string' ? item.category : 'project',
      tags: Array.isArray(item.tags)
        ? item.tags.filter((t): t is string => typeof t === 'string')
        : [],
      pinned: false,
      linkedTaskId: typeof item.linkedTaskId === 'string' ? item.linkedTaskId : null,
      displayDateLabel: typeof item.createdAt === 'string' ? item.createdAt : undefined,
      createdAt: typeof item.createdAtIso === 'string' ? item.createdAtIso : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && item.revision >= 1 ? Math.round(item.revision) : 1,
    });
  }

  const parsedUseful = inspectLegacyJsonArray(rawUsefulInfos);
  if (parsedUseful.hadParseError) {
    skippedInvalidRecords++;
    corruptedKeys.push(LEGACY_STORAGE_KEYS.USEFUL_INFO);
  }
  for (let i = 0; i < parsedUseful.items.length; i++) {
    const raw = parsedUseful.items[i];
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'usefulInfos',
        index: i,
        reason: 'رکورد اطلاعات کاربردی یک شیء معتبر نیست.',
        rawPreview: String(raw).slice(0, 120),
      });
      continue;
    }
    const item = raw as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'usefulInfos',
        index: i,
        reason: 'عنوان اطلاعات کاربردی خالی یا نامعتبر است.',
        rawPreview: JSON.stringify(raw).slice(0, 120),
      });
      continue;
    }
    const id =
      typeof item.id === 'string' && item.id.trim() ? item.id.trim() : createEntityId('info');
    noteEntitiesMap.set(id, {
      id,
      kind: 'useful_info',
      title,
      content: typeof item.content === 'string' ? item.content : '',
      category: typeof item.category === 'string' ? item.category : 'work',
      tags: Array.isArray(item.tags)
        ? item.tags.filter((t): t is string => typeof t === 'string')
        : [],
      pinned: Boolean(item.pinned),
      displayDateLabel: typeof item.createdAt === 'string' ? item.createdAt : undefined,
      createdAt: typeof item.createdAtIso === 'string' ? item.createdAtIso : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && item.revision >= 1 ? Math.round(item.revision) : 1,
    });
  }

  // Parse Legacy Trash (`nazmyar_trash_v1`) into canonical soft-deleted records
  const parsedTrash = inspectLegacyJsonArray(rawTrash);
  if (parsedTrash.hadParseError) {
    skippedInvalidRecords++;
    corruptedKeys.push(LEGACY_STORAGE_KEYS.TRASH);
  }
  for (let i = 0; i < parsedTrash.items.length; i++) {
    const raw = parsedTrash.items[i];
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : '';
    const type = item.type;
    const deletedAt = typeof item.deletedAt === 'string' ? item.deletedAt : now;
    const payload = item.payload as Record<string, unknown> | undefined;
    if (!id || !payload || typeof payload !== 'object') continue;
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) continue;

    if (type === 'task' && !taskEntitiesMap.has(id)) {
      taskEntitiesMap.set(id, {
        id,
        title,
        description: typeof payload.description === 'string' ? payload.description : undefined,
        status: payload.completed ? 'done' : 'todo',
        completed: Boolean(payload.completed),
        priority: typeof payload.priority === 'number' ? payload.priority : 1,
        duration: typeof payload.duration === 'number' ? payload.duration : 45,
        targetDate: typeof payload.targetDate === 'string' ? payload.targetDate : now.slice(0, 10),
        dueAt: null,
        reminderTime: typeof payload.reminderTime === 'string' ? payload.reminderTime : null,
        reminded: Boolean(payload.reminded),
        projectId: null,
        sourceId: null,
        category: typeof payload.category === 'string' ? payload.category : 'work',
        tags: [],
        subtasks: [],
        completedAt: typeof payload.completedAt === 'string' ? payload.completedAt : null,
        createdAt: now,
        updatedAt: deletedAt,
        deletedAt,
        revision: 1,
      });
    } else if (type === 'habit' && !habitEntitiesMap.has(id)) {
      habitEntitiesMap.set(id, {
        id,
        title,
        category: (typeof payload.category === 'string' ? payload.category : 'health') as HabitCategoryId,
        emoji: typeof payload.emoji === 'string' ? payload.emoji : '✨',
        color: typeof payload.color === 'string' ? payload.color : '#6366f1',
        frequencyType: 'daily',
        weeklyGoal: typeof payload.weeklyGoal === 'number' ? payload.weeklyGoal : 7,
        archived: false,
        completedDates:
          payload.completedDates && typeof payload.completedDates === 'object'
            ? (payload.completedDates as Record<string, boolean>)
            : {},
        createdAt: now,
        updatedAt: deletedAt,
        deletedAt,
        revision: 1,
      });
    } else if ((type === 'idea' || type === 'useful_info') && !noteEntitiesMap.has(id)) {
      noteEntitiesMap.set(id, {
        id,
        kind: type === 'idea' ? 'idea' : 'useful_info',
        title,
        content:
          type === 'idea'
            ? typeof payload.note === 'string'
              ? payload.note
              : ''
            : typeof payload.content === 'string'
            ? payload.content
            : '',
        category: typeof payload.category === 'string' ? payload.category : 'work',
        tags: [],
        pinned: Boolean(payload.pinned),
        displayDateLabel: typeof payload.createdAt === 'string' ? payload.createdAt : undefined,
        createdAt: now,
        updatedAt: deletedAt,
        deletedAt,
        revision: 1,
      });
    }
  }

  // Parse Focus Sessions
  const focusEntitiesMap = new Map<string, FocusSessionEntity>();
  const parsedFocus = inspectLegacyJsonArray(rawFocus);
  if (parsedFocus.hadParseError) {
    skippedInvalidRecords++;
    corruptedKeys.push(LEGACY_STORAGE_KEYS.FOCUS_SESSIONS);
  }
  for (let i = 0; i < parsedFocus.items.length; i++) {
    const raw = parsedFocus.items[i];
    if (!raw || typeof raw !== 'object') {
      skippedInvalidRecords++;
      invalidRecords.push({
        collection: 'focusSessions',
        index: i,
        reason: 'رکورد جلسه تمرکز یک شیء معتبر نیست.',
        rawPreview: String(raw).slice(0, 120),
      });
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
    const endedAt = typeof item.endedAt === 'string' ? item.endedAt : new Date(ts).toISOString();
    const startedAt =
      typeof item.startedAt === 'string'
        ? item.startedAt
        : new Date(ts - durationMinutes * 60 * 1000).toISOString();
    const dateKey =
      typeof item.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.dateKey)
        ? item.dateKey
        : endedAt.slice(0, 10);

    focusEntitiesMap.set(id, {
      id,
      taskId: typeof item.taskId === 'string' ? item.taskId : null,
      taskTitle: typeof item.taskTitle === 'string' ? item.taskTitle : undefined,
      phase:
        item.phase === 'short_break' || item.phase === 'long_break' ? item.phase : 'work',
      plannedMinutes:
        typeof item.plannedMinutes === 'number' && item.plannedMinutes > 0
          ? item.plannedMinutes
          : durationMinutes,
      durationMinutes,
      dateKey,
      startedAt,
      endedAt,
      completedNaturally:
        typeof item.completedNaturally === 'boolean' ? item.completedNaturally : true,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : endedAt,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : endedAt,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && item.revision >= 1 ? Math.round(item.revision) : 1,
    });
  }

  const taskEntities = Array.from(taskEntitiesMap.values());
  const habitEntities = Array.from(habitEntitiesMap.values());
  const habitEntryEntities = Array.from(habitEntryEntitiesMap.values());
  const noteEntities = Array.from(noteEntitiesMap.values());
  const focusEntities = Array.from(focusEntitiesMap.values());

  const report: MigrationReport = {
    migratedAt: now,
    fromSchemaVersion: 1,
    toSchemaVersion: 2,
    status: hasAnyLegacyData ? 'migrated' : 'clean_first_run',
    counts: {
      tasks: taskEntities.length,
      habits: habitEntities.length,
      habitEntries: habitEntryEntities.length,
      notes: noteEntities.length,
      focusSessions: focusEntities.length,
    },
    skippedInvalidRecords,
    corruptedKeys,
    invalidRecords,
    verifiedCountsMatch: true,
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

      // Post-write count verification inside transaction before marking migration complete
      const [writtenTasks, writtenHabits, writtenNotes, writtenFocus] = await Promise.all([
        db.tasks.count(),
        db.habits.count(),
        db.notes.count(),
        db.focusSessions.count(),
      ]);

      if (
        writtenTasks < taskEntities.length ||
        writtenHabits < habitEntities.length ||
        writtenNotes < noteEntities.length ||
        writtenFocus < focusEntities.length
      ) {
        throw new Error(
          'عدم تطابق تعداد رکوردهای نوشته‌شده در IndexedDB پس از مهاجرت؛ تراکنش لغو شد.'
        );
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
        const next = await this.db.transaction('rw', this.db.tasks, async () => {
          const existing = await this.db.tasks.get(task.id);
          const now = nowIso();
          const nextRevision = Math.max(existing?.revision ?? 0, task.revision ?? 0) + 1;
          const record: TaskEntity = {
            ...existing,
            ...task,
            status: task.completed
              ? 'done'
              : task.status === 'done'
              ? 'todo'
              : task.status ?? existing?.status ?? 'todo',
            projectId: task.projectId !== undefined ? task.projectId : existing?.projectId ?? null,
            sourceId: task.sourceId !== undefined ? task.sourceId : existing?.sourceId ?? null,
            tags: task.tags !== undefined ? task.tags : existing?.tags ?? [],
            subtasks: task.subtasks !== undefined ? task.subtasks : existing?.subtasks ?? [],
            completedAt: task.completed
              ? task.completedAt ?? existing?.completedAt ?? now
              : null,
            createdAt: existing?.createdAt ?? task.createdAt ?? now,
            updatedAt: now,
            deletedAt: task.deletedAt !== undefined ? task.deletedAt : existing?.deletedAt ?? null,
            revision: nextRevision,
          };
          await this.db.tasks.put(record);
          return record;
        });
        notifyCrossTabSync('tasks.upsert');
        return next;
      },

      upsertTasksBatch: async (tasksToSave: TaskEntity[]): Promise<TaskEntity[]> => {
        const saved = await this.db.transaction('rw', this.db.tasks, async () => {
          const now = nowIso();
          const existingList = await this.db.tasks.bulkGet(tasksToSave.map((t) => t.id));
          const prepared: TaskEntity[] = tasksToSave.map((t, idx): TaskEntity => {
            const existing = existingList[idx];
            const nextRevision = Math.max(existing?.revision ?? 0, t.revision ?? 0) + 1;
            return {
              ...existing,
              ...t,
              status: t.completed
                ? 'done'
                : t.status === 'done'
                ? 'todo'
                : t.status ?? existing?.status ?? 'todo',
              projectId: t.projectId !== undefined ? t.projectId : existing?.projectId ?? null,
              sourceId: t.sourceId !== undefined ? t.sourceId : existing?.sourceId ?? null,
              tags: t.tags !== undefined ? t.tags : existing?.tags ?? [],
              subtasks: t.subtasks !== undefined ? t.subtasks : existing?.subtasks ?? [],
              completedAt: t.completed ? t.completedAt ?? existing?.completedAt ?? now : null,
              createdAt: existing?.createdAt ?? t.createdAt ?? now,
              updatedAt: now,
              deletedAt: t.deletedAt !== undefined ? t.deletedAt : existing?.deletedAt ?? null,
              revision: nextRevision,
            };
          });
          await this.db.tasks.bulkPut(prepared);
          return prepared;
        });
        notifyCrossTabSync('tasks.upsertBatch');
        return saved;
      },

      softDeleteTask: async (id: EntityId): Promise<void> => {
        await this.db.transaction('rw', this.db.tasks, async () => {
          const existing = await this.db.tasks.get(id);
          if (!existing) return;
          const now = nowIso();
          await this.db.tasks.put({
            ...existing,
            deletedAt: now,
            updatedAt: now,
            revision: (existing.revision || 0) + 1,
          });
        });
        notifyCrossTabSync('tasks.softDelete');
      },

      restoreTask: async (id: EntityId): Promise<TaskEntity | null> => {
        const restored = await this.db.transaction('rw', this.db.tasks, async () => {
          const existing = await this.db.tasks.get(id);
          if (!existing) return null;
          const now = nowIso();
          const record: TaskEntity = {
            ...existing,
            deletedAt: null,
            updatedAt: now,
            revision: (existing.revision || 0) + 1,
          };
          await this.db.tasks.put(record);
          return record;
        });
        notifyCrossTabSync('tasks.restore');
        return restored;
      },

      hardDeleteTask: async (id: EntityId): Promise<void> => {
        await this.db.tasks.delete(id);
        notifyCrossTabSync('tasks.hardDelete');
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
        const next = await this.db.transaction('rw', this.db.habits, async () => {
          const existing = await this.db.habits.get(habit.id);
          const now = nowIso();
          const nextRevision = Math.max(existing?.revision ?? 0, habit.revision ?? 0) + 1;
          const record: HabitEntity = {
            ...existing,
            ...habit,
            startDate: habit.startDate ?? existing?.startDate ?? now.slice(0, 10),
            createdAt: existing?.createdAt ?? habit.createdAt ?? now,
            updatedAt: now,
            deletedAt: habit.deletedAt !== undefined ? habit.deletedAt : existing?.deletedAt ?? null,
            revision: nextRevision,
          };
          await this.db.habits.put(record);
          return record;
        });
        notifyCrossTabSync('habits.upsert');
        return next;
      },

      toggleHabitDate: async (
        habitId: EntityId,
        dateKey: LocalDateKey
      ): Promise<HabitEntity | null> => {
        const updated = await this.db.transaction(
          'rw',
          [this.db.habits, this.db.habitEntries],
          async () => {
            const habit = await this.db.habits.get(habitId);
            if (!habit) return null;
            const now = nowIso();
            const entryId = `he_${habitId}_${dateKey}`;
            const existingEntry = await this.db.habitEntries.get(entryId);
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
              createdAt: existingEntry?.createdAt ?? now,
              updatedAt: now,
              deletedAt: nextCompleted ? null : now,
              revision: (existingEntry?.revision ?? 0) + 1,
            });

            return updatedHabit;
          }
        );
        notifyCrossTabSync('habits.toggleDate');
        return updated;
      },

      listHabitEntries: async (habitId?: EntityId): Promise<HabitEntryEntity[]> => {
        const all = habitId
          ? await this.db.habitEntries.where('habitId').equals(habitId).toArray()
          : await this.db.habitEntries.toArray();
        return all.filter((e) => !e.deletedAt && e.completed);
      },

      softDeleteHabit: async (id: EntityId): Promise<void> => {
        await this.db.transaction('rw', this.db.habits, async () => {
          const existing = await this.db.habits.get(id);
          if (!existing) return;
          const now = nowIso();
          await this.db.habits.put({
            ...existing,
            deletedAt: now,
            updatedAt: now,
            revision: (existing.revision || 0) + 1,
          });
        });
        notifyCrossTabSync('habits.softDelete');
      },

      restoreHabit: async (id: EntityId): Promise<HabitEntity | null> => {
        const restored = await this.db.transaction('rw', this.db.habits, async () => {
          const existing = await this.db.habits.get(id);
          if (!existing) return null;
          const now = nowIso();
          const record: HabitEntity = {
            ...existing,
            deletedAt: null,
            updatedAt: now,
            revision: (existing.revision || 0) + 1,
          };
          await this.db.habits.put(record);
          return record;
        });
        notifyCrossTabSync('habits.restore');
        return restored;
      },

      hardDeleteHabit: async (id: EntityId): Promise<void> => {
        await this.db.transaction('rw', [this.db.habits, this.db.habitEntries], async () => {
          await this.db.habits.delete(id);
          await this.db.habitEntries.where('habitId').equals(id).delete();
        });
        notifyCrossTabSync('habits.hardDelete');
      },
    };

    this.notes = {
      listNotes: async (kind?: NoteKind, includeDeleted = false): Promise<NoteEntity[]> => {
        const all = await this.db.notes.toArray();
        return all
          .filter((n) => {
            if (!includeDeleted && n.deletedAt) return false;
            if (kind && n.kind !== kind) return false;
            return true;
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      },

      upsertNote: async (note: NoteEntity): Promise<NoteEntity> => {
        const next = await this.db.transaction('rw', this.db.notes, async () => {
          const existing = await this.db.notes.get(note.id);
          const now = nowIso();
          const nextRevision = Math.max(existing?.revision ?? 0, note.revision ?? 0) + 1;
          const record: NoteEntity = {
            ...existing,
            ...note,
            tags: note.tags !== undefined ? note.tags : existing?.tags ?? [],
            linkedTaskId:
              note.linkedTaskId !== undefined ? note.linkedTaskId : existing?.linkedTaskId ?? null,
            displayDateLabel: note.displayDateLabel ?? existing?.displayDateLabel,
            createdAt: existing?.createdAt ?? note.createdAt ?? now,
            updatedAt: now,
            deletedAt: note.deletedAt !== undefined ? note.deletedAt : existing?.deletedAt ?? null,
            revision: nextRevision,
          };
          await this.db.notes.put(record);
          return record;
        });
        notifyCrossTabSync('notes.upsert');
        return next;
      },

      softDeleteNote: async (id: EntityId): Promise<void> => {
        await this.db.transaction('rw', this.db.notes, async () => {
          const existing = await this.db.notes.get(id);
          if (!existing) return;
          const now = nowIso();
          await this.db.notes.put({
            ...existing,
            deletedAt: now,
            updatedAt: now,
            revision: (existing.revision || 0) + 1,
          });
        });
        notifyCrossTabSync('notes.softDelete');
      },

      restoreNote: async (id: EntityId): Promise<NoteEntity | null> => {
        const restored = await this.db.transaction('rw', this.db.notes, async () => {
          const existing = await this.db.notes.get(id);
          if (!existing) return null;
          const now = nowIso();
          const record: NoteEntity = {
            ...existing,
            deletedAt: null,
            updatedAt: now,
            revision: (existing.revision || 0) + 1,
          };
          await this.db.notes.put(record);
          return record;
        });
        notifyCrossTabSync('notes.restore');
        return restored;
      },

      hardDeleteNote: async (id: EntityId): Promise<void> => {
        await this.db.notes.delete(id);
        notifyCrossTabSync('notes.hardDelete');
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
        const next = await this.db.transaction('rw', this.db.focusSessions, async () => {
          const existing = await this.db.focusSessions.get(session.id);
          const now = nowIso();
          const nextRevision = Math.max(existing?.revision ?? 0, session.revision ?? 0) + 1;
          const record: FocusSessionEntity = {
            ...existing,
            ...session,
            createdAt: existing?.createdAt ?? session.createdAt ?? now,
            updatedAt: now,
            deletedAt: null,
            revision: nextRevision,
          };
          await this.db.focusSessions.put(record);
          return record;
        });
        notifyCrossTabSync('focus.logSession');
        return next;
      },

      getActiveTimerState: async (): Promise<ActiveTimerState | null> => {
        const row = await this.db.kvState.get('active_timer_state');
        return (row?.value as ActiveTimerState) ?? null;
      },

      saveActiveTimerState: async (state: ActiveTimerState | null): Promise<void> => {
        if (!state) {
          await this.db.kvState.delete('active_timer_state');
        } else {
          await this.db.kvState.put({
            key: 'active_timer_state',
            value: state,
            updatedAt: nowIso(),
          });
        }
        notifyCrossTabSync('focus.saveActiveTimer');
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
        notifyCrossTabSync('settings.save');
        return updated;
      },
    };

    this.backup = {
      exportBackup: async (): Promise<BackupEnvelopeV2> => {
        // Consistent snapshot read inside a single read-only transaction
        const payload = await this.db.transaction(
          'r',
          [
            this.db.tasks,
            this.db.habits,
            this.db.habitEntries,
            this.db.notes,
            this.db.focusSessions,
            this.db.settings,
          ],
          async () => {
            const [tasks, habits, habitEntries, notes, focusSessions, settings] = await Promise.all(
              [
                this.db.tasks.toArray(),
                this.db.habits.toArray(),
                this.db.habitEntries.toArray(),
                this.db.notes.toArray(),
                this.db.focusSessions.toArray(),
                this.db.settings.get('default'),
              ]
            );
            return {
              tasks,
              habits,
              habitEntries,
              notes,
              focusSessions,
              settings,
            };
          }
        );

        return {
          appId: 'kairos',
          app: 'Kairos',
          formatVersion: 2,
          schemaVersion: 2,
          exportedAt: nowIso(),
          platform: 'web',
          encrypted: false,
          checksum: computeBackupChecksum(payload),
          payload,
        };
      },

      validateBackupJson: async (rawJson: string): Promise<BackupValidationResult> => {
        const preview = validateAndPreviewBackupPayload(rawJson, { verifyChecksum: true });
        return {
          valid: preview.valid,
          errors: preview.errors,
          envelope: preview.envelope,
          encrypted: preview.encrypted,
          migratedFromLegacy: preview.migratedFromLegacy,
        };
      },

      restoreBackup: async (
        envelope: BackupEnvelopeV2,
        strategy: 'replace' | 'merge'
      ): Promise<{ restoredCounts: Record<string, number>; snapshotKey: string }> => {
        // 1. Strict validation of incoming envelope before touching any data
        const validation = validateBackupEnvelopeObject(envelope, { verifyChecksum: true });
        if (!validation.valid || !validation.envelope) {
          throw new Error(
            validation.errors.join(' | ') ||
              validation.error ||
              'ساختار داده‌های فایل پشتیبان نامعتبر است و عملیات بازیابی لغو شد.'
          );
        }

        const validatedPayload = validation.envelope.payload;

        // 2. Mandatory pre-restore snapshot creation & read-back verification
        let preRestoreSnapshot: BackupEnvelopeV2;
        try {
          preRestoreSnapshot = await this.backup.exportBackup();
          const snapNow = nowIso();
          await this.db.kvState.put({
            key: PRE_RESTORE_SNAPSHOT_KEY,
            value: preRestoreSnapshot,
            updatedAt: snapNow,
          });
          const verifiedRow = await this.db.kvState.get(PRE_RESTORE_SNAPSHOT_KEY);
          const verifiedEnvelope = verifiedRow?.value as BackupEnvelopeV2 | undefined;
          if (
            !verifiedEnvelope ||
            verifiedEnvelope.checksum !== preRestoreSnapshot.checksum ||
            !Array.isArray(verifiedEnvelope.payload?.tasks)
          ) {
            throw new Error('عدم تطابق اسنپ‌شات بازخوانی‌شده با داده‌های فعلی.');
          }
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              window.localStorage.setItem(
                'kairos_pre_restore_snapshot_v1',
                JSON.stringify(preRestoreSnapshot)
              );
            } catch {
              // Secondary localStorage mirror is optional if quota is full; IndexedDB kvState is authoritative
            }
          }
        } catch (err: any) {
          throw new Error(
            `خطا در ایجاد و تأیید اسنپ‌شات امنیتی پیش از بازیابی (${
              err?.message || 'خطای ذخیره‌سازی'
            })؛ عملیات بازیابی برای حفاظت از داده‌های فعلی متوقف شد.`
          );
        }

        // 3. Atomic transactional restore ('replace' or 'merge') with post-write verification
        const finalCounts = await this.db.transaction(
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
            const { tasks, habits, habitEntries, notes, focusSessions, settings } =
              validatedPayload;

            if (strategy === 'replace') {
              await Promise.all([
                this.db.tasks.clear(),
                this.db.habits.clear(),
                this.db.habitEntries.clear(),
                this.db.notes.clear(),
                this.db.focusSessions.clear(),
              ]);

              if (tasks.length > 0) await this.db.tasks.bulkPut(tasks);
              if (habits.length > 0) await this.db.habits.bulkPut(habits);
              if (habitEntries.length > 0) await this.db.habitEntries.bulkPut(habitEntries);
              if (notes.length > 0) await this.db.notes.bulkPut(notes);
              if (focusSessions.length > 0) await this.db.focusSessions.bulkPut(focusSessions);
              if (settings) await this.db.settings.put({ ...settings, id: 'default' });

              const [wTasks, wHabits, wEntries, wNotes, wFocus] = await Promise.all([
                this.db.tasks.count(),
                this.db.habits.count(),
                this.db.habitEntries.count(),
                this.db.notes.count(),
                this.db.focusSessions.count(),
              ]);

              if (
                wTasks !== tasks.length ||
                wHabits !== habits.length ||
                wEntries !== habitEntries.length ||
                wNotes !== notes.length ||
                wFocus !== focusSessions.length
              ) {
                throw new Error(
                  'عدم تطابق تعداد رکوردهای ذخیره‌شده در تراکنش بازیابی؛ عملیات به حالت اول بازگردانده شد.'
                );
              }

              return {
                tasks: wTasks,
                habits: wHabits,
                habitEntries: wEntries,
                notes: wNotes,
                focusSessions: wFocus,
              };
            } else {
              // Merge strategy: preserve existing records and merge by ID (newer revision/updatedAt wins)
              const [curTasks, curHabits, curEntries, curNotes, curFocus] = await Promise.all([
                this.db.tasks.toArray(),
                this.db.habits.toArray(),
                this.db.habitEntries.toArray(),
                this.db.notes.toArray(),
                this.db.focusSessions.toArray(),
              ]);

              const mergeEntityMap = <
                T extends { id: string; revision: number; updatedAt: string }
              >(
                existingList: T[],
                incomingList: T[],
                customMerge?: (existing: T, incoming: T) => T
              ): T[] => {
                const map = new Map<string, T>();
                for (const item of existingList) {
                  map.set(item.id, item);
                }
                for (const inc of incomingList) {
                  const ex = map.get(inc.id);
                  if (!ex) {
                    map.set(inc.id, inc);
                  } else if (customMerge) {
                    map.set(inc.id, customMerge(ex, inc));
                  } else {
                    const incWins =
                      (inc.revision || 1) > (ex.revision || 1) ||
                      ((inc.revision || 1) === (ex.revision || 1) &&
                        inc.updatedAt >= ex.updatedAt);
                    const winner = incWins ? inc : ex;
                    map.set(inc.id, {
                      ...winner,
                      revision: Math.max(ex.revision || 1, inc.revision || 1) + 1,
                    });
                  }
                }
                return Array.from(map.values());
              };

              const mergedTasks = mergeEntityMap(curTasks, tasks);
              const mergedHabits = mergeEntityMap(curHabits, habits, (ex, inc) => {
                const incWins =
                  (inc.revision || 1) > (ex.revision || 1) ||
                  ((inc.revision || 1) === (ex.revision || 1) && inc.updatedAt >= ex.updatedAt);
                const base = incWins ? inc : ex;
                return {
                  ...base,
                  completedDates: {
                    ...(ex.completedDates || {}),
                    ...(inc.completedDates || {}),
                  },
                  revision: Math.max(ex.revision || 1, inc.revision || 1) + 1,
                };
              });
              const mergedEntries = mergeEntityMap(curEntries, habitEntries);
              const mergedNotes = mergeEntityMap(curNotes, notes);
              const mergedFocus = mergeEntityMap(curFocus, focusSessions);

              if (mergedTasks.length > 0) await this.db.tasks.bulkPut(mergedTasks);
              if (mergedHabits.length > 0) await this.db.habits.bulkPut(mergedHabits);
              if (mergedEntries.length > 0) await this.db.habitEntries.bulkPut(mergedEntries);
              if (mergedNotes.length > 0) await this.db.notes.bulkPut(mergedNotes);
              if (mergedFocus.length > 0) await this.db.focusSessions.bulkPut(mergedFocus);
              if (settings) await this.db.settings.put({ ...settings, id: 'default' });

              return {
                tasks: mergedTasks.length,
                habits: mergedHabits.length,
                habitEntries: mergedEntries.length,
                notes: mergedNotes.length,
                focusSessions: mergedFocus.length,
              };
            }
          }
        );

        notifyCrossTabSync('backup.restore');

        return {
          restoredCounts: finalCounts,
          snapshotKey: PRE_RESTORE_SNAPSHOT_KEY,
        };
      },

      hasPreRestoreSnapshot: async (): Promise<{ exists: boolean; createdAt?: string }> => {
        const row = await this.db.kvState.get(PRE_RESTORE_SNAPSHOT_KEY);
        if (!row || !row.value) return { exists: false };
        return { exists: true, createdAt: row.updatedAt };
      },

      rollbackLastRestore: async (): Promise<{ restoredCounts: Record<string, number> }> => {
        const row = await this.db.kvState.get(PRE_RESTORE_SNAPSHOT_KEY);
        if (!row || !row.value) {
          throw new Error('اسنپ‌شات پیش از بازیابی یافت نشد.');
        }

        const snapshotEnvelope = row.value as BackupEnvelopeV2;
        const validation = validateBackupEnvelopeObject(snapshotEnvelope, {
          verifyChecksum: true,
        });
        if (!validation.valid || !validation.envelope) {
          throw new Error('اسنپ‌شات ذخیره شده نامعتبر یا آسیب‌دیده است.');
        }

        const { tasks, habits, habitEntries, notes, focusSessions, settings } =
          validation.envelope.payload;

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
            await Promise.all([
              this.db.tasks.clear(),
              this.db.habits.clear(),
              this.db.habitEntries.clear(),
              this.db.notes.clear(),
              this.db.focusSessions.clear(),
            ]);

            if (tasks.length > 0) await this.db.tasks.bulkPut(tasks);
            if (habits.length > 0) await this.db.habits.bulkPut(habits);
            if (habitEntries.length > 0) await this.db.habitEntries.bulkPut(habitEntries);
            if (notes.length > 0) await this.db.notes.bulkPut(notes);
            if (focusSessions.length > 0) await this.db.focusSessions.bulkPut(focusSessions);
            if (settings) await this.db.settings.put({ ...settings, id: 'default' });
          }
        );

        notifyCrossTabSync('backup.rollback');

        return {
          restoredCounts: {
            tasks: tasks.length,
            habits: habits.length,
            habitEntries: habitEntries.length,
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
