import React, { useRef, useState } from 'react';
import {
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  GitBranch,
  KeyRound,
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
} from 'lucide-react';
import {
  Habit,
  Task,
  Idea,
  FocusSession,
  UsefulInfoItem,
  GitHubSyncConfig,
} from '../types';
import { toPersianNum } from '../utils/persianDate';
import {
  createPlainBackupEnvelope,
  createEncryptedBackupEnvelope,
  decryptBackupEnvelope,
  validateAndPreviewBackupPayload,
  BackupPreviewSummary,
} from '../utils/backupCrypto';

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
  deletedTrashItems = [],
  onRestoreTrashItem,
  onPermanentDeleteTrashItem,
  onEmptyTrash,
  githubConfig,
  onSaveGitHubConfig,
  onPullFromGitHub,
  onPushToGitHub,
  isGitHubSyncing,
  lastKnownSha,
  lastSyncedAt,
  githubSyncError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Encrypted backup state
  const [exportPassword, setExportPassword] = useState('');
  const [isExportingEncrypted, setIsExportingEncrypted] = useState(false);

  // Import preview & decryption state
  const [pendingRawFile, setPendingRawFile] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<BackupPreviewSummary | null>(null);
  const [decryptPassword, setDecryptPassword] = useState('');

  // Collapsible legacy GitHub section
  const [showLegacyGitHub, setShowLegacyGitHub] = useState(false);

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

  // 1. Export Plain JSON Backup
  const handleExportPlainBackup = () => {
    const backupEnvelope = createPlainBackupEnvelope({
      habits,
      tasks,
      ideas,
      focusSessions,
      usefulInfos,
    });

    const blob = new Blob([JSON.stringify(backupEnvelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kairos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    try {
      localStorage.setItem('kairos_last_backup_at_v1', new Date().toISOString());
    } catch {}
  };

  // 2. Export Encrypted Backup (AES-256-GCM + PBKDF2)
  const handleExportEncryptedBackup = async () => {
    setImportError(null);
    if (!exportPassword || exportPassword.trim().length < 4) {
      setImportError('لطفاً برای رمزگذاری پشتیبان یک گذرواژهٔ حداقل ۴ کاراکتری وارد کنید.');
      return;
    }
    setIsExportingEncrypted(true);
    try {
      const encryptedEnvelope = await createEncryptedBackupEnvelope(
        { habits, tasks, ideas, focusSessions, usefulInfos },
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
    setImportPreview(null);
    setPendingRawFile(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = String(event.target?.result || '');
      const preview = validateAndPreviewBackupPayload(raw);
      if (preview.encrypted) {
        setPendingRawFile(raw);
        setImportPreview(preview);
      } else if (!preview.valid) {
        setImportError(preview.error || 'فایل انتخاب‌شده معتبر نیست.');
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
    } else {
      setImportError(null);
      setImportPreview(preview);
      setDecryptPassword('');
    }
  };

  const handleConfirmRestorePreview = () => {
    if (!importPreview || !importPreview.valid || !importPreview.data) return;

    // Take pre-restore safety snapshot before replacing current data
    try {
      const snapshot = createPlainBackupEnvelope({
        habits,
        tasks,
        ideas,
        focusSessions,
        usefulInfos,
      });
      localStorage.setItem('kairos_pre_restore_snapshot_v1', JSON.stringify(snapshot));
    } catch {}

    onRestoreData(importPreview.data);
    setImportPreview(null);
    setPendingRawFile(null);
    setImportStatus('اطلاعات فایل پشتیبان پس از بررسی ساختار و ذخیرهٔ اسنپ‌شات امنیتی با موفقیت جایگزین شد!');
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
              {toPersianNum(habits.length)} عادت، {toPersianNum(ideas.length)} ایده و{' '}
              {toPersianNum(usefulInfos.length)} مورد یادداشت و مرجع.
            </p>
          </div>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 self-start sm:self-center">
            آفلاین-محور و مستقل از سرور
          </span>
        </div>

        {/* Plain & Encrypted Export Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
                ۱. خروجی استاندارد JSON (قابل انتقال)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                مناسب برای نگهداری شخصی یا انتقال دستی بین مرورگر، نسخهٔ اندروید و نسخهٔ ویندوز.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportPlainBackup}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition cursor-pointer active:scale-95"
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
                رمزگذاری استاندارد با کلید مشتق‌شده از گذرواژه. توجه: در صورت فراموشی گذرواژه، امکان بازیابی فایل وجود ندارد.
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
                disabled={isExportingEncrypted}
                onClick={handleExportEncryptedBackup}
                className="py-2 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>دانلود امن</span>
              </button>
            </div>
          </div>
        </div>

        {/* File Import with Preview */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white">
                بارگذاری و پیش‌نمایش فایل پشتیبان قبل از جایگزینی
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                فایل انتخابی ابتدا اعتبارسنجی شده و تعداد رکوردهای آن پیش از اعمال نهایی به شما نمایش داده می‌شود.
              </p>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
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
                <span>این فایل پشتیبان رمزگذاری شده است. برای مشاهدهٔ پیش‌نمایش، گذرواژهٔ آن را وارد کنید:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={decryptPassword}
                  onChange={(e) => setDecryptPassword(e.target.value)}
                  placeholder="گذرواژه فایل پشتیبان..."
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
                  <span>پیش‌نمایش فایل پشتیبان معتبر (آمادهٔ جایگزینی)</span>
                </div>
                {importPreview.exportedAt && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    تاریخ خروجی: {importPreview.exportedAt.slice(0, 10)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {toPersianNum(importPreview.counts.tasks)}
                  </div>
                  <div className="text-[11px] text-slate-500">مأموریت</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                  <div className="text-sm font-black text-slate-800 dark:text-white">
                    {toPersianNum(importPreview.counts.habits)}
                  </div>
                  <div className="text-[11px] text-slate-500">عادت</div>
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
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                ⚠️ با تأیید بازیابی، داده‌های فعلی با محتوای این فایل جایگزین می‌شوند (یک اسنپ‌شات پشتیبان خودکار از وضعیت فعلی قبل از جایگزینی ذخیره خواهد شد).
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
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
                  onClick={handleConfirmRestorePreview}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  تأیید و جایگزینی کامل داده‌ها
                </button>
              </div>
            </div>
          )}

          {importError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {importStatus && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{importStatus}</span>
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
              موارد حذف‌شده به صورت نرم نگه‌داری می‌شوند تا در صورت نیاز بتوانید آن‌ها را برگردانید یا برای همیشه پاک کنید.
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

      {/* 3. Secondary / Archived Manual GitHub REST API Section */}
      <section className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <button
          type="button"
          onClick={() => setShowLegacyGitHub((prev) => !prev)}
          className="w-full flex items-center justify-between text-right cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-slate-500" />
            <div>
              <h3 className="text-sm font-black text-slate-700 dark:text-slate-200">
                انتقال دستی با مخزن خصوصی GitHub (اختیاری - غیرفعال در پس‌زمینه)
              </h3>
              <p className="text-[11px] text-slate-400">
                طبق سیاست آفلاین-محور، هیچ داده یا توکنی به صورت خودکار ارسال نمی‌شود. فقط در صورت نیاز دستی باز کنید.
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
