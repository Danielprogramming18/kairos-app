/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { BellRing, X, Check } from 'lucide-react';
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
  usefulInfoToDomainNote,
  focusSessionToDomainEntity,
} from './app/PlatformContext';
import { createEntityId } from './domain/models';

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

export default function App() {
  const { container, ready: platformReady, bridgeError } = usePlatform();

  // 1. Persistent UI State with Hash Route Support
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

  // 2. Persistent Core Data (Preserving all existing localStorage keys + IndexedDB repository)
  const [habits, setHabits] = useState<Habit[]>(() => {
    try {
      const saved = localStorage.getItem('nazmyar_habits_v1');
      return saved ? JSON.parse(saved) : getInitialHabits();
    } catch {
      return getInitialHabits();
    }
  });

  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const saved = localStorage.getItem('nazmyar_danial_tasks_v1');
      if (saved) {
        return JSON.parse(saved) as Task[];
      }
      return getInitialTasks();
    } catch {
      return getInitialTasks();
    }
  });

  const [ideas, setIdeas] = useState<Idea[]>(() => {
    try {
      const saved = localStorage.getItem('nazmyar_danial_ideas_v1');
      return saved ? JSON.parse(saved) : getInitialIdeas();
    } catch {
      return getInitialIdeas();
    }
  });

  const [focusSessions, setFocusSessions] = useState<FocusSession[]>(() => {
    try {
      const saved = localStorage.getItem('nazmyar_focus_sessions_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [usefulInfos, setUsefulInfos] = useState<UsefulInfoItem[]>(() => {
    try {
      const saved = localStorage.getItem('nazmyar_useful_info_v1');
      return saved ? JSON.parse(saved) : getInitialUsefulInfos();
    } catch {
      return getInitialUsefulInfos();
    }
  });

  // Hydrate & Synchronize with Clean Architecture PlatformContainer (IndexedDB / Native Bridge)
  const hasHydratedFromRepoRef = useRef<boolean>(false);
  useEffect(() => {
    if (!platformReady || bridgeError || hasHydratedFromRepoRef.current) return;
    hasHydratedFromRepoRef.current = true;

    (async () => {
      try {
        const [repoTasks, repoHabits, repoNotes, repoFocus] = await Promise.all([
          container.tasks.listTasks(),
          container.habits.listHabits(),
          container.notes.listNotes(),
          container.focus.listFocusSessions(),
        ]);

        if (repoTasks.length > 0) {
          setTasks(repoTasks.map(domainEntityToTask));
        } else if (tasks.length > 0) {
          await container.tasks.upsertTasksBatch(tasks.map(taskToDomainEntity));
        }

        if (repoHabits.length > 0) {
          setHabits(repoHabits.map(domainEntityToHabit));
        } else if (habits.length > 0) {
          for (const h of habits) {
            await container.habits.upsertHabit(habitToDomainEntity(h));
          }
        }

        if (repoNotes.length === 0 && (ideas.length > 0 || usefulInfos.length > 0)) {
          for (const idea of ideas) {
            await container.notes.upsertNote(ideaToDomainNote(idea));
          }
          for (const info of usefulInfos) {
            await container.notes.upsertNote(usefulInfoToDomainNote(info));
          }
        }

        if (repoFocus.length === 0 && focusSessions.length > 0) {
          for (const fs of focusSessions) {
            await container.focus.logFocusSession(focusSessionToDomainEntity(fs));
          }
        }
      } catch {
        // Keep local state intact if repository hydration encounters an error
      }
    })();
  }, [platformReady, bridgeError, container]);

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

  const isApplyingRemoteRef = useRef<boolean>(false);
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

  // Safe localStorage persistence helper (BUG-34: explicit quota warning instead of silent failure)
  const quotaWarnedRef = useRef<boolean>(false);
  const safeSetLocalStorage = useCallback(
    (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        if (!quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          showToast(
            'حافظهٔ مرورگر (LocalStorage) پر شده است؛ داده‌ها در پایگاه‌دادهٔ محلی IndexedDB نگهداری می‌شوند.',
            'info'
          );
        }
      }
    },
    [showToast]
  );

  // Sync to localStorage & IndexedDB Repository
  useEffect(() => {
    safeSetLocalStorage('nazmyar_habits_v1', JSON.stringify(habits));
    if (platformReady && !bridgeError && hasHydratedFromRepoRef.current) {
      habits.forEach((h) => {
        container.habits.upsertHabit(habitToDomainEntity(h)).catch(() => {});
      });
    }
  }, [habits, safeSetLocalStorage, platformReady, bridgeError, container]);

  useEffect(() => {
    safeSetLocalStorage('nazmyar_danial_tasks_v1', JSON.stringify(tasks));
    if (platformReady && !bridgeError && hasHydratedFromRepoRef.current) {
      container.tasks.upsertTasksBatch(tasks.map(taskToDomainEntity)).catch(() => {});
    }
  }, [tasks, safeSetLocalStorage, platformReady, bridgeError, container]);

  useEffect(() => {
    safeSetLocalStorage('nazmyar_danial_ideas_v1', JSON.stringify(ideas));
  }, [ideas, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('nazmyar_focus_sessions_v1', JSON.stringify(focusSessions));
  }, [focusSessions, safeSetLocalStorage]);

  useEffect(() => {
    safeSetLocalStorage('nazmyar_useful_info_v1', JSON.stringify(usefulInfos));
  }, [usefulInfos, safeSetLocalStorage]);

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
          isApplyingRemoteRef.current = true;
          const remoteData = res.fileData.data;
          if (Array.isArray(remoteData.habits)) setHabits(remoteData.habits);
          if (Array.isArray(remoteData.tasks)) setTasks(remoteData.tasks);
          if (Array.isArray(remoteData.ideas)) setIdeas(remoteData.ideas);
          if (Array.isArray(remoteData.focusSessions)) setFocusSessions(remoteData.focusSessions);
          if (Array.isArray(remoteData.usefulInfos)) setUsefulInfos(remoteData.usefulInfos);

          updateStoredSha(res.sha);
          setLastSyncedAt(
            new Intl.DateTimeFormat('fa-IR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(new Date())
          );

          setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 200);

          if (!silent) {
            showToast('آخرین اطلاعات از گیت‌هاب دریافت و همگام شد!', 'success');
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
    [githubConfig, lastKnownSha, showToast, updateStoredSha]
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
          isApplyingRemoteRef.current = true;
          setHabits(res.mergedData.habits);
          setTasks(res.mergedData.tasks);
          setIdeas(res.mergedData.ideas);
          setFocusSessions(res.mergedData.focusSessions);
          setUsefulInfos(res.mergedData.usefulInfos);
          setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 200);
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
    [githubConfig, lastKnownSha, showToast, updateStoredSha]
  );

  const handleSaveGitHubConfig = (newCfg: GitHubSyncConfig) => {
    const safeCfg = { ...newCfg, autoSync: false };
    saveGitHubConfig(safeCfg);
    setGithubConfig(safeCfg);
    setGithubSyncError(null);
    showToast('تنظیمات ذخیره شد (حالت آفلاین-محور فعال است).', 'success');
  };

  // Load Theme & Sound on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('nazmyar_theme');
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }

    const savedSound = localStorage.getItem('nazmyar_sound');
    if (savedSound !== null) {
      const enabled = savedSound === 'true';
      setSoundEnabled(enabled);
      soundManager.setEnabled(enabled);
    }
  }, []);

  // Background Task Reminder Checker (runs every 15 seconds; BUG-40: catches up missed reminders from earlier today)
  useEffect(() => {
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
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, reminded: true } : t))
          );

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
  }, [tasks]);

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
  }, []);

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
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('nazmyar_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('nazmyar_theme', 'light');
    }
  };

  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    soundManager.setEnabled(nextVal);
    localStorage.setItem('nazmyar_sound', String(nextVal));
    showToast(nextVal ? 'افکت‌های صوتی فعال شدند' : 'افکت‌های صوتی بی‌صدا شدند');
  };

  // ================= HABITS ACTIONS =================
  const handleToggleHabitDay = (habitId: string, dateKey: string) => {
    const todayKey = getTodayKey();
    let isNowCompleted = false;

    setHabits((prev) =>
      prev.map((h) => {
        if (h.id === habitId) {
          const wasChecked = !!h.completedDates[dateKey];
          isNowCompleted = !wasChecked;
          const updated = { ...h.completedDates };
          if (wasChecked) {
            delete updated[dateKey];
          } else {
            updated[dateKey] = true;
          }
          return { ...h, completedDates: updated };
        }
        return h;
      })
    );

    if (isNowCompleted) {
      soundManager.playCheck();
      setTimeout(() => {
        setHabits((currentHabits) => {
          const allDone =
            currentHabits.length > 0 &&
            currentHabits.every((h) => h.completedDates[todayKey]);
          if (dateKey === todayKey && allDone) {
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            showToast('تبریک! تمام عادت‌های امروزت تکمیل شد 🎉', 'success');
          }
          return currentHabits;
        });
      }, 50);
    } else {
      soundManager.playUncheck();
    }
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
    if (data.id) {
      setHabits((prev) =>
        prev.map((h) => (h.id === data.id ? { ...h, ...data } : h))
      );
      showToast('تغییرات عادت ذخیره شد.');
    } else {
      const newHabit: Habit = {
        id: 'h_' + Date.now(),
        title: data.title,
        category: data.category,
        weeklyGoal: data.weeklyGoal,
        emoji: data.emoji,
        color: data.color,
        completedDates: {},
      };
      setHabits((prev) => [newHabit, ...prev]);
      showToast('عادت جدید با موفقیت اضافه شد.');
    }
  };

  // ================= TASKS ACTIONS =================
  const handleToggleTask = (taskId: string) => {
    let nowDone = false;
    let taskTitle = '';

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          nowDone = !t.completed;
          taskTitle = t.title;
          return {
            ...t,
            completed: nowDone,
            completedAt: nowDone ? new Date().toISOString() : undefined,
          };
        }
        return t;
      })
    );

    if (nowDone) {
      soundManager.playCheck();
      showToast(`مأموریت «${taskTitle}» انجام شد!`, 'success');
      const todayKey = getTodayKey();
      setTimeout(() => {
        setTasks((cur) => {
          const todayTasks = cur.filter((t) => t.targetDate <= todayKey);
          if (todayTasks.length > 0 && todayTasks.every((t) => t.completed)) {
            confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
          }
          return cur;
        });
      }, 50);
    } else {
      soundManager.playUncheck();
    }
  };

  const handleAddTask = (taskData: Omit<Task, 'id' | 'completed'>) => {
    const newTask: Task = {
      ...taskData,
      id: 't_' + Date.now(),
      completed: false,
    };
    setTasks((prev) => [newTask, ...prev]);
    const remNote = newTask.reminderTime ? ` (یادآور: ${toPersianNum(newTask.reminderTime)})` : '';
    showToast(`مأموریت با «اولویت ${toPersianNum(newTask.priority)}» ثبت شد${remNote}.`, 'success');
  };

  const handleAddTasksBatch = (newTasks: Array<Omit<Task, 'id' | 'completed'>>) => {
    const mapped = newTasks.map((t, idx) => ({
      ...t,
      id: 't_' + Date.now() + '_' + idx,
      completed: false,
    }));
    setTasks((prev) => [...mapped, ...prev]);
    showToast(`${toPersianNum(newTasks.length)} مأموریت پیشنهادی به میز کار اضافه شد!`, 'success');
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
    if (taskData.id) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskData.id
            ? { ...t, ...taskData, reminded: false }
            : t
        )
      );
      showToast('مأموریت ویرایش شد.');
    } else {
      handleAddTask({
        title: taskData.title,
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
    const dateKey = targetDay === 'tomorrow' ? getTomorrowKey() : getTodayKey();
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, targetDate: dateKey } : t))
    );
    showToast(targetDay === 'tomorrow' ? 'کار به برنامه فردا منتقل شد.' : 'کار به لیست امروز منتقل شد.');
  };

  const handleMoveAllPendingToTomorrow = () => {
    const todayKey = getTodayKey();
    const tomorrowKey = getTomorrowKey();
    let count = 0;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.targetDate <= todayKey && !t.completed) {
          count++;
          return { ...t, targetDate: tomorrowKey };
        }
        return t;
      })
    );

    if (count === 0) {
      showToast('تمام کارهای امروزت تکمیل شده یا کاری برای انتقال نیست!');
    } else {
      showToast(`${toPersianNum(count)} کار ناتمام بدون عذاب وجدان به فردا منتقل شد.`);
    }
  };

  const handleApplyTomorrowToToday = () => {
    const todayKey = getTodayKey();
    const tomorrowKey = getTomorrowKey();
    let count = 0;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.targetDate === tomorrowKey) {
          count++;
          return { ...t, targetDate: todayKey };
        }
        return t;
      })
    );

    if (count === 0) {
      showToast('کاری در برنامه فردا وجود ندارد.');
    } else {
      showToast(`${toPersianNum(count)} مأموریت فردا به لیست امروز منتقل شد.`);
    }
  };

  const handleStartFocusOnTask = (taskId: string, taskTitle: string, duration: number) => {
    setActiveFocusTaskId(taskId);
    setActiveTab('pomodoro');
    showToast(`تایمر تمرکز برای «${taskTitle}» آماده شد.`);
  };

  // ================= USEFUL INFO ACTIONS =================
  const handleAddUsefulInfo = (data: Omit<UsefulInfoItem, 'id' | 'createdAt'>) => {
    const newItem: UsefulInfoItem = {
      ...data,
      id: 'info_' + Date.now(),
      createdAt: new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
    };
    setUsefulInfos((prev) => [newItem, ...prev]);
    showToast('در بخش اطلاعات کاربردی ذخیره شد!', 'success');
  };

  const handleUpdateUsefulInfo = (id: string, data: Partial<UsefulInfoItem>) => {
    setUsefulInfos((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data } : item))
    );
    showToast('اطلاعات کاربردی بروزرسانی شد.');
  };

  // ================= IDEAS ACTIONS =================
  const handleAddIdea = (data: Omit<Idea, 'id' | 'createdAt'>) => {
    const newIdea: Idea = {
      ...data,
      id: 'id_' + Date.now(),
      createdAt: new Intl.DateTimeFormat('fa-IR', {
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
    };
    setIdeas((prev) => [newIdea, ...prev]);
    showToast('ایده در بانک ایده‌ها ذخیره شد تا ذهنت آزاد بماند.');
  };

  const handleUpdateIdea = (id: string, data: Partial<Idea>) => {
    setIdeas((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data } : item))
    );
    showToast('ایده با موفقیت ویرایش شد.', 'success');
  };

  const handleConvertIdeaToTask = (ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;

    // Prevent accidental duplicate conversion (BUG-29)
    const alreadyExists = tasks.some(
      (t) => t.title.trim() === idea.title.trim() && !t.completed
    );
    if (alreadyExists) {
      showToast(`مأموریت «${idea.title}» هم‌اکنون در لیست کارهای فعال موجود است.`);
      return;
    }

    const todayKey = getTodayKey();
    const todayCount = tasks.filter((t) => t.targetDate === todayKey).length;
    handleAddTask({
      title: idea.title,
      description: idea.note || 'منتقل شده از بانک ایده‌ها',
      priority: todayCount + 1,
      duration: 45,
      targetDate: todayKey,
      category: 'work',
    });
    showToast(`«${idea.title}» با اولویت ${toPersianNum(todayCount + 1)} به میز کار اضافه شد!`, 'success');
  };

  // ================= RECYCLE BIN / TRASH STATE =================
  const [deletedTrashItems, setDeletedTrashItems] = useState<DeletedTrashItem[]>(() => {
    try {
      const saved = localStorage.getItem('nazmyar_trash_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    safeSetLocalStorage('nazmyar_trash_v1', JSON.stringify(deletedTrashItems));
  }, [deletedTrashItems, safeSetLocalStorage]);

  const handleRestoreTrashItem = (item: DeletedTrashItem) => {
    setDeletedTrashItems((prev) => prev.filter((x) => x.id !== item.id));
    if (item.type === 'task' && item.payload) {
      setTasks((prev) => [item.payload, ...prev.filter((t) => t.id !== item.id)]);
      container.tasks.restoreTask(item.id).catch(() => {});
    } else if (item.type === 'habit' && item.payload) {
      setHabits((prev) => [item.payload, ...prev.filter((h) => h.id !== item.id)]);
      container.habits.upsertHabit(habitToDomainEntity(item.payload)).catch(() => {});
    } else if (item.type === 'idea' && item.payload) {
      setIdeas((prev) => [item.payload, ...prev.filter((i) => i.id !== item.id)]);
      container.notes.upsertNote(ideaToDomainNote(item.payload)).catch(() => {});
    } else if (item.type === 'useful_info' && item.payload) {
      setUsefulInfos((prev) => [item.payload, ...prev.filter((u) => u.id !== item.id)]);
      container.notes.upsertNote(usefulInfoToDomainNote(item.payload)).catch(() => {});
    }
    showToast(`«${item.title}» از سطل زباله بازیابی شد!`, 'success');
  };

  const handlePermanentDeleteTrashItem = (id: string) => {
    setDeletedTrashItems((prev) => prev.filter((x) => x.id !== id));
    showToast('مورد انتخاب‌شده برای همیشه از سطل زباله پاک شد.');
  };

  const handleEmptyTrash = () => {
    setDeletedTrashItems([]);
    showToast('سطل زباله به طور کامل تخلیه شد.');
  };

  // ================= DELETE MODAL ACTIONS =================
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
    const nowIso = new Date().toISOString();

    if (type === 'habit') {
      const deletedHabit = habits.find((h) => h.id === id);
      setHabits((prev) => prev.filter((h) => h.id !== id));
      container.habits.softDeleteHabit(id).catch(() => {});
      if (deletedHabit) {
        setDeletedTrashItems((prev) => [
          { id, type: 'habit', title: deletedHabit.title, deletedAt: nowIso, payload: deletedHabit },
          ...prev.filter((x) => x.id !== id),
        ]);
      }
      showToast(
        'عادت به سطل زباله منتقل شد.',
        'info',
        deletedHabit
          ? () => {
              setDeletedTrashItems((prev) => prev.filter((x) => x.id !== deletedHabit.id));
              setHabits((prev) => [deletedHabit, ...prev.filter((h) => h.id !== deletedHabit.id)]);
              container.habits.upsertHabit(habitToDomainEntity(deletedHabit)).catch(() => {});
              showToast('عادت حذف‌شده بازیابی شد!', 'success');
            }
          : undefined
      );
    } else if (type === 'task') {
      const deletedTask = tasks.find((t) => t.id === id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      container.tasks.softDeleteTask(id).catch(() => {});
      if (deletedTask) {
        setDeletedTrashItems((prev) => [
          { id, type: 'task', title: deletedTask.title, deletedAt: nowIso, payload: deletedTask },
          ...prev.filter((x) => x.id !== id),
        ]);
      }
      showToast(
        'مأموریت به سطل زباله منتقل شد.',
        'info',
        deletedTask
          ? () => {
              setDeletedTrashItems((prev) => prev.filter((x) => x.id !== deletedTask.id));
              setTasks((prev) => [deletedTask, ...prev.filter((t) => t.id !== deletedTask.id)]);
              container.tasks.restoreTask(deletedTask.id).catch(() => {});
              showToast('مأموریت حذف‌شده بازیابی شد!', 'success');
            }
          : undefined
      );
    } else if (type === 'idea') {
      const deletedIdea = ideas.find((i) => i.id === id);
      setIdeas((prev) => prev.filter((i) => i.id !== id));
      container.notes.softDeleteNote(id).catch(() => {});
      if (deletedIdea) {
        setDeletedTrashItems((prev) => [
          { id, type: 'idea', title: deletedIdea.title, deletedAt: nowIso, payload: deletedIdea },
          ...prev.filter((x) => x.id !== id),
        ]);
      }
      showToast(
        'ایده به سطل زباله منتقل شد.',
        'info',
        deletedIdea
          ? () => {
              setDeletedTrashItems((prev) => prev.filter((x) => x.id !== deletedIdea.id));
              setIdeas((prev) => [deletedIdea, ...prev.filter((i) => i.id !== deletedIdea.id)]);
              container.notes.upsertNote(ideaToDomainNote(deletedIdea)).catch(() => {});
              showToast('ایدهٔ حذف‌شده بازیابی شد!', 'success');
            }
          : undefined
      );
    } else if (type === 'useful_info') {
      const deletedInfo = usefulInfos.find((u) => u.id === id);
      setUsefulInfos((prev) => prev.filter((u) => u.id !== id));
      container.notes.softDeleteNote(id).catch(() => {});
      if (deletedInfo) {
        setDeletedTrashItems((prev) => [
          {
            id,
            type: 'useful_info',
            title: deletedInfo.title,
            deletedAt: nowIso,
            payload: deletedInfo,
          },
          ...prev.filter((x) => x.id !== id),
        ]);
      }
      showToast(
        'مورد به سطل زباله منتقل شد.',
        'info',
        deletedInfo
          ? () => {
              setDeletedTrashItems((prev) => prev.filter((x) => x.id !== deletedInfo.id));
              setUsefulInfos((prev) => [
                deletedInfo,
                ...prev.filter((u) => u.id !== deletedInfo.id),
              ]);
              container.notes.upsertNote(usefulInfoToDomainNote(deletedInfo)).catch(() => {});
              showToast('اطلاعات حذف‌شده بازیابی شد!', 'success');
            }
          : undefined
      );
    }
    setDeleteModalState((prev) => ({ ...prev, isOpen: false }));
  };

  // ================= RESTORE / BACKUP =================
  const handleRestoreData = (data: {
    habits: Habit[];
    tasks: Task[];
    ideas: Idea[];
    focusSessions: FocusSession[];
    usefulInfos: UsefulInfoItem[];
  }) => {
    if (Array.isArray(data.habits)) setHabits(data.habits);
    if (Array.isArray(data.tasks)) setTasks(data.tasks);
    if (Array.isArray(data.ideas)) setIdeas(data.ideas);
    if (Array.isArray(data.focusSessions)) setFocusSessions(data.focusSessions);
    if (Array.isArray(data.usefulInfos)) setUsefulInfos(data.usefulInfos);
    showToast('اطلاعات با موفقیت بازیابی شدند!', 'success');
  };

  // Counts for Badges
  const pendingTasksCount = tasks.filter((t) => t.targetDate <= getTodayKey() && !t.completed).length;

  return (
    <div className="min-h-screen pb-24 lg:pb-16 selection:bg-indigo-500 selection:text-white transition-colors duration-300">
      {/* Header */}
      <Header
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

      {/* Explicit Native Bridge Diagnostic Banner (Never fail silently) */}
      {bridgeError && (
        <div
          role="alert"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3"
        >
          <div className="bg-rose-600 text-white rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-bold">{bridgeError}</p>
          </div>
        </div>
      )}

      {/* In-App Active Reminder Alert Banner */}
      {activeReminderAlert && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 animate-fade-in">
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white rounded-2xl p-4 shadow-xl shadow-indigo-600/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 animate-bounce">
                <BellRing className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black bg-white/20 px-2 py-0.5 rounded-md">
                    یادآور هوشمند کایروس • ساعت {toPersianNum(activeReminderAlert.time)}
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
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
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
                className="px-3.5 py-2 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-bold transition cursor-pointer active:scale-95"
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

      {/* Navigation */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingTasksCount={pendingTasksCount}
        ideasCount={ideas.length}
        usefulInfoCount={usefulInfos.length}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {activeTab === 'dashboard' && (
          <DashboardView
            tasks={tasks}
            habits={habits}
            onToggleTask={handleToggleTask}
            onToggleHabitToday={(id) => handleToggleHabitDay(id, getTodayKey())}
            onAddTask={handleAddTask}
            onMoveOverdueToToday={() => {
              const todayKey = getTodayKey();
              setTasks((prev) =>
                prev.map((t) =>
                  t.targetDate < todayKey && !t.completed ? { ...t, targetDate: todayKey } : t
                )
              );
              showToast('کارهای مانده به امروز منتقل شدند.');
            }}
            onMoveOverdueToTomorrow={() => {
              const todayKey = getTodayKey();
              const tomorrowKey = getTomorrowKey();
              setTasks((prev) =>
                prev.map((t) =>
                  t.targetDate < todayKey && !t.completed ? { ...t, targetDate: tomorrowKey } : t
                )
              );
              showToast('کارهای مانده به فردا منتقل شدند.');
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
            activeTaskId={activeFocusTaskId}
            onLogFocusSession={(session) => {
              setFocusSessions((prev) => [session, ...prev]);
              showToast(`جلسه تمرکز ${toPersianNum(session.durationMinutes)} دقیقه‌ای ثبت شد!`, 'success');
            }}
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

      {/* Persistent Global Mini-Timer Player across tabs */}
      <GlobalMiniTimer
        tasks={tasks}
        visible={activeTab !== 'pomodoro'}
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
