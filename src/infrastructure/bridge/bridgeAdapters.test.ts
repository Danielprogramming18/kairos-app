import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AndroidBridgePlatformAdapter,
  AndroidSketchwareBridgeTransport,
} from '../android/androidBridgeAdapter';
import {
  WindowsDesktopBridgeTransport,
  WindowsDesktopPlatformAdapter,
} from '../desktop/desktopBridgeAdapter';
import { BRIDGE_CONTRACT_VERSION, BridgeProtocolError } from './protocol';
import { computeBackupChecksum } from '../../utils/backupCrypto';
import { BackupEnvelopeV2, BackupPayloadV2 } from '../../domain/models';

test('AndroidBridgePlatformAdapter fails closed with BRIDGE_UNAVAILABLE when native host is missing', async () => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = {};
  try {
    const adapter = new AndroidBridgePlatformAdapter(new AndroidSketchwareBridgeTransport());
    const health = await adapter.lifecycle.getStorageHealth();
    assert.equal(health.healthy, false);
    assert.equal(health.engine, 'android_sqlite_bridge');

    await assert.rejects(
      () => adapter.tasks.listTasks(),
      (err: unknown) => {
        assert.ok(err instanceof BridgeProtocolError);
        assert.equal(err.code, 'BRIDGE_UNAVAILABLE');
        return true;
      }
    );
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('AndroidBridgePlatformAdapter round-trips CRUD, handshake, and rejects invalid backup before bridge call', async () => {
  const originalWindow = (globalThis as any).window;
  const recordedOperations: string[] = [];

  (globalThis as any).window = {
    KairosAndroidBridge: {
      postMessage(rawJson: string): string {
        const req = JSON.parse(rawJson);
        recordedOperations.push(req.operation);
        return JSON.stringify({
          requestId: req.requestId,
          version: BRIDGE_CONTRACT_VERSION,
          ok: true,
          data:
            req.operation === 'tasks.upsert'
              ? { ...req.payload.task, revision: (req.payload.task.revision || 0) + 1 }
              : req.operation === 'backup.restore'
              ? { restoredCounts: { tasks: 1 }, snapshotKey: 'sqlite_snap_1' }
              : { status: 'ok' },
        });
      },
    },
  };

  try {
    const adapter = new AndroidBridgePlatformAdapter(new AndroidSketchwareBridgeTransport());
    await adapter.initialize();
    const health = await adapter.lifecycle.getStorageHealth();
    assert.equal(health.healthy, true);

    const savedTask = await adapter.tasks.upsertTask({
      id: 't_bridge_1',
      title: 'تست پل اندروید',
      status: 'todo',
      completed: false,
      priority: 1,
      duration: 25,
      targetDate: '2026-03-30',
      category: 'work',
      tags: [],
      subtasks: [],
      createdAt: '2026-03-30T08:00:00.000Z',
      updatedAt: '2026-03-30T08:00:00.000Z',
      deletedAt: null,
      revision: 1,
    });
    assert.equal(savedTask.revision, 2);

    // Invalid backup must be rejected client-side BEFORE calling native bridge
    const opsBeforeInvalidRestore = recordedOperations.length;
    await assert.rejects(
      () =>
        adapter.backup.restoreBackup(
          {
            appId: 'wrong_app' as any,
            app: 'Kairos',
            formatVersion: 2,
            schemaVersion: 2,
            exportedAt: '2026-03-30T08:00:00.000Z',
            platform: 'android_webview',
            encrypted: false,
            checksum: 'bad',
            payload: {} as any,
          },
          'replace'
        ),
      /فایل پشتیبان|appId/
    );
    assert.equal(recordedOperations.length, opsBeforeInvalidRestore);

    // Valid backup envelope passes validation and invokes backup.restore on bridge
    const validPayload: BackupPayloadV2 = {
      tasks: [savedTask],
      habits: [],
      habitEntries: [],
      notes: [],
      focusSessions: [],
      settings: {
        id: 'default',
        theme: 'dark',
        soundEnabled: true,
        pomodoroWorkMinutes: 25,
        pomodoroShortBreakMinutes: 5,
        pomodoroLongBreakMinutes: 20,
        pomodoroCyclesBeforeLongBreak: 4,
        calendarPreference: 'jalali',
        updatedAt: '2026-03-30T08:00:00.000Z',
      },
    };
    const validEnvelope: BackupEnvelopeV2 = {
      appId: 'kairos',
      app: 'Kairos',
      formatVersion: 2,
      schemaVersion: 2,
      exportedAt: '2026-03-30T08:00:00.000Z',
      platform: 'android_webview',
      encrypted: false,
      checksum: computeBackupChecksum(validPayload),
      payload: validPayload,
    };
    const restoreRes = await adapter.backup.restoreBackup(validEnvelope, 'replace');
    assert.equal(restoreRes.restoredCounts.tasks, 1);
    assert.ok(recordedOperations.includes('backup.restore'));
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('AndroidBridgePlatformAdapter rejects VERSION_MISMATCH responses from host', async () => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = {
    KairosAndroidBridge: {
      postMessage(rawJson: string): string {
        const req = JSON.parse(rawJson);
        return JSON.stringify({
          requestId: req.requestId,
          version: '9.9.9',
          ok: true,
          data: [],
        });
      },
    },
  };

  try {
    const adapter = new AndroidBridgePlatformAdapter(new AndroidSketchwareBridgeTransport());
    await assert.rejects(
      () => adapter.tasks.listTasks(),
      (err: unknown) => {
        assert.ok(err instanceof BridgeProtocolError);
        assert.equal(err.code, 'VERSION_MISMATCH');
        return true;
      }
    );
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('WindowsDesktopPlatformAdapter fails closed when missing and handles async invoke & errors', async () => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = {};

  try {
    const disconnectedAdapter = new WindowsDesktopPlatformAdapter(
      new WindowsDesktopBridgeTransport()
    );
    const disconnectedHealth = await disconnectedAdapter.lifecycle.getStorageHealth();
    assert.equal(disconnectedHealth.healthy, false);

    // Now wire up mock Windows bridge host
    (globalThis as any).window = {
      __KAIROS_DESKTOP_BRIDGE__: {
        async invoke(rawJson: string): Promise<string> {
          const req = JSON.parse(rawJson);
          if (req.operation === 'notes.softDelete') {
            return JSON.stringify({
              requestId: req.requestId,
              version: BRIDGE_CONTRACT_VERSION,
              ok: false,
              error: {
                code: 'STORAGE_ERROR',
                message: 'خطای آزمایشی قفل دیتابیس در ویندوز',
              },
            });
          }
          return JSON.stringify({
            requestId: req.requestId,
            version: BRIDGE_CONTRACT_VERSION,
            ok: true,
            data:
              req.operation === 'backup.hasPreRestoreSnapshot'
                ? { exists: true, createdAt: '2026-03-30T09:00:00.000Z' }
                : [],
          });
        },
      },
    };

    const connectedAdapter = new WindowsDesktopPlatformAdapter(
      new WindowsDesktopBridgeTransport()
    );
    await connectedAdapter.initialize();
    const connectedHealth = await connectedAdapter.lifecycle.getStorageHealth();
    assert.equal(connectedHealth.healthy, true);

    assert.ok(connectedAdapter.backup.hasPreRestoreSnapshot);
    const snapInfo = await connectedAdapter.backup.hasPreRestoreSnapshot();
    assert.equal(snapInfo.exists, true);

    await assert.rejects(
      () => connectedAdapter.notes.softDeleteNote('n_locked'),
      (err: unknown) => {
        assert.ok(err instanceof BridgeProtocolError);
        assert.equal(err.code, 'STORAGE_ERROR');
        return true;
      }
    );
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('FIX-20: Native handoff files (KairosAndroidBridge.java, main.rs, tauri.conf.json) strictly match BridgeProtocol 1.0.0 and security policies', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const rootDir = process.cwd();

  const javaSource = fs.readFileSync(
    path.join(rootDir, 'handoff/android/KairosAndroidBridge.java'),
    'utf8'
  );
  const { ALLOWED_BRIDGE_OPERATIONS } = await import('./protocol');

  // 1. Uses "version" (not legacy "protocolVersion") and matches BRIDGE_CONTRACT_VERSION
  assert.ok(javaSource.includes(`CONTRACT_VERSION = "${BRIDGE_CONTRACT_VERSION}"`));
  assert.equal(javaSource.includes('"protocolVersion"'), false);

  // 2. Does NOT enable insecure setAllowUniversalAccessFromFileURLs(true)
  assert.equal(javaSource.includes('setAllowUniversalAccessFromFileURLs(true)'), false);

  // 3. Supports every operation in ALLOWED_BRIDGE_OPERATIONS
  for (const op of ALLOWED_BRIDGE_OPERATIONS) {
    assert.ok(
      javaSource.includes(`"${op}"`),
      `KairosAndroidBridge.java must implement operation "${op}"`
    );
  }

  // 4. Windows Tauri v2 project at /src-tauri/ and /handoff/windows/ match package.json version, protocol, and all 35 operations
  const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const tauriConf = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'src-tauri/tauri.conf.json'), 'utf8')
  );
  const handoffTauriConf = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'handoff/windows/tauri.conf.json'), 'utf8')
  );
  assert.equal(tauriConf.version, pkgJson.version);
  assert.equal(handoffTauriConf.version, pkgJson.version);
  assert.equal(tauriConf.app.windows[0].title, 'کایروس');
  assert.equal(tauriConf.build.frontendDist, '../dist');
  assert.equal(tauriConf.bundle.windows.nsis.installMode, 'currentUser');

  // Verify required Tauri v2 files & generated Windows icons exist on disk
  assert.ok(fs.existsSync(path.join(rootDir, 'src-tauri/Cargo.toml')));
  assert.ok(fs.existsSync(path.join(rootDir, 'src-tauri/build.rs')));
  assert.ok(fs.existsSync(path.join(rootDir, 'src-tauri/capabilities/default.json')));
  assert.ok(fs.existsSync(path.join(rootDir, 'src-tauri/icons/icon.ico')));
  assert.ok(fs.existsSync(path.join(rootDir, 'src-tauri/icons/icon.png')));
  assert.ok(fs.existsSync(path.join(rootDir, 'src-tauri/icons/32x32.png')));
  assert.ok(fs.existsSync(path.join(rootDir, 'src-tauri/icons/128x128.png')));

  const rustLibSource = fs.readFileSync(path.join(rootDir, 'src-tauri/src/lib.rs'), 'utf8');
  const rustDbSource = fs.readFileSync(path.join(rootDir, 'src-tauri/src/db.rs'), 'utf8');
  assert.ok(
    rustLibSource.includes(`BRIDGE_CONTRACT_VERSION: &str = "${BRIDGE_CONTRACT_VERSION}"`)
  );
  assert.ok(rustDbSource.includes('CONFLICT_STALE_REVISION'));
  assert.ok(rustDbSource.includes('PRAGMA journal_mode = WAL'));

  for (const op of ALLOWED_BRIDGE_OPERATIONS) {
    assert.ok(
      rustDbSource.includes(`"${op}"`),
      `src-tauri/src/db.rs must implement operation "${op}"`
    );
  }
});

test('WindowsDesktopPlatformAdapter end-to-end stateful contract: CRUD, expectedRevision conflict, settings theme persistence, timer recovery, and backup/restore/rollback', async () => {
  const originalWindow = (globalThis as any).window;

  // Stateful mirror of KairosSqliteDatabase (`src-tauri/src/db.rs`)
  const tasksTable = new Map<string, any>();
  const habitsTable = new Map<string, any>();
  const habitEntriesTable = new Map<string, any>();
  const notesTable = new Map<string, any>();
  const focusTable = new Map<string, any>();
  const kvState = new Map<string, any>();
  let settingsRow: any = {
    id: 'default',
    theme: 'system',
    soundEnabled: true,
    pomodoroWorkMinutes: 45,
    pomodoroShortBreakMinutes: 10,
    pomodoroLongBreakMinutes: 20,
    pomodoroCyclesBeforeLongBreak: 4,
    calendarPreference: 'jalali',
    updatedAt: '2026-03-30T08:00:00.000Z',
  };

  (globalThis as any).window = {
    __TAURI_INTERNALS__: {
      async invoke(cmd: string, args?: { rawRequest?: string }): Promise<string> {
        assert.equal(cmd, 'kairos_bridge_invoke');
        const req = JSON.parse(String(args?.rawRequest || '{}'));
        const reply = (ok: boolean, data?: unknown, error?: { code: string; message: string }) =>
          JSON.stringify({
            requestId: req.requestId || 'unknown',
            version: BRIDGE_CONTRACT_VERSION,
            ok,
            data,
            error,
          });

        if (req.version !== BRIDGE_CONTRACT_VERSION) {
          return reply(false, undefined, {
            code: 'VERSION_MISMATCH',
            message: 'Version mismatch',
          });
        }

        const p = req.payload || {};
        switch (req.operation) {
          case 'bridge.handshake':
            return reply(true, {
              status: 'ready',
              engine: 'windows_sqlite_bridge',
              version: BRIDGE_CONTRACT_VERSION,
            });
          case 'tasks.upsert': {
            const task = { ...p.task };
            const existing = tasksTable.get(task.id);
            if (p.expectedRevision !== undefined && existing && existing.revision !== p.expectedRevision) {
              return reply(false, undefined, {
                code: 'CONFLICT_STALE_REVISION',
                message: 'Revision conflict',
              });
            }
            task.revision = existing ? existing.revision + 1 : task.revision || 1;
            tasksTable.set(task.id, task);
            return reply(true, task);
          }
          case 'tasks.list': {
            const includeDeleted = Boolean(p.includeDeleted);
            const all = Array.from(tasksTable.values()).filter(
              (t) => includeDeleted || !t.deletedAt
            );
            return reply(true, all);
          }
          case 'tasks.softDelete': {
            const existing = tasksTable.get(p.id);
            if (existing) {
              existing.deletedAt = '2026-03-30T10:00:00.000Z';
              existing.revision += 1;
            }
            return reply(true, null);
          }
          case 'tasks.restore': {
            const existing = tasksTable.get(p.id);
            if (existing) {
              existing.deletedAt = null;
              existing.revision += 1;
              return reply(true, existing);
            }
            return reply(true, null);
          }
          case 'habits.upsert': {
            const habit = { ...p.habit, revision: 1 };
            habitsTable.set(habit.id, habit);
            return reply(true, habit);
          }
          case 'habits.toggleDate': {
            const h = habitsTable.get(p.habitId);
            if (!h) return reply(true, null);
            h.completedDates = { ...(h.completedDates || {}) };
            const entryKey = `he_${p.habitId}_${p.dateKey}`;
            if (h.completedDates[p.dateKey]) {
              delete h.completedDates[p.dateKey];
              habitEntriesTable.delete(entryKey);
            } else {
              h.completedDates[p.dateKey] = true;
              habitEntriesTable.set(entryKey, {
                id: entryKey,
                habitId: p.habitId,
                dateKey: p.dateKey,
                completed: true,
                createdAt: '2026-03-30T10:00:00.000Z',
                updatedAt: '2026-03-30T10:00:00.000Z',
                deletedAt: null,
                revision: 1,
              });
            }
            h.revision += 1;
            return reply(true, h);
          }
          case 'focus.logSession': {
            focusTable.set(p.session.id, p.session);
            return reply(true, p.session);
          }
          case 'focus.listSessions':
            return reply(true, Array.from(focusTable.values()));
          case 'focus.saveActiveTimer':
            if (p.state === null) kvState.delete('active_timer');
            else kvState.set('active_timer', p.state);
            return reply(true, null);
          case 'focus.getActiveTimer':
            return reply(true, kvState.get('active_timer') ?? null);
          case 'settings.get':
            return reply(true, settingsRow);
          case 'settings.save':
            settingsRow = { ...settingsRow, ...p.settings, id: 'default' };
            return reply(true, settingsRow);
          case 'backup.export': {
            const payloadObj: BackupPayloadV2 = {
              tasks: Array.from(tasksTable.values()),
              habits: Array.from(habitsTable.values()),
              habitEntries: Array.from(habitEntriesTable.values()),
              notes: Array.from(notesTable.values()),
              focusSessions: Array.from(focusTable.values()),
              settings: settingsRow,
            };
            return reply(true, {
              appId: 'kairos',
              app: 'Kairos',
              formatVersion: 2,
              schemaVersion: 2,
              exportedAt: '2026-03-30T12:00:00.000Z',
              platform: 'windows_desktop',
              encrypted: false,
              checksum: 'rust_fnv1a',
              payload: payloadObj,
            });
          }
          case 'backup.restore': {
            kvState.set('pre_restore_snapshot', {
              tasks: Array.from(tasksTable.values()),
              settings: { ...settingsRow },
            });
            if (p.strategy === 'replace') {
              tasksTable.clear();
            }
            for (const t of p.envelope.payload.tasks || []) {
              tasksTable.set(t.id, t);
            }
            if (p.envelope.payload.settings) {
              settingsRow = { ...p.envelope.payload.settings, id: 'default' };
            }
            return reply(true, {
              restoredCounts: { tasks: tasksTable.size },
              snapshotKey: 'kairos_pre_restore_snapshot_v2',
            });
          }
          case 'backup.hasPreRestoreSnapshot':
            return reply(true, { exists: kvState.has('pre_restore_snapshot') });
          case 'backup.rollback': {
            const snap = kvState.get('pre_restore_snapshot');
            tasksTable.clear();
            for (const t of snap.tasks) tasksTable.set(t.id, t);
            settingsRow = snap.settings;
            kvState.delete('pre_restore_snapshot');
            return reply(true, { restoredCounts: { tasks: tasksTable.size } });
          }
          default:
            return reply(true, []);
        }
      },
    },
  };

  try {
    const adapter = new WindowsDesktopPlatformAdapter(new WindowsDesktopBridgeTransport());
    await adapter.initialize();

    // 1. Default theme is 'system'
    const initialSettings = await adapter.settings.getSettings();
    assert.equal(initialSettings.theme, 'system');

    // 2. Save manual theme ('dark') and verify persistence
    const updatedSettings = await adapter.settings.saveSettings({ theme: 'dark' });
    assert.equal(updatedSettings.theme, 'dark');
    assert.equal((await adapter.settings.getSettings()).theme, 'dark');

    // 3. Task CRUD + Optimistic Concurrency Check (CONFLICT_STALE_REVISION)
    const created = await adapter.tasks.upsertTask({
      id: 't_win_1',
      title: 'نصب ویندوز کایروس',
      status: 'todo',
      completed: false,
      priority: 1,
      duration: 45,
      targetDate: '2026-03-30',
      category: 'work',
      tags: [],
      subtasks: [],
      createdAt: '2026-03-30T08:00:00.000Z',
      updatedAt: '2026-03-30T08:00:00.000Z',
      deletedAt: null,
      revision: 1,
    });
    assert.equal(created.revision, 1);

    const updated = await adapter.tasks.upsertTask(
      { ...created, title: 'نصب ویندوز کایروس - ویرایش ۲' },
      { expectedRevision: 1 }
    );
    assert.equal(updated.revision, 2);

    // Stale expectedRevision (1 instead of 2) must throw CONFLICT_STALE_REVISION
    await assert.rejects(
      () => adapter.tasks.upsertTask(updated, { expectedRevision: 1 }),
      (err: any) => err?.code === 'CONFLICT_STALE_REVISION'
    );

    // 4. Soft delete & restore
    await adapter.tasks.softDeleteTask('t_win_1');
    assert.equal((await adapter.tasks.listTasks()).length, 0);
    await adapter.tasks.restoreTask('t_win_1');
    assert.equal((await adapter.tasks.listTasks()).length, 1);

    // 5. Idempotent focus session logging (no duplicate on sleep/resume)
    const sessionEntity = {
      id: 'fs_unique_1',
      taskId: 't_win_1',
      taskTitle: 'نصب ویندوز کایروس',
      phase: 'work' as const,
      plannedMinutes: 45,
      durationMinutes: 45,
      dateKey: '2026-03-30',
      startedAt: '2026-03-30T09:00:00.000Z',
      endedAt: '2026-03-30T09:45:00.000Z',
      completedNaturally: true,
      createdAt: '2026-03-30T09:45:00.000Z',
      updatedAt: '2026-03-30T09:45:00.000Z',
      deletedAt: null,
      revision: 1,
    };
    await adapter.focus.logFocusSession(sessionEntity);
    await adapter.focus.logFocusSession(sessionEntity);
    assert.equal((await adapter.focus.listFocusSessions()).length, 1);

    // 6. Export backup -> Restore empty backup -> Rollback to pre-restore snapshot
    const exported = await adapter.backup.exportBackup();
    assert.equal(exported.payload.tasks.length, 1);
    const emptyPayload: BackupPayloadV2 = {
      tasks: [],
      habits: [],
      habitEntries: [],
      notes: [],
      focusSessions: [],
      settings: { ...updatedSettings, theme: 'light' },
    };
    const emptyEnvelope: BackupEnvelopeV2 = {
      appId: 'kairos',
      app: 'Kairos',
      formatVersion: 2,
      schemaVersion: 2,
      exportedAt: '2026-03-30T12:05:00.000Z',
      platform: 'web',
      encrypted: false,
      checksum: computeBackupChecksum(emptyPayload),
      payload: emptyPayload,
    };
    await adapter.backup.restoreBackup(emptyEnvelope, 'replace');
    assert.equal((await adapter.tasks.listTasks()).length, 0);
    assert.equal((await adapter.backup.hasPreRestoreSnapshot!()).exists, true);

    await adapter.backup.rollbackLastRestore!();
    assert.equal((await adapter.tasks.listTasks()).length, 1);
    assert.equal((await adapter.settings.getSettings()).theme, 'dark');
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

