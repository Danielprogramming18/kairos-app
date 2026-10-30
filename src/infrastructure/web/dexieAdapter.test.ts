import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KairosWebDatabase,
  LEGACY_STORAGE_KEYS,
  migrateLegacyLocalStorageToIndexedDB,
  MIGRATION_MARKER_KEY,
  MIGRATION_RECOVERY_SNAPSHOT_KEY,
  PRE_RESTORE_SNAPSHOT_KEY,
  WebDexiePlatformAdapter,
} from './dexieAdapter';
import { createEntityId, nowIso } from '../../domain/models';
import { computeBackupChecksum } from '../../utils/backupCrypto';
import {
  BRIDGE_CONTRACT_VERSION,
  BridgeProtocolError,
  createBridgeRequest,
  validateBridgeRequest,
} from '../bridge/protocol';
import {
  domainEntityToFocusSession,
  domainEntityToHabit,
  domainEntityToTask,
  domainNoteToIdea,
  domainNoteToUsefulInfo,
  focusSessionToDomainEntity,
  habitToDomainEntity,
  ideaToDomainNote,
  taskToDomainEntity,
  usefulInfoToDomainNote,
} from '../../app/PlatformContext';

class InMemoryStorage {
  private map = new Map<string, string>();
  public failOnSnapshotWrite = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, val: string): void {
    if (this.failOnSnapshotWrite && key === MIGRATION_RECOVERY_SNAPSHOT_KEY) {
      throw new Error('Simulated QuotaExceededError on snapshot');
    }
    this.map.set(key, val);
  }
}

test('Safe legacy migration imports tasks, habits, ideas, usefulInfos, trash, and preserves original keys', async () => {
  const db = new KairosWebDatabase('test_migration_db_' + Date.now());
  const storage = new InMemoryStorage();

  storage.setItem(
    LEGACY_STORAGE_KEYS.TASKS,
    JSON.stringify([
      {
        id: 't_legacy_1',
        title: 'نوشتن تست‌های قرارداد کایروس',
        priority: 1,
        duration: 45,
        targetDate: '2026-03-29',
        completed: false,
      },
      {
        // Invalid record without title -> should be skipped gracefully and reported
        id: 't_invalid',
        title: '   ',
      },
    ])
  );

  storage.setItem(
    LEGACY_STORAGE_KEYS.HABITS,
    JSON.stringify([
      {
        id: 'h_legacy_1',
        title: 'ورزش صبحگاهی',
        category: 'health',
        emoji: '🏃',
        color: '#10b981',
        weeklyGoal: 5,
        completedDates: {
          '2026-03-28': true,
          '2026-03-29': true,
        },
      },
    ])
  );

  storage.setItem(
    LEGACY_STORAGE_KEYS.IDEAS,
    JSON.stringify([
      {
        id: 'idea_1',
        title: 'ایده ساخت افزونه مرورگر',
        note: 'با معماری تمیز',
        category: 'project',
        createdAt: '۹ فروردین',
      },
    ])
  );

  storage.setItem(
    LEGACY_STORAGE_KEYS.USEFUL_INFO,
    JSON.stringify([
      {
        id: 'info_1',
        title: 'دستور اجرای تست‌ها',
        content: 'npx tsx --test',
        category: 'code',
        pinned: true,
        createdAt: '۹ فروردین',
      },
    ])
  );

  storage.setItem(
    LEGACY_STORAGE_KEYS.TRASH,
    JSON.stringify([
      {
        id: 't_trashed_1',
        type: 'task',
        title: 'کار حذف‌شده قبلی',
        deletedAt: '2026-03-28T10:00:00.000Z',
        payload: {
          id: 't_trashed_1',
          title: 'کار حذف‌شده قبلی',
          priority: 2,
          duration: 30,
          targetDate: '2026-03-28',
          completed: false,
        },
      },
    ])
  );

  const report = await migrateLegacyLocalStorageToIndexedDB(db, storage);
  assert.ok(report);
  assert.equal(report.status, 'migrated');
  assert.equal(report.counts.tasks, 2); // 1 active + 1 trashed
  assert.equal(report.counts.habits, 1);
  assert.equal(report.counts.habitEntries, 2);
  assert.equal(report.counts.notes, 2);
  assert.equal(report.skippedInvalidRecords, 1);
  assert.equal(report.verifiedCountsMatch, true);
  assert.equal(report.invalidRecords?.length, 1);
  assert.equal(report.invalidRecords?.[0].collection, 'tasks');

  // Verify recovery snapshot was saved and original keys were NOT deleted
  assert.ok(storage.getItem(MIGRATION_RECOVERY_SNAPSHOT_KEY));
  assert.ok(storage.getItem(LEGACY_STORAGE_KEYS.TASKS));

  // Verify idempotency: running migration a second time returns status 'already_migrated' and does not duplicate rows
  const secondReport = await migrateLegacyLocalStorageToIndexedDB(db, storage);
  assert.ok(secondReport);
  assert.equal(secondReport.status, 'already_migrated');
  assert.equal(secondReport.counts.tasks, report.counts.tasks);
  const allTasks = await db.tasks.toArray();
  assert.equal(allTasks.length, 2);
});

