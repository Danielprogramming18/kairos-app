/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { BellRing, X, Check, AlertTriangle, RefreshCw, Download, Database } from 'lucide-react';
import { Header } from './components/Header';
import { Navigation, NavTabId } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { DeepFocusView } from './components/DeepFocusView';
import { CalendarView } from './components/CalendarView';
import { HabitsView } from './components/HabitsView';
import { WorkspaceView } from './components/WorkspaceView';
import { UsefulInfoView } from './components/UsefulInfoView';
import { AIAssistantView } from './components/AIAssistantView';
import { FocusTimerView } from './components/FocusTimerView';
import { NotesAndIdeasView } from './components/NotesAndIdeasView';
import { AnalyticsView } from './components/AnalyticsView';
import { BackupAndSyncView, DeletedTrashItem } from './components/BackupAndSyncView';
import { GlobalMiniTimer } from './components/GlobalMiniTimer';
import { useGlobalPomodoro } from './app/useGlobalPomodoro';
import { HabitModal } from './components/HabitModal';
import { TaskModal } from './components/TaskModal';
import { DeleteModal } from './components/DeleteModal';
import {
  Habit,
  Task,
  Idea,
  FocusSession,
  HabitCategory,
  UsefulInfoItem,
  GitHubSyncConfig,
} from './types';
import {
  getInitialHabits,
  getInitialTasks,
  getInitialIdeas,
  getInitialUsefulInfos,
} from './utils/initialData';
import { soundManager } from './utils/soundEffects';
import { getTodayKey, getTomorrowKey, toPersianNum } from './utils/persianDate';
import {
  loadGitHubConfig,
  saveGitHubConfig,
  isGitHubConfigValid,
  fetchGitHubDataFile,
  pushGitHubDataFile,
  GITHUB_LAST_SHA_STORAGE_KEY,
} from './utils/githubSync';
import {
  usePlatform,
  domainEntityToTask,
  taskToDomainEntity,
  domainEntityToHabit,
  habitToDomainEntity,
  ideaToDomainNote,
  domainNoteToIdea,
  usefulInfoToDomainNote,
  domainNoteToUsefulInfo,
  focusSessionToDomainEntity,
  domainEntityToFocusSession,
} from './app/PlatformContext';
import { BackupEnvelopeV2, createEntityId, nowIso } from './domain/models';
import { CROSS_TAB_SYNC_CHANNEL } from './infrastructure/web/dexieAdapter';
import { createPlainBackupEnvelope } from './utils/backupCrypto';

const HASH_TO_TAB: Record<string, NavTabId> = {
  '#/today': 'dashboard',
  '#/dashboard': 'dashboard',
  '#/tasks': 'workspace',
  '#/workspace': 'workspace',
  '#/calendar': 'calendar',
  '#/habits': 'habits',
  '#/focus': 'deep_focus',
  '#/deep_focus': 'deep_focus',
  '#/pomodoro': 'pomodoro',
  '#/notes': 'useful_info',
  '#/useful_info': 'useful_info',
  '#/ideas': 'ideas',
  '#/planner': 'planner',
  '#/insights': 'analytics',
  '#/analytics': 'analytics',
  '#/settings': 'sync',
  '#/sync': 'sync',
  '#/trash': 'sync',
};

const TAB_TO_HASH: Record<NavTabId, string> = {
  dashboard: '#/today',
  workspace: '#/tasks',
  calendar: '#/calendar',
  habits: '#/habits',
  deep_focus: '#/focus',
  pomodoro: '#/pomodoro',
  useful_info: '#/notes',
  ideas: '#/ideas',
  planner: '#/planner',
  analytics: '#/insights',
  sync: '#/settings',
};

export type StorageLifecycleStatus = 'initializing' | 'ready' | 'saving' | 'saved' | 'error';

