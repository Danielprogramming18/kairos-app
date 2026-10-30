# راهنمای تحویل و بسته‌بندی اندروید (Sketchware WebView Handoff)

این سند راهنمای گام‌به‌گام استفاده از خروجی وب «کایروس» در داخل `WebView` اندروید (Sketchware / Android Studio) است.

> **نکتهٔ مهم معماری (`FIX-12`):** کایروس به‌گونه‌ای طراحی شده است که **وجود SQLite، پل بومی (`Bridge`)، مدیریت فایل بومی یا اعلان بومی را از پیش فرض نمی‌گیرد**. در حالت پیش‌فرض (فقط بسته‌بندی فایل‌های استاتیک HTML/CSS/JavaScript/تصاویر/فونت‌های محلی `.woff2`)، برنامه به‌صورت خودکار از موتور تراکنشی `IndexedDB` داخل `WebView` استفاده می‌کند و ۱۰۰٪ آفلاین کار می‌کند.

---

## ۱. حالت الف (پشتیبانی‌شده در نسخهٔ فعلی Sketchware): بسته‌بندی استاتیک بدون نیاز به Bridge یا SQLite
1. دستور زیر را اجرا کنید تا بستهٔ استاتیک با مسیرهای نسبی (`base: './'`) و فونت‌های محلی `Vazirmatn` (`.woff2`) ساخته شود:
   ```bash
   npm run build
   ```
2. تمام محتویات پوشهٔ `dist/` (شامل `index.html` و پوشهٔ `assets/` حاوی فایل‌های JS، CSS و فونت‌های محلی `.woff2`) را در مسیر `assets/kairos/` پروژهٔ Sketchware قرار دهید.
3. در `WebView` اندروید، تنظیمات استاندارد زیر را فعال کنید:
   ```java
   WebSettings settings = webView.getSettings();
   settings.setJavaScriptEnabled(true);
   settings.setDomStorageEnabled(true);
   settings.setDatabaseEnabled(true);
   settings.setAllowFileAccess(true);
   webView.loadUrl("file:///android_asset/kairos/index.html");
   ```
4. در این حالت، کارت «وضعیت محیط اجرا و قابلیت‌های میزبان» در بخش تنظیمات کایروس، محیط را به‌عنوان `وب‌ویو استاتیک اندروید / فایل محلی (بدون وابستگی به پل بومی)` و موتور ذخیره‌سازی را `پایگاه‌دادهٔ تراکنشی IndexedDB روی دستگاه (Dexie)` شناسایی و نمایش می‌دهد.

---

## ۲. حالت ب (اختیاری برای توسعهٔ آتی): تزریق پل بومی (`KairosAndroidBridge` + `SQLite`)
اگر در نسخه‌های آینده تصمیم به اتصال دیتابیس بومی `SQLite` گرفته شود، اپلیکیشن وب در هنگام راه‌اندازی (`detectRuntimePlatform` در `src/app/PlatformContext.tsx`) وجود شیء `window.KairosAndroidBridge` را بررسی می‌کند:

```java
public class KairosBridge {
    private final Context context;

    public KairosBridge(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public String postMessage(String rawRequestJson) {
        // 1. Parse BridgeRequestEnvelope (requestId, version="1.0.0", operation, payload)
        // 2. Execute corresponding SQLite DAO method inside a transaction
        // 3. Return serialized BridgeResponseEnvelope JSON:
        //    {"requestId":"...","version":"1.0.0","ok":true,"data":...}
    }
}

webView.addJavascriptInterface(new KairosBridge(this), "KairosAndroidBridge");
webView.loadUrl("file:///android_asset/kairos/index.html");
```

---

## ۳. پاسخ‌دهی غیرهمگام (Async Callback در حالت پل بومی)
اگر عملیات در ترد پس‌زمینهٔ جاوا انجام می‌شود، می‌توانید پاسخ را به تابع سراسری زیر ارسال کنید:
```java
webView.post(() -> {
    webView.evaluateJavascript(
        "window.__onKairosNativeBridgeResponse(" + JSONObject.quote(responseJson) + ");",
        null
    );
});
```

---

## ۴. رفتار ایمن در صورت عدم تطابق نسخهٔ پل
اگر شیء `KairosAndroidBridge` تزریق شده باشد اما پاسخ ندهد یا نسخهٔ آن مغایر با `1.0.0` باشد، کایروس یک بنر هشدار صریح (`role="alert"`) نمایش می‌دهد و هرگز به صورت خاموش داده را دور نمی‌ریزد.
