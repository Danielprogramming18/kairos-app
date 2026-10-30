# قرارداد پل ارتباطی پلتفرم (Platform Bridge Contract v1.0.0)

این سند قرارداد رسمی و نسخه‌دار بین هستهٔ وب کایروس (`React + TypeScript`) و میزبان‌های بومی **اندروید (Sketchware WebView)** و **دسکتاپ ویندوز (Tauri v2 / WebView2 Host)** را تعریف می‌کند.

---

## ۱. مشخصات کلی پروتکل
- **نسخهٔ قرارداد (`BRIDGE_CONTRACT_VERSION`):** `"1.0.0"`
- **حداکثر حجم مجاز پیام (`MAX_BRIDGE_PAYLOAD_BYTES`):** `5,242,880` بایت (۵ مگابایت)
- **مهلت زمانی پیش‌فرض (`DEFAULT_BRIDGE_TIMEOUT_MS`):** `8000` میلی‌ثانیه
- **قواعد امنیتی:**
  - هیچ رشتهٔ جاوااسکریپت خام یا `eval` از پل عبور نمی‌کند.
  - هیچ دستور SQL خام از سمت رابط کاربری ارسال نمی‌شود؛ فقط نام عملیات‌های مجاز (`BridgeOperation`) در لیست سفید پذیرفته می‌شود.

---

## ۲. ساختار پاکت درخواست (Request Envelope)

```json
{
  "requestId": "req_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "version": "1.0.0",
  "operation": "tasks.upsert",
  "payload": {
    "task": {
      "id": "t_101",
      "title": "تمرین معماری تمیز",
      "status": "todo",
      "completed": false,
      "priority": 1,
      "duration": 45,
      "targetDate": "2026-03-29",
      "category": "work",
      "tags": [],
      "subtasks": [],
      "createdAt": "2026-03-29T08:00:00.000Z",
      "updatedAt": "2026-03-29T08:00:00.000Z",
      "deletedAt": null,
      "revision": 1
    }
  },
  "sentAt": "2026-03-29T08:00:00.000Z"
}
```

---

## ۳. ساختار پاکت پاسخ (Response Envelope)

### پاسخ موفق:
```json
{
  "requestId": "req_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "version": "1.0.0",
  "ok": true,
  "data": {
    "id": "t_101",
    "revision": 2
  }
}
```

### پاسخ خطا:
```json
{
  "requestId": "req_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "version": "1.0.0",
  "ok": false,
  "error": {
    "code": "STORAGE_ERROR",
    "message": "خطا در نوشتن رکورد داخل جدول tasks در SQLite."
  }
}
```

---

## ۴. کدهای خطای استاندارد (`BridgeErrorCode`)

| کد خطا | توضیح |
|---|---|
| `BRIDGE_UNAVAILABLE` | شیء پل بومی (`window.KairosAndroidBridge` یا `window.__KAIROS_DESKTOP_BRIDGE__`) تزریق نشده است. |
| `VERSION_MISMATCH` | نسخهٔ قرارداد کلاینت و میزبان بومی همخوانی ندارد. |
| `INVALID_ORIGIN` | پیام از مبدأ غیرمجاز ارسال شده است. |
| `PAYLOAD_TOO_LARGE` | اندازهٔ پیام بیش از ۵ مگابایت است. |
| `UNKNOWN_OPERATION` | نام عملیات خارج از لیست سفید `ALLOWED_BRIDGE_OPERATIONS` است. |
| `VALIDATION_ERROR` | ساختار JSON یا فیلدهای ورودی نامعتبر هستند. |
| `TIMEOUT` | میزبان بومی در مهلت مقرر پاسخ نداده است. |
| `STORAGE_ERROR` | خطای سطح SQLite یا فایل‌سیستم در میزبان بومی رخ داده است. |

---

## ۵. لیست عملیات‌های مجاز (`BridgeOperation`)
- `bridge.handshake`
- `tasks.list`, `tasks.getById`, `tasks.upsert`, `tasks.upsertBatch`, `tasks.softDelete`, `tasks.restore`, `tasks.hardDelete`
- `habits.list`, `habits.getById`, `habits.upsert`, `habits.toggleDate`, `habits.listEntries`, `habits.softDelete`, `habits.restore`, `habits.hardDelete`
- `notes.list`, `notes.upsert`, `notes.softDelete`, `notes.restore`, `notes.hardDelete`
- `focus.listSessions`, `focus.logSession`, `focus.getActiveTimer`, `focus.saveActiveTimer`
- `settings.get`, `settings.save`
- `backup.export`, `backup.restore`, `backup.hasPreRestoreSnapshot`, `backup.rollback`
- `notifications.getPermission`, `notifications.requestPermission`, `notifications.scheduleReminder`, `notifications.cancelReminder`
