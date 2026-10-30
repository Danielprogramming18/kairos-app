import {
  BackupEnvelopeV2,
  BackupPayloadV2,
  FocusSessionEntity,
  HabitCategoryId,
  HabitEntity,
  HabitEntryEntity,
  NoteEntity,
  nowIso,
  TaskEntity,
  UserSettingsEntity,
} from '../domain/models';
import {
  Habit,
  Task,
  Idea,
  IdeaCategory,
  FocusSession,
  UsefulInfoCategory,
  UsefulInfoItem,
} from '../types';

export type KairosPlainBackupEnvelope = BackupEnvelopeV2;

export interface KairosEncryptedBackupEnvelope {
  appId: 'kairos';
  app: 'Kairos';
  formatVersion: 2;
  schemaVersion: 2;
  exportedAt: string;
  encrypted: true;
  kdf: {
    algorithm: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    saltBase64: string;
  };
  cipher: {
    algorithm: 'AES-GCM';
    ivBase64: string;
    ciphertextBase64: string;
  };
}

export interface LegacyBackupDataInput {
  habits: Habit[];
  tasks: Task[];
  ideas: Idea[];
  focusSessions: FocusSession[];
  usefulInfos: UsefulInfoItem[];
}

export interface BackupPreviewCounts {
  tasks: number;
  activeTasks: number;
  trashedItems: number;
  habits: number;
  habitEntries: number;
  notes: number;
  ideas: number;
  usefulInfos: number;
  focusSessions: number;
  hasSettings: boolean;
}

export interface BackupPreviewSummary {
  valid: boolean;
  encrypted: boolean;
  error?: string;
  errors: string[];
  schemaVersion?: number;
  formatVersion?: number | string;
  migratedFromLegacy?: boolean;
  exportedAt?: string;
  checksum?: string;
  counts?: BackupPreviewCounts;
  envelope?: BackupEnvelopeV2;
  data?: {
    habits: Habit[];
    tasks: Task[];
    ideas: Idea[];
    focusSessions: FocusSession[];
    usefulInfos: UsefulInfoItem[];
  };
}

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // 10 MB safety limit
export const PBKDF2_ITERATIONS = 100_000;

const VALID_HABIT_CATEGORIES = new Set<string>([
  'health',
  'learning',
  'work',
  'mindfulness',
  'finance',
]);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesGcmKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yStr, mStr, dStr] = value.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (!Number.isInteger(year) || year < 1970 || year > 2100) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  // Require ISO-like date/time structure and valid Date.parse
  if (!/^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(value.trim())) return false;
  const ms = Date.parse(value);
  return !Number.isNaN(ms) && Number.isFinite(ms);
}

/**
 * Deterministic checksum computation for canonical BackupPayloadV2.
 */
