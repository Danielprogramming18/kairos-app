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
  BookOpen,
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

  // Local form state initialized from githubConfig
  const [owner, setOwner] = useState(githubConfig.owner);
  const [repo, setRepo] = useState(githubConfig.repo);
  const [path, setPath] = useState(githubConfig.path || 'data.json');
  const [branch, setBranch] = useState(githubConfig.branch || 'main');
  const [token, setToken] = useState(githubConfig.token);
  const [autoSync, setAutoSync] = useState(githubConfig.autoSync);
  const [showToken, setShowToken] = useState(false);
  const [configSavedNotice, setConfigSavedNotice] = useState(false);

  const isConfigured = Boolean(
    owner.trim() && repo.trim() && path.trim() && token.trim()
  );

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: GitHubSyncConfig = {
      owner: owner.trim(),
      repo: repo.trim(),
      path: path.trim() || 'data.json',
      branch: branch.trim() || 'main',
      token: token.trim(),
      autoSync,
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

  // 1. Export JSON backup (exact data.json format)
  const handleExportBackup = () => {
    const backupData = {
      app: 'Kairos',
      version: '4.0',
      updatedAt: new Date().toISOString(),
      data: {
        habits,
        tasks,
        ideas,
        focusSessions,
        usefulInfos,
      },
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `data.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 2. Import JSON backup
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const data = parsed.data || parsed;
        if (!data.habits || !data.tasks) {
          throw new Error('فرمت فایل پشتیبان معتبر نیست.');
        }

        onRestoreData({
          habits: data.habits || [],
          tasks: data.tasks || [],
          ideas: data.ideas || [],
          focusSessions: data.focusSessions || [],
          usefulInfos: data.usefulInfos || [],
        });
        setImportStatus('اطلاعات فایل data.json با موفقیت بازیابی و اعمال شد!');
      } catch (err: any) {
        setImportStatus('خطا در خواندن فایل: فایل انتخاب‌شده معتبر نیست.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. GitHub Private Repo (data.json) Synchronization Settings */}
      <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border-2 border-indigo-500/30 dark:border-indigo-500/30 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <GitBranch className="w-5 h-5 text-indigo-500" />
              <h3 className="text-base font-black text-slate-800 dark:text-white">
                همگام‌سازی ابری با GitHub REST API (فایل <code>data.json</code> در مخزن خصوصی)
              </h3>
              <span
                className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                  isConfigured
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}
              >
                {isConfigured ? 'تنظیم‌شده و فعال' : 'آماده تنظیم توکن'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              بدون نیاز به هیچ سرور یا دیتابیس خارجی؛ تمام کارها، عادت‌ها، ایده‌ها و اطلاعات کاربردی در فایل <code>data.json</code> داخل مخزن خصوصی گیت‌هاب خودت با بررسی <code>SHA</code> ذخیره و بین گوشی و لپ‌تاپ همگام می‌شوند.
            </p>
          </div>
        </div>

        {/* Settings Form */}
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                نام کاربری گیت‌هاب (GitHub Owner / Username)
              </label>
              <input
                type="text"
                dir="ltr"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. daniyal-dev"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-white text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                نام مخزن خصوصی داده‌ها (Private Data Repo)
              </label>
              <input
                type="text"
                dir="ltr"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="e.g. kairos-data"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-white text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                مسیر فایل داده (File Path)
              </label>
              <input
                type="text"
                dir="ltr"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="data.json"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-white text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                شاخه مخزن (Branch)
              </label>
              <input
                type="text"
                dir="ltr"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-white text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Fine-grained PAT Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>توکن دسترسی گیت‌هاب (Fine-grained Personal Access Token)</span>
              </label>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                🔒 فقط در حافظه همین مرورگر ذخیره می‌شود (خارج از سورس‌کد)
              </span>
            </div>

            <div className="relative flex items-center">
              <input
                type={showToken ? 'text' : 'password'}
                dir="ltr"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-white text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                title={showToken ? 'مخفی کردن توکن' : 'نمایش توکن'}
                className="absolute left-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="rounded accent-indigo-600 w-4 h-4"
              />
              <span>
                همگام‌سازی خودکار (دریافت در بدو ورود، بررسی دوره‌ای هر ۴۵ ثانیه و ذخیره خودکار تغییرات)
              </span>
            </label>

            <div className="flex items-center gap-2">
              {token && (
                <button
                  type="button"
                  onClick={handleClearToken}
                  className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف توکن</span>
                </button>
              )}
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>ذخیره تنظیمات گیت‌هاب</span>
              </button>
            </div>
          </div>
        </form>

        {configSavedNotice && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>تنظیمات گیت‌هاب در مرورگر شما ذخیره شد.</span>
          </div>
        )}

        {/* SHA Status & Manual Sync Controls */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-slate-600 dark:text-slate-300">
                آخرین SHA فایل:
                <code className="mr-1.5 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-900 text-indigo-600 dark:text-indigo-400">
                  {lastKnownSha ? lastKnownSha.slice(0, 10) : 'ثبت نشده'}
                </code>
              </span>
              {lastSyncedAt && (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  آخرین همگام‌سازی: {lastSyncedAt}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!isConfigured || isGitHubSyncing}
                onClick={onPullFromGitHub}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-40"
              >
                <ArrowDownToLine className="w-3.5 h-3.5 text-sky-500" />
                <span>دریافت از گیت‌هاب (Pull)</span>
              </button>

              <button
                type="button"
                disabled={!isConfigured || isGitHubSyncing}
                onClick={onPushToGitHub}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-40 shadow-sm"
              >
                {isGitHubSyncing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                )}
                <span>ذخیره در گیت‌هاب با بررسی SHA (Push)</span>
              </button>
            </div>
          </div>

          {githubSyncError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{githubSyncError}</span>
            </div>
          )}
        </div>
      </section>

      {/* 2. Step-by-Step Guide for GitHub Private Repo & GitHub Pages */}
      <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-500" />
          <h3 className="text-base font-black text-slate-800 dark:text-white">
            راهنمای گام‌به‌گام انتشار رایگان با GitHub Pages و اتصال مخزن خصوصی داده
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
            <h4 className="font-black text-slate-800 dark:text-white text-sm">
              بخش اول: ساخت مخزن خصوصی داده و توکن (برای سینک گوشی و لپ‌تاپ)
            </h4>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>
                در اکانت GitHub خود یک Repository جدید و <b>Private (خصوصی)</b> به نام <code>kairos-data</code> (با تیک <i>Add a README file</i>) بساز.
              </li>
              <li>
                در گیت‌هاب به مسیر <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> برو و روی <b>Generate new token</b> بزن.
              </li>
              <li>
                در بخش <b>Repository access</b> گزینه <b>Only select repositories</b> را بزن و فقط مخزن <code>kairos-data</code> را انتخاب کن.
              </li>
              <li>
                در بخش <b>Repository permissions</b>، دسترسی <b>Contents</b> را روی <b>Read and write</b> بگذار و توکن ساخته‌شده را در کادر بالا وارد کن.
              </li>
            </ol>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
            <h4 className="font-black text-slate-800 dark:text-white text-sm">
              بخش دوم: انتشار رایگان کد برنامه روی GitHub Pages
            </h4>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>
                یک مخزن دوم (مثلاً <code>kairos-app</code>) در GitHub بساز و سورس‌کد این پروژه را در شاخه <code>main</code> آن Push کن.
              </li>
              <li>
                در تنظیمات مخزن <code>kairos-app</code> به بخش <b>Settings → Pages</b> برو و در قسمت <b>Build and deployment (Source)</b> گزینه <b>GitHub Actions</b> را انتخاب کن.
              </li>
              <li>
                فایل خودکار <code>.github/workflows/deploy.yml</code> که داخل پروژه قرار داده شده، به‌طور خودکار برنامه را Build کرده و لینک دائمی <code>https://USERNAME.github.io/kairos-app/</code> را به تو می‌دهد!
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* 3. Offline Local File Backup (data.json) */}
      <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-6">
        <div>
          <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-500" />
            پشتیبان‌گیری و بازیابی مستقیم فایل <code>data.json</code>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            شامل {toPersianNum(habits.length)} عادت، {toPersianNum(tasks.length)} کار، {toPersianNum(ideas.length)} ایده و {toPersianNum(usefulInfos.length)} مورد اطلاعات کاربردی.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={handleExportBackup}
            className="py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>دانلود مستقیم فایل data.json</span>
          </button>

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
              className="w-full py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
            >
              <Upload className="w-4 h-4 text-emerald-500" />
              <span>بارگذاری و بازیابی فایل data.json</span>
            </button>
          </div>
        </div>

        {importStatus && (
          <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}
      </section>

      {/* 4. Data Integrity & SHA Conflict Protection Summary */}
      <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/70 dark:border-slate-800 shadow-sm space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          <h3 className="text-sm font-black text-slate-800 dark:text-white">
            حفاظت در برابر بازنویسی اشتباه بین گوشی و لپ‌تاپ (SHA Conflict Protection)
          </h3>
        </div>
        <p>
          • هر بار که تغییری ذخیره می‌شود، برنامه ابتدا <code>SHA</code> آخرین نسخه فایل <code>data.json</code> روی گیت‌هاب را بررسی می‌کند. اگر دستگاه دیگر در این فاصله تغییری ثبت کرده باشد، اطلاعات دو دستگاه به‌صورت هوشمند ادغام (Merge) می‌شوند تا هیچ کاری یا تیکی حذف نشود.
        </p>
      </section>
    </div>
  );
};
