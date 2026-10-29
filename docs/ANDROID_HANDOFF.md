# راهنمای تحویل و اتصال بومی اندروید (Sketchware WebView Handoff)

این سند راهنمای گام‌به‌گام استفاده از خروجی وب «کایروس» در داخل `WebView` اندروید (Sketchware / Android Studio) و اتصال آن به دیتابیس بومی `SQLite` است.

---

## ۱. آماده‌سازی فایل‌های استاتیک برای `assets` اندروید
1. دستور زیر را اجرا کنید تا بستهٔ استاتیک با مسیرهای نسبی (`base: './'`) ساخته شود:
   ```bash
   npm run build
   ```
2. محتویات پوشهٔ `dist/` را در مسیر `app/src/main/assets/kairos/` پروژهٔ اندروید یا پوشهٔ Assets در Sketchware قرار دهید.
3. در `WebView` اندروید، تنظیمات زیر را فعال کنید:
   ```java
   WebSettings settings = webView.getSettings();
   settings.setJavaScriptEnabled(true);
   settings.setDomStorageEnabled(true);
   settings.setAllowFileAccess(true);
   ```

---

## ۲. تزریق پل بومی (`KairosAndroidBridge`)
اپلیکیشن وب در هنگام راه‌اندازی (`detectRuntimePlatform` در `src/app/PlatformContext.tsx`) وجود شیء `window.KairosAndroidBridge` را بررسی می‌کند.

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

## ۳. پاسخ‌دهی غیرهمگام (Async Callback)
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

## ۴. رفتار ایمن در صورت عدم اتصال پل
اگر برنامه در حالت بومی اندروید پیکربندی شده باشد اما `KairosAndroidBridge` پاسخ ندهد یا نسخهٔ آن مغایر با `1.0.0` باشد، کایروس یک بنر هشدار صریح (`role="alert"`) نمایش می‌دهد و هرگز به صورت خاموش داده را دور نمی‌ریزد.
