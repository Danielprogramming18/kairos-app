# آزمون‌های پذیرش و قرارداد (Acceptance & Contract Tests)

این سند معیارهای پذیرش و آزمون‌های خودکار اجراشده برای کایروس را مستند می‌کند.

---

## ۱. آزمون‌های واحد و قرارداد (`node:test` — ۵۷ آزمون اجراشده و موفق)

1. **`src/infrastructure/web/dexieAdapter.test.ts` (۸ آزمون جامع مراحل ۱ و ۲)**
   - **مهاجرت امن و غیرمخرب (`migrateLegacyLocalStorageToIndexedDB`):**
     - خواندن کلیدهای قدیمی `nazmyar_danial_tasks_v1`, `nazmyar_habits_v1`, `nazmyar_danial_ideas_v1`, `nazmyar_useful_info_v1`, `nazmyar_focus_sessions_v1`, `nazmyar_trash_v1`.
     - ایجاد اسنپ‌شات بازیابی در `kairos_migration_recovery_v1` و بررسی صحت خواندن مجدد آن پیش از ادامهٔ مهاجرت.
     - توقف کامل مهاجرت و دست‌نخورده ماندن داده‌های مبدأ در صورت شکست نوشتن اسنپ‌شات (`FIX-04`).
     - ثبت وضعیت `clean_first_run` در اجرای اول بدون کلیدهای قدیمی و عدم تزریق خودکار رکوردهای نمونه (`FIX-04`).
     - ثبت جزئیات رکوردهای معیوب در `invalidRecords` و `corruptedKeys` بدون حذف بی‌صدا.
     - کنترل صحت تعداد رکوردهای نوشته‌شده در IndexedDB (`verifiedCountsMatch: true`) پیش از ثبت نشانگر مهاجرت.
   - **مبدل‌های بدون اتلاف Domain <-> UI (`FIX-05`):**
     - حفظ کامل فیلدهای `id`, `createdAt`, `updatedAt`, `revision`, `deletedAt`, `completedAt`, `projectId`, `sourceId`, `tags`, `subtasks`, `startDate`, `targetDaysOfWeek`.
   - **چرخهٔ کامل CRUD و افزایش واقعی `revision` (`FIX-01`, `FIX-02`, `FIX-06`):**
     - ایجاد، ویرایش، افزایش گام‌به‌گام `revision` (`1 -> 2 -> 3`)، حذف نرم (`softDelete`)، بازیابی (`restore`) و حذف دائمی (`hardDelete`) برای `tasks`, `habits`, `notes` (`idea` و `useful_info`) و `focusSessions`.
   - **امنیت پروتکل پل بومی (`validateBridgeRequest`):**
     - پذیرش درخواست معتبر نسخهٔ `1.0.0` و رد کردن نسخهٔ نامعتبر، عملیات غیرمجاز (مانند SQL خام) و مبدأ غیرمجاز.
   - **پشتیبان‌گیری، بازیابی اتمیک (`replace` و `merge`)، اسنپ‌شات پیش از بازیابی و بازگردانی (`rollbackLastRestore` — `FIX-08`):**
     - خروجی کامل `BackupEnvelopeV2` شامل `tasks`, `habits`, `habitEntries`, `notes`, `focusSessions`, `settings` و `checksum`.
     - ایجاد و بازخوانی اسنپ‌شات امنیتی در `kairos_pre_restore_snapshot_v2` پیش از هر بازیابی؛ توقف کامل بازیابی و حفظ داده‌های قبلی در صورت شکست ساخت اسنپ‌شات یا نامعتبر بودن فایل.
     - بازیابی اتمیک در دو حالت `replace` و `merge` و بازگردانی یک‌کلیکی با `rollbackLastRestore()`.

