package com.kairos.app;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

/**
 * KairosAndroidBridge — Production Reference Implementation for Android Sketchware / Android Studio
 * Protocol Version: 1.0.0 (Strictly aligned with src/infrastructure/bridge/protocol.ts)
 *
 * نحوهٔ استفاده در Sketchware (حالت A — بدون نیاز به این کلاس، صرفاً WebView + IndexedDB):
 *   WebSettings ws = webview1.getSettings();
 *   ws.setJavaScriptEnabled(true);
 *   ws.setDomStorageEnabled(true);
 *   ws.setDatabaseEnabled(true);
 *   ws.setAllowFileAccess(true);
 *   ws.setAllowContentAccess(true);
 *   ws.setAllowFileAccessFromFileURLs(true);
 *   webview1.loadUrl("file:///android_asset/www/index.html");
 *
 * نحوهٔ استفاده در حالت B (اختیاری — فعال‌سازی پایگاه داده SQLite بومی اندروید):
 *   KairosAndroidBridge.attachToWebView(getApplicationContext(), webview1);
 *   webview1.loadUrl("file:///android_asset/www/index.html");
 */
public class KairosAndroidBridge extends SQLiteOpenHelper {

    private static final String DB_NAME = "kairos_native_v2.db";
    private static final int DB_VERSION = 2;
    public static final String CONTRACT_VERSION = "1.0.0";
    public static final int MAX_BRIDGE_PAYLOAD_BYTES = 5 * 1024 * 1024;

    private static final Set<String> ALLOWED_OPERATIONS = new HashSet<>(Arrays.asList(
        "bridge.handshake",
        "tasks.list",
        "tasks.getById",
        "tasks.upsert",
        "tasks.upsertBatch",
        "tasks.softDelete",
        "tasks.restore",
        "tasks.hardDelete",
        "habits.list",
        "habits.getById",
        "habits.upsert",
        "habits.toggleDate",
        "habits.listEntries",
        "habits.softDelete",
        "habits.restore",
        "habits.hardDelete",
        "notes.list",
        "notes.upsert",
        "notes.softDelete",
        "notes.restore",
        "notes.hardDelete",
        "focus.listSessions",
        "focus.logSession",
        "focus.getActiveTimer",
        "focus.saveActiveTimer",
        "settings.get",
        "settings.save",
        "backup.export",
        "backup.restore",
        "backup.hasPreRestoreSnapshot",
        "backup.rollback",
        "notifications.getPermission",
        "notifications.requestPermission",
        "notifications.scheduleReminder",
        "notifications.cancelReminder"
    ));

    public KairosAndroidBridge(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    /**
     * Securely configures WebSettings for local asset loading without enabling universal file access.
     */
    public static void configureWebViewForModeA(WebView webView) {
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
    }

    public static void attachToWebView(Context context, WebView webView) {
        configureWebViewForModeA(webView);
        webView.addJavascriptInterface(new KairosAndroidBridge(context), "KairosAndroidBridge");
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS kairos_records (" +
            "collection TEXT NOT NULL, " +
            "id TEXT NOT NULL, " +
            "deleted_at TEXT, " +
            "updated_at TEXT, " +
            "revision INTEGER NOT NULL DEFAULT 1, " +
            "json_payload TEXT NOT NULL, " +
            "PRIMARY KEY (collection, id)" +
            ");"
        );
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS idx_kairos_collection_deleted " +
            "ON kairos_records (collection, deleted_at);"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            try {
                db.execSQL("ALTER TABLE kairos_records ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;");
            } catch (Exception ignored) {
                // Column may already exist
            }
            db.execSQL(
                "CREATE INDEX IF NOT EXISTS idx_kairos_collection_deleted " +
                "ON kairos_records (collection, deleted_at);"
            );
        }
    }

