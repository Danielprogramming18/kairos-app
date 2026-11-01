# راهنمای تحویل و بسته‌بندی اندروید (Sketchware WebView Handoff)

این سند راهنمای گام‌به‌گام استفاده از خروجی وب «کایروس» در داخل `WebView` اندروید (Sketchware / Android Studio) است.

> **نکتهٔ مهم معماری (`FIX-12`):** کایروس به‌گونه‌ای طراحی شده است که **وجود SQLite، پل بومی (`Bridge`)، مدیریت فایل بومی یا اعلان بومی را از پیش فرض نمی‌گیرد**. در حالت پیش‌فرض (فقط بسته‌بندی فایل‌های استاتیک HTML/CSS/JavaScript/تصاویر/فونت‌های محلی `.woff2`)، برنامه به‌صورت خودکار از موتور تراکنشی `IndexedDB` داخل `WebView` استفاده می‌کند و ۱۰۰٪ آفلاین کار می‌کند.

---

## ۱. حالت الف (پشتیبانی‌شده در نسخهٔ فعلی Sketchware): بسته‌بندی استاتیک بدون نیاز به Bridge یا SQLite
1. دستور زیر را اجرا کنید تا بستهٔ استاتیک با مسیرهای نسبی (`base: './'`) و فونت‌های محلی `Vazirmatn` (`.woff2`) ساخته شود:
   ```bash
   npm run build
   ```
2. تمام محتویات پوشهٔ `dist/` (شامل `index.html` و پوشهٔ `assets/` حاوی فایل‌های JS، CSS و فونت‌های محلی `.woff2`) را در مسیر `assets/kairos/` (یا `assets/www/`) پروژهٔ Sketchware قرار دهید.
3. در `WebView` اندروید، تنظیمات استاندارد زیر را فعال کنید:
   ```java
   WebSettings settings = webView.getSettings();
   settings.setJavaScriptEnabled(true);
   settings.setDomStorageEnabled(true);
   settings.setDatabaseEnabled(true);
   settings.setAllowFileAccess(true);
   ```

---

## ۲. انتقال و همگام‌سازی خودکار تم روشن/تاریک گوشی در Android WebView (مهم)

### چرا تنظیم میزبان اندروید اهمیت دارد؟
در مرورگرهای استاندارد وب، مدیاکوئری `prefers-color-scheme: dark` مستقیماً از سیستم‌عامل خوانده می‌شود. اما در `WebView` اندروید (به‌ویژه در پروژه‌های Sketchware که معمولاً از تم پایهٔ `Theme.AppCompat.Light` بدون `DayNight` استفاده می‌کنند یا تنظیمات `WebSettingsCompat` روی آن‌ها اعمال نشده است)، `window.matchMedia('(prefers-color-scheme: dark)')` داخل `WebView` ممکن است همیشه مقدار `false` (روشن) برگرداند یا هنگام تغییر حالت Dark Mode گوشی از نوار اعلان، رویداد تغییر را به صفحهٔ وب منتقل نکند.

برای تضمین ۱۰۰٪ هماهنگی خودکار تم کایروس با تم گوشی (از لحظهٔ بارگذاری اولیه و همچنین تغییر زنده هنگام باز بودن برنامه بدون `reload`):

### گام ۱: بارگذاری اولیه بدون پرش رنگی (Zero-Flash Startup)
هنگام فراخوانی `loadUrl` در `onCreate`، وضعیت فعلی تم گوشی (`UI_MODE_NIGHT_MASK`) را در پارامتر `hostTheme` پاس دهید تا اسکریپت همگام داخل `<head>` پیش از رندر شدن صفحه، تم درست را اعمال کند:
```java
boolean isNight = (getResources().getConfiguration().uiMode
    & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
    == android.content.res.Configuration.UI_MODE_NIGHT_YES;
String hostTheme = isNight ? "dark" : "light";

webView.loadUrl("file:///android_asset/kairos/index.html?hostTheme=" + hostTheme);
```

### گام ۲: تغییر زندهٔ تم هنگام باز بودن برنامه بدون Reload یا از دست رفتن وضعیت
1. در فایل `AndroidManifest.xml` برای `Activity` میزبان، مقدار `uiMode` را به `android:configChanges` اضافه کنید تا با تغییر تم گوشی، `Activity` و `WebView` دوباره ساخته نشوند (و متن فرم‌ها یا تایمر در حال اجرا از دست نرود):
   ```xml
   android:configChanges="orientation|screenSize|keyboardHidden|uiMode"
   ```
2. در متد `onConfigurationChanged` اکتیویتی (و همچنین در `onPageFinished` از `WebViewClient`)، متد آمادهٔ `KairosAndroidBridge.syncDeviceThemeToWebView(this, webView)` یا اسکریپت مستقیم زیر را صدا بزنید:
   ```java
   @Override
   public void onConfigurationChanged(android.content.res.Configuration newConfig) {
       super.onConfigurationChanged(newConfig);
       boolean isNight = (newConfig.uiMode
           & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
           == android.content.res.Configuration.UI_MODE_NIGHT_YES;
       String theme = isNight ? "dark" : "light";
       webView.evaluateJavascript(
           "if (window.__KAIROS_SET_HOST_THEME__) window.__KAIROS_SET_HOST_THEME__('" + theme + "');",
           null
       );
   }
   ```
- تابع سراسری `window.__KAIROS_SET_HOST_THEME__('dark' | 'light' | null)` از همان ابتدای بارگذاری `index.html` و در طول اجرای React در دسترس است و تم را بلافاصله بدون بارگذاری مجدد صفحه تغییر می‌دهد.

---

## ۳. حالت ب (اختیاری برای توسعهٔ آتی): تزریق پل بومی (`KairosAndroidBridge` + `SQLite`)
اگر در نسخه‌های آینده تصمیم به اتصال دیتابیس بومی `SQLite` گرفته شود، اپلیکیشن وب در هنگام راه‌اندازی (`detectRuntimePlatform` در `src/app/PlatformContext.tsx`) وجود شیء `window.KairosAndroidBridge` را بررسی می‌کند:

```java
KairosAndroidBridge.attachToWebView(getApplicationContext(), webView);
String hostTheme = KairosAndroidBridge.resolveAndroidDeviceTheme(this);
webView.loadUrl("file:///android_asset/kairos/index.html?hostTheme=" + hostTheme);
```

---

## ۴. فایل‌های آمادهٔ تحویل در مخزن (Ready-to-Use Handoff Files)
- **کد کامل جاوای اندروید (هر دو حالت A و B + همگام‌سازی تم گوشی):** فایل `/handoff/android/KairosAndroidBridge.java` شامل متدهای `configureWebViewForModeA(webView)`، `resolveAndroidDeviceTheme(context)` و `syncDeviceThemeToWebView(context, webView)` است.
- **ممیز خودکار بستهٔ آفلاین (`dist/`):** ماژول `/src/utils/offlineBundleVerifier.ts` و آزمون `/src/utils/offlineBundleVerifier.test.ts` به صورت خودکار بررسی می‌کنند که در `dist/index.html` هیچ مسیر مطلق `/assets/` یا لینک CDN خارجی وجود نداشته باشد و فونت‌های محلی `.woff2` باندل شده باشند.