test('Migration aborts and preserves source data if recovery snapshot creation fails (FIX-04)', async () => {
  const db = new KairosWebDatabase('test_migration_abort_' + Date.now());
  const storage = new InMemoryStorage();
  storage.failOnSnapshotWrite = true;

  const originalTasksJson = JSON.stringify([
    {
      id: 't_important',
      title: 'کار حیاتی کاربر',
      priority: 1,
      duration: 45,
      targetDate: '2026-03-29',
      completed: false,
    },
  ]);
  storage.setItem(LEGACY_STORAGE_KEYS.TASKS, originalTasksJson);

  await assert.rejects(
    () => migrateLegacyLocalStorageToIndexedDB(db, storage),
    /خطا در ایجاد اسنپ‌شات پشتیبان پیش از مهاجرت/
  );

  // Source data remains intact and migration marker was NOT written
  assert.equal(storage.getItem(LEGACY_STORAGE_KEYS.TASKS), originalTasksJson);
  const marker = await db.kvState.get(MIGRATION_MARKER_KEY);
  assert.equal(marker, undefined);
});

test('Clean first run with no legacy keys records clean_first_run and does not seed fake records (FIX-04)', async () => {
  const db = new KairosWebDatabase('test_clean_first_run_' + Date.now());
  const storage = new InMemoryStorage();

  const report = await migrateLegacyLocalStorageToIndexedDB(db, storage);
  assert.ok(report);
  assert.equal(report.status, 'clean_first_run');
  assert.equal(report.counts.tasks, 0);
  assert.equal(report.counts.habits, 0);
  assert.equal(report.counts.notes, 0);
  assert.equal(await db.tasks.count(), 0);
});