export function computeBackupChecksum(payload: BackupPayloadV2): string {
  const normalized = {
    tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
    habits: Array.isArray(payload.habits) ? payload.habits : [],
    habitEntries: Array.isArray(payload.habitEntries) ? payload.habitEntries : [],
    notes: Array.isArray(payload.notes) ? payload.notes : [],
    focusSessions: Array.isArray(payload.focusSessions) ? payload.focusSessions : [],
    settings: payload.settings ?? undefined,
  };
  const str = JSON.stringify(normalized);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a_${(hash >>> 0).toString(16)}_${str.length}`;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val && typeof val === 'object' && !Array.isArray(val));
}

function payloadToUiData(payload: BackupPayloadV2): {
  habits: Habit[];
  tasks: Task[];
  ideas: Idea[];
  focusSessions: FocusSession[];
  usefulInfos: UsefulInfoItem[];
} {
  const activeTasks: Task[] = payload.tasks
    .filter((t) => !t.deletedAt)
    .map((entity) => ({
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
    }));

  const activeHabits: Habit[] = payload.habits
    .filter((h) => !h.deletedAt)
    .map((entity) => ({
      id: entity.id,
      title: entity.title,
      category: entity.category,
      weeklyGoal: entity.weeklyGoal,
      emoji: entity.emoji,
      color: entity.color,
      frequencyType: entity.frequencyType,
      targetDaysOfWeek: Array.isArray(entity.targetDaysOfWeek)
        ? [...entity.targetDaysOfWeek]
        : undefined,
      startDate: entity.startDate ?? entity.createdAt.slice(0, 10),
      archived: entity.archived,
      completedDates: { ...(entity.completedDates || {}) },
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt ?? null,
      revision: entity.revision,
    }));

  const ideas: Idea[] = payload.notes
    .filter((n) => !n.deletedAt && n.kind === 'idea')
    .map((entity) => ({
      id: entity.id,
      title: entity.title,
      note: entity.content || undefined,
      category: (entity.category as IdeaCategory) || 'project',
      tags: Array.isArray(entity.tags) ? [...entity.tags] : [],
      linkedTaskId: entity.linkedTaskId ?? null,
      createdAt: entity.displayDateLabel || entity.createdAt.slice(0, 10),
      createdAtIso: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt ?? null,
      revision: entity.revision,
    }));

  const usefulInfos: UsefulInfoItem[] = payload.notes
    .filter((n) => !n.deletedAt && n.kind === 'useful_info')
    .map((entity) => ({
      id: entity.id,
      title: entity.title,
      content: entity.content,
      category: (entity.category as UsefulInfoCategory) || 'work',
      pinned: entity.pinned,
      tags: Array.isArray(entity.tags) ? [...entity.tags] : [],
      createdAt: entity.displayDateLabel || entity.createdAt.slice(0, 10),
      createdAtIso: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt ?? null,
      revision: entity.revision,
    }));

  const focusSessions: FocusSession[] = payload.focusSessions
    .filter((s) => !s.deletedAt)
    .map((entity) => ({
      id: entity.id,
      taskId: entity.taskId ?? undefined,
      taskTitle: entity.taskTitle,
      phase: entity.phase,
      plannedMinutes: entity.plannedMinutes,
      durationMinutes: entity.durationMinutes,
      dateKey: entity.dateKey,
      timestamp: Date.parse(entity.endedAt) || Date.now(),
      startedAt: entity.startedAt,
      endedAt: entity.endedAt,
      completedNaturally: entity.completedNaturally,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt ?? null,
      revision: entity.revision,
    }));

  return {
    habits: activeHabits,
    tasks: activeTasks,
    ideas,
    focusSessions,
    usefulInfos,
  };
}

/**
 * Explicitly migrates a validated legacy v1 data structure into canonical BackupPayloadV2.
 */
export function migrateLegacyBackupDataToV2Payload(
  rawLegacy: Record<string, unknown>,
  exportedAtFallback?: string
): { valid: boolean; errors: string[]; payload?: BackupPayloadV2 } {
  const errors: string[] = [];
  const now = exportedAtFallback && isValidIsoTimestamp(exportedAtFallback) ? exportedAtFallback : nowIso();

  if (!Array.isArray(rawLegacy.tasks)) {
    errors.push('فایل پشتیبان قدیمی فاقد آرایهٔ tasks معتبر است.');
  }
  if (!Array.isArray(rawLegacy.habits)) {
    errors.push('فایل پشتیبان قدیمی فاقد آرایهٔ habits معتبر است.');
  }
  if (rawLegacy.ideas !== undefined && !Array.isArray(rawLegacy.ideas)) {
    errors.push('فیلد ideas در فایل پشتیبان باید آرایه باشد.');
  }
  if (rawLegacy.usefulInfos !== undefined && !Array.isArray(rawLegacy.usefulInfos)) {
    errors.push('فیلد usefulInfos در فایل پشتیبان باید آرایه باشد.');
  }
  if (rawLegacy.focusSessions !== undefined && !Array.isArray(rawLegacy.focusSessions)) {
    errors.push('فیلد focusSessions در فایل پشتیبان باید آرایه باشد.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const tasksInput = rawLegacy.tasks as unknown[];
  const habitsInput = rawLegacy.habits as unknown[];
  const ideasInput = Array.isArray(rawLegacy.ideas) ? (rawLegacy.ideas as unknown[]) : [];
  const usefulInput = Array.isArray(rawLegacy.usefulInfos) ? (rawLegacy.usefulInfos as unknown[]) : [];
  const focusInput = Array.isArray(rawLegacy.focusSessions) ? (rawLegacy.focusSessions as unknown[]) : [];

  const convertedTasks: TaskEntity[] = [];
  const seenTaskIds = new Set<string>();

  for (let i = 0; i < tasksInput.length; i++) {
    const raw = tasksInput[i];
    if (!isPlainObject(raw)) {
      errors.push(`رکورد مأموریت (tasks[${i}]) یک شیء معتبر نیست.`);
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!id) {
      errors.push(`رکورد مأموریت (tasks[${i}]) فاقد شناسه (id) معتبر است.`);
      continue;
    }
    if (seenTaskIds.has(id)) {
      errors.push(`شناسهٔ تکراری مأموریت (${id}) در tasks[${i}] یافت شد.`);
      continue;
    }
    seenTaskIds.add(id);

    if (!title) {
      errors.push(`رکورد مأموریت (${id}) در tasks[${i}] فاقد عنوان (title) معتبر است.`);
      continue;
    }

    const duration = raw.duration !== undefined ? Number(raw.duration) : 45;
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push(`مدت‌زمان (duration) مأموریت (${id}) در tasks[${i}] باید عددی مثبت باشد.`);
      continue;
    }

    const priority = raw.priority !== undefined ? Number(raw.priority) : 1;
    if (!Number.isFinite(priority) || priority < 1) {
      errors.push(`اولویت (priority) مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    const targetDate = raw.targetDate !== undefined ? raw.targetDate : now.slice(0, 10);
    if (!isValidDateKey(targetDate)) {
      errors.push(`تاریخ هدف (targetDate) مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    if (raw.completedAt !== undefined && raw.completedAt !== null && !isValidIsoTimestamp(raw.completedAt)) {
      errors.push(`زمان تکمیل (completedAt) مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    const createdAt =
      raw.createdAt !== undefined && raw.createdAt !== null
        ? isValidIsoTimestamp(raw.createdAt)
          ? raw.createdAt
          : null
        : now;
    if (!createdAt) {
      errors.push(`زمان ایجاد (createdAt) مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    const updatedAt =
      raw.updatedAt !== undefined && raw.updatedAt !== null
        ? isValidIsoTimestamp(raw.updatedAt)
          ? raw.updatedAt
          : null
        : createdAt;
    if (!updatedAt) {
      errors.push(`زمان بروزرسانی (updatedAt) مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    const completed = Boolean(raw.completed);
    convertedTasks.push({
      id,
      title,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      status: completed ? 'done' : 'todo',
      completed,
      priority: Math.round(priority),
      duration: Math.round(duration),
      targetDate,
      dueAt: typeof raw.dueAt === 'string' && isValidIsoTimestamp(raw.dueAt) ? raw.dueAt : null,
      reminderTime: typeof raw.reminderTime === 'string' ? raw.reminderTime : null,
      reminded: Boolean(raw.reminded),
      projectId: typeof raw.projectId === 'string' ? raw.projectId : null,
      sourceId: typeof raw.sourceId === 'string' ? raw.sourceId : null,
      category: typeof raw.category === 'string' && raw.category.trim() ? raw.category : 'work',
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      subtasks: Array.isArray(raw.subtasks)
        ? raw.subtasks
            .filter(isPlainObject)
            .map((s) => ({
              id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `${id}_sub`,
              title: String(s.title ?? ''),
              completed: Boolean(s.completed),
            }))
        : [],
      completedAt:
        typeof raw.completedAt === 'string'
          ? raw.completedAt
          : completed
          ? updatedAt
          : null,
      createdAt,
      updatedAt,
      deletedAt:
        typeof raw.deletedAt === 'string' && isValidIsoTimestamp(raw.deletedAt)
          ? raw.deletedAt
          : null,
      revision: typeof raw.revision === 'number' && raw.revision >= 1 ? Math.round(raw.revision) : 1,
    });
  }

  const convertedHabits: HabitEntity[] = [];
  const convertedHabitEntries: HabitEntryEntity[] = [];
  const seenHabitIds = new Set<string>();

  for (let i = 0; i < habitsInput.length; i++) {
    const raw = habitsInput[i];
    if (!isPlainObject(raw)) {
      errors.push(`رکورد عادت (habits[${i}]) یک شیء معتبر نیست.`);
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!id) {
      errors.push(`رکورد عادت (habits[${i}]) فاقد شناسه (id) معتبر است.`);
      continue;
    }
    if (seenHabitIds.has(id)) {
      errors.push(`شناسهٔ تکراری عادت (${id}) در habits[${i}] یافت شد.`);
      continue;
    }
    seenHabitIds.add(id);

    if (!title) {
      errors.push(`رکورد عادت (${id}) در habits[${i}] فاقد عنوان (title) معتبر است.`);
      continue;
    }

    const weeklyGoal = raw.weeklyGoal !== undefined ? Number(raw.weeklyGoal) : 7;
    if (!Number.isFinite(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 7) {
      errors.push(`هدف هفتگی (weeklyGoal) عادت (${id}) در habits[${i}] باید بین ۱ تا ۷ باشد.`);
      continue;
    }

    const completedDates: Record<string, boolean> = {};
    if (raw.completedDates !== undefined && raw.completedDates !== null) {
      if (!isPlainObject(raw.completedDates)) {
        errors.push(`فیلد completedDates در عادت (${id}) معتبر نیست.`);
        continue;
      }
      for (const [dateKey, doneVal] of Object.entries(raw.completedDates)) {
        if (!isValidDateKey(dateKey)) {
          errors.push(`کلید تاریخ نامعتبر (${dateKey}) در completedDates عادت (${id}) یافت شد.`);
          continue;
        }
        if (Boolean(doneVal)) {
          completedDates[dateKey] = true;
          convertedHabitEntries.push({
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

    const startDate =
      typeof raw.startDate === 'string' ? raw.startDate : now.slice(0, 10);
    if (!isValidDateKey(startDate)) {
      errors.push(`تاریخ شروع (startDate) عادت (${id}) در habits[${i}] نامعتبر است.`);
      continue;
    }

    const categoryRaw = typeof raw.category === 'string' ? raw.category : 'health';
    const category = (
      VALID_HABIT_CATEGORIES.has(categoryRaw) ? categoryRaw : 'health'
    ) as HabitCategoryId;

    convertedHabits.push({
      id,
      title,
      category,
      emoji: typeof raw.emoji === 'string' && raw.emoji.trim() ? raw.emoji : '✨',
      color: typeof raw.color === 'string' && raw.color.trim() ? raw.color : '#6366f1',
      frequencyType:
        raw.frequencyType === 'weekly_target' || raw.frequencyType === 'custom_days'
          ? raw.frequencyType
          : 'daily',
      weeklyGoal: Math.round(weeklyGoal),
      targetDaysOfWeek: Array.isArray(raw.targetDaysOfWeek)
        ? raw.targetDaysOfWeek.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : undefined,
      startDate,
      archived: Boolean(raw.archived),
      completedDates,
      createdAt:
        typeof raw.createdAt === 'string' && isValidIsoTimestamp(raw.createdAt)
          ? raw.createdAt
          : now,
      updatedAt:
        typeof raw.updatedAt === 'string' && isValidIsoTimestamp(raw.updatedAt)
          ? raw.updatedAt
          : now,
      deletedAt:
        typeof raw.deletedAt === 'string' && isValidIsoTimestamp(raw.deletedAt)
          ? raw.deletedAt
          : null,
      revision: typeof raw.revision === 'number' && raw.revision >= 1 ? Math.round(raw.revision) : 1,
    });
  }

  const convertedNotes: NoteEntity[] = [];
  const seenNoteIds = new Set<string>();

  for (let i = 0; i < ideasInput.length; i++) {
    const raw = ideasInput[i];
    if (!isPlainObject(raw)) {
      errors.push(`رکورد ایده (ideas[${i}]) یک شیء معتبر نیست.`);
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!id || !title) {
      errors.push(`رکورد ایده (ideas[${i}]) فاقد شناسه یا عنوان معتبر است.`);
      continue;
    }
    if (seenNoteIds.has(id)) {
      errors.push(`شناسهٔ تکراری یادداشت/ایده (${id}) در ideas[${i}] یافت شد.`);
      continue;
    }
    seenNoteIds.add(id);

    if (raw.createdAtIso !== undefined && !isValidIsoTimestamp(raw.createdAtIso)) {
      errors.push(`زمان ایجاد (createdAtIso) ایده (${id}) در ideas[${i}] نامعتبر است.`);
      continue;
    }

    const createdAtIso =
      typeof raw.createdAtIso === 'string' && isValidIsoTimestamp(raw.createdAtIso)
        ? raw.createdAtIso
        : typeof raw.createdAt === 'string' && isValidIsoTimestamp(raw.createdAt)
        ? raw.createdAt
        : now;

    convertedNotes.push({
      id,
      kind: 'idea',
      title,
      content: typeof raw.note === 'string' ? raw.note : '',
      category: typeof raw.category === 'string' && raw.category.trim() ? raw.category : 'project',
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      pinned: false,
      linkedTaskId: typeof raw.linkedTaskId === 'string' ? raw.linkedTaskId : null,
      displayDateLabel: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
      createdAt: createdAtIso,
      updatedAt:
        typeof raw.updatedAt === 'string' && isValidIsoTimestamp(raw.updatedAt)
          ? raw.updatedAt
          : createdAtIso,
      deletedAt:
        typeof raw.deletedAt === 'string' && isValidIsoTimestamp(raw.deletedAt)
          ? raw.deletedAt
          : null,
      revision: typeof raw.revision === 'number' && raw.revision >= 1 ? Math.round(raw.revision) : 1,
    });
  }

  for (let i = 0; i < usefulInput.length; i++) {
    const raw = usefulInput[i];
    if (!isPlainObject(raw)) {
      errors.push(`رکورد یادداشت مرجع (usefulInfos[${i}]) یک شیء معتبر نیست.`);
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!id || !title || typeof raw.content !== 'string') {
      errors.push(`رکورد یادداشت مرجع (usefulInfos[${i}]) فاقد شناسه، عنوان یا محتوای معتبر است.`);
      continue;
    }
    if (seenNoteIds.has(id)) {
      errors.push(`شناسهٔ تکراری یادداشت/مرجع (${id}) در usefulInfos[${i}] یافت شد.`);
      continue;
    }
    seenNoteIds.add(id);

    const createdAtIso =
      typeof raw.createdAtIso === 'string' && isValidIsoTimestamp(raw.createdAtIso)
        ? raw.createdAtIso
        : typeof raw.createdAt === 'string' && isValidIsoTimestamp(raw.createdAt)
        ? raw.createdAt
        : now;

    convertedNotes.push({
      id,
      kind: 'useful_info',
      title,
      content: raw.content,
      category: typeof raw.category === 'string' && raw.category.trim() ? raw.category : 'work',
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      pinned: Boolean(raw.pinned),
      linkedTaskId: null,
      displayDateLabel: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
      createdAt: createdAtIso,
      updatedAt:
        typeof raw.updatedAt === 'string' && isValidIsoTimestamp(raw.updatedAt)
          ? raw.updatedAt
          : createdAtIso,
      deletedAt:
        typeof raw.deletedAt === 'string' && isValidIsoTimestamp(raw.deletedAt)
          ? raw.deletedAt
          : null,
      revision: typeof raw.revision === 'number' && raw.revision >= 1 ? Math.round(raw.revision) : 1,
    });
  }

  const convertedFocus: FocusSessionEntity[] = [];
  const seenFocusIds = new Set<string>();

  for (let i = 0; i < focusInput.length; i++) {
    const raw = focusInput[i];
    if (!isPlainObject(raw)) {
      errors.push(`رکورد جلسه تمرکز (focusSessions[${i}]) یک شیء معتبر نیست.`);
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) {
      errors.push(`رکورد جلسه تمرکز (focusSessions[${i}]) فاقد شناسه معتبر است.`);
      continue;
    }
    if (seenFocusIds.has(id)) {
      errors.push(`شناسهٔ تکراری جلسه تمرکز (${id}) در focusSessions[${i}] یافت شد.`);
      continue;
    }
    seenFocusIds.add(id);

    const durationMinutes = Number(raw.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      errors.push(`مدت‌زمان (durationMinutes) جلسه تمرکز (${id}) در focusSessions[${i}] باید عددی مثبت باشد.`);
      continue;
    }

    const ts =
      raw.timestamp !== undefined ? Number(raw.timestamp) : Date.parse(now);
    if (!Number.isFinite(ts) || ts <= 0) {
      errors.push(`برچسب زمانی (timestamp) جلسه تمرکز (${id}) در focusSessions[${i}] نامعتبر است.`);
      continue;
    }

    const endedAt =
      typeof raw.endedAt === 'string'
        ? isValidIsoTimestamp(raw.endedAt)
          ? raw.endedAt
          : null
        : new Date(ts).toISOString();
    if (!endedAt) {
      errors.push(`زمان پایان (endedAt) جلسه تمرکز (${id}) در focusSessions[${i}] نامعتبر است.`);
      continue;
    }

    const startedAt =
      typeof raw.startedAt === 'string'
        ? isValidIsoTimestamp(raw.startedAt)
          ? raw.startedAt
          : null
        : new Date(ts - durationMinutes * 60 * 1000).toISOString();
    if (!startedAt) {
      errors.push(`زمان شروع (startedAt) جلسه تمرکز (${id}) در focusSessions[${i}] نامعتبر است.`);
      continue;
    }

    const dateKey =
      raw.dateKey !== undefined ? raw.dateKey : endedAt.slice(0, 10);
    if (!isValidDateKey(dateKey)) {
      errors.push(`کلید تاریخ (dateKey) جلسه تمرکز (${id}) در focusSessions[${i}] نامعتبر است.`);
      continue;
    }

    convertedFocus.push({
      id,
      taskId: typeof raw.taskId === 'string' ? raw.taskId : null,
      taskTitle: typeof raw.taskTitle === 'string' ? raw.taskTitle : undefined,
      phase:
        raw.phase === 'short_break' || raw.phase === 'long_break' ? raw.phase : 'work',
      plannedMinutes:
        typeof raw.plannedMinutes === 'number' && raw.plannedMinutes > 0
          ? Math.round(raw.plannedMinutes)
          : Math.round(durationMinutes),
      durationMinutes: Math.round(durationMinutes),
      dateKey,
      startedAt,
      endedAt,
      completedNaturally:
        typeof raw.completedNaturally === 'boolean' ? raw.completedNaturally : true,
      createdAt: endedAt,
      updatedAt: endedAt,
      deletedAt: null,
      revision: 1,
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    payload: {
      tasks: convertedTasks,
      habits: convertedHabits,
      habitEntries: convertedHabitEntries,
      notes: convertedNotes,
      focusSessions: convertedFocus,
    },
  };
}

/**
 * Validates a canonical V2 payload object strictly record-by-record.
 */
function validateCanonicalV2Payload(rawPayload: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  payload?: BackupPayloadV2;
} {
  const errors: string[] = [];

  if (!Array.isArray(rawPayload.tasks)) {
    errors.push('آرایهٔ tasks در فایل پشتیبان وجود ندارد یا نامعتبر است.');
  }
  if (!Array.isArray(rawPayload.habits)) {
    errors.push('آرایهٔ habits در فایل پشتیبان وجود ندارد یا نامعتبر است.');
  }
  if (!Array.isArray(rawPayload.notes)) {
    errors.push('آرایهٔ notes در فایل پشتیبان وجود ندارد یا نامعتبر است.');
  }
  if (!Array.isArray(rawPayload.focusSessions)) {
    errors.push('آرایهٔ focusSessions در فایل پشتیبان وجود ندارد یا نامعتبر است.');
  }
  if (rawPayload.habitEntries !== undefined && !Array.isArray(rawPayload.habitEntries)) {
    errors.push('فیلد habitEntries در فایل پشتیبان باید آرایه باشد.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const now = nowIso();
  const tasksRaw = rawPayload.tasks as unknown[];
  const habitsRaw = rawPayload.habits as unknown[];
  const habitEntriesRaw = Array.isArray(rawPayload.habitEntries)
    ? (rawPayload.habitEntries as unknown[])
    : [];
  const notesRaw = rawPayload.notes as unknown[];
  const focusRaw = rawPayload.focusSessions as unknown[];

  const tasks: TaskEntity[] = [];
  const seenTaskIds = new Set<string>();
  for (let i = 0; i < tasksRaw.length; i++) {
    const item = tasksRaw[i];
    if (!isPlainObject(item)) {
      errors.push(`رکورد مأموریت در tasks[${i}] یک شیء معتبر نیست (null یا غیرشیء).`);
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!id) {
      errors.push(`رکورد مأموریت در tasks[${i}] فاقد شناسه (id) معتبر است.`);
      continue;
    }
    if (seenTaskIds.has(id)) {
      errors.push(`شناسهٔ تکراری مأموریت (${id}) در tasks[${i}] یافت شد.`);
      continue;
    }
    seenTaskIds.add(id);

    if (!title) {
      errors.push(`رکورد مأموریت (${id}) در tasks[${i}] فاقد عنوان (title) معتبر است.`);
      continue;
    }

    const duration = Number(item.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push(`مدت‌زمان (duration) مأموریت (${id}) در tasks[${i}] باید عددی مثبت و بزرگ‌تر از صفر باشد.`);
      continue;
    }

    const priority = Number(item.priority);
    if (!Number.isFinite(priority) || priority < 1) {
      errors.push(`اولویت (priority) مأموریت (${id}) در tasks[${i}] باید حداقل ۱ باشد.`);
      continue;
    }

    if (!isValidDateKey(item.targetDate)) {
      errors.push(`تاریخ هدف (targetDate) مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    const createdAt = item.createdAt ?? now;
    const updatedAt = item.updatedAt ?? createdAt;
    if (!isValidIsoTimestamp(createdAt) || !isValidIsoTimestamp(updatedAt)) {
      errors.push(`برچسب زمانی createdAt/updatedAt مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    if (item.deletedAt !== undefined && item.deletedAt !== null && !isValidIsoTimestamp(item.deletedAt)) {
      errors.push(`برچسب زمانی deletedAt مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    if (item.completedAt !== undefined && item.completedAt !== null && !isValidIsoTimestamp(item.completedAt)) {
      errors.push(`برچسب زمانی completedAt مأموریت (${id}) در tasks[${i}] نامعتبر است.`);
      continue;
    }

    const completed = Boolean(item.completed);
    tasks.push({
      id,
      title,
      description: typeof item.description === 'string' ? item.description : undefined,
      status:
        item.status === 'todo' ||
        item.status === 'in_progress' ||
        item.status === 'done' ||
        item.status === 'archived'
          ? item.status
          : completed
          ? 'done'
          : 'todo',
      completed,
      priority: Math.round(priority),
      duration: Math.round(duration),
      targetDate: item.targetDate,
      dueAt: typeof item.dueAt === 'string' && isValidIsoTimestamp(item.dueAt) ? item.dueAt : null,
      reminderTime: typeof item.reminderTime === 'string' ? item.reminderTime : null,
      reminded: Boolean(item.reminded),
      projectId: typeof item.projectId === 'string' ? item.projectId : null,
      sourceId: typeof item.sourceId === 'string' ? item.sourceId : null,
      category: typeof item.category === 'string' && item.category.trim() ? item.category : 'work',
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      subtasks: Array.isArray(item.subtasks)
        ? item.subtasks.filter(isPlainObject).map((s) => ({
            id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `${id}_sub`,
            title: String(s.title ?? ''),
            completed: Boolean(s.completed),
          }))
        : [],
      completedAt:
        typeof item.completedAt === 'string'
          ? item.completedAt
          : completed
          ? updatedAt
          : null,
      createdAt,
      updatedAt,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && Number.isFinite(item.revision) && item.revision >= 1
          ? Math.round(item.revision)
          : 1,
    });
  }

  const habits: HabitEntity[] = [];
  const seenHabitIds = new Set<string>();
  for (let i = 0; i < habitsRaw.length; i++) {
    const item = habitsRaw[i];
    if (!isPlainObject(item)) {
      errors.push(`رکورد عادت در habits[${i}] یک شیء معتبر نیست (null یا غیرشیء).`);
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!id) {
      errors.push(`رکورد عادت در habits[${i}] فاقد شناسه (id) معتبر است.`);
      continue;
    }
    if (seenHabitIds.has(id)) {
      errors.push(`شناسهٔ تکراری عادت (${id}) در habits[${i}] یافت شد.`);
      continue;
    }
    seenHabitIds.add(id);

    if (!title) {
      errors.push(`رکورد عادت (${id}) در habits[${i}] فاقد عنوان (title) معتبر است.`);
      continue;
    }

    const weeklyGoal = Number(item.weeklyGoal);
    if (!Number.isFinite(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 7) {
      errors.push(`هدف هفتگی (weeklyGoal) عادت (${id}) در habits[${i}] باید بین ۱ تا ۷ باشد.`);
      continue;
    }

    if (!isPlainObject(item.completedDates)) {
      errors.push(`فیلد completedDates عادت (${id}) در habits[${i}] باید یک شیء معتبر باشد.`);
      continue;
    }

    const completedDates: Record<string, boolean> = {};
    let hasBadDateKey = false;
    for (const [dateKey, val] of Object.entries(item.completedDates)) {
      if (!isValidDateKey(dateKey)) {
        errors.push(`کلید تاریخ نامعتبر (${dateKey}) در completedDates عادت (${id}) در habits[${i}] یافت شد.`);
        hasBadDateKey = true;
        break;
      }
      if (Boolean(val)) {
        completedDates[dateKey] = true;
      }
    }
    if (hasBadDateKey) continue;

    const createdAt = item.createdAt ?? now;
    const updatedAt = item.updatedAt ?? createdAt;
    if (!isValidIsoTimestamp(createdAt) || !isValidIsoTimestamp(updatedAt)) {
      errors.push(`برچسب زمانی createdAt/updatedAt عادت (${id}) در habits[${i}] نامعتبر است.`);
      continue;
    }

    if (item.deletedAt !== undefined && item.deletedAt !== null && !isValidIsoTimestamp(item.deletedAt)) {
      errors.push(`برچسب زمانی deletedAt عادت (${id}) در habits[${i}] نامعتبر است.`);
      continue;
    }

    const startDate =
      item.startDate !== undefined && item.startDate !== null
        ? item.startDate
        : createdAt.slice(0, 10);
    if (!isValidDateKey(startDate)) {
      errors.push(`تاریخ شروع (startDate) عادت (${id}) در habits[${i}] نامعتبر است.`);
      continue;
    }

    const categoryRaw = typeof item.category === 'string' ? item.category : 'health';
    const category = (
      VALID_HABIT_CATEGORIES.has(categoryRaw) ? categoryRaw : 'health'
    ) as HabitCategoryId;

    habits.push({
      id,
      title,
      category,
      emoji: typeof item.emoji === 'string' && item.emoji.trim() ? item.emoji : '✨',
      color: typeof item.color === 'string' && item.color.trim() ? item.color : '#6366f1',
      frequencyType:
        item.frequencyType === 'weekly_target' || item.frequencyType === 'custom_days'
          ? item.frequencyType
          : 'daily',
      weeklyGoal: Math.round(weeklyGoal),
      targetDaysOfWeek: Array.isArray(item.targetDaysOfWeek)
        ? item.targetDaysOfWeek.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : undefined,
      startDate,
      archived: Boolean(item.archived),
      completedDates,
      createdAt,
      updatedAt,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && Number.isFinite(item.revision) && item.revision >= 1
          ? Math.round(item.revision)
          : 1,
    });
  }

  const habitEntries: HabitEntryEntity[] = [];
  const seenHabitEntryIds = new Set<string>();
  for (let i = 0; i < habitEntriesRaw.length; i++) {
    const item = habitEntriesRaw[i];
    if (!isPlainObject(item)) {
      errors.push(`رکورد ثبت عادت در habitEntries[${i}] یک شیء معتبر نیست.`);
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const habitId = typeof item.habitId === 'string' ? item.habitId.trim() : '';
    if (!id || !habitId) {
      errors.push(`رکورد ثبت عادت در habitEntries[${i}] فاقد id یا habitId معتبر است.`);
      continue;
    }
    if (seenHabitEntryIds.has(id)) {
      errors.push(`شناسهٔ تکراری ثبت عادت (${id}) در habitEntries[${i}] یافت شد.`);
      continue;
    }
    seenHabitEntryIds.add(id);

    if (!isValidDateKey(item.dateKey)) {
      errors.push(`تاریخ (dateKey) ثبت عادت (${id}) در habitEntries[${i}] نامعتبر است.`);
      continue;
    }

    const createdAt = item.createdAt ?? now;
    const updatedAt = item.updatedAt ?? createdAt;
    if (!isValidIsoTimestamp(createdAt) || !isValidIsoTimestamp(updatedAt)) {
      errors.push(`برچسب زمانی ثبت عادت (${id}) در habitEntries[${i}] نامعتبر است.`);
      continue;
    }

    if (item.deletedAt !== undefined && item.deletedAt !== null && !isValidIsoTimestamp(item.deletedAt)) {
      errors.push(`برچسب زمانی deletedAt ثبت عادت (${id}) در habitEntries[${i}] نامعتبر است.`);
      continue;
    }

    habitEntries.push({
      id,
      habitId,
      dateKey: item.dateKey,
      completed: Boolean(item.completed),
      value: typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : undefined,
      note: typeof item.note === 'string' ? item.note : undefined,
      createdAt,
      updatedAt,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && Number.isFinite(item.revision) && item.revision >= 1
          ? Math.round(item.revision)
          : 1,
    });
  }

  // If habitEntries was empty in envelope but habits have completedDates, synthesize missing entries
  if (habitEntries.length === 0 && habits.length > 0) {
    for (const h of habits) {
      for (const [dateKey, done] of Object.entries(h.completedDates)) {
        if (done) {
          const entryId = `he_${h.id}_${dateKey}`;
          if (!seenHabitEntryIds.has(entryId)) {
            seenHabitEntryIds.add(entryId);
            habitEntries.push({
              id: entryId,
              habitId: h.id,
              dateKey,
              completed: true,
              createdAt: h.createdAt,
              updatedAt: h.updatedAt,
              deletedAt: null,
              revision: 1,
            });
          }
        }
      }
    }
  }

  const notes: NoteEntity[] = [];
  const seenNoteIds = new Set<string>();
  for (let i = 0; i < notesRaw.length; i++) {
    const item = notesRaw[i];
    if (!isPlainObject(item)) {
      errors.push(`رکورد یادداشت در notes[${i}] یک شیء معتبر نیست (null یا غیرشیء).`);
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!id) {
      errors.push(`رکورد یادداشت در notes[${i}] فاقد شناسه (id) معتبر است.`);
      continue;
    }
    if (seenNoteIds.has(id)) {
      errors.push(`شناسهٔ تکراری یادداشت (${id}) در notes[${i}] یافت شد.`);
      continue;
    }
    seenNoteIds.add(id);

    if (!title) {
      errors.push(`رکورد یادداشت (${id}) در notes[${i}] فاقد عنوان (title) معتبر است.`);
      continue;
    }

    if (item.kind !== 'idea' && item.kind !== 'useful_info' && item.kind !== 'journal') {
      errors.push(`نوع یادداشت (kind) برای (${id}) در notes[${i}] نامعتبر است.`);
      continue;
    }

    if (typeof item.content !== 'string') {
      errors.push(`محتوای یادداشت (content) برای (${id}) در notes[${i}] باید رشته باشد.`);
      continue;
    }

    const createdAt = item.createdAt ?? now;
    const updatedAt = item.updatedAt ?? createdAt;
    if (!isValidIsoTimestamp(createdAt) || !isValidIsoTimestamp(updatedAt)) {
      errors.push(`برچسب زمانی createdAt/updatedAt یادداشت (${id}) در notes[${i}] نامعتبر است.`);
      continue;
    }

    if (item.deletedAt !== undefined && item.deletedAt !== null && !isValidIsoTimestamp(item.deletedAt)) {
      errors.push(`برچسب زمانی deletedAt یادداشت (${id}) در notes[${i}] نامعتبر است.`);
      continue;
    }

    notes.push({
      id,
      kind: item.kind,
      title,
      content: item.content,
      category: typeof item.category === 'string' && item.category.trim() ? item.category : 'work',
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      pinned: Boolean(item.pinned),
      linkedTaskId: typeof item.linkedTaskId === 'string' ? item.linkedTaskId : null,
      displayDateLabel:
        typeof item.displayDateLabel === 'string' ? item.displayDateLabel : undefined,
      createdAt,
      updatedAt,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && Number.isFinite(item.revision) && item.revision >= 1
          ? Math.round(item.revision)
          : 1,
    });
  }

  const focusSessions: FocusSessionEntity[] = [];
  const seenFocusIds = new Set<string>();
  for (let i = 0; i < focusRaw.length; i++) {
    const item = focusRaw[i];
    if (!isPlainObject(item)) {
      errors.push(`رکورد جلسه تمرکز در focusSessions[${i}] یک شیء معتبر نیست (null یا غیرشیء).`);
      continue;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) {
      errors.push(`رکورد جلسه تمرکز در focusSessions[${i}] فاقد شناسه (id) معتبر است.`);
      continue;
    }
    if (seenFocusIds.has(id)) {
      errors.push(`شناسهٔ تکراری جلسه تمرکز (${id}) در focusSessions[${i}] یافت شد.`);
      continue;
    }
    seenFocusIds.add(id);

    const durationMinutes = Number(item.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      errors.push(
        `مدت‌زمان (durationMinutes) جلسه تمرکز (${id}) در focusSessions[${i}] باید عددی مثبت باشد.`
      );
      continue;
    }

    const plannedMinutes =
      item.plannedMinutes !== undefined ? Number(item.plannedMinutes) : durationMinutes;
    if (!Number.isFinite(plannedMinutes) || plannedMinutes <= 0) {
      errors.push(
        `مدت‌زمان برنامه‌ریزی‌شده (plannedMinutes) جلسه تمرکز (${id}) در focusSessions[${i}] باید عددی مثبت باشد.`
      );
      continue;
    }

    if (!isValidDateKey(item.dateKey)) {
      errors.push(`کلید تاریخ (dateKey) جلسه تمرکز (${id}) در focusSessions[${i}] نامعتبر است.`);
      continue;
    }

    if (!isValidIsoTimestamp(item.startedAt) || !isValidIsoTimestamp(item.endedAt)) {
      errors.push(
        `زمان شروع یا پایان (startedAt/endedAt) جلسه تمرکز (${id}) در focusSessions[${i}] نامعتبر است.`
      );
      continue;
    }

    const createdAt = item.createdAt ?? item.endedAt;
    const updatedAt = item.updatedAt ?? item.endedAt;
    if (!isValidIsoTimestamp(createdAt) || !isValidIsoTimestamp(updatedAt)) {
      errors.push(`برچسب زمانی createdAt/updatedAt جلسه تمرکز (${id}) در focusSessions[${i}] نامعتبر است.`);
      continue;
    }

    if (item.deletedAt !== undefined && item.deletedAt !== null && !isValidIsoTimestamp(item.deletedAt)) {
      errors.push(`برچسب زمانی deletedAt جلسه تمرکز (${id}) در focusSessions[${i}] نامعتبر است.`);
      continue;
    }

    focusSessions.push({
      id,
      taskId: typeof item.taskId === 'string' ? item.taskId : null,
      taskTitle: typeof item.taskTitle === 'string' ? item.taskTitle : undefined,
      phase:
        item.phase === 'short_break' || item.phase === 'long_break' ? item.phase : 'work',
      plannedMinutes: Math.round(plannedMinutes),
      durationMinutes: Math.round(durationMinutes),
      dateKey: item.dateKey,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      completedNaturally:
        typeof item.completedNaturally === 'boolean' ? item.completedNaturally : true,
      createdAt,
      updatedAt,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
      revision:
        typeof item.revision === 'number' && Number.isFinite(item.revision) && item.revision >= 1
          ? Math.round(item.revision)
          : 1,
    });
  }

  let settings: UserSettingsEntity | undefined;
  if (rawPayload.settings !== undefined && rawPayload.settings !== null) {
    if (!isPlainObject(rawPayload.settings)) {
      errors.push('فیلد settings در فایل پشتیبان یک شیء معتبر نیست.');
    } else {
      const s = rawPayload.settings;
      const theme =
        s.theme === 'light' || s.theme === 'dark' || s.theme === 'system' ? s.theme : 'dark';
      const workMins = Number(s.pomodoroWorkMinutes ?? 45);
      const shortMins = Number(s.pomodoroShortBreakMinutes ?? 10);
      const longMins = Number(s.pomodoroLongBreakMinutes ?? 20);
      const cycles = Number(s.pomodoroCyclesBeforeLongBreak ?? 4);
      if (
        !Number.isFinite(workMins) ||
        workMins <= 0 ||
        !Number.isFinite(shortMins) ||
        shortMins <= 0 ||
        !Number.isFinite(longMins) ||
        longMins <= 0 ||
        !Number.isFinite(cycles) ||
        cycles < 1
      ) {
        errors.push('مقادیر تنظیمات تایمر پومودورو در settings نامعتبر هستند.');
      } else {
        settings = {
          id: 'default',
          theme,
          soundEnabled: typeof s.soundEnabled === 'boolean' ? s.soundEnabled : true,
          pomodoroWorkMinutes: Math.round(workMins),
          pomodoroShortBreakMinutes: Math.round(shortMins),
          pomodoroLongBreakMinutes: Math.round(longMins),
          pomodoroCyclesBeforeLongBreak: Math.round(cycles),
          calendarPreference: s.calendarPreference === 'gregorian' ? 'gregorian' : 'jalali',
          updatedAt:
            typeof s.updatedAt === 'string' && isValidIsoTimestamp(s.updatedAt)
              ? s.updatedAt
              : now,
        };
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    payload: {
      tasks,
      habits,
      habitEntries,
      notes,
      focusSessions,
      settings,
    },
  };
}

/**
 * Creates a canonical BackupEnvelopeV2 from either a V2 payload, V2 envelope, or legacy UI data.
 */
export function createPlainBackupEnvelope(
  input: BackupEnvelopeV2 | BackupPayloadV2 | LegacyBackupDataInput,
  platform: 'web' | 'android_webview' | 'windows_desktop' = 'web'
): BackupEnvelopeV2 {
  const exportedAt = nowIso();

  if (isPlainObject(input) && 'payload' in input && isPlainObject(input.payload)) {
    const env = input as unknown as BackupEnvelopeV2;
    const checksum = computeBackupChecksum(env.payload);
    return {
      appId: 'kairos',
      app: 'Kairos',
      formatVersion: 2,
      schemaVersion: 2,
      exportedAt: env.exportedAt && isValidIsoTimestamp(env.exportedAt) ? env.exportedAt : exportedAt,
      platform: env.platform || platform,
      encrypted: false,
      checksum,
      payload: env.payload,
    };
  }

  if (
    isPlainObject(input) &&
    'notes' in input &&
    Array.isArray((input as unknown as BackupPayloadV2).notes)
  ) {
    const payload = input as unknown as BackupPayloadV2;
    const normalizedPayload: BackupPayloadV2 = {
      tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
      habits: Array.isArray(payload.habits) ? payload.habits : [],
      habitEntries: Array.isArray(payload.habitEntries) ? payload.habitEntries : [],
      notes: Array.isArray(payload.notes) ? payload.notes : [],
      focusSessions: Array.isArray(payload.focusSessions) ? payload.focusSessions : [],
      settings: payload.settings,
    };
    return {
      appId: 'kairos',
      app: 'Kairos',
      formatVersion: 2,
      schemaVersion: 2,
      exportedAt,
      platform,
      encrypted: false,
      checksum: computeBackupChecksum(normalizedPayload),
      payload: normalizedPayload,
    };
  }

  const migrated = migrateLegacyBackupDataToV2Payload(
    input as unknown as Record<string, unknown>,
    exportedAt
  );
  const payload: BackupPayloadV2 = migrated.payload ?? {
    tasks: [],
    habits: [],
    habitEntries: [],
    notes: [],
    focusSessions: [],
  };

  return {
    appId: 'kairos',
    app: 'Kairos',
    formatVersion: 2,
    schemaVersion: 2,
    exportedAt,
    platform,
    encrypted: false,
    checksum: computeBackupChecksum(payload),
    payload,
  };
}

/**
 * Encrypts a canonical BackupEnvelopeV2 using Web Crypto API PBKDF2-SHA256 + AES-256-GCM
 * with a random 16-byte salt and unique 12-byte IV.
 */
export async function createEncryptedBackupEnvelope(
  input: BackupEnvelopeV2 | BackupPayloadV2 | LegacyBackupDataInput,
  password: string
): Promise<KairosEncryptedBackupEnvelope> {
  if (!password || password.trim().length < 4) {
    throw new Error('گذرواژهٔ رمزگذاری باید حداقل ۴ کاراکتر باشد.');
  }

  const plainEnvelope = createPlainBackupEnvelope(input);
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(plainEnvelope));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(password, salt, PBKDF2_ITERATIONS);

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintextBytes as BufferSource
  );

  return {
    appId: 'kairos',
    app: 'Kairos',
    formatVersion: 2,
    schemaVersion: 2,
    exportedAt: plainEnvelope.exportedAt,
    encrypted: true,
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      saltBase64: bytesToBase64(salt),
    },
    cipher: {
      algorithm: 'AES-GCM',
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
    },
  };
}

/**
 * Decrypts an AES-256-GCM encrypted backup envelope using the user's password.
 */
export async function decryptBackupEnvelope(
  rawJson: string,
  password: string
): Promise<BackupPreviewSummary> {
  try {
    const parsed = JSON.parse(rawJson) as KairosEncryptedBackupEnvelope;
    if (!parsed || parsed.encrypted !== true || !parsed.kdf || !parsed.cipher) {
      const msg = 'ساختار فایل پشتیبان رمزگذاری‌شده معتبر نیست.';
      return { valid: false, encrypted: false, error: msg, errors: [msg] };
    }
    const salt = base64ToBytes(parsed.kdf.saltBase64);
    const iv = base64ToBytes(parsed.cipher.ivBase64);
    const ciphertext = base64ToBytes(parsed.cipher.ciphertextBase64);
    const iterations = Number(parsed.kdf.iterations) || PBKDF2_ITERATIONS;

    const key = await deriveAesGcmKey(password, salt, iterations);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    const plainText = new TextDecoder().decode(plainBuffer);
    return validateAndPreviewBackupPayload(plainText);
  } catch {
    const msg = 'گذرواژه اشتباه است یا فایل پشتیبان رمزگذاری‌شده دستکاری/آسیب دیده است.';
    return {
      valid: false,
      encrypted: true,
      error: msg,
      errors: [msg],
    };
  }
}

/**
 * Validates an already-parsed backup envelope object (used by both UI preview and Repository restore).
 */
export function validateBackupEnvelopeObject(
  parsed: unknown,
  options?: { verifyChecksum?: boolean }
): BackupPreviewSummary {
  if (!isPlainObject(parsed)) {
    const msg = 'ساختار ریشهٔ فایل پشتیبان نامعتبر است.';
    return { valid: false, encrypted: false, error: msg, errors: [msg] };
  }

  if (parsed.encrypted === true) {
    const msg = 'این فایل پشتیبان رمزگذاری شده است. لطفاً گذرواژهٔ آن را وارد کنید.';
    return {
      valid: false,
      encrypted: true,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
      error: msg,
      errors: [msg],
    };
  }

  if (parsed.schemaVersion !== undefined) {
    const sv = Number(parsed.schemaVersion);
    if (!Number.isFinite(sv) || sv > 2 || sv < 1) {
      const msg = `نسخهٔ قالب این پشتیبان (schemaVersion: ${String(
        parsed.schemaVersion
      )}) جدیدتر یا ناسازگار با نسخهٔ فعلی برنامه است و پشتیبانی نمی‌شود.`;
      return { valid: false, encrypted: false, error: msg, errors: [msg] };
    }
  }

  if (parsed.formatVersion !== undefined && typeof parsed.formatVersion === 'number') {
    if (parsed.formatVersion > 2 || parsed.formatVersion < 1) {
      const msg = `نسخهٔ ساختار فایل پشتیبان (formatVersion: ${String(
        parsed.formatVersion
      )}) پشتیبانی نمی‌شود.`;
      return { valid: false, encrypted: false, error: msg, errors: [msg] };
    }
  }

  let validatedPayload: BackupPayloadV2 | undefined;
  let migratedFromLegacy = false;
  const exportedAt =
    typeof parsed.exportedAt === 'string' && isValidIsoTimestamp(parsed.exportedAt)
      ? parsed.exportedAt
      : typeof parsed.updatedAt === 'string' && isValidIsoTimestamp(parsed.updatedAt)
      ? parsed.updatedAt
      : nowIso();

  // Path A: Canonical V2 Envelope (`payload` object)
  if (isPlainObject(parsed.payload)) {
    const v2Result = validateCanonicalV2Payload(parsed.payload);
    if (!v2Result.valid || !v2Result.payload) {
      return {
        valid: false,
        encrypted: false,
        error: v2Result.errors[0] || 'ساختار داده‌های فایل پشتیبان نامعتبر است.',
        errors: v2Result.errors,
      };
    }

    // Verify checksum if provided on raw input payload
    const shouldVerifyChecksum = options?.verifyChecksum !== false;
    if (
      shouldVerifyChecksum &&
      typeof parsed.checksum === 'string' &&
      parsed.checksum.trim() &&
      parsed.checksum !== 'restored_v2'
    ) {
      // Check against both raw parsed.payload and normalized v2Result.payload
      const rawPayloadObj = parsed.payload as unknown as BackupPayloadV2;
      const computedFromRaw = computeBackupChecksum(rawPayloadObj);
      const computedFromNormalized = computeBackupChecksum(v2Result.payload);
      if (
        parsed.checksum !== computedFromRaw &&
        parsed.checksum !== computedFromNormalized
      ) {
        const msg =
          'مقدار کنترلی (checksum) فایل پشتیبان با محتوای آن همخوانی ندارد؛ فایل دستکاری یا خراب شده است.';
        return {
          valid: false,
          encrypted: false,
          error: msg,
          errors: [msg],
        };
      }
    }

    validatedPayload = v2Result.payload;
  } else {
    // Path B: Legacy v1 (`data` object or root arrays)
    const legacyContainer = isPlainObject(parsed.data) ? parsed.data : parsed;
    if (!Array.isArray(legacyContainer.tasks) || !Array.isArray(legacyContainer.habits)) {
      const msg =
        'فایل پشتیبان فاقد آرایه‌های ضروری مأموریت‌ها (tasks) و عادت‌ها (habits) است.';
      return { valid: false, encrypted: false, error: msg, errors: [msg] };
    }

    const legacyResult = migrateLegacyBackupDataToV2Payload(legacyContainer, exportedAt);
    if (!legacyResult.valid || !legacyResult.payload) {
      return {
        valid: false,
        encrypted: false,
        error: legacyResult.errors[0] || 'رکوردهای فایل پشتیبان قدیمی نامعتبر هستند.',
        errors: legacyResult.errors,
      };
    }
    validatedPayload = legacyResult.payload;
    migratedFromLegacy = true;
  }

  const canonicalChecksum = computeBackupChecksum(validatedPayload);
  const platform =
    parsed.platform === 'android_webview' || parsed.platform === 'windows_desktop'
      ? parsed.platform
      : 'web';

  const canonicalEnvelope: BackupEnvelopeV2 = {
    appId: 'kairos',
    app: 'Kairos',
    formatVersion: 2,
    schemaVersion: 2,
    exportedAt,
    platform,
    encrypted: false,
    checksum: canonicalChecksum,
    payload: validatedPayload,
  };

  const uiData = payloadToUiData(validatedPayload);
  const trashedCount =
    validatedPayload.tasks.filter((t) => Boolean(t.deletedAt)).length +
    validatedPayload.habits.filter((h) => Boolean(h.deletedAt)).length +
    validatedPayload.notes.filter((n) => Boolean(n.deletedAt)).length;

  return {
    valid: true,
    encrypted: false,
    errors: [],
    schemaVersion: 2,
    formatVersion: 2,
    migratedFromLegacy,
    exportedAt,
    checksum: canonicalChecksum,
    counts: {
      tasks: uiData.tasks.length,
      activeTasks: uiData.tasks.length,
      trashedItems: trashedCount,
      habits: uiData.habits.length,
      habitEntries: validatedPayload.habitEntries.length,
      notes: validatedPayload.notes.filter((n) => !n.deletedAt).length,
      ideas: uiData.ideas.length,
      usefulInfos: uiData.usefulInfos.length,
      focusSessions: uiData.focusSessions.length,
      hasSettings: Boolean(validatedPayload.settings),
    },
    envelope: canonicalEnvelope,
    data: uiData,
  };
}

/**
 * Validates raw JSON backup string (size, JSON syntax, version, checksum, duplicate IDs, required fields)
 * and produces a structured preview summary + canonical BackupEnvelopeV2 before any restore is committed.
 */
export function validateAndPreviewBackupPayload(
  rawJson: string,
  options?: { verifyChecksum?: boolean }
): BackupPreviewSummary {
  if (!rawJson || typeof rawJson !== 'string' || !rawJson.trim()) {
    const msg = 'فایل پشتیبان خالی است.';
    return { valid: false, encrypted: false, error: msg, errors: [msg] };
  }
  if (rawJson.length > MAX_BACKUP_BYTES) {
    const msg = 'حجم فایل پشتیبان بیش از حد مجاز (۱۰ مگابایت) است.';
    return { valid: false, encrypted: false, error: msg, errors: [msg] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    const msg = 'فایل انتخاب‌شده یک JSON معتبر نیست.';
    return { valid: false, encrypted: false, error: msg, errors: [msg] };
  }

  return validateBackupEnvelopeObject(parsed, options);
}
