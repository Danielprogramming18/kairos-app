import {
  createPlainBackupEnvelope,
  createEncryptedBackupEnvelope,
  decryptBackupEnvelope,
  validateAndPreviewBackupPayload,
} from './backupCrypto';
import {
  isJalaliLeapYear,
  getJalaliMonthLength,
  getStartOfPersianYear,
  getPersianParts,
  addDays,
} from './persianDate';
import { parseNaturalTaskInput } from './nlpTaskParser';
import { detectHostCapabilities } from './hostCapabilities';

export type DiagnosticCheckStatus = 'passed' | 'failed' | 'not_run' | 'unsupported';

export interface DiagnosticCheckResult {
  id:
    | 'storage_check'
    | 'backup_contract_check'
    | 'crypto_check'
    | 'calendar_check'
    | 'nlp_check'
    | 'offline_bundle_check'
    | 'native_host_bridge_check';
  titleFa: string;
  status: DiagnosticCheckStatus;
  passed: boolean;
  durationMs: number;
  detailFa: string;
  scopeFa: string;
}

export interface SelfDiagnosticSummary {
  ranAtIso: string;
  allPassed: boolean;
  totalDurationMs: number;
  checks: DiagnosticCheckResult[];
}

export interface StorageProbePort {
  verifyStorageHealth: () => Promise<{ healthy: boolean; engine: string; errorMessage?: string }>;
}

/**
 * Runs a non-destructive live verification suite across Kairos runtime subsystems.
 * Honestly distinguishes `passed`, `failed`, `not_run`, and `unsupported` checks,
 * and states the exact scope of each check without exaggerated claims (FIX-19).
 */