test('Lossless Domain <-> UI mappers preserve id, createdAt, updatedAt, revision, deletedAt, completedAt, projectId, tags, and sourceId (FIX-05)', () => {
  const originalTaskEntity = {
    id: 't_lossless_1',
    title: 'بررسی تطابق مدل',
    description: 'توضیحات تست',
    status: 'done' as const,
    completed: true,
    priority: 2,
    duration: 90,
    targetDate: '2026-03-29',
    dueAt: '2026-03-29T18:00:00.000Z',
    reminderTime: '14:30',
    reminded: true,
    projectId: 'proj_alpha',
    sourceId: 'idea_source_99',
    category: 'work',
    tags: ['urgent', 'backend'],
    subtasks: [{ id: 'sub_1', title: 'زیرکار ۱', completed: true }],
    completedAt: '2026-03-29T15:00:00.000Z',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-29T15:00:00.000Z',
    deletedAt: null,
    revision: 7,
  };

  const uiTask = domainEntityToTask(originalTaskEntity);
  const roundTripTask = taskToDomainEntity(uiTask);

  assert.equal(roundTripTask.id, originalTaskEntity.id);
  assert.equal(roundTripTask.createdAt, originalTaskEntity.createdAt);
  assert.equal(roundTripTask.updatedAt, originalTaskEntity.updatedAt);
  assert.equal(roundTripTask.revision, 7);
  assert.equal(roundTripTask.completedAt, originalTaskEntity.completedAt);
  assert.equal(roundTripTask.projectId, 'proj_alpha');
  assert.equal(roundTripTask.sourceId, 'idea_source_99');
  assert.deepEqual(roundTripTask.tags, ['urgent', 'backend']);
  assert.deepEqual(roundTripTask.subtasks, [{ id: 'sub_1', title: 'زیرکار ۱', completed: true }]);

  const originalHabitEntity = {
    id: 'h_lossless_1',
    title: 'مطالعه عمیق',
    category: 'learning' as const,
    emoji: '📚',
    color: '#6366f1',
    frequencyType: 'weekly_target' as const,
    weeklyGoal: 5,
    targetDaysOfWeek: [0, 1, 2, 3, 4],
    startDate: '2026-02-15',
    archived: false,
    completedDates: { '2026-03-28': true },
    createdAt: '2026-02-15T07:00:00.000Z',
    updatedAt: '2026-03-28T20:00:00.000Z',
    deletedAt: null,
    revision: 4,
  };

  const uiHabit = domainEntityToHabit(originalHabitEntity);
  const roundTripHabit = habitToDomainEntity(uiHabit);
  assert.equal(roundTripHabit.createdAt, originalHabitEntity.createdAt);
  assert.equal(roundTripHabit.revision, 4);
  assert.equal(roundTripHabit.startDate, '2026-02-15');
  assert.deepEqual(roundTripHabit.targetDaysOfWeek, [0, 1, 2, 3, 4]);
});

