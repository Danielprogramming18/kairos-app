# معماری کایروس (Kairos Clean Offline-First Architecture)

## ۱. نمای کلی و اصول بنیادین
«کایروس | دستیار هوشمند تمرکز» بر پایهٔ معماری تمیز (Clean Architecture / Ports & Adapters) و سیاست **۱۰۰٪ آفلاین-محور (Offline-First)** طراحی شده است:

1. **مربع حقیقت محلی (Local Source of Truth):** تمام داده‌های کاربر به صورت پیش‌فرض و بدون نیاز به اینترنت روی دستگاه ذخیره می‌شوند:
   - **وب / PWA:** پایگاه دادهٔ تراکنشی `IndexedDB` با موتور `Dexie` (`KairosWebDatabase`) همراه با مهاجرت امن و غیرمخرب از کلیدهای قدیمی `localStorage` (`nazmyar_*`).
   - **اندروید (Sketchware WebView):** پایگاه دادهٔ بومی `SQLite` از طریق پل ارتباطی نسخه‌دار `window.KairosAndroidBridge`.
   - **دسکتاپ ویندوز (Tauri v2 / WebView2 Host):** پایگاه دادهٔ بومی `SQLite` از طریق پل ارتباطی نسخه‌دار `window.__KAIROS_DESKTOP_BRIDGE__`.
2. **عدم وابستگی رابط کاربری به زیرساخت ذخیره‌سازی:** کامپوننت‌های React تنها از طریق `PlatformProvider` و قراردادهای `src/application/repositories.ts` با داده‌ها تعامل دارند.
3. **جلوگیری از شکست خاموش (Zero Silent Fallback):** اگر پلتفرم روی حالت بومی (`android_webview` یا `windows_desktop`) اجرا شود ولی پل بومی در دسترس نباشد یا نسخهٔ آن ناسازگار باشد، برنامه خطای صریح و قابل تشخیص نمایش می‌دهد و هرگز بی‌صدا به حافظهٔ موقت سوییچ نمی‌کند.

---

## ۲. ساختار لایه‌ها

```text
src/
  domain/
    models.ts              # موجودیت‌های استاندارد دامنه (TaskEntity, HabitEntity, HabitEntryEntity, NoteEntity, FocusSessionEntity, UserSettingsEntity)
  application/
    repositories.ts        # قراردادهای Repository و سرویس‌های پلتفرم (PlatformContainer)
  infrastructure/
    bridge/
      protocol.ts          # پروتکل پیام‌رسانی JSON نسخه‌دار (1.0.0) با اعتبارسنجی امنیتی، سایز و Origin
    web/
      dexieAdapter.ts      # پیاده‌سازی IndexedDB با Dexie + مهاجرت تراکنشی و غیرمخرب از localStorage
      dexieAdapter.test.ts # آزمون‌های قرارداد و مهاجرت با fake-indexeddb
    android/
      androidBridgeAdapter.ts # آداپتور پل بومی Sketchware WebView
    desktop/
      desktopBridgeAdapter.ts # آداپتور پل بومی دسکتاپ ویندوز
  app/
    PlatformContext.tsx    # تزریق وابستگی در زمان راه‌اندازی (Startup DI) و نگاشت مدل‌ها
```

---

## ۳. مدل داده و کلیدهای ذخیره‌سازی

### کلیدهای میراث (`localStorage`) که بدون حذف حفظ و مهاجرت داده می‌شوند:
- `nazmyar_habits_v1`
- `nazmyar_danial_tasks_v1`
- `nazmyar_danial_ideas_v1`
- `nazmyar_focus_sessions_v1`
- `nazmyar_useful_info_v1`
- `nazmyar_theme`
- `nazmyar_sound`
- `kairos_migration_recovery_v1` (اسنپ‌شات خام بازیابی قبل از مهاجرت به IndexedDB)

### جداول پایگاه داده (`KairosWebDatabase` در IndexedDB و معادل SQLite در اندروید/ویندوز):
- `tasks`: کلید اصلی `id`، ایندکس‌ها روی `targetDate, completed, status, priority, category, updatedAt, deletedAt`
- `habits`: کلید اصلی `id`، ایندکس‌ها روی `category, archived, updatedAt, deletedAt`
- `habitEntries`: کلید اصلی `id` (`he_${habitId}_${dateKey}`)، ایندکس ترکیبی `[habitId+dateKey]`
- `notes`: کلید اصلی `id`، یکپارچه‌ساز `idea` و `useful_info` با ایندکس روی `kind, category, pinned, updatedAt, deletedAt`
- `focusSessions`: کلید اصلی `id`، ایندکس روی `dateKey, taskId, startedAt, updatedAt, deletedAt`
- `settings`: کلید اصلی `id` (`default`)
- `kvState`: کلید اصلی `key` (نگهدارندهٔ `active_timer_state` و `kairos_indexeddb_migrated_v2`)
