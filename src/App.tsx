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
import { BackupAndSyncView } from './components/BackupAndSyncView';
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

export default function App() {
  // 1. Persistent UI State
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
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

  // 2. Persistent Core Data (Preserving all existing localStorage keys)
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
        const parsed: Task[] = JSON.parse(saved);
        return parsed.map((t) => {
          if (t.id === 't1' && !t.reminderTime) return { ...t, reminderTime: '19:00' };
          if (t.id === 't2' && !t.reminderTime) return { ...t, reminderTime: '16:30' };
          return t;
        });
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

  // 3. GitHub REST API Sync State
  const [githubConfig, setGithubConfig] = useState<GitHubSyncConfig>(() => loadGitHubConfig());
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
  const hasInitialPullRunRef = useRef<boolean>(false);
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

  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; type: 'info' | 'success' }>>([]);

  const showToast = useCallback((text: string, type: 'info' | 'success' = 'info') => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('nazmyar_habits_v1', JSON.stringify(habits));
    } catch {}
  }, [habits]);

  useEffect(() => {
    try {
      localStorage.setItem('nazmyar_danial_tasks_v1', JSON.stringify(tasks));
    } catch {}
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem('nazmyar_danial_ideas_v1', JSON.stringify(ideas));
    } catch {}
  }, [ideas]);

  useEffect(() => {
    try {
      localStorage.setItem('nazmyar_focus_sessions_v1', JSON.stringify(focusSessions));
    } catch {}
  }, [focusSessions]);

  useEffect(() => {
    try {
      localStorage.setItem('nazmyar_useful_info_v1', JSON.stringify(usefulInfos));
    } catch {}
  }, [usefulInfos]);

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

  // ================= GITHUB REST API SYNC LOGIC =================
  const handlePullFromGitHub = useCallback(
    async (silent = false) => {
      if (!isGitHubConfigValid(githubConfig)) return;
      setIsGitHubSyncing(true);
      if (!silent) setGithubSyncError(null);

      try {
        const res = await fetchGitHubDataFile(githubConfig);
        if (!res.exists || !res.fileData) {
          // data.json does not exist in the private repo yet -> create it with current local data!
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

        // Only apply remote state if SHA changed or if this is a manual pull
        if (!silent || res.sha !== lastKnownSha) {
          isApplyingRemoteRef.current = true;
          const remoteData = res.fileData.data;
          if (remoteData.habits) setHabits(remoteData.habits);
          if (remoteData.tasks) setTasks(remoteData.tasks);
          if (remoteData.ideas) setIdeas(remoteData.ideas);
          if (remoteData.focusSessions) setFocusSessions(remoteData.focusSessions);
          if (remoteData.usefulInfos) setUsefulInfos(remoteData.usefulInfos);

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
        hasInitialPullRunRef.current = true;
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

  // Pull on app open + periodic poll every 45 seconds + when window regains focus
  useEffect(() => {
    if (!isGitHubConfigValid(githubConfig) || !githubConfig.autoSync) return;

    handlePullFromGitHub(true);

    const interval = setInterval(() => {
      handlePullFromGitHub(true);
    }, 45000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        handlePullFromGitHub(true);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [githubConfig, handlePullFromGitHub]);

  // Debounced auto-push to GitHub whenever local data changes
  useEffect(() => {
    if (!isGitHubConfigValid(githubConfig) || !githubConfig.autoSync) return;
    if (!hasInitialPullRunRef.current || isApplyingRemoteRef.current) return;

    const timer = setTimeout(() => {
      handlePushToGitHub(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [habits, tasks, ideas, focusSessions, usefulInfos, githubConfig, handlePushToGitHub]);

  const handleSaveGitHubConfig = (newCfg: GitHubSyncConfig) => {
    saveGitHubConfig(newCfg);
    setGithubConfig(newCfg);
    setGithubSyncError(null);
    if (isGitHubConfigValid(newCfg)) {
      showToast('تنظیمات گیت‌هاب ذخیره شد. در حال اتصال به مخزن...', 'success');
    }
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

  // Background Task Reminder Checker (runs every 15 seconds)
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentHHMM = `${hh}:${mm}`;
      const todayKey = getTodayKey();

      tasks.forEach((task) => {
        if (
          !task.completed &&
          task.targetDate <= todayKey &&
          task.reminderTime === currentHHMM &&
          !task.reminded
        ) {
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, reminded: true } : t))
          );

          soundManager.playBell();
          setActiveReminderAlert({
            taskId: task.id,
            title: task.title,
            time: currentHHMM,
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
    showToast('ایده در پارکینگ ایده‌ها ذخیره شد تا ذهنت آزاد بماند.');
  };

  const handleConvertIdeaToTask = (ideaId: string) => {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;
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
    if (type === 'habit') {
      setHabits((prev) => prev.filter((h) => h.id !== id));
      showToast('عادت مورد نظر حذف شد.');
    } else if (type === 'task') {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      showToast('مأموریت حذف شد.');
    } else if (type === 'idea') {
      setIdeas((prev) => prev.filter((i) => i.id !== id));
      showToast('ایده از بانک ایده‌ها حذف شد.');
    } else if (type === 'useful_info') {
      setUsefulInfos((prev) => prev.filter((u) => u.id !== id));
      showToast('مورد از اطلاعات کاربردی حذف شد.');
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
    setHabits(data.habits);
    setTasks(data.tasks);
    setIdeas(data.ideas);
    setFocusSessions(data.focusSessions);
    if (data.usefulInfos && data.usefulInfos.length > 0) {
      setUsefulInfos(data.usefulInfos);
    }
    showToast('اطلاعات با موفقیت بازیابی شدند!', 'success');
  };

  // Counts for Badges
  const pendingTasksCount = tasks.filter((t) => t.targetDate <= getTodayKey() && !t.completed).length;

  return (
    <div className="min-h-screen pb-16 selection:bg-indigo-500 selection:text-white transition-colors duration-300">
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
            onAddIdea={handleAddIdea}
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
        description={`آیا از حذف «${deleteModalState.title}» اطمینان دارید؟`}
        onClose={() => setDeleteModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmDelete}
      />

      {/* Toast Floating Notifications */}
      <div className="fixed bottom-5 left-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 pointer-events-auto transition-all duration-300 animate-fade-in ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white shadow-emerald-600/25'
                : 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-slate-900/30'
            }`}
          >
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