test('WebDexiePlatformAdapter supports full CRUD, revision increments, softDelete, restore, and hardDelete across Tasks, Habits, Notes, and FocusSessions (FIX-01, FIX-02, FIX-06)', async () => {
  const db = new KairosWebDatabase('test_full_crud_e2e_' + Date.now());
  const adapter = new WebDexiePlatformAdapter(db);

  // 1. Task lifecycle & monotonic revision
  const taskId = createEntityId('t');
  const now = nowIso();
  const createdTask = await adapter.tasks.upsertTask({
    id: taskId,
    title: 'پیاده‌سازی آداپتور Dexie',
    description: 'تست کامل چرخه حیات وظیفه',
    status: 'todo',
    completed: false,
    priority: 1,
    duration: 60,
    targetDate: '2026-03-29',
    category: 'work',
    tags: ['architecture'],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
  });
  assert.equal(createdTask.revision, 2); // incremented on commit

  const updatedTask = await adapter.tasks.upsertTask({
    ...createdTask,
    title: 'پیاده‌سازی آداپتور Dexie نسخه ۲',
  });
  assert.equal(updatedTask.revision, 3);
  assert.equal(updatedTask.createdAt, createdTask.createdAt);

  await adapter.tasks.softDeleteTask(taskId);
  assert.equal((await adapter.tasks.listTasks()).length, 0);
  const trashedTasks = await adapter.tasks.listTasks({ includeDeleted: true });
  assert.equal(trashedTasks.length, 1);
  assert.ok(trashedTasks[0].deletedAt);
  assert.equal(trashedTasks[0].revision, 4);

  const restoredTask = await adapter.tasks.restoreTask(taskId);
  assert.ok(restoredTask);
  assert.equal(restoredTask.deletedAt, null);
  assert.equal(restoredTask.revision, 5);

  await adapter.tasks.hardDeleteTask(taskId);
  assert.equal((await adapter.tasks.listTasks({ includeDeleted: true })).length, 0);

  // 2. Notes (Ideas & Useful Info) lifecycle
  const ideaNote = ideaToDomainNote({
    id: 'idea_e2e_1',
    title: 'ایده تست مخزن',
    note: 'ذخیره در IndexedDB',
    category: 'project',
    createdAt: '۹ فروردین',
  });
  const savedIdeaNote = await adapter.notes.upsertNote(ideaNote);
  assert.equal(savedIdeaNote.kind, 'idea');

  const usefulNote = usefulInfoToDomainNote({
    id: 'info_e2e_1',
    title: 'لینک مستندات',
    content: 'https://developer.mozilla.org',
    category: 'links',
    pinned: true,
    createdAt: '۹ فروردین',
  });
  await adapter.notes.upsertNote(usefulNote);

  const allIdeas = await adapter.notes.listNotes('idea');
  const allUseful = await adapter.notes.listNotes('useful_info');
  assert.equal(allIdeas.length, 1);
  assert.equal(allUseful.length, 1);
  assert.equal(domainNoteToIdea(allIdeas[0]).title, 'ایده تست مخزن');
  assert.equal(domainNoteToUsefulInfo(allUseful[0]).pinned, true);

  await adapter.notes.softDeleteNote('idea_e2e_1');
  assert.equal((await adapter.notes.listNotes('idea')).length, 0);
  await adapter.notes.restoreNote('idea_e2e_1');
  assert.equal((await adapter.notes.listNotes('idea')).length, 1);
  await adapter.notes.hardDeleteNote('idea_e2e_1');
  assert.equal((await adapter.notes.listNotes('idea', true)).length, 0);

  // 3. FocusSession lifecycle
  const sessionEntity = focusSessionToDomainEntity({
    id: 'fs_e2e_1',
    taskId: 't_1',
    taskTitle: 'تمرکز عمیق',
    durationMinutes: 45,
    dateKey: '2026-03-29',
    timestamp: Date.now(),
  });
  await adapter.focus.logFocusSession(sessionEntity);
  const loadedSessions = await adapter.focus.listFocusSessions();
  assert.equal(loadedSessions.length, 1);
  assert.equal(domainEntityToFocusSession(loadedSessions[0]).durationMinutes, 45);
});

test('Bridge protocol validates version, whitelisted operations, and origin security', () => {
  const validReq = createBridgeRequest('tasks.list', { completed: false });
  const validated = validateBridgeRequest(
    validReq,
    ['app://kairos.local'],
    'app://kairos.local'
  );
  assert.equal(validated.version, BRIDGE_CONTRACT_VERSION);
  assert.equal(validated.operation, 'tasks.list');

  // Reject mismatched version
  assert.throws(
    () =>
      validateBridgeRequest({
        requestId: 'req_1',
        version: '0.1.0',
        operation: 'tasks.list',
        payload: {},
      }),
    (err: unknown) => err instanceof BridgeProtocolError && err.code === 'VERSION_MISMATCH'
  );

  // Reject unwhitelisted raw SQL operation
  assert.throws(
    () =>
      validateBridgeRequest({
        requestId: 'req_2',
        version: BRIDGE_CONTRACT_VERSION,
        operation: 'sql.executeRaw',
        payload: { query: 'DROP TABLE tasks;' },
      }),
    (err: unknown) => err instanceof BridgeProtocolError && err.code === 'UNKNOWN_OPERATION'
  );

  // Reject untrusted origin
  assert.throws(
    () =>
      validateBridgeRequest(validReq, ['app://kairos.local'], 'https://evil.example.com'),
    (err: unknown) => err instanceof BridgeProtocolError && err.code === 'INVALID_ORIGIN'
  );
});

