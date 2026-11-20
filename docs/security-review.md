# بررسی امنیتی Kairos ۲.۲.۲

مبنای مقایسه کامیت `5951e10bad4fe6f891f5532587f92c67c1b7894b` است. نصاب آزمایشی همان شناسهٔ `com.kairos.workspace` و مسیر `%LOCALAPPDATA%\com.kairos.workspace\data\kairos_v2.sqlite` را دارد. کل پایگاه SQLite رمزگذاری نشده است. عبارت عبور فقط از فایل پشتیبان رمزدار محافظت می‌کند.

## پشتیبان

در ۲.۲.۱ هزینهٔ PBKDF2 از JSON ورودی به عدد تبدیل می‌شد. برای ۲.۲.۲ اندازهٔ فایل در انتخابگر و اندازهٔ UTF-8 رشته در API پیش از JSON.parse بررسی می‌شوند. حد فایل ۳۲ MiB است. شناسه‌ها، نسخه‌های دقیق ۲، تاریخ، PBKDF2/SHA-256، یک عدد صحیح در بازهٔ ۱۰۰٬۰۰۰ تا ۶۰۰٬۰۰۰، Base64 استاندارد، salt شانزده‌بایتی، IV دوازده‌بایتی و وجود محتوای فراتر از تگ شانزده‌بایتی GCM الزامی‌اند. در هر صفحه فقط یک رمزگشایی اجرا می‌شود و برنامه تا پایان واقعی فراخوانی محدود Web Crypto منتظر می‌ماند. صحت تگ GCM، محتوای داخلی و checksum قبل از تأیید جداگانهٔ بازگردانی بررسی می‌شوند. checksum پشتیبان ساده برای تشخیص خرابی است و اصالت فرستنده را اثبات نمی‌کند.

