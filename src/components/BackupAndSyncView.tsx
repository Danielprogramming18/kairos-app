import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Trash2,
  Lock,
  RotateCcw,
  FileCheck2,
  ChevronDown,
  ChevronUp,
  History,
  Sun,
  Moon,
  Monitor,
  Volume2,
  VolumeX,
  Bell,
  Wrench,
} from 'lucide-react';
import {
  Habit,
  Task,
  Idea,
  FocusSession,
  UsefulInfoItem,
  GitHubSyncConfig,
} from '../types';
import { BackupEnvelopeV2 } from '../domain/models';
import { usePlatform } from '../app/PlatformContext';
import { toPersianNum } from '../utils/persianDate';
import {
  createPlainBackupEnvelope,
  createEncryptedBackupEnvelope,
  decryptBackupEnvelope,
  validateAndPreviewBackupPayload,
  BackupPreviewSummary,
} from '../utils/backupCrypto';
import { detectHostCapabilities } from '../utils/hostCapabilities';
import {
  runSubsystemSelfDiagnostics,
  getPlatformHandoffSnippets,
  SelfDiagnosticSummary,
} from '../utils/releaseReadiness';

export interface DeletedTrashItem {
  id: string;
  type: 'task' | 'habit' | 'idea' | 'useful_info';
  title: string;
  deletedAt: string;
  payload: any;
}

interface BackupAndSyncViewProps {
  habits: Habit[];
  tasks: Task[];
  ideas: Idea[];
  focusSessions: FocusSession[];
  usefulInfos: UsefulInfoItem[];
  onRestoreData: (data: {
    habits: Habit[];
    tasks: Task[];
    ideas: Idea[];
    focusSessions: FocusSession[];
    usefulInfos: UsefulInfoItem[];
  }) => void;
  onRestoreEnvelope?: (
    envelope: BackupEnvelopeV2,
    strategy: 'replace' | 'merge'
  ) => Promise<void>;
  onRollbackLastRestore?: () => Promise<void>;
  deletedTrashItems?: DeletedTrashItem[];
  onRestoreTrashItem?: (item: DeletedTrashItem) => void;
  onPermanentDeleteTrashItem?: (id: string) => void;
  onEmptyTrash?: () => void;
  // Appearance & Sound Preferences
  themePreference?: 'light' | 'dark' | 'system';
  onChangeThemePreference?: (theme: 'light' | 'dark' | 'system') => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  notificationPermission?: NotificationPermission;
  onRequestNotificationPermission?: () => void;
  onTriggerTestNotification?: () => void;
  // Optional legacy props kept for type compatibility
  githubConfig?: GitHubSyncConfig;
  onSaveGitHubConfig?: (config: GitHubSyncConfig) => void;
  onPullFromGitHub?: () => Promise<void>;
  onPushToGitHub?: () => Promise<void>;
  isGitHubSyncing?: boolean;
  lastKnownSha?: string | null;
  lastSyncedAt?: string | null;
  githubSyncError?: string | null;
}