2. **`src/infrastructure/bridge/bridgeAdapters.test.ts` (۴ آزمون قرارداد آداپتورهای اندروید و ویندوز)**
   - رفتار Fail-Closed (`BRIDGE_UNAVAILABLE`) در `AndroidBridgePlatformAdapter` و `WindowsDesktopPlatformAdapter` در صورت عدم تزریق شیء پل بومی (جلوگیری از شکست خاموش).
   - اجرای کامل `bridge.handshake`, `tasks.upsert`, `backup.hasPreRestoreSnapshot` و مسدود کردن فایل پشتیبان نامعتبر پیش از ارسال به پل بومی در `backup.restore`.
   - رد کردن پاسخ‌های دارای عدم تطابق نسخه (`VERSION_MISMATCH`) و خطاهای ذخیره‌سازی میزبان (`STORAGE_ERROR`).

3. **`src/utils/pomodoroEngine.test.ts` (۴ آزمون — شامل `FIX-09`)**
   - محاسبهٔ زمان باقی‌مانده بر اساس `startedAtEpochMs` و `targetEndEpochMs` (`BUG-15`).
   - ثبت دقیقه‌های واقعی سپری‌شده هنگام توقف دستی (`BUG-17`) و چرخهٔ ۴تایی استراحت بلند (`BUG-19`).
   - ارزیاب سراسری `evaluateTimerTick` برای تشخیص پایان جلسهٔ کاری و گذار به فاز استراحت در هر تب از برنامه (`FIX-09`).

4. **`src/utils/analyticsCalculator.test.ts` (۲ آزمون — `FIX-09`)**
   - محاسبهٔ تاریخ واقعی تکمیل کار با `getTaskEffectiveCompletionDateKey` بر اساس `completedAt` (و بازگشت به `targetDate` فقط برای رکوردهای قدیمی فاقد `completedAt`).
   - محاسبهٔ خلاصهٔ تحلیلی هفتگی (`computeWeeklyAnalyticsSummary`) با احتساب کارهای عقب‌افتادهٔ تکمیل‌شده در امروز و رعایت `startDate` عادت‌ها.

5. **`src/utils/backupCrypto.test.ts` (۴ آزمون جامع مرحلهٔ ۲ — `FIX-08`)**
   - ایجاد و اعتبارسنجی قالب رسمی `BackupEnvelopeV2` و حفظ آرایه‌های خالی (`[]`).
   - رمزنگاری استاندارد پشتیبان با `PBKDF2-SHA256` (۱۰۰٬۰۰۰ تکرار) و `AES-256-GCM`، رد کردن گذرواژهٔ اشتباه و رد کردن `ciphertext` دستکاری‌شده.
   - رد کردن JSON خراب، `schemaVersion` آینده (`99`)، `checksum` دستکاری‌شده، آیتم‌های `null`، `duration` منفی، تاریخ‌های تقویمی نامعتبر (`2026-02-30`) و شناسه‌های تکراری.
   - مهاجرت کنترل‌شدهٔ فایل‌های قدیمی نسخهٔ ۱ به `BackupEnvelopeV2` همراه با اعتبارسنجی تک‌تک آیتم‌ها.

6. **`src/utils/nlpTaskParser.test.ts` (۷ آزمون)**
   - آزمون تشخیص تاریخ نسبی، ساعت یادآور (`BUG-22`), مدت‌زمان اعشاری (`BUG-24`), پرچم‌های تشخیص توکن برای پیش‌نمایش زنده (`FIX-09`) و حفظ کلمات مرکب (`BUG-21`, `BUG-23`).

7. **`src/utils/persianDate.test.ts` و `src/utils/habitStreaks.test.ts` (۱۴ آزمون — شامل `FIX-09`)**
   - آزمون الگوریتم سال کبیسهٔ جلالی و ناوبری سالانه (`BUG-11`, `BUG-12`, `BUG-14`).
   - محاسبهٔ زنجیرهٔ عادت‌ها بر اساس `weeklyGoal` (`BUG-27`)، رعایت روزهای انتخابی هفته (`targetDaysOfWeek`) و عدم جریمهٔ روزهای پیش از `startDate` در `calculateHabitWindowRate` (`FIX-09`).

