import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KairosWebDatabase,
  LEGACY_STORAGE_KEYS,
  migrateLegacyLocalStorageToIndexedDB,
  MIGRATION_RECOVERY_SNAPSHOT_KEY,
  WebDexiePlatformAdapter,
} from './dexieAdapter';
import { createEntityId, nowIso } from '../../domain/models';
import {
  BRIDGE_CONTRACT_VERSION,
  BridgeProtocolError,
  createBridgeRequest,
  validateBridgeRequest,
} from '../bridge/protocol';

class InMemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, val: string): void {
    this.map.set(key, val);
  }
}

test('Safe legacy migration imports tasks, habits, ideas, usefulInfos, and preserves original keys', async () => {
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
        // Invalid record without title -> should be skipped gracefully
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

  const report = await migrateLegacyLocalStorageToIndexedDB(db, storage);
  assert.ok(report);
  assert.equal(report.counts.tasks, 1);
  assert.equal(report.counts.habits, 1);
  assert.equal(report.counts.habitEntries, 2);
  assert.equal(report.counts.notes, 2);
  assert.equal(report.skippedInvalidRecords, 1);

  // Verify recovery snapshot was saved and original keys were NOT deleted
  assert.ok(storage.getItem(MIGRATION_RECOVERY_SNAPSHOT_KEY));
  assert.ok(storage.getItem(LEGACY_STORAGE_KEYS.TASKS));

  // Verify idempotency: running migration a second time returns the same report and does not duplicate rows
  const secondReport = await migrateLegacyLocalStorageToIndexedDB(db, storage);
  assert.deepEqual(secondReport, report);
  const allTasks = await db.tasks.toArray();
  assert.equal(allTasks.length, 1);
});

test('WebDexiePlatformAdapter TaskRepository supports end-to-end create, read, softDelete, and restore', async () => {
  const db = new KairosWebDatabase('test_tasks_e2e_' + Date.now());
  const adapter = new WebDexiePlatformAdapter(db);

  const taskId = createEntityId('t');
  const now = nowIso();
  const created = await adapter.tasks.upsertTask({
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

  assert.equal(created.id, taskId);
  assert.equal(created.revision, 1);

  const list1 = await adapter.tasks.listTasks();
  assert.equal(list1.length, 1);
  assert.equal(list1[0].title, 'پیاده‌سازی آداپتور Dexie');

  // Soft delete hides task from default list but keeps tombstone record
  await adapter.tasks.softDeleteTask(taskId);
  const listAfterDelete = await adapter.tasks.listTasks();
  assert.equal(listAfterDelete.length, 0);

  const listWithDeleted = await adapter.tasks.listTasks({ includeDeleted: true });
  assert.equal(listWithDeleted.length, 1);
  assert.ok(listWithDeleted[0].deletedAt);

  // Restore brings task back
  const restored = await adapter.tasks.restoreTask(taskId);
  assert.ok(restored);
  assert.equal(restored.deletedAt, null);
  const listAfterRestore = await adapter.tasks.listTasks();
  assert.equal(listAfterRestore.length, 1);
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