export async function runSubsystemSelfDiagnostics(
  storagePort?: StorageProbePort
): Promise<SelfDiagnosticSummary> {
  const suiteStart = performance.now();
  const checks: DiagnosticCheckResult[] = [];
  const caps = detectHostCapabilities();

  // 1. Storage Engine Check (Non-destructive repository health & read probe)
  {
    const t0 = performance.now();
    try {
      if (storagePort) {
        const health = await storagePort.verifyStorageHealth();
        checks.push({
          id: 'storage_check',
          titleFa: 'اتصال و سلامت موتور ذخیره‌سازی (IndexedDB / Repository)',
          status: health.healthy ? 'passed' : 'failed',
          passed: health.healthy,
          durationMs: Math.max(1, Math.round(performance.now() - t0)),
          detailFa: health.healthy
            ? `اتصال به موتور «${health.engine}» بدون دست‌کاری داده‌های کاربر تأیید شد.`
            : health.errorMessage || 'موتور ذخیره‌سازی وضعیت ناسالم گزارش کرد.',
          scopeFa: 'بررسی دسترسی خواندن و وضعیت اتصال پایه (بدون نوشتن روی داده‌های کاربر).',
        });
      } else {
        checks.push({
          id: 'storage_check',
          titleFa: 'اتصال و سلامت موتور ذخیره‌سازی (IndexedDB / Repository)',
          status: caps.hasIndexedDB ? 'passed' : 'failed',
          passed: caps.hasIndexedDB,
          durationMs: Math.max(1, Math.round(performance.now() - t0)),
          detailFa: caps.hasIndexedDB
            ? 'رابط IndexedDB در این محیط در دسترس است.'
            : 'رابط IndexedDB در این محیط یافت نشد.',
          scopeFa: 'بررسی وجود رابط IndexedDB در مرورگر یا WebView.',
        });
      }
    } catch (err: any) {
      checks.push({
        id: 'storage_check',
        titleFa: 'اتصال و سلامت موتور ذخیره‌سازی (IndexedDB / Repository)',
        status: 'failed',
        passed: false,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        detailFa: `خطا در بررسی پایگاه‌داده: ${err?.message || 'نامشخص'}`,
        scopeFa: 'بررسی دسترسی خواندن و وضعیت اتصال پایه.',
      });
    }
  }

  // 2. Backup Contract V2 & Checksum Verification
  {
    const t0 = performance.now();
    try {
      const sampleEnvelope = createPlainBackupEnvelope({
        tasks: [
          {
            id: 'diag-task-1',
            title: 'کار آزمایشی کایروس',
            completed: false,
            priority: 1,
            duration: 45,
            targetDate: '2026-03-21',
            category: 'work',
            subtasks: [],
            createdAt: '2026-03-20T08:00:00.000Z',
          },
        ],
        habits: [],
        ideas: [],
        focusSessions: [],
        usefulInfos: [],
      });
      const serialized = JSON.stringify(sampleEnvelope);
      const preview = validateAndPreviewBackupPayload(serialized, { verifyChecksum: true });
      const passed =
        preview.valid &&
        preview.schemaVersion === 2 &&
        preview.counts?.tasks === 1 &&
        Boolean(sampleEnvelope.checksum);
      checks.push({
        id: 'backup_contract_check',
        titleFa: 'ساختار پاکت پشتیبان نسخهٔ ۲ و کد کنترلی Checksum',
        status: passed ? 'passed' : 'failed',
        passed,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        detailFa: passed
          ? 'ساخت پاکت BackupEnvelopeV2، محاسبهٔ Checksum و اعتبارسنجی ساختار رکوردها در حافظه تأیید شد.'
          : preview.error || 'خطا در اعتبارسنجی قرارداد پشتیبان نسخهٔ ۲',
        scopeFa: 'تشخیص خرابی تصادفی فایل (Checksum جایگزین امضای دیجیتال رمزنگاری نیست).',
      });
    } catch (err: any) {
      checks.push({
        id: 'backup_contract_check',
        titleFa: 'ساختار پاکت پشتیبان نسخهٔ ۲ و کد کنترلی Checksum',
        status: 'failed',
        passed: false,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        detailFa: `خطا در بررسی قرارداد پشتیبان: ${err?.message || 'نامشخص'}`,
        scopeFa: 'تشخیص خرابی تصادفی فایل پشتیبان.',
      });
    }
  }

  // 3. Authenticated Encryption Round-Trip (PBKDF2-SHA256 + AES-256-GCM)
  {
    const t0 = performance.now();
    if (!caps.hasWebCryptoSubtle) {
      checks.push({
        id: 'crypto_check',
        titleFa: 'رمزنگاری فایل پشتیبان (AES-256-GCM + PBKDF2)',
        status: 'unsupported',
        passed: false,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        detailFa: 'رابط WebCrypto Subtle در این مبدأ غیرفعال است؛ فقط خروجی JSON معمولی در دسترس است.',
        scopeFa: 'رمزگذاری فایل خروجی پشتیبان با گذرواژه.',
      });
    } else {
      try {
        const sampleEnvelope = createPlainBackupEnvelope({
          tasks: [],
          habits: [],
          ideas: [
            {
              id: 'diag-idea-1',
              title: 'یادداشت آزمایشی رمزنگاری آفلاین',
              note: 'تست PBKDF2 و AES-GCM',
              category: 'project',
              tags: ['امنیت'],
              createdAt: '۱ فروردین',
            },
          ],
          focusSessions: [],
          usefulInfos: [],
        });
        const encrypted = await createEncryptedBackupEnvelope(sampleEnvelope, 'KairosDiag#1404');
        const decrypted = await decryptBackupEnvelope(
          JSON.stringify(encrypted),
          'KairosDiag#1404'
        );
        const wrongPass = await decryptBackupEnvelope(
          JSON.stringify(encrypted),
          'WrongPass#0000'
        );
        const passed =
          decrypted.valid &&
          decrypted.counts?.ideas === 1 &&
          !wrongPass.valid;
        checks.push({
          id: 'crypto_check',
          titleFa: 'رمزنگاری فایل پشتیبان (AES-256-GCM + PBKDF2)',
          status: passed ? 'passed' : 'failed',
          passed,
          durationMs: Math.max(1, Math.round(performance.now() - t0)),
          detailFa: passed
            ? 'رمزگذاری، رمزگشایی با گذرواژهٔ درست و رد گذرواژهٔ اشتباه در حافظه تأیید شد.'
            : 'خطا در چرخهٔ رمزنگاری یا رمزگشایی WebCrypto',
          scopeFa: 'رمزگذاری روی فایل خروجی پشتیبان اعمال می‌شود، نه روی دیتابیس زندهٔ مرورگر.',
        });
      } catch (err: any) {
        checks.push({
          id: 'crypto_check',
          titleFa: 'رمزنگاری فایل پشتیبان (AES-256-GCM + PBKDF2)',
          status: 'failed',
          passed: false,
          durationMs: Math.max(1, Math.round(performance.now() - t0)),
          detailFa: `خطا در WebCrypto: ${err?.message || 'نامشخص'}`,
          scopeFa: 'رمزگذاری روی فایل خروجی پشتیبان.',
        });
      }
    }
  }

  // 4. Jalali Calendar & Leap-Year Accuracy
  {
    const t0 = performance.now();
    try {
      const leap1403 = isJalaliLeapYear(1403);
      const nonLeap1404 = !isJalaliLeapYear(1404);
      const esfand1403Len = getJalaliMonthLength(1403, 12);
      const esfand1404Len = getJalaliMonthLength(1404, 12);
      const start1403 = getStartOfPersianYear(1403);
      const day366Parts = getPersianParts(addDays(start1403, 365));
      const passed =
        leap1403 &&
        nonLeap1404 &&
        esfand1403Len === 30 &&
        esfand1404Len === 29 &&
        day366Parts.jYear === 1403 &&
        day366Parts.jMonth === 12 &&
        day366Parts.jDay === 30;
      checks.push({
        id: 'calendar_check',
        titleFa: 'موتور تقویم جلالی و محاسبهٔ سال‌های کبیسه',
        status: passed ? 'passed' : 'failed',
        passed,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        detailFa: passed
          ? 'تشخیص ۳۰ اسفند ۱۴۰۳ (کبیسه) و ۲۹ اسفند ۱۴۰۴ (عادی) تأیید شد.'
          : 'عدم تطابق در تبدیل تاریخ جلالی یا تشخیص سال کبیسه',
        scopeFa: 'بررسی تبدیل تاریخ شمسی و طول ماه اسفند در سال کبیسه و عادی.',
      });
    } catch (err: any) {
      checks.push({
        id: 'calendar_check',
        titleFa: 'موتور تقویم جلالی و محاسبهٔ سال‌های کبیسه',
        status: 'failed',
        passed: false,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        detailFa: `خطا در تقویم جلالی: ${err?.message || 'نامشخص'}`,
        scopeFa: 'بررسی تبدیل تاریخ شمسی و سال کبیسه.',
      });
    }
  }

  // 5. Persian NLP Smart Task Parser
  {
    const t0 = performance.now();
    try {
      const parsed = parseNaturalTaskInput(
        'ارسال گزارش نهایی فردا ساعت ۱۴:۳۰ ۳۰ دقیقه اولویت ۲',
        new Date(2026, 2, 20, 9, 0, 0)
      );
      const passed =
        parsed.title === 'ارسال گزارش نهایی' &&
        parsed.targetDate === '2026-03-21' &&
        parsed.reminderTime === '14:30' &&
        parsed.duration === 30 &&
        parsed.priority === 2 &&
        parsed.hasExtractedTokens;
      checks.push({
        id: 'nlp_check',
        titleFa: 'تحلیلگر عبارت‌های تاریخ و زمان فارسی (Quick Add Parser)',
        status: passed ? 'passed' : 'failed',
        passed,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        detailFa: passed
          ? 'استخراج عنوان، تاریخ «فردا»، ساعت «۱۴:۳۰»، مدت «۳۰ دقیقه» و «اولویت ۲» تأیید شد.'
          : 'خروجی تحلیلگر متن با مقادیر مورد انتظار تطابق ندارد.',
        scopeFa: 'تحلیل مبتنی بر الگوهای متنی فارسی؛ پیش از ثبت نهایی توسط کاربر قابل ویرایش است.',
      });
    } catch (err: any) {
      checks.push({
        id: 'nlp_check',
        titleFa: 'تحلیلگر عبارت‌های تاریخ و زمان فارسی (Quick Add Parser)',
        status: 'failed',
        passed: false,
        durationMs: Math.max(1, Math.round(performance.now() - t0)),
        detailFa: `خطا در تحلیلگر متن: ${err?.message || 'نامشخص'}`,
        scopeFa: 'تحلیل مبتنی بر الگوهای متنی فارسی.',
      });
    }
  }

  // 6. Offline Static Bundle & Local Font Readiness
  {
    const t0 = performance.now();
    const passed = caps.isOfflineReady;
    checks.push({
      id: 'offline_bundle_check',
      titleFa: 'آمادگی دارایی‌های آفلاین و ذخیره‌سازی محلی',
      status: passed ? 'passed' : 'failed',
      passed,
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      detailFa: passed
        ? `محیط «${caps.hostLabelFa}» با ذخیره‌سازی محلی در دسترس است.`
        : caps.warningsFa.join(' | ') || 'نقص در قابلیت‌های آفلاین میزبان',
      scopeFa: 'بررسی دسترسی به موتور ذخیره‌سازی در محیط فعلی.',
    });
  }

  const requiredChecks = checks.filter((c) => c.status !== 'unsupported' && c.status !== 'not_run');
  const allPassed = requiredChecks.length > 0 && requiredChecks.every((c) => c.status === 'passed');

  return {
    ranAtIso: new Date().toISOString(),
    allPassed,
    totalDurationMs: Math.max(1, Math.round(performance.now() - suiteStart)),
    checks,
  };
}