8. **`src/utils/githubSync.test.ts` (۲ آزمون)**
   - آزمون رمزگشایی UTF-8 Base64 و مدیریت تعارض SHA.

9. **`src/utils/useModalFocusTrap.test.ts` (۴ آزمون — `FIX-11` / `BUG-37`)**
   - آزمون چرخش فوکوس رو به جلو با `Tab` (از آخرین المان به اولین المان) و چرخش رو به عقب با `Shift+Tab` (از اولین المان به آخرین المان) در `computeNextFocusIndex`.

10. **`src/utils/hostCapabilities.test.ts` و `src/utils/releaseReadiness.test.ts` (۸ آزمون — `FIX-12`)**
    - تشخیص صحیح محیط‌های `web_browser`, `android_webview_static` (بستهٔ استاتیک در Sketchware بدون پیش‌فرض قرار دادن SQLite/Bridge و استفاده از `IndexedDB`), `android_webview_bridged` و `windows_desktop_bridged`.
    - صدور هشدار صریح در صورت غیرفعال بودن `IndexedDB` (`setDomStorageEnabled(true)`) یا عدم دسترسی به `WebCrypto`.
    - بررسی خودکار سورس `index.html` و `src/main.tsx` برای اطمینان از صفر بودن وابستگی‌های شبکه/CDN خارجی و استفاده از فونت محلی `@fontsource-variable/vazirmatn` و مسیرهای نسبی (`./...`).
    - اجرای خودآزمایی زندهٔ ۶ زیرسیستم حیاتی (`runSelfDiagnostics`).

---

## ۲. آزمون‌های مرورگر واقعی (`playwright-cli`)
- بارگذاری بدون خطای کنسول یا خطای شبکه در `http://localhost:3000` (`Errors: 0, Warnings: 0`).
- بررسی وضعیت هیدراته شدن مخزن (`data-storage-status="ready"`).
- **آزمون پایداری یکپارچهٔ مرحلهٔ ۱ (`FIX-01`, `FIX-02`):**
  - ایجاد یادداشت جدید در `#/notes` و ایدهٔ جدید در `#/ideas`.
  - رفرش کامل صفحه (`playwright-cli reload`) و تأیید حضور هر دو رکورد در UI پس از بارگذاری مجدد از `IndexedDB` (`ideaVisibleAfterReload: true`, `noteVisibleAfterReload: true`).
  - تأیید عدم استفاده از `localStorage` برای داده‌های اصلی محصول (`legacyLocalStorageIdeas: null`, `legacyLocalStorageNotes: null`).
- **آزمون پشتیبان‌گیری، اعتبارسنجی، بازیابی و Rollback مرحلهٔ ۲ (`FIX-08`):**
  - بارگذاری فایل پشتیبان نامعتبر با `duration: -20` در `#/settings` و تأیید نمایش خطای دقیق در `[role="alert"]` (`مدت‌زمان (duration) مأموریت (t_bad) در tasks[0] باید عددی مثبت و بزرگ‌تر از صفر باشد.`).
  - بارگذاری فایل پشتیبان معتبر، مشاهدهٔ کارت پیش‌نمایش (نسخهٔ اسکیما، تاریخ خروجی، تعداد رکوردها و انتخاب استراتژی `Replace`/`Merge`)، اجرای بازیابی، رفرش مرورگر و تأیید ماندگاری داده‌ها در `IndexedDB` و کارکرد دکمهٔ «بازگردانی به وضعیت پیش از بازیابی».
- **آزمون موتور سراسری تایمر، پیش‌نمایش NLP و گزارش‌های مرحلهٔ ۳ (`FIX-09`):**
  - تایپ جملهٔ طبیعی در نوار ثبت سریع داشبورد و تأیید رندر زندهٔ چیپ‌های استخراج‌شده (`[data-testid="dashboard-nlp-preview"]`).
  - اتمام تایمر پومودورو در حالی که کاربر در تب داشبورد حضور دارد (و نه تب پومودورو)، تأیید نمایش اعلان ثبت جلسه، گذار خودکار مینی‌تایمر به فاز استراحت کوتاه (`۰۵:۰۰`) و ثبت ۲۵ دقیقه تمرکز در صفحهٔ گزارش‌ها (`#/insights`).