خروجی جدید با salt و IV تازه، AES-256-GCM و ۶۰۰٬۰۰۰ تکرار ساخته می‌شود. سیاست خروجی حداقل ۱۵ نویسه به همراه رد الگوهای رایج و تکراری است. این سیاست هنگام ورود فایل قدیمی اعمال نمی‌شود. در Chrome 157 روی این رایانهٔ ویندوزی سه اندازه‌گیری Web Crypto برای ۶۰۰٬۰۰۰ تکرار برابر ۳۹۵، ۴۱۰ و ۳۷۷ میلی‌ثانیه بود. زمان روی گوشی به سخت‌افزار و WebView آن بستگی دارد. [راهنمای هزینهٔ PBKDF2 از OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## وابستگی‌ها

ممیزی اولیه npm چهار بستهٔ High و چهار بستهٔ Moderate گزارش کرد. مسیرها در جدول از فایل قفل قبلی هستند. ممیزی فایل قفل اصلاح‌شده صفر هشدار npm گزارش کرد. Firebase و کلاینت Google GenAI در کد محصول فراخوانی نمی‌شدند و از نصب حذف شدند. زنجیرهٔ Workbox هنگام ساخت فهرست آفلاین استفاده می‌شود.

| مسیر و نسخهٔ قبلی | شرط و اثر | اقدام |
| --- | --- | --- |
| firebase 13.2.0 → @firebase/firestore-compat 0.4.17 → @firebase/firestore 4.19.1 → @grpc/grpc-js 1.9.16 | در پیکربندی معینی از سرور gRPC می‌شد اعتبار گواهی طرف مقابل را اشتباه تفسیر کرد. مسئلهٔ دیگر ارسال جزئیات خطای handler به کلاینت بود. این برنامه چنین سروری را راه نمی‌اندازد. | حذف زنجیرهٔ بدون مصرف. [بررسی گواهی](https://github.com/advisories/GHSA-m9gg-hp2v-232j) و [پیام خطا](https://github.com/advisories/GHSA-f596-whhp-79r4) |
| vite-plugin-pwa 2.0.0 → workbox-build 7.4.1 → glob 11.1.0 | لغو جست‌وجوی فایل در شرایط گزارش‌شده می‌توانست پیمایش را در زمان ساخت ادامه دهد. الگوهای Kairos از تنظیمات داخل مخزن می‌آیند. | glob 14.0.2 و ساخت دوبارهٔ Service Worker. [هشدار glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) |
| همان مسیر → minimatch 10.2.6 | پردازش الگوهای نامطمئن می‌توانست هزینهٔ محاسبه را زیاد کند. پشتیبان کاربر الگوی ساخت تولید نمی‌کند. | نسخهٔ قفل‌شدهٔ 11.0.9. [هشدار minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) |

ممیزی Rust با cargo-audit 0.23.0 و پایگاه RustSec در کامیت `074ea9a7ed619f511b5b7374c7a97e98d1e98be4` انجام شد. در نسخهٔ اولیه، rusqlite 0.32.1 به libsqlite3-sys 0.30.1 وصل بود. هشدار SQLite مربوط به بازشدن یک جفت فایل پایگاه و WAL دستکاری‌شده روی دستگاه است. بازیابی JSON برنامه چنین فایل‌هایی را نصب نمی‌کند. با ارتقای rusqlite به 0.41.1 و libsqlite3-sys به 0.39.0 شمار آسیب‌پذیری‌های دستهٔ vulnerabilities به صفر رسید. ۴۸۱ نسخه و checksum فایل قفل با نمایهٔ رسمی crates.io تطبیق داشت و هیچ‌کدام yanked نبود. [RustSec برای SQLite](https://rustsec.org/advisories/RUSTSEC-2026-0459.html)

شش هشدار اطلاعاتی در فایل قفل چندسکویی باقی مانده است. دستهٔ unsound دربارهٔ درستی کد واقعی است و نباید با هشدار نگهداری اشتباه شود.

| بسته و مسیر در گراف قفل | ماهیت و دامنه |
| --- | --- |
| chrono 0.4.45، Tauri → tauri-utils → serde_with | عدم نگهداری. مصرف مستقیم برنامه با time جایگزین شد. حضور در قفل به‌تنهایی استفاده در باینری را اثبات نمی‌کند. [RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0543.html) |
| proc-macro-error 1.0.4، Tauri → gtk → gtk3-macros | ابزار ساخت GTK، بدون نگهداری. مسیر GTK مربوط به لینوکس است. [RustSec](https://rustsec.org/advisories/RUSTSEC-2024-0370.html) |
| zbus_names 4.3.5، zvariant 5.15.1 و zvariant_derive 5.15.1، افزونهٔ single-instance → zbus | سه هشدار عدم نگهداری در زنجیرهٔ D-Bus لینوکس. قابلیت‌ها در نسل جدید zbus ادغام شده‌اند. [zbus_names](https://rustsec.org/advisories/RUSTSEC-2026-0371.html)، [zvariant](https://rustsec.org/advisories/RUSTSEC-2026-0370.html)، [derive](https://rustsec.org/advisories/RUSTSEC-2026-0372.html) |
| glib 0.18.5، Tauri → gtk → glib | پیاده‌سازی iterator رشتهٔ Variant از نظر ایمنی حافظه اشکال دارد. این مسیر GTK در نصاب Windows به‌کار نمی‌رود. پیش از پشتیبانی لینوکس باید نسل GTK/Tauri سازگار با glib اصلاح‌شده بررسی شود. [RustSec](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) |

## مرز محتوای وب

برنامهٔ اصلی داده‌های کاربر را با رندر متنی React نمایش می‌دهد. لینک‌های یادداشت به http، https و mailto محدودند. قالب HTML معرفی از دارایی‌های همراه برنامه ساخته می‌شود و متن اسلایدها escape می‌شود. اسکریپت آغاز تم به فایل محلی منتقل شده است. صفحهٔ اصلی و معرفی script-src بدون unsafe-inline دارند. سبک‌های پویای رابط همچنان به inline style نیاز دارند. Tauri فقط پنجرهٔ محلی را می‌پذیرد. مجوز shell جاوااسکریپت حذف شده است. لینک بیرونی با بررسی scheme به سیستم داده می‌شود. ساخت وب به حساب ابری یا توکن GitHub نیاز ندارد. کلید قدیمی تنظیمات GitHub در شروع بدون خواندن یا ثبت مقدار پاک می‌شود. راهنمای میزبان اندروید و آزمون ارتقای هر دو نوع ذخیره‌سازی در [راهنمای اندروید](ANDROID_HANDOFF.md) است.

## شواهد بستهٔ اولیه و بررسی هشدار دانلود

[اجرای اصلی ۲.۲.۱](https://github.com/Danielprogramming18/kairos-app/actions/runs/44545261562) شناسهٔ artifact برابر 14539894353 داشت. SHA-256 آرشیو دانلودشده با مقدار GitHub و سه فایل با SHA256SUMS داخل آن برابر بودند.

| فایل | SHA-256 |
| --- | --- |
| ZIP | `5442525ad929c288899fcc7bfeb14c5e15beeb43be70c8b28659d61cc9c2fa7d` |
| kairos-desktop.exe | `f9c908259f51ebd283f9f98149ea1f90155a1acf5f045cafd90744df6f5b5e55` |
| Kairos_2.2.1_x64-setup.exe | `99b54f17f79800297ffb8146c1b93a299833fbfa88f1ac305c93bba32109e006` |
| Kairos_2.2.1_x64_en-US.msi | `3f37fcf2081e8593b2b85299fe0235950a54a978691613f3f25d41739c630ba7` |

در ویندوز محلی هر سه فایل NotSigned بودند. MpCmdRun برای ZIP، EXE اصلی، Setup و MSI جداگانه پایان اسکن و «found no threats» با کد صفر گزارش کرد. WinDefend در حال اجرا بود. در زمان آزمون موتور 1.1.26100.4، امضای 1.463.367.0 و زمان ثبت تعریف‌ها 2026-11-19T07:33:13Z بودند. تازه‌سازی اجباری در این حساب با کد 0x80070005 رد شد. هیچ نام تشخیصی به دست نیامد که بتوان آن را به یک فایل نسبت داد.

**Chrome.** پیام گزارش‌شده همچنان پرونده‌ای باز است. داده‌های Defender و Authenticode دلیل داخلی تصمیم Google Safe Browsing را مشخص نمی‌کنند. پوشهٔ artifact ویندوز شامل فهرست هش‌ها، نسخهٔ ابزارها و وضعیت بررسی هر فایل است. نصب currentUser ممکن است روی ماشینی که WebView2 ندارد به bootstrapper رسمی Microsoft نیاز پیدا کند. رابط و داده‌های خود Kairos محلی‌اند. مشاهدهٔ چند اتصال در یک بازهٔ آزمون فقط همان بازه را پوشش می‌دهد.

**پیگیری توسط مالک.**

1. از صفحهٔ دانلود Chrome متن کامل دلیل، نسخهٔ مرورگر، زمان و نام فایل را نگه دارید. لینک پایدار اجرای GitHub، نام artifact و هش ZIP را اضافه کنید. لینک موقت دانلود که شامل توکن است نفرستید.
2. اگر نشانی دانلود اشتباه طبقه‌بندی شده، به Google نشانی پایدار و شواهد را بدهید. برای دامنه‌ای که در Search Console تحت مالکیت شماست، بخش Security Issues امکان درخواست بازبینی دارد. برای دامنهٔ github.com مالک مخزن معمولاً مالک دامنه نیست. در آن حالت مسیر گزارش URL و پشتیبانی GitHub قابل استفاده‌اند. [راهنمای Chrome](https://support.google.com/chrome/answer/6261569)، [گزارش اشتباه Safe Browsing](https://safebrowsing.google.com/safebrowsing/report_error/)، [بازبینی Search Console](https://support.google.com/webmasters/answer/9044101)
3. اگر Defender یا SmartScreen تشخیص مشخصی نشان داد، نام تشخیص، فایل دقیق، هش و تاریخ تعریف‌ها را ثبت کنید. گزینهٔ Software developer در درگاه Microsoft برای بازبینی است. ارسال نمونه تصمیم مالک است. [درگاه Microsoft](https://www.microsoft.com/en-us/wdsi/filesubmission)
4. برای امضای معتبر، مالک هویت ناشر را نزد CA معتبرِ code signing یا Microsoft Artifact Signing تأیید می‌کند. کلید در سخت‌افزار یا سرویس امضای مدیریت‌شده می‌ماند. فایل برنامه را پیش از بسته‌بندی، سپس Setup و MSI را با SHA-256 و timestamp مورداعتماد RFC 3161 امضا کنید. زنجیره، زمان امضا و هش نهایی هر فایل را دوباره بررسی کنید. امضا هویت ناشر را قابل بررسی می‌کند. تصمیم‌های اعتبارسنجی دانلود مستقل‌اند. [گزینه‌های امضای Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