    @JavascriptInterface
    public String postMessage(String rawRequestJson) {
        String requestId = "unknown";
        try {
            if (rawRequestJson == null || rawRequestJson.length() > MAX_BRIDGE_PAYLOAD_BYTES) {
                return buildErrorEnvelope(requestId, "PAYLOAD_TOO_LARGE", "Payload exceeds 5 MB limit");
            }

            JSONObject req = new JSONObject(rawRequestJson);
            requestId = req.optString("requestId", "unknown");
            String version = req.optString("version", "");

            if (!CONTRACT_VERSION.equals(version)) {
                return buildErrorEnvelope(
                    requestId,
                    "VERSION_MISMATCH",
                    "Bridge version mismatch: expected " + CONTRACT_VERSION + ", got " + version
                );
            }

            String operation = req.optString("operation", "");
            if (!ALLOWED_OPERATIONS.contains(operation)) {
                return buildErrorEnvelope(
                    requestId,
                    "UNKNOWN_OPERATION",
                    "Operation not in whitelist: " + operation
                );
            }

            JSONObject payload = req.optJSONObject("payload");
            if (payload == null) {
                payload = new JSONObject();
            }

            Object resultData = dispatchOperation(operation, payload);

            JSONObject res = new JSONObject();
            res.put("requestId", requestId);
            res.put("version", CONTRACT_VERSION);
            res.put("ok", true);
            res.put("data", resultData != null ? resultData : JSONObject.NULL);
            return res.toString();
        } catch (BridgeExecutionException bex) {
            return buildErrorEnvelope(requestId, bex.code, bex.getMessage());
        } catch (Exception ex) {
            String msg = ex.getMessage() != null ? ex.getMessage() : "Android SQLite execution error";
            return buildErrorEnvelope(requestId, "STORAGE_ERROR", msg);
        }
    }

    private String buildErrorEnvelope(String requestId, String code, String message) {
        try {
            JSONObject errRes = new JSONObject();
            errRes.put("requestId", requestId);
            errRes.put("version", CONTRACT_VERSION);
            errRes.put("ok", false);
            JSONObject errObj = new JSONObject();
            errObj.put("code", code);
            errObj.put("message", message);
            errRes.put("error", errObj);
            return errRes.toString();
        } catch (Exception fallbackEx) {
            return "{\"requestId\":\"" + requestId + "\",\"version\":\"1.0.0\",\"ok\":false,\"error\":{\"code\":\"STORAGE_ERROR\",\"message\":\"Bridge serialization failure\"}}";
        }
    }

    private static class BridgeExecutionException extends Exception {
        final String code;

