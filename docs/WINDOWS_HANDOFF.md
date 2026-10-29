# راهنمای تحویل و ساخت نسخهٔ دسکتاپ ویندوز (Windows Desktop Handoff)

این سند نحوهٔ بسته‌بندی «کایروس» به عنوان نرم‌افزار بومی ویندوز (`.exe` / `.msi`) با استفاده از **Tauri v2** و `WebView2` را شرح می‌دهد.

---

## ۱. معماری ارتباطی دسکتاپ ویندوز
در محیط دسکتاپ ویندوز، هستهٔ رابط کاربری از طریق `WindowsDesktopPlatformAdapter` (`src/infrastructure/desktop/desktopBridgeAdapter.ts`) و شیء `window.__KAIROS_DESKTOP_BRIDGE__` با میزبان Rust/Tauri و دیتابیس بومی `SQLite` ارتباط برقرار می‌کند.

---

## ۲. پیش‌نیازهای سیستم بیلد ویندوز
از آنجا که محیط فعلی یک کانتینر لینوکس ابری است، کامپایل نهایی `.exe` باید روی سیستم ویندوز ۱۰ یا ۱۱ با ابزارهای زیر انجام شود:
1. **Node.js LTS** (نسخه ۲۰ یا بالاتر)
2. **Rust Toolchain** (`rustup` با هدف `x86_64-pc-windows-msvc`)
3. **Microsoft Visual Studio C++ Build Tools**
4. **Microsoft Edge WebView2 Runtime** (به‌طور پیش‌فرض روی ویندوز ۱۰/۱۱ نصب است)

---

## ۳. مراحل اتصال و ساخت فایل نصبی (`.exe`)
1. ساخت دارایی‌های فرانت‌اند:
   ```bash
   npm install
   npm run build
   ```
2. در اسکریپت مقداردهی اولیهٔ Tauri (`initialization_script`)، پل زیر را به `window.__KAIROS_DESKTOP_BRIDGE__` متصل کنید:
   ```javascript
   window.__KAIROS_DESKTOP_BRIDGE__ = {
     invoke: async (rawRequestJson) => {
       return await window.__TAURI_INTERNALS__.invoke('kairos_bridge_dispatch', {
         rawRequestJson,
       });
     },
   };
   ```
3. اجرای دستور بیلد دسکتاپ روی ویندوز:
   ```bash
   npx tauri build
   ```
   فایل اجرایی در مسیر `src-tauri/target/release/bundle/` تولید خواهد شد.