test('Repository exportBackup, restoreBackup (replace & merge), pre-restore snapshot verification, and rollbackLastRestore work atomically (FIX-08)', async () => {
  const db = new KairosWebDatabase('test_backup_restore_e2e_' + Date.now());
  const adapter = new WebDexiePlatformAdapter(db);
  const now = nowIso();

  // Seed initial state in DB
  await adapter.tasks.upsertTask({
    id: 't_initial_1',
    title: 'مأموریت اولیه قبل از بازیابی',
    status: 'todo',
    completed: false,
    priority: 1,
    duration: 45,
    targetDate: '2026-03-29',
    category: 'work',
    tags: [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 2,
  });

  await adapter.habits.upsertHabit({
    id: 'h_initial_1',
    title: 'عادت اولیه',
    category: 'health',
    emoji: '💧',
    color: '#0ea5e9',
    frequencyType: 'daily',
    weeklyGoal: 7,
    startDate: '2026-03-01',
    archived: false,
    completedDates: { '2026-03-28': true },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 2,
  });
  await adapter.habits.toggleHabitDate('h_initial_1', '2026-03-29');

  await adapter.settings.saveSettings({
    theme: 'light',
    pomodoroWorkMinutes: 50,
  });

  // 1. Export canonical backup
  const exported = await adapter.backup.exportBackup();
  assert.equal(exported.appId, 'kairos');
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.payload.tasks.length, 1);
  assert.equal(exported.payload.habits.length, 1);
  assert.ok(exported.payload.habitEntries.length >= 1);
  assert.equal(exported.payload.settings?.pomodoroWorkMinutes, 50);

  // 2. Prepare a new backup envelope to replace current DB
  const replacementPayload = {
    tasks: [
      {
        id: 't_replaced_1',
        title: 'مأموریت جایگزین‌شده ۱',
        status: 'todo' as const,
        completed: false,
        priority: 1,
        duration: 30,
        targetDate: '2026-03-30',
        category: 'work',
        tags: [],
        subtasks: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        revision: 1,
      },
      {
        id: 't_replaced_2',
        title: 'مأموریت جایگزین‌شده ۲',
        status: 'done' as const,
        completed: true,
        priority: 2,
        duration: 60,
        targetDate: '2026-03-30',
        completedAt: now,
        category: 'work',
        tags: [],
        subtasks: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        revision: 1,
      },
    ],
    habits: [],
    habitEntries: [],
    notes: [],
    focusSessions: [],
    settings: {
      id: 'default' as const,
      theme: 'dark' as const,
      soundEnabled: true,
      pomodoroWorkMinutes: 25,
      pomodoroShortBreakMinutes: 5,
      pomodoroLongBreakMinutes: 15,
      pomodoroCyclesBeforeLongBreak: 4,
      calendarPreference: 'jalali' as const,
      updatedAt: now,
    },
  };

  const replacementEnvelope = {
    appId: 'kairos' as const,
    app: 'Kairos' as const,
    formatVersion: 2 as const,
    schemaVersion: 2 as const,
    exportedAt: now,
    platform: 'web' as const,
    encrypted: false as const,
    checksum: computeBackupChecksum(replacementPayload),
    payload: replacementPayload,
  };

  const restoreRes = await adapter.backup.restoreBackup(replacementEnvelope, 'replace');
  assert.equal(restoreRes.restoredCounts.tasks, 2);
  assert.equal(restoreRes.restoredCounts.habits, 0);
  assert.equal(restoreRes.snapshotKey, PRE_RESTORE_SNAPSHOT_KEY);

  // Verify DB was replaced (including empty habits array clearing old habits)
  assert.equal((await adapter.tasks.listTasks()).length, 2);
  assert.equal((await adapter.habits.listHabits()).length, 0);
  assert.equal((await adapter.settings.getSettings()).pomodoroWorkMinutes, 25);

  // Verify pre-restore snapshot exists
  const snapInfo = await adapter.backup.hasPreRestoreSnapshot!();
  assert.equal(snapInfo.exists, true);

  // 3. Test Merge strategy: merge initial backup into replaced DB
  const mergeRes = await adapter.backup.restoreBackup(exported, 'merge');
  assert.equal(mergeRes.restoredCounts.tasks, 3); // 2 replaced + 1 initial
  assert.equal(mergeRes.restoredCounts.habits, 1);

  // 4. Test Rollback: rollbackLastRestore reverts to snapshot taken before the merge
  const rollbackRes = await adapter.backup.rollbackLastRestore!();
  assert.equal(rollbackRes.restoredCounts.tasks, 2);
  assert.equal(rollbackRes.restoredCounts.habits, 0);
});