        BridgeExecutionException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    private Object dispatchOperation(String op, JSONObject payload) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        switch (op) {
            case "bridge.handshake": {
                JSONObject info = new JSONObject();
                info.put("status", "ready");
                info.put("engine", "android_sqlite_bridge");
                info.put("version", CONTRACT_VERSION);
                return info;
            }

            // Tasks
            case "tasks.list": {
                boolean includeDeleted = payload.optBoolean("includeDeleted", false);
                return listCollection(db, "tasks", includeDeleted, null);
            }
            case "tasks.getById":
                return getRecord(db, "tasks", payload.getString("id"));
            case "tasks.upsert": {
                JSONObject task = payload.has("task") ? payload.getJSONObject("task") : payload;
                Integer expectedRev = payload.has("expectedRevision") && !payload.isNull("expectedRevision")
                    ? payload.getInt("expectedRevision")
                    : null;
                return upsertRecordWithConcurrency(db, "tasks", task, expectedRev);
            }
            case "tasks.upsertBatch": {
                JSONArray tasks = payload.optJSONArray("tasks");
                JSONArray saved = new JSONArray();
                if (tasks != null) {
                    db.beginTransaction();
                    try {
                        for (int i = 0; i < tasks.length(); i++) {
                            JSONObject t = tasks.getJSONObject(i);
                            saved.put(upsertRecordWithConcurrency(db, "tasks", t, null));
                        }
                        db.setTransactionSuccessful();
                    } finally {
                        db.endTransaction();
                    }
                }
                return saved;
            }
            case "tasks.softDelete":
                return setDeletedAt(db, "tasks", payload.getString("id"), isoNow());
            case "tasks.restore":
                return setDeletedAt(db, "tasks", payload.getString("id"), null);
            case "tasks.hardDelete":
                return hardDeleteRecord(db, "tasks", payload.getString("id"));

            // Habits
            case "habits.list": {
                boolean includeDeleted = payload.optBoolean("includeDeleted", false);
                return listCollection(db, "habits", includeDeleted, null);
            }
            case "habits.getById":
                return getRecord(db, "habits", payload.getString("id"));
            case "habits.upsert": {
                JSONObject habit = payload.has("habit") ? payload.getJSONObject("habit") : payload;
                Integer expectedRev = payload.has("expectedRevision") && !payload.isNull("expectedRevision")
                    ? payload.getInt("expectedRevision")
                    : null;
                return upsertRecordWithConcurrency(db, "habits", habit, expectedRev);
            }
            case "habits.toggleDate": {
                String habitId = payload.getString("habitId");
                String dateKey = payload.getString("dateKey");
                Object existingObj = getRecord(db, "habits", habitId);
                if (existingObj == JSONObject.NULL) return JSONObject.NULL;
                JSONObject habit = (JSONObject) existingObj;
                JSONObject completedDates = habit.optJSONObject("completedDates");
                if (completedDates == null) completedDates = new JSONObject();
                boolean nextState = !completedDates.optBoolean(dateKey, false);
                if (nextState) {
                    completedDates.put(dateKey, true);
                } else {
                    completedDates.remove(dateKey);
                }
                habit.put("completedDates", completedDates);
                return upsertRecordWithConcurrency(db, "habits", habit, null);
            }
            case "habits.listEntries":
                return listCollection(db, "habitEntries", false, null);
            case "habits.softDelete":
                return setDeletedAt(db, "habits", payload.getString("id"), isoNow());
            case "habits.restore":
                return setDeletedAt(db, "habits", payload.getString("id"), null);
            case "habits.hardDelete":
                return hardDeleteRecord(db, "habits", payload.getString("id"));

            // Notes (Ideas & Useful Info)
            case "notes.list": {
                boolean includeDeleted = payload.optBoolean("includeDeleted", false);
                String kind = payload.isNull("kind") ? null : payload.optString("kind", null);
                return listCollection(db, "notes", includeDeleted, kind);
            }
            case "notes.upsert": {
                JSONObject note = payload.has("note") ? payload.getJSONObject("note") : payload;
                Integer expectedRev = payload.has("expectedRevision") && !payload.isNull("expectedRevision")
                    ? payload.getInt("expectedRevision")
                    : null;
                return upsertRecordWithConcurrency(db, "notes", note, expectedRev);
            }
            case "notes.softDelete":
                return setDeletedAt(db, "notes", payload.getString("id"), isoNow());
            case "notes.restore":
                return setDeletedAt(db, "notes", payload.getString("id"), null);
            case "notes.hardDelete":
                return hardDeleteRecord(db, "notes", payload.getString("id"));

            // Focus & Active Timer
            case "focus.listSessions": {
                boolean includeDeleted = payload.optBoolean("includeDeleted", false);
                return listCollection(db, "focusSessions", includeDeleted, null);
            }
            case "focus.logSession": {
                JSONObject session = payload.has("session") ? payload.getJSONObject("session") : payload;
                String id = session.getString("id");
                Object existing = getRecord(db, "focusSessions", id);
                if (existing != JSONObject.NULL) {
                    return existing; // Idempotent session logging
                }
                return upsertRecordWithConcurrency(db, "focusSessions", session, null);
            }
            case "focus.getActiveTimer":
                return getRecord(db, "runtimeState", "active_timer");
            case "focus.saveActiveTimer": {
                if (payload.isNull("state")) {
                    hardDeleteRecord(db, "runtimeState", "active_timer");
                    return JSONObject.NULL;
                }
                JSONObject timerState = payload.getJSONObject("state");
                timerState.put("id", "active_timer");
                return upsertRecordWithConcurrency(db, "runtimeState", timerState, null);
            }

            // Settings
            case "settings.get": {
                Object existing = getRecord(db, "settings", "user_settings");
                if (existing != JSONObject.NULL) return existing;
                JSONObject defaults = new JSONObject();
                defaults.put("id", "user_settings");
                defaults.put("theme", "dark");
                defaults.put("soundEnabled", true);
                defaults.put("pomodoroWorkMinutes", 25);
                defaults.put("pomodoroShortBreakMinutes", 5);
                defaults.put("pomodoroLongBreakMinutes", 15);
                defaults.put("updatedAt", isoNow());
                return defaults;
            }
            case "settings.save": {
                JSONObject incoming = payload.has("settings") ? payload.getJSONObject("settings") : payload;
                Object existingObj = getRecord(db, "settings", "user_settings");
                JSONObject merged = existingObj != JSONObject.NULL ? (JSONObject) existingObj : new JSONObject();
                Iterator<String> keys = incoming.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    merged.put(k, incoming.get(k));
                }
                merged.put("id", "user_settings");
                return upsertRecordWithConcurrency(db, "settings", merged, null);
            }

