import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  GitBranch,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Eye,
  EyeOff,
  AlertCircle,
  Trash2,
  Lock,
  RotateCcw,
  FileCheck2,
  ChevronDown,
  ChevronUp,
  History,
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
  githubConfig: GitHubSyncConfig;
  onSaveGitHubConfig: (config: GitHubSyncConfig) => void;
  onPullFromGitHub: () => Promise<void>;
  onPushToGitHub: () => Promise<void>;
  isGitHubSyncing: boolean;
  lastKnownSha: string | null;
  lastSyncedAt: string | null;
  githubSyncError: string | null;
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
  githubConfig,
  onSaveGitHubConfig,
  onPullFromGitHub,
  onPushToGitHub,
  isGitHubSyncing,
  lastSyncedAt,
  githubSyncError,
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

  // Collapsible legacy GitHub section
  const [showLegacyGitHub, setShowLegacyGitHub] = useState(false);

  // Runtime host capabilities inspection (FIX-12)
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

  // Local form state initialized from githubConfig
  const [owner, setOwner] = useState(githubConfig.owner);
  const [repo, setRepo] = useState(githubConfig.repo);
  const [path, setPath] = useState(githubConfig.path || 'data.json');
  const [branch, setBranch] = useState(githubConfig.branch || 'main');
  const [token, setToken] = useState(githubConfig.token);
  const [showToken, setShowToken] = useState(false);
  const [configSavedNotice, setConfigSavedNotice] = useState(false);

  const isConfigured = Boolean(
    owner.trim() && repo.trim() && path.trim() && token.trim()
  );

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

  // 1. Export Canonical Plain JSON Backup (BackupEnvelopeV2 directly from Repository transaction)
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

  // 2. Export Encrypted Backup (AES-256-GCM + PBKDF2 over canonical BackupEnvelopeV2)
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
          ? 'اطلاعات فایل پشتیبان پس از تأیید اسنپ‌شات امنیتی با موفقیت در پایگاه‌داده جایگزین شد!'
          : 'اطلاعات فایل پشتیبان با موفقیت با داده‌های فعلی ادغام شد!'
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
      setImportStatus('داده‌ها با موفقیت به وضعیت پیش از آخرین بازیابی (اسنپ‌شات امنیتی) بازگردانده شدند.');
    } catch (err: any) {
      setImportError(err?.message || 'خطا در بازگردانی اسنپ‌شات قبلی');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: GitHubSyncConfig = {
      owner: owner.trim(),
      repo: repo.trim(),
      path: path.trim() || 'data.json',
      branch: branch.trim() || 'main',
      token: token.trim(),
      autoSync: false,
    };
    onSaveGitHubConfig(updated);
    setConfigSavedNotice(true);
    setTimeout(() => setConfigSavedNotice(false), 3000);
  };

  const handleClearToken = () => {
    setToken('');
    onSaveGitHubConfig({
      owner: owner.trim(),
      repo: repo.trim(),
      path: path.trim() || 'data.json',
      branch: branch.trim() || 'main',
      token: '',
      autoSync: false,
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Primary Offline Local Backup & Restore (Plain + Encrypted AES-GCM + Preview) */}
      <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Download className="w-5 h-5 text-indigo-500" />
              <span>پشتیبان‌گیری و بازیابی آفلاین (مالکیت کامل داده)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              داده‌های شما ۱۰۰٪ روی همین دستگاه ذخیره می‌شوند. شامل {toPersianNum(tasks.length)} کار،{' '}
              {toPersianNum(habits.length)} عادت، {toPersianNum(ideas.length)} ایده،{' '}
              {toPersianNum(usefulInfos.length)} یادداشت مرجع و {toPersianNum(focusSessions.length)} جلسه تمرکز.
            </p>
          </div>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 self-start sm:self-center">
            آفلاین-محور و مستقل از سرور (نسخهٔ ۲)
          </span>
        </div>

        {/* Plain & Encrypted Export Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
                ۱. خروجی استاندارد JSON (BackupEnvelopeV2)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                حاوی تمام جداول (کارها، عادت‌ها، سابقهٔ روزانه عادت‌ها، یادداشت‌ها، جلسات تمرکز، سطل زباله و تنظیمات) همراه با کد کنترلی Checksum.
              </p>
            </div>
            <button
              type="button"
              disabled={isExportingPlain}
              onClick={handleExportPlainBackup}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>دانلود فایل پشتیبان (JSON)</span>
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>۲. خروجی رمزگذاری‌شده (AES-256-GCM + PBKDF2)</span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                مشتق‌سازی کلید با ۱۰۰٬۰۰۰ دور PBKDF2-SHA256 و رمزنگاری احرازهویت‌شده. هشدار: در صورت فراموشی گذرواژه، امکان بازیابی فایل وجود ندارد.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="گذرواژه رمزگذاری (حداقل ۴ کاراکتر)..."
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

        {/* File Import with Strict Validation & Preview */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
                بارگذاری، اعتبارسنجی دقیق و پیش‌نمایش فایل پشتیبان
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                هر رکورد پیش از بازیابی از نظر ساختار، تاریخ، شناسه و Checksum بررسی شده و ابتدا اسنپ‌شات امنیتی از داده‌های فعلی ثبت می‌گردد.
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
              className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                <Lock className="w-4 h-4 shrink-0" />
                <span>این فایل پشتیبان رمزگذاری شده است. برای رمزگشایی و بررسی ساختار، گذرواژهٔ آن را وارد کنید:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={decryptPassword}
                  onChange={(e) => setDecryptPassword(e.target.value)}
                  placeholder="گذرواژه فایل پشتیبان..."
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
            <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-indigo-700 dark:text-indigo-300">
                  <FileCheck2 className="w-5 h-5 text-indigo-500" />
                  <span>پیش‌نمایش فایل پشتیبان معتبر (تأییدشده)</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold">
                    نسخهٔ اسکیما: {toPersianNum(importPreview.schemaVersion || 2)}
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
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {toPersianNum(importPreview.counts.tasks)}
                  </div>
                  <div className="text-[11px] text-slate-500">مأموریت فعال</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {toPersianNum(importPreview.counts.habits)}
                  </div>
                  <div className="text-[11px] text-slate-500">عادت ({toPersianNum(importPreview.counts.habitEntries)} ثبت)</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {toPersianNum(importPreview.counts.ideas)}
                  </div>
                  <div className="text-[11px] text-slate-500">ایده</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {toPersianNum(importPreview.counts.usefulInfos)}
                  </div>
                  <div className="text-[11px] text-slate-500">یادداشت مرجع</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {toPersianNum(importPreview.counts.focusSessions)}
                  </div>
                  <div className="text-[11px] text-slate-500">جلسه تمرکز</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {toPersianNum(importPreview.counts.trashedItems)}
                  </div>
                  <div className="text-[11px] text-slate-500">در سطل زباله</div>
                </div>
              </div>

              {/* Restore Strategy Selection */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  روش اعمال بازیابی در پایگاه‌داده:
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
                    <div className="text-xs font-black">۱. جایگزینی کامل (Replace)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      ثبت اسنپ‌شات امنیتی از وضعیت فعلی و جایگزینی کامل دیتابیس با محتوای این فایل
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
                    <div className="text-xs font-black">۲. ادغام هوشمند (Merge)</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      حفظ رکوردهای فعلی و ادغام رکوردهای فایل پشتیبان بر پایهٔ آخرین ویرایش (Revision)
                    </div>
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                🛡️ پیش از اعمال هرگونه تغییر، یک اسنپ‌شات امنیتی کامل در IndexedDB ذخیره و بازخوانی می‌شود؛ اگر ذخیرهٔ اسنپ‌شات با خطا مواجه شود، بازیابی متوقف شده و داده‌های فعلی شما دست‌نخورده باقی می‌مانند.
              </p>

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
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
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
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-white">
                    اسنپ‌شات امنیتی پیش از آخرین بازیابی موجود است
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
      <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-500" />
              <span>سطل زباله و بازیابی موارد حذف‌شده</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                {toPersianNum(deletedTrashItems.length)} مورد
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              موارد حذف‌شده به صورت نرم در پایگاه‌داده نگه‌داری می‌شوند تا بتوانید آن‌ها را بازیابی یا برای همیشه پاک کنید.
            </p>
          </div>

          {deletedTrashItems.length > 0 && onEmptyTrash && (
            <button
              type="button"
              onClick={onEmptyTrash}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition cursor-pointer"
            >
              تخلیه کامل سطل زباله
            </button>
          )}
        </div>

        {deletedTrashItems.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 bg-slate-50/60 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
            سطل زباله خالی است.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {deletedTrashItems.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {item.type === 'task'
                        ? 'مأموریت'
                        : item.type === 'habit'
                        ? 'عادت'
                        : item.type === 'idea'
                        ? 'ایده'
                        : 'یادداشت مرجع'}
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

      {/* 2.5 Host & Offline Capabilities Diagnostic Card (FIX-12) */}
      <section
        data-testid="host-capabilities-card"
        className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <span>وضعیت محیط اجرا و قابلیت‌های میزبان (Host Capabilities)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              تشخیص خودکار محیط وب، WebView استاتیک اندروید (Sketchware) یا پل بومی بدون پیش‌فرض قرار دادن SQLite.
            </p>
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
              ? '۱۰۰٪ مستقل از سرور و اینترنت (فونت و دارایی‌های محلی)'
              : 'نیازمند فعال‌سازی ذخیره‌سازی در میزبان'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">محیط اجرای شناسایی‌شده:</div>
            <div data-testid="host-kind-label" className="font-black text-slate-800 dark:text-white mt-1">
              {hostCaps.hostLabelFa}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
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
              {hostCaps.hasNativeAndroidBridge || hostCaps.hasNativeDesktopBridge ? 'متصل' : 'بستهٔ وب استاتیک'}
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

        {hostCaps.warningsFa.length > 0 && (
          <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs space-y-1">
            {hostCaps.warningsFa.map((w, idx) => (
              <div key={idx}>• {w}</div>
            ))}
          </div>
        )}

        {/* Live Non-Destructive Subsystem Self-Diagnostic & Handoff Kit */}
        <div
          data-testid="self-diagnostic-card"
          className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
                آزمون خودکار سلامت زیرسیستم‌ها و آمادگی بسته‌بندی (Self-Diagnostics)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                بررسی زنده و غیرمخرب تراکنش IndexedDB، قرارداد پشتیبان نسخهٔ ۲، رمزنگاری AES-256-GCM، تقویم کبیسهٔ جلالی و مفسر NLP بدون تغییر داده‌های شما.
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
                راهنمای فنی Sketchware / Windows
              </button>
              <button
                type="button"
                data-testid="run-self-diagnostic-btn"
                disabled={isRunningDiagnostics}
                onClick={handleRunDiagnostics}
                className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostics ? 'animate-spin' : ''}`} />
                <span>اجرای خودآزمایی زیرسیستم‌ها</span>
              </button>
            </div>
          </div>

          {diagnosticSummary && (
            <div
              data-testid="self-diagnostic-results"
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-3"
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
                      ? 'هر ۶ زیرسیستم حیاتی با موفقیت تأیید شدند'
                      : 'برخی زیرسیستم‌ها نیازمند بررسی هستند'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-bold">
                  زمان کل اجرا: {toPersianNum(diagnosticSummary.totalDurationMs)} میلی‌ثانیه
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
                          chk.passed
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {chk.passed ? 'تأیید شد' : 'ناموفق'}
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
              className="p-4 rounded-2xl bg-slate-900 text-slate-100 text-xs space-y-3 border border-slate-800"
            >
              <div className="space-y-1">
                <div className="font-bold text-indigo-300">
                  ۱. تنظیمات الزامی WebView در Sketchware اندروید (کد جاوا در onCreate):
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
                  ۲. دستورات ساخت بستهٔ استاتیک و نصاب ویندوز (در سیستم دارای Rust/WebView2):
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
      </section>

      {/* 3. Secondary / Archived Manual GitHub REST API Section */}
      <section
        data-testid="legacy-github-disclosure"
        className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4"
      >
        <button
          type="button"
          aria-expanded={showLegacyGitHub}
          onClick={() => setShowLegacyGitHub((prev) => !prev)}
          className="w-full flex items-center justify-between text-right cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-slate-500" />
            <div>
              <h3 className="text-sm font-black text-slate-700 dark:text-slate-200">
                ابزار جانبی قدیمی: انتقال دستی با مخزن خصوصی GitHub (خارج از مسیر اصلی آفلاین)
              </h3>
              <p className="text-[11px] text-slate-400">
                مسیر اصلی کایروس ۱۰۰٪ آفلاین و مبتنی بر فایل پشتیبان محلی است. این بخش صرفاً برای سازگاری با نسخه‌های قدیمی نگه‌داری شده و در پس‌زمینه غیرفعال است.
              </p>
            </div>
          </div>
          {showLegacyGitHub ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showLegacyGitHub && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    نام کاربری گیت‌هاب (Owner)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="e.g. daniyal-dev"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    نام مخزن خصوصی (Repo)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="e.g. kairos-data"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white text-left"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  توکن دسترسی گیت‌هاب (Fine-grained PAT)
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showToken ? 'text' : 'password'}
                    dir="ltr"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="github_pat_..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-white text-left"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute left-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                {token && (
                  <button
                    type="button"
                    onClick={handleClearToken}
                    className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold cursor-pointer"
                  >
                    حذف توکن
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs cursor-pointer"
                >
                  ذخیره تنظیمات دستی
                </button>
              </div>
            </form>

            {configSavedNotice && (
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                تنظیمات ذخیره شد.
              </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
              <span className="text-xs text-slate-500">
                آخرین وضعیت: {lastSyncedAt || 'ارسال خودکار غیرفعال است'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isConfigured || isGitHubSyncing}
                  onClick={onPullFromGitHub}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5 text-sky-500" />
                  <span>دریافت دستی (Pull)</span>
                </button>
                <button
                  type="button"
                  disabled={!isConfigured || isGitHubSyncing}
                  onClick={onPushToGitHub}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  {isGitHubSyncing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                  )}
                  <span>ارسال دستی (Push)</span>
                </button>
              </div>
            </div>

            {githubSyncError && (
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold">
                {githubSyncError}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