- **آزمون سیستم طراحی، توکن‌های معنایی و ناوبری واکنش‌گرای مرحلهٔ ۴ (`FIX-10`):**
  - بررسی مقادیر واقعی متغیرهای CSS در حالت تیره (`--bg-app: #0b0f17`, `--bg-surface-1: #111827`) و روشن (`--bg-app: #f8fafc`, `--bg-surface-1: #ffffff`) از طریق `getComputedStyle`.
  - بررسی نمایش سایدبار عمودی RTL (`[data-testid="desktop-sidebar-nav"]`) در رزولوشن دسکتاپ (`1440x900`) و جایگزینی خودکار آن با نوار پایین ۵تایی موبایل (`[data-testid="mobile-bottom-nav"]`) در رزولوشن موبایل (`390x844`) به همراه بسته شدن شیت «بیشتر» با کلید `Escape`.
- **آزمون تلهٔ فوکوس کیبورد (Focus Trap) و وضعیت‌های خالی عمل‌گرای مرحلهٔ ۵ (`FIX-11`):**
  - باز کردن `TaskModal` و `HabitModal` با دکمهٔ هدر، تأیید انتقال خودکار فوکوس به `#task-modal-title-input` و `#habit-modal-title-input`، ارسال ۱۵ رویداد متوالی `Tab` و ۵ رویداد `Shift+Tab` و تأیید محصور ماندن کامل فوکوس در داخل `[role="dialog"]` (`allTabsStayedInside: true`)، بستن مودال با `Escape` و تأیید بازگشت فوکوس به دکمهٔ فراخواننده (`focusRestoredToTrigger: true`).
  - بررسی رندر وضعیت‌های خالی عمل‌گرا (Actionable Empty States) در صفحات میز کار (`workspace-empty-state`)، عادت‌ها (`habits-empty-state`)، پومودورو (`pomodoro-empty-state`)، ایده‌ها (`ideas-empty-state`) و یادداشت‌ها (`notes-empty-state`).
- **آزمون بسته‌بندی ۱۰۰٪ آفلاین، فونت محلی و تشخیص قابلیت‌های میزبان مرحلهٔ ۶ (`FIX-12`):**
  - بررسی خروجی بیلد تولیدی (`dist/assets/vazirmatn-*.woff2` و `dist/index.html` با مسیرهای نسبی `./assets/...`).
  - باز کردن `#/settings` در مرورگر واقعی، تأیید نمایش کارت `[data-testid="host-capabilities-card"]`، تأیید بسته بودن پیش‌فرض بخش قدیمی GitHub (`githubCollapsedByDefault: true`)، تأیید صفر بودن درخواست‌های شبکه به Google Fonts (`externalFontRequestsCount: 0`) و بارگذاری فونت محلی وزیرمتن (`localFontLoaded: true`).
- **آزمون نهایی خودآزمایی زیرسیستم‌ها و ممیزی سرتاسری ۱۰ مسیر در مرحلهٔ ۷ (`releaseReadiness.test.ts` + Playwright E2E):**
  - اجرای ۵۷ آزمون واحد و قرارداد داده (`57 pass, 0 fail`).
  - اجرای بیلد نهایی `npm run build` بدون هیچ‌گونه اخطار (`0 warnings, 0 errors`).
  - پیمایش خودکار تمام مسیرهای برنامه (`#/today`, `#/tasks`, `#/habits`, `#/pomodoro`, `#/ideas`, `#/notes`, `#/insights`, `#/calendar`, `#/planner`, `#/settings`) در مرورگر Chromium واقعی و اجرای زندهٔ دکمهٔ `[data-testid="run-self-diagnostic-btn"]` با نتیجهٔ `هر ۶ زیرسیستم حیاتی با موفقیت تأیید شدند` (`checkCount: 6, Errors: 0`).

