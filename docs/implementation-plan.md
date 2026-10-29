# برنامهٔ اجرایی فازبندی‌شدهٔ کایروس (Implementation Plan)

این سند نقشهٔ راه اجرایی بازطراحی مهندسی «کایروس | دستیار هوشمند تمرکز» را بر اساس پرامپت جامع مهندسی تعریف می‌کند.

---

## فاز ۰: کشف، ثبت وضعیت پایه و رفع باگ‌های مسدودکنندهٔ فوری (انجام شد ✅)
- بررسی کامل درخت فایل‌ها، کلیدهای `localStorage` و کامپوننت‌های فعلی.
- ایجاد مجموعه مستندات مهندسی در `/docs`:
  - `/docs/architecture.md`
  - `/docs/implementation-plan.md`
  - `/docs/audit-status.md`
  - `/docs/platform-contract.md`
  - `/docs/acceptance-tests.md`
  - `/docs/ANDROID_HANDOFF.md`
  - `/docs/WINDOWS_HANDOFF.md`
- غیرفعال‌سازی همگام‌سازی خودکار پس‌زمینه با GitHub (`BUG-01..05`) در راستای سیاست ۱۰۰٪ آفلاین-محور.
- رفع باگ سوییچ تم روشن/تیره در Tailwind v4 (`BUG-10`) و حفظ فونت Monospace و جهت LTR برای بلوک‌های کد (`BUG-36`).
- رفع محدودیت زوم در متاتگ viewport و یکپارچه‌سازی عنوان برنامه در `index.html` (`BUG-35`).
- رفع باگ‌های پردازش زبان طبیعی فارسی برای «ساعت ۱ ظهر» (`BUG-22`)، ساعات اعشاری مانند «۱.۵ ساعت» (`BUG-24`) و ارقام فارسی در ویزارد آیوی لی (`BUG-25`).

---

## فاز ۱: جداسازی معماری، قرارداد پلتفرم و مهاجرت امن به IndexedDB (انجام شد ✅)
- پیاده‌سازی لایهٔ `domain` (`src/domain/models.ts`) با شناسه‌های یکتا (`crypto.randomUUID`)، فیلدهای ممیزی (`createdAt`, `updatedAt`, `deletedAt`, `revision`) و پشتیبانی از Soft Delete.
- پیاده‌سازی لایهٔ `application` (`src/application/repositories.ts`) شامل قراردادهای `TaskRepository`, `HabitRepository`, `NoteRepository`, `FocusRepository`, `SettingsRepository`, `BackupService`, `NotificationService`, `AppLifecycleService`.
- پیاده‌سازی پروتکل پل ارتباطی نسخه‌دار (`1.0.0`) در `src/infrastructure/bridge/protocol.ts` همراه با اعتبارسنجی Origin، محدودیت حجم (۵ مگابایت)، لیست سفید عملیات و کدهای خطای استاندارد.
- پیاده‌سازی آداپتور وب مبتنی بر `Dexie` (`src/infrastructure/web/dexieAdapter.ts`) و تابع مهاجرت تراکنشی و غیرمخرب `migrateLegacyLocalStorageToIndexedDB`.
- پیاده‌سازی آداپتورهای بومی اندروید (`src/infrastructure/android/androidBridgeAdapter.ts`) و دسکتاپ ویندوز (`src/infrastructure/desktop/desktopBridgeAdapter.ts`).
- اتصال مسیر End-to-End ایجاد، خواندن، ویرایش و حذف نرم وظایف/عادت‌ها/یادداشت‌ها در `src/App.tsx` از طریق `PlatformProvider`.
- نگارش و اجرای آزمون‌های قرارداد و مهاجرت (`src/infrastructure/web/dexieAdapter.test.ts` و `src/utils/nlpTaskParser.test.ts`).

---

## فاز ۲: تکمیل منطق دامنه، تایمر مبتنی بر Timestamp و موتور تاریخ شمسی/میلادی (انجام شد ✅)
- بازنویسی تایمر تمرکز بر اساس `startedAtEpochMs` و `targetEndEpochMs` (`BUG-15..20`) تا در صورت رفتن تب یا WebView به پس‌زمینه دچار خطای محاسبهٔ زمان نشود.
- افزودن ناوبری سالانه در تقویم شمسی و پشتیبانی از سال کبیسه (`BUG-11`, `BUG-12`, `BUG-14`).
- تکمیل محاسبهٔ زنجیرهٔ عادت‌ها بر اساس `weeklyGoal` (`BUG-27..29`) و اصلاح درصد پیشرفت داشبورد و میز کار (`BUG-06`, `BUG-07`, `BUG-30`).

---

## فاز ۳: دسترس‌پذیری (A11y)، تجربهٔ کاربری RTL و بهینه‌سازی عملکرد (انجام شد ✅)
- افزودن `role="dialog"`, `aria-modal="true"`, `aria-labelledby` و بسته شدن با کلید `Escape` و کلیک روی پس‌زمینه به تمام مودال‌ها (`BUG-37`).
- جایگزینی رنگ‌های هاردکدشده در نمودارهای بخش آمار و عملکرد (`AnalyticsView.tsx`) با رنگ‌های سازگار با تم روشن و تیره (`BUG-09`).
- افزودن دکمهٔ «واگرد (Undo)» به اعلان Toast پس از حذف وظایف، عادت‌ها، ایده‌ها و اطلاعات کاربردی (`BUG-44`).
- تکمیل اعتبارسنجی فرم‌ها (`BUG-33`)، بهبود پردازش زبان طبیعی فارسی (`BUG-21`, `BUG-23`)، بهینه‌سازی تشخیص قصد مربی هوشمند محلی (`BUG-26`)، حفظ شمارشگر اولویت در ویزارد آیوی لی (`BUG-13`)، صفحه‌بندی لیست‌های بزرگ (`BUG-43`)، پاک‌سازی تایمرهای Toast (`BUG-41`)، یادآور جبرانی کارهای امروز (`BUG-40`)، مدیریت چرخهٔ حیات AudioContext (`BUG-39`) و میانبرهای سراسری صفحه‌کلید (`BUG-45`).

