/**
 * Windows Desktop Native Host Adapter (Tauri v2 / WebView2 Host)
 * Communicates with `window.__KAIROS_DESKTOP_BRIDGE__` via versioned async JSON messages (`1.0.0`).
 * Never silently falls back to browser storage when configured for native Windows desktop mode.
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

export interface WindowsDesktopBridgeHost {
  invoke(rawRequestJson: string): Promise<string>;
}

declare global {
  interface Window {
    __KAIROS_DESKTOP_BRIDGE__?: WindowsDesktopBridgeHost;
  }
}

export class WindowsDesktopBridgeTransport {
  public isAvailable(): boolean {
    return Boolean(
      typeof window !== 'undefined' &&
        window.__KAIROS_DESKTOP_BRIDGE__ &&
        typeof window.__KAIROS_DESKTOP_BRIDGE__.invoke === 'function'
    );
  }

  public async invoke<TPayload, TResult>(
    operation: BridgeOperation,
    payload: TPayload,
    timeoutMs = DEFAULT_BRIDGE_TIMEOUT_MS
  ): Promise<TResult> {
    if (!this.isAvailable()) {
      throw new BridgeProtocolError(
        'BRIDGE_UNAVAILABLE',
        'پل ارتباطی دسکتاپ ویندوز (window.__KAIROS_DESKTOP_BRIDGE__) در دسترس نیست. ذخیره‌سازی متوقف شد تا از از دست رفتن خاموش داده جلوگیری شود.'
      );
    }

    const req = createBridgeRequest(operation, payload);

    const responsePromise = window.__KAIROS_DESKTOP_BRIDGE__!.invoke(JSON.stringify(req));
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new BridgeProtocolError(
              'TIMEOUT',
              `پاسخی از میزبان دسکتاپ ویندوز برای عملیات ${operation} پس از ${timeoutMs} میلی‌ثانیه دریافت نشد.`
            )
          ),
        timeoutMs
      )
    );

    const rawResponse = await Promise.race([responsePromise, timeoutPromise]);
    let parsed: BridgeResponseEnvelope<TResult>;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      throw new BridgeProtocolError(
        'VALIDATION_ERROR',
        'پاسخ دریافتی از میزبان ویندوز یک JSON معتبر نیست.'
      );
    }

    if (parsed.version && parsed.version !== BRIDGE_CONTRACT_VERSION) {
      throw new BridgeProtocolError(
        'VERSION_MISMATCH',
        `عدم تطابق نسخهٔ پل دسکتاپ ویندوز: ${parsed.version} !== ${BRIDGE_CONTRACT_VERSION}`
      );
    }

    if (!parsed.ok) {
      throw new BridgeProtocolError(
        parsed.error?.code || 'STORAGE_ERROR',
        parsed.error?.message || 'خطا در اجرای دستور روی دیتابیس SQLite دسکتاپ ویندوز.'
      );
    }

    return parsed.data as TResult;
  }
}

export class WindowsDesktopPlatformAdapter implements PlatformContainer {
  private readonly transport: WindowsDesktopBridgeTransport;
  public readonly tasks: TaskRepository;
  public readonly habits: HabitRepository;
  public readonly notes: NoteRepository;
  public readonly focus: FocusRepository;
  public readonly settings: SettingsRepository;
  public readonly backup: BackupService;
  public readonly notifications: NotificationService;
  public readonly lifecycle: AppLifecycleService;

  constructor(transport = new WindowsDesktopBridgeTransport()) {
    this.transport = transport;

    this.tasks = {
      listTasks: (filter?: TaskFilter) =>
        this.transport.invoke<TaskFilter | undefined, TaskEntity[]>('tasks.list', filter),
      getTaskById: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, TaskEntity | null>('tasks.getById', { id }),
      upsertTask: (task: TaskEntity) =>
        this.transport.invoke<{ task: TaskEntity }, TaskEntity>('tasks.upsert', { task }),
      upsertTasksBatch: (tasks: TaskEntity[]) =>
        this.transport.invoke<{ tasks: TaskEntity[] }, TaskEntity[]>('tasks.upsertBatch', {
          tasks,
        }),
      softDeleteTask: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, void>('tasks.softDelete', { id }),
      restoreTask: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, TaskEntity | null>('tasks.restore', { id }),
    };

    this.habits = {
      listHabits: (includeDeleted = false) =>
        this.transport.invoke<{ includeDeleted: boolean }, HabitEntity[]>('habits.list', {
          includeDeleted,
        }),
      getHabitById: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, HabitEntity | null>('habits.getById', { id }),
      upsertHabit: (habit: HabitEntity) =>
        this.transport.invoke<{ habit: HabitEntity }, HabitEntity>('habits.upsert', { habit }),
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
    };

    this.notes = {
      listNotes: (kind?: NoteKind, includeDeleted = false) =>
        this.transport.invoke<{ kind?: NoteKind; includeDeleted: boolean }, NoteEntity[]>(
          'notes.list',
          { kind, includeDeleted }
        ),
      upsertNote: (note: NoteEntity) =>
        this.transport.invoke<{ note: NoteEntity }, NoteEntity>('notes.upsert', { note }),
      softDeleteNote: (id: EntityId) =>
        this.transport.invoke<{ id: EntityId }, void>('notes.softDelete', { id }),
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
        try {
          const parsed = JSON.parse(rawJson);
          if (!parsed || typeof parsed !== 'object') {
            return { valid: false, errors: ['ساختار فایل پشتیبان نامعتبر است.'] };
          }
          return { valid: true, errors: [], envelope: parsed as BackupEnvelopeV2 };
        } catch {
          return { valid: false, errors: ['فایل JSON معتبر نیست.'] };
        }
      },
      restoreBackup: (envelope: BackupEnvelopeV2, strategy: 'replace' | 'merge') =>
        this.transport.invoke<
          { envelope: BackupEnvelopeV2; strategy: 'replace' | 'merge' },
          { restoredCounts: Record<string, number> }
        >('backup.restore', { envelope, strategy }),
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
      getPlatformKind: () => 'windows_desktop',
      getStorageHealth: async () => {
        if (!this.transport.isAvailable()) {
          return {
            engine: 'windows_sqlite_bridge',
            healthy: false,
            errorMessage: 'پل بومی دسکتاپ ویندوز (__KAIROS_DESKTOP_BRIDGE__) متصل نیست.',
          };
        }
        try {
          await this.transport.invoke('bridge.handshake', {
            clientVersion: BRIDGE_CONTRACT_VERSION,
          });
          return {
            engine: 'windows_sqlite_bridge',
            healthy: true,
          };
        } catch (err: any) {
          return {
            engine: 'windows_sqlite_bridge',
            healthy: false,
            errorMessage: err?.message || 'خطا در handshake با میزبان ویندوز.',
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