export default function App() {
  const { container, ready: platformReady, migrationReport, bridgeError } = usePlatform();

  // 1. UI Navigation State with Hash Route Support
  const [activeTab, setActiveTabState] = useState<NavTabId>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const mapped = HASH_TO_TAB[window.location.hash];
      if (mapped) return mapped;
    }
    return 'dashboard';
  });

  const setActiveTab = useCallback((tab: NavTabId) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const targetHash = TAB_TO_HASH[tab] || '#/today';
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const mapped = HASH_TO_TAB[window.location.hash];
      if (mapped) {
        setActiveTabState(mapped);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => getTodayKey());
  const [isDark, setIsDark] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  // Active in-app reminder banner
  const [activeReminderAlert, setActiveReminderAlert] = useState<{
    taskId?: string;
    title: string;
    time: string;
  } | null>(null);

  // 2. Single Source of Truth State (Purely hydrated from Repository — NO independent localStorage DB)
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [storageStatus, setStorageStatus] = useState<StorageLifecycleStatus>('initializing');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [lastFailedOperation, setLastFailedOperation] = useState<{
    label: string;
    retry: () => Promise<void>;
  } | null>(null);

  const [habits, setHabits] = useState<Habit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [usefulInfos, setUsefulInfos] = useState<UsefulInfoItem[]>([]);
  const [deletedTrashItems, setDeletedTrashItems] = useState<DeletedTrashItem[]>([]);

  // Toast notifications (BUG-41: timer cleanup on unmount; BUG-44: Undo action support)
  const [toasts, setToasts] = useState<
    Array<{ id: string; text: string; type: 'info' | 'success'; onUndo?: () => void }>
  >([]);
  const toastTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  const showToast = useCallback(
    (text: string, type: 'info' | 'success' = 'info', onUndo?: () => void) => {
      const id = createEntityId('toast');
      setToasts((prev) => [...prev, { id, text, type, onUndo }]);
      const durationMs = onUndo ? 6000 : 3200;
      const timerId = setTimeout(() => {
        toastTimersRef.current.delete(timerId);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
      toastTimersRef.current.add(timerId);
    },
    []
  );

  // Canonical reload from Repository (Tasks, Habits, Notes/Ideas/UsefulInfo, FocusSessions, Settings, Trash)
  const reloadAllFromRepository = useCallback(async () => {
    const [allTaskEntities, allHabitEntities, allNoteEntities, allFocusEntities, userSettings] =
      await Promise.all([
        container.tasks.listTasks({ includeDeleted: true }),
        container.habits.listHabits(true),
        container.notes.listNotes(undefined, true),
        container.focus.listFocusSessions(false),
        container.settings.getSettings(),
      ]);

    const activeTasks = allTaskEntities.filter((t) => !t.deletedAt).map(domainEntityToTask);
    const activeHabits = allHabitEntities.filter((h) => !h.deletedAt).map(domainEntityToHabit);
    const activeIdeas = allNoteEntities
      .filter((n) => n.kind === 'idea' && !n.deletedAt)
      .map(domainNoteToIdea);
    const activeUsefulInfos = allNoteEntities
      .filter((n) => n.kind === 'useful_info' && !n.deletedAt)
      .map(domainNoteToUsefulInfo);
    const activeFocusSessions = allFocusEntities.map(domainEntityToFocusSession);

    // Build unified Recycle Bin / Trash view directly from soft-deleted Repository records
    const trashList: DeletedTrashItem[] = [
      ...allTaskEntities
        .filter((t) => Boolean(t.deletedAt))
        .map((t) => ({
          id: t.id,
          type: 'task' as const,
          title: t.title,
          deletedAt: t.deletedAt!,
          payload: domainEntityToTask(t),
        })),
      ...allHabitEntities
        .filter((h) => Boolean(h.deletedAt))
        .map((h) => ({
          id: h.id,
          type: 'habit' as const,
          title: h.title,
          deletedAt: h.deletedAt!,
          payload: domainEntityToHabit(h),
        })),
      ...allNoteEntities
        .filter((n) => Boolean(n.deletedAt) && (n.kind === 'idea' || n.kind === 'useful_info'))
        .map((n) => ({
          id: n.id,
          type: (n.kind === 'idea' ? 'idea' : 'useful_info') as 'idea' | 'useful_info',
          title: n.title,
          deletedAt: n.deletedAt!,
          payload: n.kind === 'idea' ? domainNoteToIdea(n) : domainNoteToUsefulInfo(n),
        })),
    ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

    setTasks(activeTasks);
    setHabits(activeHabits);
    setIdeas(activeIdeas);
    setUsefulInfos(activeUsefulInfos);
    setFocusSessions(activeFocusSessions);
    setDeletedTrashItems(trashList);

    const nextDark = userSettings.theme !== 'light';
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    setSoundEnabled(userSettings.soundEnabled);
    soundManager.setEnabled(userSettings.soundEnabled);
  }, [container]);

  // Startup Hydration (runs ONLY after PlatformProvider initialization & migration finish)
  const hasHydratedFromRepoRef = useRef<boolean>(false);
  useEffect(() => {
    if (!platformReady) return;
    if (bridgeError) {
      setStorageStatus('error');
      setStorageError(bridgeError);
      setIsHydrated(true);
      return;
    }
    if (hasHydratedFromRepoRef.current) return;
    hasHydratedFromRepoRef.current = true;

    (async () => {
      try {
        setStorageStatus('initializing');
        await reloadAllFromRepository();
        setStorageStatus('ready');
        setStorageError(null);
      } catch (err: any) {
        const msg =
          err?.message || 'خطا در خواندن اطلاعات از پایگاه‌دادهٔ محلی (IndexedDB / Bridge).';
        setStorageStatus('error');
        setStorageError(msg);
      } finally {
        setIsHydrated(true);
      }
    })();
  }, [platformReady, bridgeError, reloadAllFromRepository]);

  // Cross-Tab Synchronization via BroadcastChannel (prevents silent overwrite across multiple open tabs)
  useEffect(() => {
    if (!isHydrated || bridgeError || typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CROSS_TAB_SYNC_CHANNEL);
      channel.onmessage = () => {
        reloadAllFromRepository().catch((err: any) => {
          setStorageStatus('error');
          setStorageError(err?.message || 'خطا در همگام‌سازی تب‌های موازی.');
        });
      };
    } catch {
      // BroadcastChannel unavailable
    }
    return () => {
      if (channel) channel.close();
    };
  }, [isHydrated, bridgeError, reloadAllFromRepository]);

  // Unified Transactional Storage Mutation Runner:
  // UI action -> validation -> repository transaction -> result -> UI update (never hides errors)
  const executeStorageMutation = useCallback(
    async <T,>(
      label: string,
      mutationFn: () => Promise<T>,
      onSuccess?: (result: T) => void
    ): Promise<T | null> => {
      setStorageStatus('saving');
      setStorageError(null);
      try {
        const result = await mutationFn();
        await reloadAllFromRepository();
        setStorageStatus('saved');
        setLastFailedOperation(null);
        if (onSuccess) onSuccess(result);
        return result;
      } catch (err: any) {
        const msg = err?.message || `خطا در ذخیرهٔ تغییرات (${label}).`;
        setStorageStatus('error');
        setStorageError(msg);
        setLastFailedOperation({
          label,
          retry: async () => {
            await executeStorageMutation(label, mutationFn, onSuccess);
          },
        });
        showToast(`خطا در ذخیره‌سازی: ${msg}`);
        return null;
      }
    },
    [reloadAllFromRepository, showToast]
  );

  // Optional Sample Data Loader for Clean First Run (Never auto-seeds on empty DB)
  const handleLoadSampleData = useCallback(async () => {
    await executeStorageMutation(
      'بارگذاری داده‌های نمونه آزمایشی',
      async () => {
        const sampleTasks = getInitialTasks().map(taskToDomainEntity);
        const sampleHabits = getInitialHabits().map(habitToDomainEntity);
        const sampleIdeas = getInitialIdeas().map(ideaToDomainNote);
        const sampleUseful = getInitialUsefulInfos().map(usefulInfoToDomainNote);

        await container.tasks.upsertTasksBatch(sampleTasks);
        for (const h of sampleHabits) {
          await container.habits.upsertHabit(h);
        }
        for (const n of [...sampleIdeas, ...sampleUseful]) {
          await container.notes.upsertNote(n);
        }
      },
      () => {
        showToast('داده‌های نمونه آزمایشی با موفقیت بارگذاری شدند.', 'success');
      }
    );
  }, [container, executeStorageMutation, showToast]);

  // Emergency Recovery Export (allows user to export current in-memory state + migration snapshot if storage errors occur)
  const handleDownloadEmergencyRecovery = useCallback(() => {
    const recoveryPayload = {
      exportedAt: nowIso(),
      reason: 'emergency_recovery_export',
      storageError,
      migrationReport,
      inMemoryState: {
        tasks,
        habits,
        ideas,
        usefulInfos,
        focusSessions,
        deletedTrashItems,
      },
    };
    const blob = new Blob([JSON.stringify(recoveryPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairos-emergency-recovery-${getTodayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [storageError, migrationReport, tasks, habits, ideas, usefulInfos, focusSessions, deletedTrashItems]);

  // 3. Legacy GitHub REST API Sync State (Offline-First Policy: automatic background network calls disabled)
  const [githubConfig, setGithubConfig] = useState<GitHubSyncConfig>(() => {
    const loaded = loadGitHubConfig();
    return { ...loaded, autoSync: false };
  });
  const [lastKnownSha, setLastKnownSha] = useState<string | null>(() => {
    try {
      return localStorage.getItem(GITHUB_LAST_SHA_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [isGitHubSyncing, setIsGitHubSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [githubSyncError, setGithubSyncError] = useState<string | null>(null);

  const latestDataRef = useRef({
    habits,
    tasks,
    ideas,
    focusSessions,
    usefulInfos,
  });

  useEffect(() => {
    latestDataRef.current = {
      habits,
      tasks,
      ideas,
      focusSessions,
      usefulInfos,
    };
  }, [habits, tasks, ideas, focusSessions, usefulInfos]);

  // Modal States
  const [isHabitModalOpen, setIsHabitModalOpen] = useState(false);
  const [habitToEdit, setHabitToEdit] = useState<Habit | null>(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    type: 'habit' | 'task' | 'idea' | 'useful_info';
    id: string;
    title: string;
  }>({
    isOpen: false,
    type: 'habit',
    id: '',
    title: '',
  });

  const [activeFocusTaskId, setActiveFocusTaskId] = useState<string | undefined>(undefined);

  const updateStoredSha = useCallback((sha: string | null) => {
    setLastKnownSha(sha);
    try {
      if (sha) {
        localStorage.setItem(GITHUB_LAST_SHA_STORAGE_KEY, sha);
      } else {
        localStorage.removeItem(GITHUB_LAST_SHA_STORAGE_KEY);
      }
    } catch {}
  }, []);

  // ================= MANUAL GITHUB REST API SYNC (ONLY WHEN EXPLICITLY INVOKED) =================
  const handlePullFromGitHub = useCallback(
    async (silent = false) => {
      if (!isGitHubConfigValid(githubConfig)) return;
      setIsGitHubSyncing(true);
      if (!silent) setGithubSyncError(null);

      try {
        const res = await fetchGitHubDataFile(githubConfig);
        if (!res.exists || !res.fileData) {
          const pushRes = await pushGitHubDataFile(
            githubConfig,
            latestDataRef.current,
            null
          );
          updateStoredSha(pushRes.sha);
          setLastSyncedAt(
            new Intl.DateTimeFormat('fa-IR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(new Date())
          );
          if (!silent) {
            showToast('فایل اولیه data.json در مخزن خصوصی گیت‌هاب ایجاد شد!', 'success');
          }
          return;
        }

        if (!silent || res.sha !== lastKnownSha) {
          const remoteData = res.fileData.data;
          await executeStorageMutation('دریافت داده از گیت‌هاب', async () => {
            const validated = await container.backup.validateBackupJson(
              JSON.stringify(remoteData)
            );
            if (!validated.valid || !validated.envelope) {
              throw new Error(validated.errors.join(' | ') || 'ساختار دادهٔ گیت‌هاب نامعتبر است.');
            }
            await container.backup.restoreBackup(validated.envelope, 'replace');
          });

          updateStoredSha(res.sha);
          setLastSyncedAt(
            new Intl.DateTimeFormat('fa-IR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(new Date())
          );

          if (!silent) {
            showToast('آخرین اطلاعات از گیت‌هاب دریافت و در پایگاه‌داده ذخیره شد!', 'success');
          }
        }
      } catch (err: any) {
        const msg = err?.message || 'خطا در دریافت اطلاعات از گیت‌هاب';
        setGithubSyncError(msg);
        if (!silent) showToast(msg);
      } finally {
        setIsGitHubSyncing(false);
      }
    },
    [githubConfig, lastKnownSha, showToast, updateStoredSha, container, executeStorageMutation]
  );

  const handlePushToGitHub = useCallback(
    async (silent = false) => {
      if (!isGitHubConfigValid(githubConfig)) return;
      setIsGitHubSyncing(true);
      setGithubSyncError(null);

      try {
        const res = await pushGitHubDataFile(
          githubConfig,
          latestDataRef.current,
          lastKnownSha
        );
        updateStoredSha(res.sha);
        setLastSyncedAt(
          new Intl.DateTimeFormat('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date())
        );

        if (res.hadConflictResolved) {
          await executeStorageMutation('ادغام تغییرات گیت‌هاب', async () => {
            const validated = await container.backup.validateBackupJson(
              JSON.stringify(res.mergedData)
            );
            if (validated.valid && validated.envelope) {
              await container.backup.restoreBackup(validated.envelope, 'replace');
            }
          });
          showToast(
            'تغییرات دستگاه دیگر تشخیص داده شد و با موفقیت ادغام و ذخیره گردید!',
            'success'
          );
        } else if (!silent) {
          showToast('اطلاعات با موفقیت در فایل data.json گیت‌هاب ذخیره شد!', 'success');
        }
      } catch (err: any) {
        const msg = err?.message || 'خطا در ارسال اطلاعات به گیت‌هاب';
        setGithubSyncError(msg);
        if (!silent) showToast(msg);
      } finally {
        setIsGitHubSyncing(false);
      }
    },
    [githubConfig, lastKnownSha, showToast, updateStoredSha, container, executeStorageMutation]
  );

  const handleSaveGitHubConfig = (newCfg: GitHubSyncConfig) => {
    const safeCfg = { ...newCfg, autoSync: false };
    saveGitHubConfig(safeCfg);
    setGithubConfig(safeCfg);
    setGithubSyncError(null);
    showToast('تنظیمات ذخیره شد (حالت آفلاین-محور فعال است).', 'success');
  };

  // Background Task Reminder Checker (runs every 15 seconds; BUG-40: catches up missed reminders from earlier today)
  useEffect(() => {
    if (!isHydrated) return;
    const checkReminders = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentHHMM = `${hh}:${mm}`;
      const todayKey = getTodayKey();

      tasks.forEach((task) => {
        const isDueToday =
          task.targetDate === todayKey &&
          !!task.reminderTime &&
          task.reminderTime <= currentHHMM;
        const isDueFromBefore =
          task.targetDate < todayKey && task.reminderTime === currentHHMM;

        if (
          !task.completed &&
          !task.reminded &&
          (isDueToday || isDueFromBefore)
        ) {
          const updatedTask: Task = { ...task, reminded: true };
          container.tasks
            .upsertTask(taskToDomainEntity(updatedTask))
            .then(() => reloadAllFromRepository())
            .catch((err: any) => {
              setStorageStatus('error');
              setStorageError(err?.message || 'خطا در ثبت وضعیت یادآور.');
            });

          soundManager.playBell();
          setActiveReminderAlert({
            taskId: task.id,
            title: task.title,
            time: task.reminderTime || currentHHMM,
          });

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('یادآور کایروس', {
                body: `زمان انجام کار: ${task.title}`,
                icon: './icon.svg',
              });
            } catch {}
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [tasks, isHydrated, container, reloadAllFromRepository]);

  // Global Keyboard Shortcuts (BUG-45: Alt+N new task, Alt+H new habit, Alt+F deep focus, Alt+D dashboard)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        setTaskToEdit(null);
        setIsTaskModalOpen(true);
      } else if (key === 'h') {
        e.preventDefault();
        setHabitToEdit(null);
        setIsHabitModalOpen(true);
      } else if (key === 'f') {
        e.preventDefault();
        setActiveTab('deep_focus');
      } else if (key === 'd') {
        e.preventDefault();
        setActiveTab('dashboard');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [setActiveTab]);

  const handleRequestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showToast('مرورگر شما از نوتیفیکیشن سیستمی پشتیبانی نمی‌کند، اما یادآور داخلی برنامه فعال است.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        soundManager.playBell();
        showToast('نوتیفیکیشن مرورگر با موفقیت فعال شد!', 'success');
      } else {
        showToast('یادآور داخلی و صوتی برنامه فعال است.');
      }
    } catch {
      showToast('یادآور داخلی برنامه فعال شد.');
    }
  };

  const handleTriggerTestNotification = () => {
    soundManager.playBell();
    const firstPending = tasks.find((t) => !t.completed);
    const sampleTitle = firstPending
      ? firstPending.title
      : 'طراحی عکس با هوش مصنوعی و ارسال متن کانال ایتا';
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    setActiveReminderAlert({
      taskId: firstPending?.id,
      title: sampleTitle,
      time: hhmm,
    });

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('یادآور کایروس (تست)', {
          body: `زمان انجام کار: ${sampleTitle}`,
          icon: './icon.svg',
        });
      } catch {}
    }
    showToast('یادآور آزمایشی با موفقیت اجرا شد!', 'success');
  };

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    executeStorageMutation(
      'تغییر تم ظاهر',
      () => container.settings.saveSettings({ theme: nextDark ? 'dark' : 'light' }),
      () => {
        try {
          localStorage.setItem('nazmyar_theme', nextDark ? 'dark' : 'light');
        } catch {}
      }
    );
  };

  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    executeStorageMutation(
      'تغییر وضعیت صدا',
      () => container.settings.saveSettings({ soundEnabled: nextVal }),
      () => {
        try {
          localStorage.setItem('nazmyar_sound', String(nextVal));
        } catch {}
        showToast(nextVal ? 'افکت‌های صوتی فعال شدند' : 'افکت‌های صوتی بی‌صدا شدند');
      }
    );
  };

  // ================= HABITS ACTIONS (Repository-First) =================
  const handleToggleHabitDay = (habitId: string, dateKey: string) => {
    const todayKey = getTodayKey();
    executeStorageMutation(
      'ثبت وضعیت عادت',
      () => container.habits.toggleHabitDate(habitId, dateKey),
      (updatedHabit) => {
        if (!updatedHabit) return;
        const isNowCompleted = Boolean(updatedHabit.completedDates[dateKey]);
        if (isNowCompleted) {
          soundManager.playCheck();
          const allDone =
            habits.length > 0 &&
            habits.every((h) =>
              h.id === habitId ? isNowCompleted : Boolean(h.completedDates[todayKey])
            );
          if (dateKey === todayKey && allDone) {
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            showToast('تبریک! تمام عادت‌های امروزت تکمیل شد', 'success');
          }
        } else {
          soundManager.playUncheck();
        }
      }
    );
  };

  const handleOpenHabitModal = (habitId?: string) => {
    if (habitId) {
      const h = habits.find((item) => item.id === habitId);
      setHabitToEdit(h || null);
    } else {
      setHabitToEdit(null);
    }
    setIsHabitModalOpen(true);
  };

  const handleSaveHabit = (data: {
    id?: string;
    title: string;
    category: HabitCategory;
    weeklyGoal: number;
    emoji: string;
    color: string;
  }) => {
    const trimmedTitle = data.title.trim();
    if (!trimmedTitle) {
      showToast('عنوان عادت نمی‌تواند خالی باشد.');
      return;
    }

    if (data.id) {
      const existing = habits.find((h) => h.id === data.id);
      if (!existing) return;
      const merged: Habit = {
        ...existing,
        ...data,
        title: trimmedTitle,
      };
      executeStorageMutation(
        'ویرایش عادت',
        () => container.habits.upsertHabit(habitToDomainEntity(merged)),
        () => showToast('تغییرات عادت ذخیره شد.', 'success')
      );
    } else {
      const newHabit: Habit = {
        id: createEntityId('h'),
        title: trimmedTitle,
        category: data.category,
        weeklyGoal: data.weeklyGoal,
        emoji: data.emoji,
        color: data.color,
        startDate: getTodayKey(),
        completedDates: {},
      };
      executeStorageMutation(
        'ایجاد عادت جدید',
        () => container.habits.upsertHabit(habitToDomainEntity(newHabit)),
        () => showToast('عادت جدید با موفقیت اضافه شد.', 'success')
      );
    }
  };

  // ================= TASKS ACTIONS (Repository-First) =================
  const handleToggleTask = (taskId: string) => {
    const existing = tasks.find((t) => t.id === taskId);
    if (!existing) return;
    const nowDone = !existing.completed;
    const updatedTask: Task = {
      ...existing,
      completed: nowDone,
      status: nowDone ? 'done' : 'todo',
      completedAt: nowDone ? nowIso() : null,
    };

    executeStorageMutation(
      'تغییر وضعیت انجام کار',
      () => container.tasks.upsertTask(taskToDomainEntity(updatedTask)),
      () => {
        if (nowDone) {
          soundManager.playCheck();
          showToast(`مأموریت «${existing.title}» انجام شد!`, 'success');
          const todayKey = getTodayKey();
          const todayTasks = tasks.filter((t) => t.targetDate <= todayKey);
          const allDone =
            todayTasks.length > 0 &&
            todayTasks.every((t) => (t.id === taskId ? true : t.completed));
          if (allDone) {
            confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
          }
        } else {
          soundManager.playUncheck();
        }
      }
    );
  };

  const handleAddTask = (taskData: Omit<Task, 'id' | 'completed'>) => {
    const trimmedTitle = taskData.title.trim();
    if (!trimmedTitle) {
      showToast('عنوان مأموریت نمی‌تواند خالی باشد.');
      return;
    }
    const newTask: Task = {
      ...taskData,
      title: trimmedTitle,
      id: createEntityId('t'),
      completed: false,
      status: 'todo',
    };
    executeStorageMutation(
      'افزودن مأموریت جدید',
      () => container.tasks.upsertTask(taskToDomainEntity(newTask)),
      () => {
        const remNote = newTask.reminderTime
          ? ` (یادآور: ${toPersianNum(newTask.reminderTime)})`
          : '';
        showToast(
          `مأموریت با «اولویت ${toPersianNum(newTask.priority)}» ثبت شد${remNote}.`,
          'success'
        );
      }
    );
  };

  const handleAddTasksBatch = (newTasks: Array<Omit<Task, 'id' | 'completed'>>) => {
    const validTasks = newTasks
      .filter((t) => t.title && t.title.trim())
      .map((t) =>
        taskToDomainEntity({
          ...t,
          title: t.title.trim(),
          id: createEntityId('t'),
          completed: false,
          status: 'todo',
        })
      );
    if (validTasks.length === 0) return;

    executeStorageMutation(
      'افزودن دسته‌ای مأموریت‌ها',
      () => container.tasks.upsertTasksBatch(validTasks),
      () => {
        showToast(
          `${toPersianNum(validTasks.length)} مأموریت پیشنهادی به میز کار اضافه شد!`,
          'success'
        );
      }
    );
  };

  const handleOpenTaskModal = (taskId?: string) => {
    if (taskId) {
      const t = tasks.find((item) => item.id === taskId);
      setTaskToEdit(t || null);
    } else {
      setTaskToEdit(null);
    }
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = (taskData: {
    id?: string;
    title: string;
    description?: string;
    priority: number;
    duration: number;
    targetDate: string;
    category?: string;
    reminderTime?: string;
  }) => {
    const trimmedTitle = taskData.title.trim();
    if (!trimmedTitle) {
      showToast('عنوان مأموریت نمی‌تواند خالی باشد.');
      return;
    }

    if (taskData.id) {
      const existing = tasks.find((t) => t.id === taskData.id);
      if (!existing) return;
      const merged: Task = {
        ...existing,
        ...taskData,
        title: trimmedTitle,
        reminded: false,
      };
      executeStorageMutation(
        'ویرایش مأموریت',
        () => container.tasks.upsertTask(taskToDomainEntity(merged)),
        () => showToast('مأموریت ویرایش شد.', 'success')
      );
    } else {
      handleAddTask({
        title: trimmedTitle,
        description: taskData.description,
        priority: taskData.priority,
        duration: taskData.duration,
        targetDate: taskData.targetDate,
        category: taskData.category || 'work',
        reminderTime: taskData.reminderTime,
      });
    }
  };

  const handleMoveTaskDay = (taskId: string, targetDay: 'today' | 'tomorrow') => {
    const existing = tasks.find((t) => t.id === taskId);
    if (!existing) return;
    const dateKey = targetDay === 'tomorrow' ? getTomorrowKey() : getTodayKey();
    const updated: Task = { ...existing, targetDate: dateKey };
    executeStorageMutation(
      'انتقال روز مأموریت',
      () => container.tasks.upsertTask(taskToDomainEntity(updated)),
      () =>
        showToast(
          targetDay === 'tomorrow'
            ? 'کار به برنامه فردا منتقل شد.'
            : 'کار به لیست امروز منتقل شد.'
        )
    );
  };

  const handleMoveAllPendingToTomorrow = () => {
    const todayKey = getTodayKey();
    const tomorrowKey = getTomorrowKey();
    const affected = tasks
      .filter((t) => t.targetDate <= todayKey && !t.completed)
      .map((t) => taskToDomainEntity({ ...t, targetDate: tomorrowKey }));

    if (affected.length === 0) {
      showToast('تمام کارهای امروزت تکمیل شده یا کاری برای انتقال نیست!');
      return;
    }

    executeStorageMutation(
      'انتقال کارهای ناتمام به فردا',
      () => container.tasks.upsertTasksBatch(affected),
      () =>
        showToast(
          `${toPersianNum(affected.length)} کار ناتمام بدون عذاب وجدان به فردا منتقل شد.`
        )
    );
  };

  const handleApplyTomorrowToToday = () => {
    const todayKey = getTodayKey();
    const tomorrowKey = getTomorrowKey();
    const affected = tasks
      .filter((t) => t.targetDate === tomorrowKey)
      .map((t) => taskToDomainEntity({ ...t, targetDate: todayKey }));

    if (affected.length === 0) {
      showToast('کاری در برنامه فردا وجود ندارد.');
      return;
    }

    executeStorageMutation(
      'انتقال کارهای فردا به امروز',
      () => container.tasks.upsertTasksBatch(affected),
      () =>
        showToast(`${toPersianNum(affected.length)} مأموریت فردا به لیست امروز منتقل شد.`)
    );
  };

  const handleLogFocusSession = useCallback(
    (session: FocusSession) => {
      executeStorageMutation(
        'ثبت جلسه تمرکز',
        () => container.focus.logFocusSession(focusSessionToDomainEntity(session)),
        () =>
          showToast(
            `جلسه تمرکز ${toPersianNum(session.durationMinutes)} دقیقه‌ای ثبت شد!`,
            'success'
          )
      );
    },
    [container, executeStorageMutation, showToast]
  );

  const pomodoroController = useGlobalPomodoro({
    container,
    tasks,
    activeTaskId: activeFocusTaskId,
    onLogFocusSession: handleLogFocusSession,
  });

  const handleStartFocusOnTask = (taskId: string, taskTitle: string, _duration: number) => {
    setActiveFocusTaskId(taskId);
    pomodoroController.handleSelectTask(taskId);
    setActiveTab('pomodoro');
    showToast(`تایمر تمرکز برای «${taskTitle}» آماده شد.`);
  };

  // ================= USEFUL INFO / NOTES ACTIONS (Repository-First) =================
  const handleAddUsefulInfo = (data: Omit<UsefulInfoItem, 'id' | 'createdAt'>) => {
    const trimmedTitle = data.title.trim();
    if (!trimmedTitle) {
      showToast('عنوان یادداشت نمی‌تواند خالی باشد.');
      return;
    }
    const now = nowIso();
    const newItem: UsefulInfoItem = {
      ...data,
      title: trimmedTitle,
      id: createEntityId('info'),
      createdAt: new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
      createdAtIso: now,
      updatedAt: now,
    };

    executeStorageMutation(
      'افزودن یادداشت و مرجع کاربردی',
      () => container.notes.upsertNote(usefulInfoToDomainNote(newItem)),
      () => showToast('در بخش یادداشت‌ها و اطلاعات کاربردی ذخیره شد!', 'success')
    );
  };

  const handleUpdateUsefulInfo = (id: string, data: Partial<UsefulInfoItem>) => {
    const existing = usefulInfos.find((item) => item.id === id);
    if (!existing) return;
    const merged: UsefulInfoItem = {
      ...existing,
      ...data,
      title: data.title !== undefined ? data.title.trim() || existing.title : existing.title,
      updatedAt: nowIso(),
    };

    executeStorageMutation(
      'ویرایش یادداشت کاربردی',
      () => container.notes.upsertNote(usefulInfoToDomainNote(merged)),
      () => showToast('یادداشت کاربردی بروزرسانی شد.', 'success')
    );
  };

  // ================= IDEAS ACTIONS (Repository-First) =================
  const handleAddIdea = (data: Omit<Idea, 'id' | 'createdAt'>) => {
    const trimmedTitle = data.title.trim();
    if (!trimmedTitle) {
      showToast('عنوان ایده نمی‌تواند خالی باشد.');
      return;
    }
    const now = nowIso();
    const newIdea: Idea = {
      ...data,
      title: trimmedTitle,
      id: createEntityId('id'),
      createdAt: new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
      createdAtIso: now,
      updatedAt: now,
    };

    executeStorageMutation(
      'ثبت ایده جدید',
      () => container.notes.upsertNote(ideaToDomainNote(newIdea)),
      () => showToast('ایده در بانک ایده‌ها ذخیره شد تا ذهنت آزاد بماند.', 'success')
    );
  };

  const handleUpdateIdea = (id: string, data: Partial<Idea>) => {
    const existing = ideas.find((item) => item.id === id);
    if (!existing) return;
    const merged: Idea = {
      ...existing,
      ...data,
      title: data.title !== undefined ? data.title.trim() || existing.title : existing.title,
      updatedAt: nowIso(),
    };

    executeStorageMutation(
      'ویرایش ایده',
      () => container.notes.upsertNote(ideaToDomainNote(merged)),
      () => showToast('ایده با موفقیت ویرایش شد.', 'success')
    );
  };

  const handleConvertIdeaToTask = (ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;

    // Prevent accidental duplicate conversion via sourceId or matching title (BUG-29)
    const alreadyExists = tasks.some(
      (t) =>
        t.sourceId === idea.id ||
        (t.title.trim() === idea.title.trim() && !t.completed)
    );
    if (alreadyExists) {
      showToast(`مأموریت «${idea.title}» هم‌اکنون در لیست کارهای فعال موجود است.`);
      return;
    }

    const todayKey = getTodayKey();
    const todayCount = tasks.filter((t) => t.targetDate === todayKey).length;
    const newTaskId = createEntityId('t');
    const newTask: Task = {
      id: newTaskId,
      title: idea.title.trim(),
      description: idea.note || 'منتقل شده از بانک ایده‌ها',
      priority: todayCount + 1,
      duration: 45,
      targetDate: todayKey,
      category: 'work',
      completed: false,
      status: 'todo',
      sourceId: idea.id,
    };

    executeStorageMutation(
      'تبدیل ایده به مأموریت',
      async () => {
        await container.tasks.upsertTask(taskToDomainEntity(newTask));
        await container.notes.upsertNote(
          ideaToDomainNote({
            ...idea,
            linkedTaskId: newTaskId,
            updatedAt: nowIso(),
          })
        );
      },
      () =>
        showToast(
          `«${idea.title}» با اولویت ${toPersianNum(todayCount + 1)} به میز کار اضافه شد!`,
          'success'
        )
    );
  };

  // ================= RECYCLE BIN / TRASH ACTIONS (Repository-First) =================
  const handleRestoreTrashItem = (item: DeletedTrashItem) => {
    executeStorageMutation(
      'بازیابی از سطل زباله',
      async () => {
        if (item.type === 'task') {
          await container.tasks.restoreTask(item.id);
        } else if (item.type === 'habit') {
          await container.habits.restoreHabit(item.id);
        } else if (item.type === 'idea' || item.type === 'useful_info') {
          await container.notes.restoreNote(item.id);
        }
      },
      () => showToast(`«${item.title}» از سطل زباله بازیابی شد!`, 'success')
    );
  };

  const handlePermanentDeleteTrashItem = (id: string) => {
    const target = deletedTrashItems.find((x) => x.id === id);
    if (!target) return;
    executeStorageMutation(
      'حذف دائمی از سطل زباله',
      async () => {
        if (target.type === 'task') {
          await container.tasks.hardDeleteTask(id);
        } else if (target.type === 'habit') {
          await container.habits.hardDeleteHabit(id);
        } else {
          await container.notes.hardDeleteNote(id);
        }
      },
      () => showToast('مورد انتخاب‌شده برای همیشه از پایگاه‌داده پاک شد.')
    );
  };

  const handleEmptyTrash = () => {
    if (deletedTrashItems.length === 0) return;
    executeStorageMutation(
      'تخلیه کامل سطل زباله',
      async () => {
        for (const item of deletedTrashItems) {
          if (item.type === 'task') {
            await container.tasks.hardDeleteTask(item.id);
          } else if (item.type === 'habit') {
            await container.habits.hardDeleteHabit(item.id);
          } else {
            await container.notes.hardDeleteNote(item.id);
          }
        }
      },
      () => showToast('سطل زباله به طور کامل تخلیه شد.')
    );
  };

  // ================= DELETE MODAL ACTIONS (Repository Soft-Delete + Undo) =================
  const handleOpenDeleteModal = (
    type: 'habit' | 'task' | 'idea' | 'useful_info',
    id: string,
    title: string
  ) => {
    setDeleteModalState({
      isOpen: true,
      type,
      id,
      title,
    });
  };

  const handleConfirmDelete = () => {
    const { type, id } = deleteModalState;
    setDeleteModalState((prev) => ({ ...prev, isOpen: false }));

    if (type === 'habit') {
      executeStorageMutation(
        'حذف نرم عادت',
        () => container.habits.softDeleteHabit(id),
        () => {
          showToast('عادت به سطل زباله منتقل شد.', 'info', () => {
            executeStorageMutation(
              'واگرد حذف عادت',
              () => container.habits.restoreHabit(id),
              () => showToast('عادت حذف‌شده بازیابی شد!', 'success')
            );
          });
        }
      );
    } else if (type === 'task') {
      executeStorageMutation(
        'حذف نرم مأموریت',
        () => container.tasks.softDeleteTask(id),
        () => {
          showToast('مأموریت به سطل زباله منتقل شد.', 'info', () => {
            executeStorageMutation(
              'واگرد حذف مأموریت',
              () => container.tasks.restoreTask(id),
              () => showToast('مأموریت حذف‌شده بازیابی شد!', 'success')
            );
          });
        }
      );
    } else if (type === 'idea' || type === 'useful_info') {
      const label = type === 'idea' ? 'ایده' : 'یادداشت کاربردی';
      executeStorageMutation(
        `حذف نرم ${label}`,
        () => container.notes.softDeleteNote(id),
        () => {
          showToast(`${label} به سطل زباله منتقل شد.`, 'info', () => {
            executeStorageMutation(
              `واگرد حذف ${label}`,
              () => container.notes.restoreNote(id),
              () => showToast(`${label} حذف‌شده بازیابی شد!`, 'success')
            );
          });
        }
      );
    }
  };

  // ================= RESTORE / BACKUP (Transactional Replace / Merge / Rollback on Repository) =================
  const handleRestoreEnvelope = async (
    envelope: BackupEnvelopeV2,
    strategy: 'replace' | 'merge'
  ): Promise<void> => {
    const res = await executeStorageMutation(
      strategy === 'replace'
        ? 'بازیابی و جایگزینی کامل پایگاه‌داده از فایل پشتیبان'
        : 'ادغام هوشمند فایل پشتیبان با پایگاه‌داده',
      () => container.backup.restoreBackup(envelope, strategy),
      () =>
        showToast(
          strategy === 'replace'
            ? 'اطلاعات با موفقیت در پایگاه‌داده جایگزین و بازیابی شدند!'
            : 'اطلاعات فایل پشتیبان با موفقیت با داده‌های فعلی ادغام شدند!',
          'success'
        )
    );
    if (!res) {
      throw new Error('عملیات بازیابی متوقف شد؛ داده‌های فعلی دست‌نخورده باقی ماندند.');
    }
  };

  const handleRollbackLastRestore = async (): Promise<void> => {
    if (!container.backup.rollbackLastRestore) return;
    const res = await executeStorageMutation(
      'بازگردانی به اسنپ‌شات امنیتی پیش از آخرین بازیابی',
      () => container.backup.rollbackLastRestore!(),
      () =>
        showToast(
          'پایگاه‌داده با موفقیت به وضعیت پیش از آخرین بازیابی بازگردانده شد!',
          'success'
        )
    );
    if (!res) {
      throw new Error('خطا در بازگردانی اسنپ‌شات قبلی.');
    }
  };

  const handleRestoreData = (data: {
    habits: Habit[];
    tasks: Task[];
    ideas: Idea[];
    focusSessions: FocusSession[];
    usefulInfos: UsefulInfoItem[];
  }) => {
    const canonicalEnvelope = createPlainBackupEnvelope(data);
    handleRestoreEnvelope(canonicalEnvelope, 'replace').catch(() => {});
  };

  // Counts for Badges
  const pendingTasksCount = tasks.filter(
    (t) => t.targetDate <= getTodayKey() && !t.completed
  ).length;

  const isDatabaseCompletelyEmpty =
    isHydrated &&
    tasks.length === 0 &&
    habits.length === 0 &&
    ideas.length === 0 &&
    usefulInfos.length === 0 &&
    deletedTrashItems.length === 0;

  return (
    <div className="min-h-screen bg-app text-token-primary pb-24 lg:pb-16 selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      {/* Header */}
      <Header
        activeTab={activeTab}
        storageStatus={storageStatus}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onOpenHabitModal={() => handleOpenHabitModal()}
        onOpenTaskModal={() => handleOpenTaskModal()}
        tasks={tasks}
        notificationPermission={notificationPermission}
        onRequestNotificationPermission={handleRequestNotificationPermission}
        onTriggerTestNotification={handleTriggerTestNotification}
        onSwitchTab={setActiveTab}
        isGitHubConfigured={isGitHubConfigValid(githubConfig)}
        isGitHubSyncing={isGitHubSyncing}
        githubRepoLabel={
          githubConfig.owner && githubConfig.repo
            ? `${githubConfig.owner}/${githubConfig.repo}`
            : undefined
        }
      />

      {/* Storage Initialization / Error / Migration Diagnostic Banner (Never fail silently) */}
      {(bridgeError ||
        storageError ||
        (migrationReport && migrationReport.skippedInvalidRecords > 0)) && (
        <div role="alert" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3">
          <div className="bg-rose-600 text-white rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs sm:text-sm">
                {bridgeError && <p className="font-bold">{bridgeError}</p>}
                {storageError && <p className="font-bold">{storageError}</p>}
                {migrationReport && migrationReport.skippedInvalidRecords > 0 && (
                  <p className="font-medium">
                    هشدار مهاجرت داده: {toPersianNum(migrationReport.skippedInvalidRecords)} رکورد
                    آسیب‌دیده در داده‌های قدیمی شناسایی شد. نسخهٔ خام اصلی در کلید{' '}
                    <code className="font-mono dir-ltr bg-black/20 px-1.5 py-0.5 rounded">
                      {migrationReport.recoverySnapshotKey}
                    </code>{' '}
                    نگهداری شده است.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {lastFailedOperation && (
                <button
                  type="button"
                  onClick={() => lastFailedOperation.retry()}
                  className="px-3 py-1.5 rounded-xl bg-white text-rose-700 font-bold text-xs flex items-center gap-1.5 hover:bg-rose-50 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  تلاش مجدد ({lastFailedOperation.label})
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadEmergencyRecovery}
                className="px-3 py-1.5 rounded-xl bg-rose-800 hover:bg-rose-900 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                خروجی اضطراری داده‌ها
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Optional Sample Data Banner on Clean First Run */}
      {isDatabaseCompletelyEmpty && !storageError && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3">
          <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              <Database className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>
                پایگاه‌دادهٔ محلی کایروس روی این دستگاه آماده و خالی است. می‌توانید از صفر شروع
                کنید یا داده‌های نمونهٔ آزمایشی را بارگذاری نمایید.
              </span>
            </div>
            <button
              type="button"
              onClick={handleLoadSampleData}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer shrink-0"
            >
              بارگذاری داده‌های نمونه (اختیاری)
            </button>
          </div>
        </div>
      )}

      {/* In-App Active Reminder Alert Banner */}
      {activeReminderAlert && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 animate-fade-in">
          <div className="bg-indigo-600 text-white rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black bg-white/20 px-2 py-0.5 rounded-md tabular-nums">
                    یادآور کایروس • ساعت {toPersianNum(activeReminderAlert.time)}
                  </span>
                </div>
                <p className="text-sm font-black mt-1">{activeReminderAlert.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              {activeReminderAlert.taskId && (
                <button
                  onClick={() => {
                    if (activeReminderAlert.taskId) {
                      handleToggleTask(activeReminderAlert.taskId);
                    }
                    setActiveReminderAlert(null);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  انجام شد
                </button>
              )}
              <button
                onClick={() => {
                  setActiveTab('deep_focus');
                  setActiveReminderAlert(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-bold transition cursor-pointer"
              >
                ورود به تمرکز عمیق
              </button>
              <button
                onClick={() => setActiveReminderAlert(null)}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
                aria-label="بستن یادآور"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Shell: RTL Desktop Sidebar + Main Content Canvas */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-6 flex flex-col lg:flex-row items-start gap-6">
        <Navigation
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          pendingTasksCount={pendingTasksCount}
          ideasCount={ideas.length}
          usefulInfoCount={usefulInfos.length}
          trashCount={deletedTrashItems.length}
        />

        {/* Main Container */}
        <main
          className="flex-1 min-w-0 w-full"
          data-storage-status={storageStatus}
        >
        {activeTab === 'dashboard' && (
          <DashboardView
            tasks={tasks}
            habits={habits}
            onToggleTask={handleToggleTask}
            onToggleHabitToday={(id) => handleToggleHabitDay(id, getTodayKey())}
            onAddTask={handleAddTask}
            onMoveOverdueToToday={() => {
              const todayKey = getTodayKey();
              const overdue = tasks
                .filter((t) => t.targetDate < todayKey && !t.completed)
                .map((t) => taskToDomainEntity({ ...t, targetDate: todayKey }));
              if (overdue.length === 0) return;
              executeStorageMutation(
                'انتقال کارهای عقب‌افتاده به امروز',
                () => container.tasks.upsertTasksBatch(overdue),
                () => showToast('کارهای مانده به امروز منتقل شدند.')
              );
            }}
            onMoveOverdueToTomorrow={() => {
              const todayKey = getTodayKey();
              const tomorrowKey = getTomorrowKey();
              const overdue = tasks
                .filter((t) => t.targetDate < todayKey && !t.completed)
                .map((t) => taskToDomainEntity({ ...t, targetDate: tomorrowKey }));
              if (overdue.length === 0) return;
              executeStorageMutation(
                'انتقال کارهای عقب‌افتاده به فردا',
                () => container.tasks.upsertTasksBatch(overdue),
                () => showToast('کارهای مانده به فردا منتقل شدند.')
              );
            }}
            onSwitchTab={setActiveTab}
            onStartFocusOnTask={handleStartFocusOnTask}
          />
        )}

        {activeTab === 'deep_focus' && (
          <DeepFocusView
            tasks={tasks}
            selectedDateKey={selectedDateKey}
            onSelectDateKey={setSelectedDateKey}
            onToggleTask={handleToggleTask}
            onAddTask={handleAddTask}
            onDeleteTask={(id) => {
              const t = tasks.find((x) => x.id === id);
              handleOpenDeleteModal('task', id, t?.title || 'این کار');
            }}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            tasks={tasks}
            habits={habits}
            selectedDateKey={selectedDateKey}
            onSelectDateKey={setSelectedDateKey}
            onToggleTask={handleToggleTask}
            onToggleHabitDay={handleToggleHabitDay}
            onAddTask={handleAddTask}
            onDeleteTask={(id) => {
              const t = tasks.find((x) => x.id === id);
              handleOpenDeleteModal('task', id, t?.title || 'این کار');
            }}
            onEnterDayInTab={(dateKey: string, targetTab: NavTabId) => {
              setSelectedDateKey(dateKey);
              setActiveTab(targetTab);
              showToast(
                targetTab === 'deep_focus'
                  ? 'نمایش روز انتخابی در محیط تمرکز عمیق'
                  : 'نمایش روز انتخابی در میز کار'
              );
            }}
          />
        )}

        {activeTab === 'habits' && (
          <HabitsView
            habits={habits}
            onToggleHabitDay={handleToggleHabitDay}
            onOpenHabitModal={handleOpenHabitModal}
            onOpenDeleteModal={(id, title) => handleOpenDeleteModal('habit', id, title)}
          />
        )}

        {activeTab === 'workspace' && (
          <WorkspaceView
            tasks={tasks}
            selectedDateKey={selectedDateKey}
            onToggleTask={handleToggleTask}
            onMoveTaskDay={handleMoveTaskDay}
            onMoveAllPendingToTomorrow={handleMoveAllPendingToTomorrow}
            onApplyTomorrowToToday={handleApplyTomorrowToToday}
            onOpenTaskModal={handleOpenTaskModal}
            onDeleteTask={(id) => {
              const t = tasks.find((x) => x.id === id);
              handleOpenDeleteModal('task', id, t?.title || 'این مأموریت');
            }}
            onSwitchTab={setActiveTab}
            onStartFocusOnTask={handleStartFocusOnTask}
          />
        )}

        {activeTab === 'useful_info' && (
          <UsefulInfoView
            items={usefulInfos}
            onAddItem={handleAddUsefulInfo}
            onUpdateItem={handleUpdateUsefulInfo}
            onDeleteItem={(id) => {
              const u = usefulInfos.find((x) => x.id === id);
              handleOpenDeleteModal('useful_info', id, u?.title || 'این مورد');
            }}
          />
        )}

        {activeTab === 'planner' && (
          <AIAssistantView
            tasks={tasks}
            habits={habits}
            onAddTasksBatch={handleAddTasksBatch}
            onSwitchTab={setActiveTab}
          />
        )}

        {activeTab === 'pomodoro' && (
          <FocusTimerView
            tasks={tasks}
            focusSessions={focusSessions}
            controller={pomodoroController}
          />
        )}

        {activeTab === 'ideas' && (
          <NotesAndIdeasView
            ideas={ideas}
            tasks={tasks}
            onAddIdea={handleAddIdea}
            onUpdateIdea={handleUpdateIdea}
            onConvertIdeaToTask={handleConvertIdeaToTask}
            onDeleteIdea={(id) => {
              const i = ideas.find((x) => x.id === id);
              handleOpenDeleteModal('idea', id, i?.title || 'این ایده');
            }}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            tasks={tasks}
            habits={habits}
            focusSessions={focusSessions}
          />
        )}

        {activeTab === 'sync' && (
          <BackupAndSyncView
            habits={habits}
            tasks={tasks}
            ideas={ideas}
            focusSessions={focusSessions}
            usefulInfos={usefulInfos}
            onRestoreData={handleRestoreData}
            onRestoreEnvelope={handleRestoreEnvelope}
            onRollbackLastRestore={handleRollbackLastRestore}
            deletedTrashItems={deletedTrashItems}
            onRestoreTrashItem={handleRestoreTrashItem}
            onPermanentDeleteTrashItem={handlePermanentDeleteTrashItem}
            onEmptyTrash={handleEmptyTrash}
            githubConfig={githubConfig}
            onSaveGitHubConfig={handleSaveGitHubConfig}
            onPullFromGitHub={() => handlePullFromGitHub(false)}
            onPushToGitHub={() => handlePushToGitHub(false)}
            isGitHubSyncing={isGitHubSyncing}
            lastKnownSha={lastKnownSha}
            lastSyncedAt={lastSyncedAt}
            githubSyncError={githubSyncError}
          />
        )}
        </main>
      </div>

      {/* Persistent Global Mini-Timer Player across tabs */}
      <GlobalMiniTimer
        tasks={tasks}
        visible={activeTab !== 'pomodoro'}
        controller={pomodoroController}
        onOpenFullTimer={() => setActiveTab('pomodoro')}
      />

      {/* Modals */}
      <HabitModal
        isOpen={isHabitModalOpen}
        habitToEdit={habitToEdit}
        onClose={() => setIsHabitModalOpen(false)}
        onSave={handleSaveHabit}
      />

      <TaskModal
        isOpen={isTaskModalOpen}
        taskToEdit={taskToEdit}
        defaultDateKey={selectedDateKey}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
      />

      <DeleteModal
        isOpen={deleteModalState.isOpen}
        title={
          deleteModalState.type === 'habit'
            ? 'حذف عادت'
            : deleteModalState.type === 'task'
            ? 'حذف مأموریت'
            : deleteModalState.type === 'useful_info'
            ? 'حذف اطلاعات کاربردی'
            : 'حذف ایده'
        }
        description={`آیا از انتقال «${deleteModalState.title}» به سطل زباله اطمینان دارید؟`}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmDelete}
      />

      {/* Toast Floating Notifications */}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 lg:bottom-5 left-5 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-3 pointer-events-auto transition-all duration-300 animate-fade-in ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white shadow-emerald-600/25'
                : 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-slate-900/30'
            }`}
          >
            <span>{toast.text}</span>
            {toast.onUndo && (
              <button
                type="button"
                onClick={() => {
                  const undoFn = toast.onUndo;
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                  if (undoFn) undoFn();
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-black transition cursor-pointer shrink-0"
              >
                واگرد (Undo)
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