test('restoreBackup aborts and leaves existing DB intact if pre-restore snapshot fails or envelope is invalid (FIX-08)', async () => {
  const db = new KairosWebDatabase('test_restore_safety_' + Date.now());
  const adapter = new WebDexiePlatformAdapter(db);
  const now = nowIso();

  await adapter.tasks.upsertTask({
    id: 't_protected_1',
    title: 'دادهٔ محافظت‌شدهٔ کاربر',
    status: 'todo',
    completed: false,
    priority: 1,
    duration: 45,
    targetDate: '2026-03-29',
    category: 'work',
    tags: [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
  });

  // 1. Attempt restore with invalid envelope (negative duration) -> rejected before touching DB
  const invalidPayload = {
    tasks: [
      {
        id: 't_bad',
        title: 'کار خراب',
        status: 'todo' as const,
        completed: false,
        priority: 1,
        duration: -10,
        targetDate: '2026-03-29',
        category: 'work',
        tags: [],
        subtasks: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        revision: 1,
      },
    ],
    habits: [],
    habitEntries: [],
    notes: [],
    focusSessions: [],
  };
  await assert.rejects(
    () =>
      adapter.backup.restoreBackup(
        {
          app: 'Kairos',
          schemaVersion: 2,
          exportedAt: now,
          platform: 'web',
          checksum: computeBackupChecksum(invalidPayload),
          payload: invalidPayload,
        },
        'replace'
      ),
    /duration/
  );

  // Verify existing data is untouched
  const afterInvalidTasks = await adapter.tasks.listTasks();
  assert.equal(afterInvalidTasks.length, 1);
  assert.equal(afterInvalidTasks[0].id, 't_protected_1');

  // 2. Simulate failure during pre-restore snapshot creation -> restore must abort!
  const validEmptyPayload = {
    tasks: [],
    habits: [],
    habitEntries: [],
    notes: [],
    focusSessions: [],
  };
  const validEmptyEnvelope = {
    app: 'Kairos' as const,
    schemaVersion: 2 as const,
    exportedAt: now,
    platform: 'web' as const,
    checksum: computeBackupChecksum(validEmptyPayload),
    payload: validEmptyPayload,
  };

  const originalKvPut = db.kvState.put.bind(db.kvState);
  (db.kvState as any).put = async (item: any) => {
    if (item && item.key === PRE_RESTORE_SNAPSHOT_KEY) {
      throw new Error('Simulated Disk Full on Pre-Restore Snapshot');
    }
    return originalKvPut(item);
  };

  await assert.rejects(
    () => adapter.backup.restoreBackup(validEmptyEnvelope, 'replace'),
    /خطا در ایجاد و تأیید اسنپ‌شات امنیتی پیش از بازیابی/
  );

  // Restore original put and verify existing task is STILL intact!
  (db.kvState as any).put = originalKvPut;
  const remainingTasks = await adapter.tasks.listTasks();
  assert.equal(remainingTasks.length, 1);
  assert.equal(remainingTasks[0].title, 'دادهٔ محافظت‌شدهٔ کاربر');
});

test('FIX-15: expectedRevision enforces optimistic concurrency on upsertTask, upsertHabit, and upsertNote and logFocusSession is idempotent', async () => {
  const db = new KairosWebDatabase('test_concurrency_' + Date.now());
  const adapter = new WebDexiePlatformAdapter(db);
  const now = nowIso();

  // 1. Task optimistic concurrency
  const createdTask = await adapter.tasks.upsertTask({
    id: 't_conc_1',
    title: 'نسخه اول کار',
    status: 'todo',
    completed: false,
    priority: 1,
    duration: 25,
    targetDate: '2026-03-30',
    category: 'work',
    tags: [],
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
  });
  assert.equal(createdTask.revision, 2);

  // Tab B updates with matching expectedRevision = 2 -> succeeds (revision becomes 3)
  const updatedByTabB = await adapter.tasks.upsertTask(
    { ...createdTask, title: 'نسخه دوم از تب B' },
    { expectedRevision: 2 }
  );
  assert.equal(updatedByTabB.revision, 3);

  // Tab A tries to overwrite using stale expectedRevision = 2 -> rejected with CONFLICT_STALE_REVISION!
  await assert.rejects(
    () =>
      adapter.tasks.upsertTask(
        { ...createdTask, title: 'نسخه قدیمی از تب A' },
        { expectedRevision: 2 }
      ),
    (err: any) => err && err.code === 'CONFLICT_STALE_REVISION' && err.actualRevision === 3
  );

  // Verify Tab B's title was NOT overwritten
  const currentTask = await adapter.tasks.getTaskById('t_conc_1');
  assert.equal(currentTask?.title, 'نسخه دوم از تب B');

  // 2. Habit optimistic concurrency
  const createdHabit = await adapter.habits.upsertHabit({
    id: 'h_conc_1',
    title: 'عادت همزمانی',
    category: 'health',
    emoji: '🌿',
    color: '#10b981',
    frequencyType: 'daily',
    weeklyGoal: 7,
    startDate: '2026-03-30',
    archived: false,
    completedDates: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
  });
  assert.equal(createdHabit.revision, 2);

  await adapter.habits.upsertHabit(
    { ...createdHabit, title: 'عادت به‌روزشده' },
    { expectedRevision: 2 }
  );
  await assert.rejects(
    () =>
      adapter.habits.upsertHabit(
        { ...createdHabit, title: 'عادت قدیمی' },
        { expectedRevision: 2 }
      ),
    (err: any) => err && err.code === 'CONFLICT_STALE_REVISION'
  );

  // 3. Note optimistic concurrency
  const createdNote = await adapter.notes.upsertNote({
    id: 'n_conc_1',
    kind: 'useful_info',
    title: 'یادداشت اول',
    content: 'متن اول',
    category: 'note',
    pinned: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    revision: 1,
  });
  assert.equal(createdNote.revision, 2);

  await adapter.notes.upsertNote(
    { ...createdNote, content: 'متن جدیدتر' },
    { expectedRevision: 2 }
  );
  await assert.rejects(
    () =>
      adapter.notes.upsertNote(
        { ...createdNote, content: 'متن قدیمی‌تر' },
        { expectedRevision: 2 }
      ),
    (err: any) => err && err.code === 'CONFLICT_STALE_REVISION'
  );

  // 4. Idempotent logFocusSession on duplicate session.id
  const sessionEntity = focusSessionToDomainEntity({
    id: 'fs_idempotent_1',
    taskId: 't_conc_1',
    taskTitle: 'نسخه دوم از تب B',
    durationMinutes: 10,
    durationSeconds: 600,
    dateKey: '2026-03-30',
    timestamp: Date.now(),
  });
  await adapter.focus.logFocusSession(sessionEntity);
  await adapter.focus.logFocusSession(sessionEntity);
  const allSessions = await adapter.focus.listFocusSessions();
  assert.equal(allSessions.length, 1);
  assert.equal(allSessions[0].durationMinutes, 10);
});

