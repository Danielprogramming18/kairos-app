/**
 * Android Sketchware WebView Native Bridge Adapter
 * Communicates with `window.KairosAndroidBridge` via versioned async JSON messages (`1.0.0`).
 * Never silently falls back to browser storage when configured for native Android mode.
 */

import {
  BRIDGE_CONTRACT_VERSION,
  BridgeOperation,
  BridgeProtocolError,
  BridgeResponseEnvelope,
  createBridgeRequest,
  DEFAULT_BRIDGE_TIMEOUT_MS,
} from '../bridge/protocol';
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
  validateAndPreviewBackupPayload,
  validateBackupEnvelopeObject,
} from '../../utils/backupCrypto';

export interface SketchwareAndroidJavascriptInterface {
  postMessage(rawRequestJson: string): string | void;
}

declare global {
  interface Window {
    KairosAndroidBridge?: SketchwareAndroidJavascriptInterface;
    __onKairosNativeBridgeResponse?: (rawResponseJson: string) => void;
  }
}

export class AndroidSketchwareBridgeTransport {
  private pending = new Map<
    string,
    {
      resolve: (data: any) => void;
      reject: (err: BridgeProtocolError) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor() {
    if (typeof window !== 'undefined') {
      window.__onKairosNativeBridgeResponse = (rawResponseJson: string) => {
        this.handleIncomingResponse(rawResponseJson);
      };
    }
  }

  public isAvailable(): boolean {
    return Boolean(
      typeof window !== 'undefined' &&
        window.KairosAndroidBridge &&
        typeof window.KairosAndroidBridge.postMessage === 'function'
    );
  }

  private handleIncomingResponse(rawResponseJson: string) {
    let parsed: BridgeResponseEnvelope;
    try {
      parsed = JSON.parse(rawResponseJson);
    } catch {
      return;
    }
    if (!parsed || typeof parsed.requestId !== 'string') return;
    const entry = this.pending.get(parsed.requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(parsed.requestId);

    if (parsed.version && parsed.version !== BRIDGE_CONTRACT_VERSION) {
      entry.reject(
        new BridgeProtocolError(
          'VERSION_MISMATCH',
          `عدم تطابق نسخهٔ پل اندروید: ${parsed.version} !== ${BRIDGE_CONTRACT_VERSION}`
        )
      );
      return;
    }

    if (!parsed.ok) {
      entry.reject(
        new BridgeProtocolError(
          parsed.error?.code || 'STORAGE_ERROR',
          parsed.error?.message || 'خطا در اجرای دستور روی دیتابیس SQLite اندروید.'
        )
      );
      return;
    }

    entry.resolve(parsed.data);
  }

  public async invoke<TPayload, TResult>(
    operation: BridgeOperation,
    payload: TPayload,
    timeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS
  ): Promise<TResult> {
    if (!this.isAvailable()) {
      throw new BridgeProtocolError(
        'BRIDGE_UNAVAILABLE',
        'پل ارتباطی بومی اندروید (window.KairosAndroidBridge) در دسترس نیست. ذخیره‌سازی متوقف شد تا از از دست رفتن خاموش داده جلوگیری شود.'
      );
    }

    const req = createBridgeRequest(operation, payload);

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req.requestId);
        reject(
          new BridgeProtocolError(
            'TIMEOUT',
            `پاسخی از میزبان اندروید برای عملیات ${operation} پس از ${timeoutMs} میلی‌ثانیه دریافت نشد.`
          )
        );
      }, timeoutMs);

      this.pending.set(req.requestId, { resolve, reject, timer });

      try {
        const syncReturn = window.KairosAndroidBridge!.postMessage(JSON.stringify(req));
        if (typeof syncReturn === 'string' && syncReturn.trim()) {
          this.handleIncomingResponse(syncReturn);
        }
      } catch (err: any) {
        clearTimeout(timer);
        this.pending.delete(req.requestId);
        reject(
          new BridgeProtocolError(
            'STORAGE_ERROR',
            err?.message || 'خطا در ارسال پیام به JavascriptInterface اندروید.'
          )
        );
      }
    });
  }
}