export const BackupAndSyncView: React.FC<BackupAndSyncViewProps> = ({
  habits,
  tasks,
  ideas,
  focusSessions,
  usefulInfos,
  onRestoreData,
  onRestoreEnvelope,
  onRollbackLastRestore,
  deletedTrashItems = [],
  onRestoreTrashItem,
  onPermanentDeleteTrashItem,
  onEmptyTrash,
  themePreference = 'dark',
  onChangeThemePreference,
  soundEnabled = true,
  onToggleSound,
  notificationPermission = 'default',
  onRequestNotificationPermission,
  onTriggerTestNotification,
}) => {
  const { container } = usePlatform();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorDetails, setImportErrorDetails] = useState<string[]>([]);

  // Encrypted backup state
  const [exportPassword, setExportPassword] = useState('');
  const [isExportingPlain, setIsExportingPlain] = useState(false);
  const [isExportingEncrypted, setIsExportingEncrypted] = useState(false);

  // Import preview, strategy & decryption state
  const [pendingRawFile, setPendingRawFile] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<BackupPreviewSummary | null>(null);
  const [restoreStrategy, setRestoreStrategy] = useState<'replace' | 'merge'>('replace');
  const [isRestoring, setIsRestoring] = useState(false);
  const [decryptPassword, setDecryptPassword] = useState('');

  // Pre-restore snapshot rollback state
  const [preRestoreSnapshot, setPreRestoreSnapshot] = useState<{
    exists: boolean;
    createdAt?: string;
  }>({ exists: false });

  // Collapsible Developer & Diagnostic Accordion (§15.7 & §18)
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);

  const hostCaps = detectHostCapabilities();
  const handoffSnippets = getPlatformHandoffSnippets();
  const [diagnosticSummary, setDiagnosticSummary] = useState<SelfDiagnosticSummary | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [showHandoffSnippets, setShowHandoffSnippets] = useState(false);

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    try {
      const summary = await runSubsystemSelfDiagnostics({
        verifyStorageHealth: () => container.lifecycle.getStorageHealth(),
      });
      setDiagnosticSummary(summary);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const refreshPreRestoreSnapshotState = async () => {
    try {
      if (container.backup.hasPreRestoreSnapshot) {
        const info = await container.backup.hasPreRestoreSnapshot();
        setPreRestoreSnapshot(info);
      }
    } catch {
      // Ignore check error
    }
  };

  useEffect(() => {
    refreshPreRestoreSnapshotState();
  }, [container]);

  // 1. Export Canonical Plain JSON Backup (BackupEnvelopeV2)
  const handleExportPlainBackup = async () => {
    setImportError(null);
    setImportErrorDetails([]);
    setIsExportingPlain(true);
    try {
      let backupEnvelope: BackupEnvelopeV2;
      try {
        backupEnvelope = await container.backup.exportBackup();
      } catch {
        backupEnvelope = createPlainBackupEnvelope({
          habits,
          tasks,
          ideas,
          focusSessions,
          usefulInfos,
        });
      }

      const blob = new Blob([JSON.stringify(backupEnvelope, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kairos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setImportStatus(
        'فایل پشتیبان استاندارد نسخهٔ ۲ (شامل کارها، عادت‌ها، یادداشت‌ها، جلسات تمرکز و تنظیمات) دانلود شد.'
      );
    } catch (err: any) {
      setImportError(err?.message || 'خطا در تهیهٔ خروجی پشتیبان');
    } finally {
      setIsExportingPlain(false);
    }
  };

  // 2. Export Encrypted Backup (AES-256-GCM + PBKDF2)
  const handleExportEncryptedBackup = async () => {
    setImportError(null);
    setImportErrorDetails([]);
    if (!exportPassword || exportPassword.trim().length < 4) {
      setImportError('لطفاً برای رمزگذاری پشتیبان یک گذرواژهٔ حداقل ۴ کاراکتری وارد کنید.');
      return;
    }
    setIsExportingEncrypted(true);
    try {
      let canonicalEnvelope: BackupEnvelopeV2;
      try {
        canonicalEnvelope = await container.backup.exportBackup();
      } catch {
        canonicalEnvelope = createPlainBackupEnvelope({
          habits,
          tasks,
          ideas,
          focusSessions,
          usefulInfos,
        });
      }

      const encryptedEnvelope = await createEncryptedBackupEnvelope(
        canonicalEnvelope,
        exportPassword
      );
      const blob = new Blob([JSON.stringify(encryptedEnvelope, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kairos-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExportPassword('');
      setImportStatus('فایل پشتیبان رمزگذاری‌شده (AES-256-GCM) با موفقیت دانلود شد.');
    } catch (err: any) {
      setImportError(err?.message || 'خطا در رمزگذاری فایل پشتیبان');
    } finally {
      setIsExportingEncrypted(false);
    }
  };

  // 3. Select & Validate File for Preview before Restore
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);
    setImportError(null);
    setImportErrorDetails([]);
    setImportPreview(null);
    setPendingRawFile(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = String(event.target?.result || '');
      const preview = validateAndPreviewBackupPayload(raw, { verifyChecksum: true });
      if (preview.encrypted) {
        setPendingRawFile(raw);
        setImportPreview(preview);
      } else if (!preview.valid) {
        setImportError(preview.error || 'فایل انتخاب‌شده معتبر نیست.');
        setImportErrorDetails(preview.errors.slice(0, 5));
      } else {
        setImportPreview(preview);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDecryptPendingFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRawFile || !decryptPassword) return;
    const preview = await decryptBackupEnvelope(pendingRawFile, decryptPassword);
    if (!preview.valid) {
      setImportError(preview.error || 'گذرواژه اشتباه است.');
      setImportErrorDetails(preview.errors.slice(0, 5));
    } else {
      setImportError(null);
      setImportErrorDetails([]);
      setImportPreview(preview);
      setDecryptPassword('');
    }
  };

  const handleConfirmRestorePreview = async () => {
    if (!importPreview || !importPreview.valid || !importPreview.envelope) return;

    setIsRestoring(true);
    setImportError(null);
    setImportErrorDetails([]);
    try {
      if (onRestoreEnvelope) {
        await onRestoreEnvelope(importPreview.envelope, restoreStrategy);
      } else if (importPreview.data) {
        onRestoreData(importPreview.data);
      }
      await refreshPreRestoreSnapshotState();
      setImportPreview(null);
      setPendingRawFile(null);
      setImportStatus(
        restoreStrategy === 'replace'
          ? 'اطلاعات فایل پشتیبان پس از ثبت اسنپ‌شات امنیتی با موفقیت جایگزین شد.'
          : 'اطلاعات فایل پشتیبان با موفقیت با داده‌های فعلی ادغام شد.'
      );
    } catch (err: any) {
      setImportError(err?.message || 'خطا در بازیابی فایل پشتیبان؛ داده‌های قبلی حفظ شدند.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleTriggerRollback = async () => {
    if (!onRollbackLastRestore) return;
    setIsRestoring(true);
    setImportError(null);
    try {
      await onRollbackLastRestore();
      await refreshPreRestoreSnapshotState();
      setImportStatus('داده‌ها با موفقیت به وضعیت پیش از آخرین بازیابی بازگردانده شدند.');
    } catch (err: any) {
      setImportError(err?.message || 'خطا در بازگردانی اسنپ‌شات قبلی');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 0. Appearance, Sound & Notification Preferences */}
      {onChangeThemePreference && (
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-5">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="text-base font-black text-slate-800 dark:text-white">
              ظاهر، صدا و یادآورها
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              شخصی‌سازی پوستهٔ نمایشی (روشن، تیره یا هماهنگ با سیستم‌عامل) و تنظیمات صوتی برنامه
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Theme Selector */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-3">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                پوستهٔ نمایشی برنامه
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeThemePreference('light')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    themePreference === 'light'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>روشن</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeThemePreference('dark')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    themePreference === 'dark'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>تیره</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeThemePreference('system')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    themePreference === 'system'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>سیستم</span>
                </button>
              </div>
            </div>

            {/* Sound & Reminder Controls */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-3">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                صدا و اعلان یادآورها
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onToggleSound && (
                  <button
                    type="button"
                    onClick={onToggleSound}
                    className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    {soundEnabled ? (
                      <>
                        <Volume2 className="w-4 h-4 text-indigo-500" />
                        <span>صدای برنامه: فعال</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-4 h-4 text-slate-400" />
                        <span>صدای برنامه: بی‌صدا</span>
                      </>
                    )}
                  </button>
                )}

                {onRequestNotificationPermission && notificationPermission !== 'granted' && (
                  <button
                    type="button"
                    onClick={onRequestNotificationPermission}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>فعال‌سازی اعلان مرورگر</span>
                  </button>
                )}

                {onTriggerTestNotification && (
                  <button
                    type="button"
                    onClick={onTriggerTestNotification}
                    className="px-3.5 py-2 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Bell className="w-3.5 h-3.5 text-amber-500" />
                    <span>آزمایش زنگ یادآور</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 1. Primary Offline Local Backup & Restore */}
      <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Download className="w-5 h-5 text-indigo-500" />
              <span>پشتیبان‌گیری و بازیابی آفلاین</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              داده‌های شما روی همین دستگاه ذخیره می‌شوند: {toPersianNum(tasks.length)} کار،{' '}
              {toPersianNum(habits.length)} عادت، {toPersianNum(ideas.length)} ایده،{' '}
              {toPersianNum(usefulInfos.length)} یادداشت و {toPersianNum(focusSessions.length)} جلسهٔ تمرکز.
            </p>
          </div>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 self-start sm:self-center">
            فرمت استاندارد نسخهٔ ۲
          </span>
        </div>

        {/* Plain & Encrypted Export Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
                ۱. خروجی استاندارد JSON
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                شامل تمام کارها، عادت‌ها، یادداشت‌ها، جلسات تمرکز، سطل زباله و تنظیمات همراه با کد کنترلی (Checksum) برای تشخیص خرابی تصادفی فایل هنگام انتقال.
              </p>
            </div>
            <button
              type="button"
              disabled={isExportingPlain}
              onClick={handleExportPlainBackup}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>دانلود فایل پشتیبان (JSON)</span>
            </button>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>۲. خروجی رمزگذاری‌شده (AES-256-GCM)</span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                فایل خروجی را با گذرواژهٔ شما (PBKDF2-SHA256) رمزنگاری می‌کند تا در صورت نگهداری فایل در فضای ابری یا فلش امن باشد. توجه: در صورت فراموشی گذرواژه، امکان بازگشایی این فایل وجود ندارد.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="گذرواژهٔ رمزگذاری (حداقل ۴ کاراکتر)..."
                aria-label="گذرواژه رمزگذاری پشتیبان"
                className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                disabled={isExportingEncrypted || !hostCaps.hasWebCryptoSubtle}
                onClick={handleExportEncryptedBackup}
                className="py-2 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>دانلود امن</span>
              </button>
            </div>
            {!hostCaps.hasWebCryptoSubtle && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                رابط رمزنگاری WebCrypto در این محیط غیرفعال است؛ از خروجی استاندارد JSON استفاده کنید.
              </p>
            )}
          </div>
        </div>

        {/* File Import with Validation & Preview */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
                بارگذاری و پیش‌نمایش فایل پشتیبان
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                فایل انتخابی پیش از اعمال بررسی می‌شود و ابتدا یک نسخهٔ پشتیبان موقت از داده‌های فعلی شما در مرورگر ثبت می‌گردد.
              </p>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                aria-label="انتخاب فایل پشتیبان JSON"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-500" />
                <span>انتخاب فایل پشتیبان (.json)</span>
              </button>
            </div>
          </div>

          {/* Password Prompt for Encrypted File */}
          {importPreview && importPreview.encrypted && !importPreview.valid && (
            <form
              onSubmit={handleDecryptPendingFile}
              className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                <Lock className="w-4 h-4 shrink-0" />
                <span>این فایل پشتیبان رمزگذاری شده است. برای رمزگشایی و پیش‌نمایش، گذرواژهٔ آن را وارد کنید:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={decryptPassword}
                  onChange={(e) => setDecryptPassword(e.target.value)}
                  placeholder="گذرواژهٔ فایل پشتیبان..."
                  aria-label="گذرواژه رمزگشایی فایل پشتیبان"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/30 text-xs text-slate-800 dark:text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                >
                  رمزگشایی و بررسی
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportPreview(null);
                    setPendingRawFile(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </form>
          )}

          {/* Validated Preview Card before Commit */}
          {importPreview && importPreview.valid && importPreview.counts && (
            <div className="p-5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-indigo-700 dark:text-indigo-300">
                  <FileCheck2 className="w-5 h-5 text-indigo-500" />
                  <span>پیش‌نمایش فایل پشتیبان معتبر</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold">
                    نسخهٔ ساختار: {toPersianNum(importPreview.schemaVersion || 2)}
                    {importPreview.migratedFromLegacy ? ' (مهاجرت از نسخهٔ ۱)' : ''}
                  </span>
                  {importPreview.exportedAt && (
                    <span className="text-slate-500 dark:text-slate-400">
                      تاریخ خروجی: {importPreview.exportedAt.slice(0, 10)}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white tabular-nums">
                    {toPersianNum(importPreview.counts.tasks)}
                  </div>
                  <div className="text-[11px] text-slate-500">کار فعال</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white tabular-nums">
                    {toPersianNum(importPreview.counts.habits)}
                  </div>
                  <div className="text-[11px] text-slate-500">عادت ({toPersianNum(importPreview.counts.habitEntries)} ثبت)</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white tabular-nums">
                    {toPersianNum(importPreview.counts.ideas)}
                  </div>
                  <div className="text-[11px] text-slate-500">ایده</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white tabular-nums">
                    {toPersianNum(importPreview.counts.usefulInfos)}
                  </div>
                  <div className="text-[11px] text-slate-500">یادداشت</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white tabular-nums">
                    {toPersianNum(importPreview.counts.focusSessions)}
                  </div>
                  <div className="text-[11px] text-slate-500">جلسهٔ تمرکز</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white tabular-nums">
                    {toPersianNum(importPreview.counts.trashedItems)}
                  </div>
                  <div className="text-[11px] text-slate-500">در سطل زباله</div>
                </div>
              </div>

              {/* Restore Strategy Selection */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  روش بازیابی اطلاعات:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRestoreStrategy('replace')}
                    className={`p-3 rounded-xl border text-right transition cursor-pointer ${
                      restoreStrategy === 'replace'
                        ? 'bg-indigo-600/15 border-indigo-500 text-indigo-800 dark:text-indigo-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-black">۱. جایگزینی کامل</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      ثبت نسخهٔ پشتیبان از وضعیت فعلی و جایگزینی کامل داده‌ها با محتوای این فایل
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestoreStrategy('merge')}
                    className={`p-3 rounded-xl border text-right transition cursor-pointer ${
                      restoreStrategy === 'merge'
                        ? 'bg-indigo-600/15 border-indigo-500 text-indigo-800 dark:text-indigo-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-black">۲. ادغام با داده‌های فعلی</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      حفظ رکوردهای فعلی و ادغام رکوردهای فایل پشتیبان بر پایهٔ آخرین ویرایش
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isRestoring}
                  onClick={() => {
                    setImportPreview(null);
                    setPendingRawFile(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  disabled={isRestoring}
                  onClick={handleConfirmRestorePreview}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {restoreStrategy === 'replace'
                    ? 'تأیید و جایگزینی کامل داده‌ها'
                    : 'تأیید و ادغام با داده‌های فعلی'}
                </button>
              </div>
            </div>
          )}

          {importError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs space-y-1.5"
            >
              <div className="font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{importError}</span>
              </div>
              {importErrorDetails.length > 1 && (
                <ul className="list-disc list-inside pr-4 text-[11px] space-y-0.5">
                  {importErrorDetails.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {importStatus && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{importStatus}</span>
            </div>
          )}

          {/* Pre-Restore Verified Snapshot Rollback Banner */}
          {preRestoreSnapshot.exists && onRollbackLastRestore && (
            <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-white">
                    نسخهٔ پشتیبان پیش از آخرین بازیابی موجود است
                  </span>
                  {preRestoreSnapshot.createdAt && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-2">
                      ({preRestoreSnapshot.createdAt.slice(0, 19).replace('T', ' ')})
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={isRestoring}
                onClick={handleTriggerRollback}
                className="px-3.5 py-2 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>بازگردانی به وضعیت پیش از بازیابی</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 2. Recycle Bin / Soft-Deleted Items Recovery (سطل زباله) */}
      <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500" />
              <span>سطل زباله و بازیابی موارد حذف‌شده</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold tabular-nums">
                {toPersianNum(deletedTrashItems.length)} مورد
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              موارد حذف‌شده در سطل زباله نگه‌داری می‌شوند تا در صورت نیاز بتوانید آن‌ها را بازیابی یا برای همیشه پاک کنید.
            </p>
          </div>

          {deletedTrashItems.length > 0 && onEmptyTrash && (
            <button
              type="button"
              onClick={onEmptyTrash}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition cursor-pointer"
            >
              تخلیهٔ کامل سطل زباله
            </button>
          )}
        </div>

        {deletedTrashItems.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 bg-slate-50/60 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            سطل زباله خالی است.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {deletedTrashItems.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {item.type === 'task'
                        ? 'کار'
                        : item.type === 'habit'
                        ? 'عادت'
                        : item.type === 'idea'
                        ? 'ایده'
                        : 'یادداشت'}
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-white truncate">
                      {item.title}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {onRestoreTrashItem && (
                    <button
                      type="button"
                      onClick={() => onRestoreTrashItem(item)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>بازیابی</span>
                    </button>
                  )}
                  {onPermanentDeleteTrashItem && (
                    <button
                      type="button"
                      onClick={() => onPermanentDeleteTrashItem(item.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition cursor-pointer"
                      title="حذف دائمی"
                    >
                      حذف دائمی
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Collapsible Technical & Developer Diagnostics Section (§15.7 & §18) */}
      <section className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <button
          type="button"
          data-testid="toggle-developer-tools-btn"
          aria-expanded={showDeveloperTools}
          onClick={() => setShowDeveloperTools((prev) => !prev)}
          className="w-full flex items-center justify-between text-right cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Wrench className="w-5 h-5 text-slate-500 shrink-0" />
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white">
                اطلاعات فنی و ابزار توسعه‌دهنده
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                بررسی قابلیت‌های محیط اجرا، خودآزمایی زیرسیستم‌های مرورگر و راهنمای فنی WebView / دسکتاپ
              </p>
            </div>
          </div>
          {showDeveloperTools ? (
            <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          )}
        </button>

        {showDeveloperTools && (
          <div
            data-testid="host-capabilities-card"
            className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                  وضعیت محیط اجرا در این دستگاه
                </span>
              </div>
              <span
                data-testid="host-offline-badge"
                className={`text-[11px] font-bold px-3 py-1 rounded-full self-start sm:self-center ${
                  hostCaps.isOfflineReady
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}
              >
                {hostCaps.isOfflineReady
                  ? 'ذخیره‌سازی آفلاین فعال است'
                  : 'نیازمند فعال‌سازی ذخیره‌سازی در میزبان'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">محیط اجرای شناسایی‌شده:</div>
                <div data-testid="host-kind-label" className="font-black text-slate-800 dark:text-white mt-1">
                  {hostCaps.hostLabelFa}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">موتور ذخیره‌سازی فعال:</div>
                <div data-testid="host-storage-label" className="font-black text-slate-800 dark:text-white mt-1">
                  {hostCaps.storageEngineLabelFa}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-bold">IndexedDB محلی</span>
                <span className={hostCaps.hasIndexedDB ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-rose-500 font-bold'}>
                  {hostCaps.hasIndexedDB ? 'فعال' : 'غیرفعال'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-bold">پل بومی SQLite</span>
                <span className={hostCaps.hasNativeAndroidBridge || hostCaps.hasNativeDesktopBridge ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-slate-400 font-bold'}>
                  {hostCaps.hasNativeAndroidBridge || hostCaps.hasNativeDesktopBridge ? 'متصل' : 'غیرمتصل (وب)'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-bold">رمزنگاری AES-GCM</span>
                <span className={hostCaps.hasWebCryptoSubtle ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-amber-500 font-bold'}>
                  {hostCaps.hasWebCryptoSubtle ? 'فعال' : 'محدود'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-bold">همگام‌سازی تب‌ها</span>
                <span className={hostCaps.hasBroadcastChannel ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-slate-400 font-bold'}>
                  {hostCaps.hasBroadcastChannel ? 'فعال' : 'تک‌پنجره'}
                </span>
              </div>
            </div>

            {/* Subsystem Self-Diagnostic & Handoff Kit */}
            <div
              data-testid="self-diagnostic-card"
              className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
                    خودآزمایی غیرمخرب زیرسیستم‌های مرورگر
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    توجه: این آزمون فقط زیرسیستم‌های داخل مرورگر فعلی را بررسی می‌کند و جایگزین تست روی دستگاه واقعی اندروید یا ویندوز نیست.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="toggle-handoff-snippets-btn"
                    aria-expanded={showHandoffSnippets}
                    onClick={() => setShowHandoffSnippets((prev) => !prev)}
                    className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
                  >
                    راهنمای فنی میزبان بومی
                  </button>
                  <button
                    type="button"
                    data-testid="run-self-diagnostic-btn"
                    disabled={isRunningDiagnostics}
                    onClick={handleRunDiagnostics}
                    className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostics ? 'animate-spin' : ''}`} />
                    <span>اجرای خودآزمایی</span>
                  </button>
                </div>
              </div>

              {diagnosticSummary && (
                <div
                  data-testid="self-diagnostic-results"
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-xs font-black">
                      <CheckCircle2
                        className={`w-4 h-4 ${
                          diagnosticSummary.allPassed ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      />
                      <span
                        data-testid="self-diagnostic-overall-status"
                        className={
                          diagnosticSummary.allPassed
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-amber-700 dark:text-amber-300'
                        }
                      >
                        {diagnosticSummary.allPassed
                          ? 'تمام آزمون‌های محیط فعلی با موفقیت اجرا شدند'
                          : 'برخی زیرسیستم‌ها نیازمند بررسی هستند'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-bold tabular-nums">
                      زمان اجرا: {toPersianNum(diagnosticSummary.totalDurationMs)} میلی‌ثانیه
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {diagnosticSummary.checks.map((chk) => (
                      <div
                        key={chk.id}
                        data-testid={`diag-item-${chk.id}`}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-black text-slate-800 dark:text-white">
                            {chk.titleFa}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ${
                              chk.status === 'passed'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : chk.status === 'unsupported'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {chk.status === 'passed'
                              ? 'تأیید شد'
                              : chk.status === 'unsupported'
                              ? 'پشتیبانی‌نشده در این محیط'
                              : chk.status === 'not_run'
                              ? 'اجرانشده'
                              : 'ناموفق'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {chk.detailFa}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showHandoffSnippets && (
                <div
                  data-testid="platform-handoff-snippets"
                  className="p-4 rounded-xl bg-slate-900 text-slate-100 text-xs space-y-3 border border-slate-800"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-indigo-300">
                      ۱. تنظیمات امن WebView در میزبان اندروید:
                    </div>
                    <pre
                      dir="ltr"
                      className="p-3 rounded-xl bg-slate-950 text-[11px] text-emerald-300 overflow-x-auto font-mono leading-relaxed"
                    >
                      {handoffSnippets.sketchwareWebSettingsJava}
                    </pre>
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-indigo-300">
                      ۲. دستورات ساخت بستهٔ استاتیک و نصاب ویندوز (Tauri):
                    </div>
                    <pre
                      dir="ltr"
                      className="p-3 rounded-xl bg-slate-950 text-[11px] text-sky-300 overflow-x-auto font-mono leading-relaxed"
                    >
                      {handoffSnippets.windowsBuildCommands}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