export function getPlatformHandoffSnippets(): {
  sketchwareWebSettingsJava: string;
  windowsBuildCommands: string;
} {
  return {
    sketchwareWebSettingsJava: [
      'WebSettings ws = webview1.getSettings();',
      'ws.setJavaScriptEnabled(true);',
      'ws.setDomStorageEnabled(true); // الزامی برای IndexedDB و localStorage',
      'ws.setDatabaseEnabled(true);',
      'ws.setAllowFileAccess(true);',
      '// نکته امنیتی: از فعال کردن setAllowUniversalAccessFromFileURLs خودداری کنید.',
      'ws.setAllowFileAccessFromFileURLs(false);',
      'ws.setAllowUniversalAccessFromFileURLs(false);',
      '// در صورت امکان از WebViewAssetLoader (https://appassets.androidplatform.net) استفاده شود:',
      'webview1.loadUrl("file:///android_asset/www/index.html");',
    ].join('\n'),
    windowsBuildCommands: [
      'npm ci',
      'npm run build   # تولید پوشهٔ استاتیک dist/ با مسیرهای نسبی ./ و فونت محلی',
      'npx tauri build # نیازمند ویندوز + Rust + WebView2 برای ساخت فایل نصبی .exe/.msi',
    ].join('\n'),
  };
}
