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