export class AndroidBridgePlatformAdapter implements PlatformContainer {
  private readonly transport: AndroidSketchwareBridgeTransport;
  public readonly tasks: TaskRepository;
  public readonly habits: HabitRepository;
  public readonly notes: NoteRepository;
  public readonly focus: FocusRepository;
  public readonly settings: SettingsRepository;
  public readonly backup: BackupService;
  public readonly notifications: NotificationService;
  public readonly lifecycle: AppLifecycleService;

  constructor(transport = new AndroidSketchwareBridgeTransport()) {
    this.transport = transport;

    this.tasks = {
      listTasks: (filter?: TaskFilter) =>
        this.transport.invoke<TaskFilter | undefined, TaskEntity[]>('tasks.list', filter),
      getTaskById: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, TaskEntity | null>('tasks.getById', { id }),
      upsertTask: (task: TaskEntity, options?: { expectedRevision?: number }) =>
        this.transport.invoke<{ task: TaskEntity; expectedRevision?: number }, TaskEntity>(
          'tasks.upsert',
          { task, expectedRevision: options?.expectedRevision }
        ),
      upsertTasksBatch: (tasks: TaskEntity[]) =>
        this.transport.invoke<{ tasks: TaskEntity[] }, TaskEntity[]>('tasks.upsertBatch', {
          tasks,
        }),
      softDeleteTask: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, void>('tasks.softDelete', { id }),
      restoreTask: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, TaskEntity | null>('tasks.restore', { id }),
      hardDeleteTask: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, void>('tasks.hardDelete', { id }),
    };

    this.habits = {
      listHabits: (includeDeleted = false) =>
        this.transport.invoke<{ includeDeleted: boolean }, HabitEntity[]>('habits.list', {
          includeDeleted,
        }),
      getHabitById: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, HabitEntity | null>('habits.getById', { id }),
      upsertHabit: (habit: HabitEntity, options?: { expectedRevision?: number }) =>
        this.transport.invoke<{ habit: HabitEntity; expectedRevision?: number }, HabitEntity>(
          'habits.upsert',
          { habit, expectedRevision: options?.expectedRevision }
        ),
      toggleHabitDate: (habitId: EntityId, dateKey: LocalDateKey) =>
        this.transport.invoke<{ habitId: EntityId; dateKey: LocalDateKey }, HabitEntity | null>(
          'habits.toggleDate',
          { habitId, dateKey }
        ),
      listHabitEntries: (habitId?: EntityId) =>
        this.transport.invoke<{ habitId?: EntityId }, HabitEntryEntity[]>('habits.listEntries', {
          habitId,
        }),
      softDeleteHabit: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, void>('habits.softDelete', { id }),
      restoreHabit: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, HabitEntity | null>('habits.restore', { id }),
      hardDeleteHabit: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, void>('habits.hardDelete', { id }),
    };

    this.notes = {
      listNotes: (kind?: NoteKind, includeDeleted = false) =>
        this.transport.invoke<{ kind?: NoteKind; includeDeleted: boolean }, NoteEntity[]>(
          'notes.list',
          { kind, includeDeleted }
        ),
      upsertNote: (note: NoteEntity, options?: { expectedRevision?: number }) =>
        this.transport.invoke<{ note: NoteEntity; expectedRevision?: number }, NoteEntity>(
          'notes.upsert',
          { note, expectedRevision: options?.expectedRevision }
        ),
      softDeleteNote: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, void>('notes.softDelete', { id }),
      restoreNote: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, NoteEntity | null>('notes.restore', { id }),
      hardDeleteNote: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, void>('notes.hardDelete', { id }),
    };

    this.focus = {
      listFocusSessions: (includeDeleted = false) =>
        this.transport.invoke<{ includeDeleted: boolean }, FocusSessionEntity[]>(
          'focus.listSessions',
          { includeDeleted }
        ),
      logFocusSession: (session: FocusSessionEntity) =>
        this.transport.invoke<{ session: FocusSessionEntity }, FocusSessionEntity>(
          'focus.logSession',
          { session }
        ),
      getActiveTimerState: () =>
        this.transport.invoke<Record<string, never>, ActiveTimerState | null>(
          'focus.getActiveTimer',
          {}
        ),
      saveActiveTimerState: (state: ActiveTimerState | null) =>
        this.transport.invoke<{ state: ActiveTimerState | null }, void>('focus.saveActiveTimer', {
          state,
        }),
    };

    this.settings = {
      getSettings: () =>
        this.transport.invoke<Record<string, never>, UserSettingsEntity>('settings.get', {}),
      saveSettings: (settings: Partial<UserSettingsEntity>) =>
        this.transport.invoke<{ settings: Partial<UserSettingsEntity> }, UserSettingsEntity>(
          'settings.save',
          { settings }
        ),
    };

    this.backup = {
      exportBackup: () =>
        this.transport.invoke<Record<string, never>, BackupEnvelopeV2>('backup.export', {}),
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
      restoreBackup: async (envelope: BackupEnvelopeV2, strategy: 'replace' | 'merge') => {
        const validation = validateBackupEnvelopeObject(envelope, { verifyChecksum: true });
        if (!validation.valid || !validation.envelope) {
          throw new Error(
            validation.errors.join(' | ') || 'فایل پشتیبان نامعتبر است و عملیات بازیابی لغو شد.'
          );
        }
        return this.transport.invoke<
          { envelope: BackupEnvelopeV2; strategy: 'replace' | 'merge' },
          { restoredCounts: Record<string, number>; snapshotKey?: string }
        >('backup.restore', { envelope: validation.envelope, strategy });
      },
      hasPreRestoreSnapshot: () =>
        this.transport.invoke<Record<string, never>, { exists: boolean; createdAt?: string }>(
          'backup.hasPreRestoreSnapshot',
          {}
        ),
      rollbackLastRestore: () =>
        this.transport.invoke<Record<string, never>, { restoredCounts: Record<string, number> }>(
          'backup.rollback',
          {}
        ),
    };

    this.notifications = {
      getPermissionStatus: () =>
        this.transport.invoke<
          Record<string, never>,
          'granted' | 'denied' | 'default' | 'unsupported'
        >('notifications.getPermission', {}),
      requestPermission: () =>
        this.transport.invoke<
          Record<string, never>,
          'granted' | 'denied' | 'default' | 'unsupported'
        >('notifications.requestPermission', {}),
      scheduleTaskReminder: (task: TaskEntity) =>
        this.transport.invoke<{ task: TaskEntity }, void>('notifications.scheduleReminder', {
          task,
        }),
      cancelTaskReminder: (taskId: EntityId) =>
        this.transport.invoke<{ taskId: EntityId }, void>('notifications.cancelReminder', {
          taskId,
        }),
    };

    this.lifecycle = {
      getPlatformKind: () => 'android_webview',
      getStorageHealth: async () => {
        if (!this.transport.isAvailable()) {
          return {
            engine: 'android_sqlite_bridge',
            healthy: false,
            errorMessage: 'پل بومی اندروید (KairosAndroidBridge) متصل نیست.',
          };
        }
        try {
          await this.transport.invoke('bridge.handshake', {
            clientVersion: BRIDGE_CONTRACT_VERSION,
          });
          return {
            engine: 'android_sqlite_bridge',
            healthy: true,
          };
        } catch (err: any) {
          return {
            engine: 'android_sqlite_bridge',
            healthy: false,
            errorMessage: err?.message || 'خطا در handshake با میزبان اندروید.',
          };
        }
      },
    };
  }

  async initialize(): Promise<MigrationReport | null> {
    await this.transport.invoke('bridge.handshake', {
      clientVersion: BRIDGE_CONTRACT_VERSION,
    });
    return null;
  }
}