            // Backup & Restore
            case "backup.export": {
                JSONObject env = new JSONObject();
                env.put("app", "kairos");
                env.put("schemaVersion", 2);
                env.put("exportedAt", isoNow());
                env.put("tasks", listCollection(db, "tasks", true, null));
                env.put("habits", listCollection(db, "habits", true, null));
                env.put("habitEntries", listCollection(db, "habitEntries", true, null));
                env.put("notes", listCollection(db, "notes", true, null));
                env.put("focusSessions", listCollection(db, "focusSessions", true, null));
                env.put("settings", dispatchOperation("settings.get", new JSONObject()));
                return env;
            }
            case "backup.restore": {
                JSONObject envelope = payload.getJSONObject("envelope");
                String strategy = payload.optString("strategy", "replace");
                JSONObject currentSnapshot = (JSONObject) dispatchOperation("backup.export", new JSONObject());
                currentSnapshot.put("id", "pre_restore_snapshot");
                currentSnapshot.put("createdAt", isoNow());
                upsertRecordWithConcurrency(db, "snapshots", currentSnapshot, null);

                db.beginTransaction();
                try {
                    if ("replace".equals(strategy)) {
                        db.execSQL("DELETE FROM kairos_records WHERE collection IN ('tasks','habits','habitEntries','notes','focusSessions');");
                    }
                    restoreCollectionArray(db, "tasks", envelope.optJSONArray("tasks"));
                    restoreCollectionArray(db, "habits", envelope.optJSONArray("habits"));
                    restoreCollectionArray(db, "habitEntries", envelope.optJSONArray("habitEntries"));
                    restoreCollectionArray(db, "notes", envelope.optJSONArray("notes"));
                    restoreCollectionArray(db, "focusSessions", envelope.optJSONArray("focusSessions"));
                    db.setTransactionSuccessful();
                } finally {
                    db.endTransaction();
                }
                JSONObject counts = new JSONObject();
                counts.put("tasks", envelope.optJSONArray("tasks") != null ? envelope.optJSONArray("tasks").length() : 0);
                return new JSONObject().put("restoredCounts", counts).put("snapshotKey", "pre_restore_snapshot");
            }
            case "backup.hasPreRestoreSnapshot": {
                Object snap = getRecord(db, "snapshots", "pre_restore_snapshot");
                JSONObject info = new JSONObject();
                info.put("exists", snap != JSONObject.NULL);
                if (snap != JSONObject.NULL) {
                    info.put("createdAt", ((JSONObject) snap).optString("createdAt", isoNow()));
                }
                return info;
            }
            case "backup.rollback": {
                Object snapObj = getRecord(db, "snapshots", "pre_restore_snapshot");
                if (snapObj == JSONObject.NULL) {
                    throw new BridgeExecutionException("STORAGE_ERROR", "No pre-restore snapshot found");
                }
                JSONObject snap = (JSONObject) snapObj;
                JSONObject restorePayload = new JSONObject();
                restorePayload.put("envelope", snap);
                restorePayload.put("strategy", "replace");
                return dispatchOperation("backup.restore", restorePayload);
            }

