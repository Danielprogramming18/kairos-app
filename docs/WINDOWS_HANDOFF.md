# راهنمای فنی میزبان دسکتاپ ویندوز (`docs/WINDOWS_HANDOFF.md`)

> برای راهنمای گام‌به‌گام نصب، پیش‌نیازها، مسیرهای دقیق خروجی، مهاجرت داده و دریافت فایل نصبی از GitHub Actions، فایل اصلی **[`/WINDOWS_INSTALL_GUIDE.md`](../WINDOWS_INSTALL_GUIDE.md)** در ریشهٔ پروژه را مطالعه کنید.

---

## ۱. معماری میزبان بومی دسکتاپ ویندوز (`/src-tauri/`)
در نسخهٔ دسکتاپ ویندوز، کایروس یک برنامهٔ بومی **Tauri v2** است که در مسیر استاندارد `/src-tauri/` قرار دارد:
- **`/src-tauri/Cargo.toml`**: وابستگی‌های Rust شامل `tauri = "2.2.0"`، پلاگین جلوگیری از اجرای چندباره (`tauri-plugin-single-instance`) و موتور پایگاه‌دادهٔ محلی `rusqlite = { version = "0.32.1", features = ["bundled"] }`.
- **`/src-tauri/tauri.conf.json`**: پیکربندی پنجرهٔ دسکتاپ با عنوان فارسی `«کایروس»`، ابعاد پیش‌فرض `1280x840` (حداقل `960x640`)، بارگذاری آفلاین از `../dist`، سیاست امنیتی آفلاین (`CSP`) و تنظیمات نصاب‌های ویندوز (`nsis` با حالت `currentUser` و `msi`).
- **`/src-tauri/src/db.rs`**: پیاده‌سازی کامل پایگاه‌دادهٔ محلی `SQLite` در مسیر `%LOCALAPPDATA%\com.kairos.workspace\data\kairos_v2.sqlite` (از طریق `app.path().app_local_data_dir()`) با حالت `WAL`، جدول `schema_migrations`، تراکنش‌های اتمیک، بررسی همزمانی خوش‌بینانه (`expectedRevision` و خطای `CONFLICT_STALE_REVISION`) و پشتیبانی از تمام ۳۵ عملیات تعریف‌شده در `BridgeProtocol 1.0.0`.
- **`/src-tauri/src/lib.rs`**: ثبت قفل تک‌نمونه‌ای ویندوز (`single-instance` برای فوکوس روی پنجرهٔ موجود)، مقداردهی اولیهٔ پایگاه‌دادهٔ SQLite، تزریق خودکار پل `window.__KAIROS_DESKTOP_BRIDGE__` پیش از بارگذاری صفحه و هندلر فرمان `kairos_bridge_invoke`.

---

## ۲. وضعیت ساخت باینری در این محیط
از آنجا که محیط فعلی یک کانتینر لینوکس بدون کامپایلر Rust و بدون ابزارهای ویندوز است، **فایل نصب ویندوز در این محیط ساخته نشده است.**
برای تولید فایل‌های نصبی:
- **در GitHub Actions:** گردش‌کار `/.github/workflows/windows-installer.yml` را به‌صورت دستی (`workflow_dispatch`) اجرا کنید تا فایل `Kairos_2.1.0_x64-setup.exe` به همراه `SHA256SUMS.txt` ساخته و به عنوان Artifact آپلود شود.
- **روی سیستم ویندوز ۱۰/۱۱ محلی:** دستور `npm run desktop:build` را اجرا کنید.