            // Notifications
            case "notifications.getPermission":
            case "notifications.requestPermission":
                return "granted";
            case "notifications.scheduleReminder":
            case "notifications.cancelReminder":
                return JSONObject.NULL;

            default:
                throw new BridgeExecutionException("UNKNOWN_OPERATION", "Unsupported BridgeOperation: " + op);
        }
    }

    private void restoreCollectionArray(SQLiteDatabase db, String collection, JSONArray items) throws Exception {
        if (items == null) return;
        for (int i = 0; i < items.length(); i++) {
            upsertRecordWithConcurrency(db, collection, items.getJSONObject(i), null);
        }
    }

    private JSONArray listCollection(SQLiteDatabase db, String collection, boolean includeDeleted, String kindFilter) throws Exception {
        JSONArray arr = new JSONArray();
        String sql = includeDeleted
            ? "SELECT json_payload FROM kairos_records WHERE collection = ?"
            : "SELECT json_payload FROM kairos_records WHERE collection = ? AND (deleted_at IS NULL OR deleted_at = '')";
        try (Cursor c = db.rawQuery(sql, new String[]{collection})) {
            while (c.moveToNext()) {
                JSONObject item = new JSONObject(c.getString(0));
                if (kindFilter != null && !kindFilter.isEmpty() && !kindFilter.equals(item.optString("kind", ""))) {
                    continue;
                }
                arr.put(item);
            }
        }
        return arr;
    }

    private Object getRecord(SQLiteDatabase db, String collection, String id) throws Exception {
        try (Cursor c = db.rawQuery(
            "SELECT json_payload FROM kairos_records WHERE collection = ? AND id = ?",
            new String[]{collection, id}
        )) {
            if (c.moveToFirst()) {
                return new JSONObject(c.getString(0));
            }
        }
        return JSONObject.NULL;
    }

    private JSONObject upsertRecordWithConcurrency(
        SQLiteDatabase db,
        String collection,
        JSONObject record,
        Integer expectedRevision
    ) throws Exception {
        String id = record.getString("id");
        Object existingObj = getRecord(db, collection, id);
        int nextRev = 1;
        if (existingObj != JSONObject.NULL) {
            JSONObject existing = (JSONObject) existingObj;
            int currentRev = existing.optInt("revision", 1);
            if (expectedRevision != null && currentRev != expectedRevision) {
                throw new BridgeExecutionException(
                    "STORAGE_ERROR",
                    "CONFLICT_STALE_REVISION: expected " + expectedRevision + ", actual " + currentRev
                );
            }
            nextRev = currentRev + 1;
        }
        String deletedAt = record.isNull("deletedAt") ? null : record.optString("deletedAt", null);
        String updatedAt = isoNow();
        record.put("updatedAt", updatedAt);
        record.put("revision", nextRev);

        db.execSQL(
            "INSERT OR REPLACE INTO kairos_records (collection, id, deleted_at, updated_at, revision, json_payload) VALUES (?, ?, ?, ?, ?, ?)",
            new Object[]{collection, id, deletedAt, updatedAt, nextRev, record.toString()}
        );
        return record;
    }

    private JSONObject setDeletedAt(SQLiteDatabase db, String collection, String id, String deletedAt) throws Exception {
        Object existing = getRecord(db, collection, id);
        if (existing == JSONObject.NULL) {
            return new JSONObject().put("id", id).put("updated", false);
        }
        JSONObject obj = (JSONObject) existing;
        if (deletedAt == null) {
            obj.put("deletedAt", JSONObject.NULL);
        } else {
            obj.put("deletedAt", deletedAt);
        }
        return upsertRecordWithConcurrency(db, collection, obj, null);
    }

    private JSONObject hardDeleteRecord(SQLiteDatabase db, String collection, String id) throws Exception {
        db.execSQL(
            "DELETE FROM kairos_records WHERE collection = ? AND id = ?",
            new Object[]{collection, id}
        );
        return new JSONObject().put("id", id).put("deleted", true);
    }

    private static String isoNow() {
        return java.time.Instant.now().toString();
    }
}
