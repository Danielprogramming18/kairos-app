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

/**
 * KairosAndroidBridge — Reference Implementation for Android Sketchware / Android Studio
 * Protocol Version: 1.0.0
 *
 * نحوهٔ استفاده در Sketchware (حالت A — بدون نیاز به این کلاس، صرفاً WebView + IndexedDB):
 *   WebSettings ws = webview1.getSettings();
 *   ws.setJavaScriptEnabled(true);
 *   ws.setDomStorageEnabled(true);
 *   ws.setDatabaseEnabled(true);
 *   ws.setAllowFileAccess(true);
 *   ws.setAllowFileAccessFromFileURLs(true);
 *   ws.setAllowUniversalAccessFromFileURLs(true);
 *   webview1.loadUrl("file:///android_asset/www/index.html");
 *
 * نحوهٔ استفاده در حالت B (اختیاری — فعال‌سازی پایگاه داده SQLite بومی اندروید):
 *   KairosAndroidBridge.attachToWebView(getApplicationContext(), webview1);
 *   webview1.loadUrl("file:///android_asset/www/index.html");
 */
public class KairosAndroidBridge extends SQLiteOpenHelper {

    private static final String DB_NAME = "kairos_native_v1.db";
    private static final int DB_VERSION = 1;
    private static final String PROTOCOL_VERSION = "1.0.0";

    public KairosAndroidBridge(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    /**
     * Helper to configure WebSettings and attach the optional native bridge to a Sketchware WebView.
     */
    public static void configureWebViewForModeA(WebView webView) {
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowFileAccessFromFileURLs(true);
        ws.setAllowUniversalAccessFromFileURLs(true);
    }

    public static void attachToWebView(Context context, WebView webView) {
        configureWebViewForModeA(webView);
        webView.addJavascriptInterface(new KairosAndroidBridge(context), "KairosAndroidBridge");
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        // Key-Value JSON document table per collection for schema-compatible storage with Dexie
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS kairos_records (" +
            "collection TEXT NOT NULL, " +
            "id TEXT NOT NULL, " +
            "deleted_at TEXT, " +
            "updated_at TEXT, " +
            "json_payload TEXT NOT NULL, " +
            "PRIMARY KEY (collection, id)" +
            ");"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        onCreate(db);
    }

    @JavascriptInterface
    public String postMessage(String rawRequestJson) {
        String requestId = "unknown";
        String protocolVersion = PROTOCOL_VERSION;
        try {
            JSONObject req = new JSONObject(rawRequestJson);
            requestId = req.optString("requestId", "unknown");
            protocolVersion = req.optString("protocolVersion", PROTOCOL_VERSION);
            String operation = req.optString("operation", "");
            JSONObject payload = req.optJSONObject("payload");
            if (payload == null) {
                payload = new JSONObject();
            }

            Object resultData = dispatchOperation(operation, payload);

            JSONObject res = new JSONObject();
            res.put("requestId", requestId);
            res.put("protocolVersion", PROTOCOL_VERSION);
            res.put("ok", true);
            res.put("data", resultData != null ? resultData : JSONObject.NULL);
            return res.toString();
        } catch (Exception ex) {
            try {
                JSONObject errRes = new JSONObject();
                errRes.put("requestId", requestId);
                errRes.put("protocolVersion", protocolVersion);
                errRes.put("ok", false);
                JSONObject errObj = new JSONObject();
                errObj.put("code", "SQLITE_ERROR");
                errObj.put("message", ex.getMessage() != null ? ex.getMessage() : "Unknown Android SQLite error");
                errObj.put("recoverable", true);
                errRes.put("error", errObj);
                return errRes.toString();
            } catch (Exception fallbackEx) {
                return "{\"requestId\":\"" + requestId + "\",\"protocolVersion\":\"1.0.0\",\"ok\":false,\"error\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"Bridge serialization failure\",\"recoverable\":false}}";
            }
        }
    }

    private Object dispatchOperation(String op, JSONObject payload) throws Exception {
        SQLiteDatabase db = getWritableDatabase();
        switch (op) {
            case "system.ping":
            case "storage.init": {
                JSONObject info = new JSONObject();
                info.put("status", "ready");
                info.put("engine", "android-sqlite");
                info.put("protocolVersion", PROTOCOL_VERSION);
                return info;
            }
            case "tasks.list":
                return listCollection(db, "tasks", false);
            case "tasks.getById":
                return getRecord(db, "tasks", payload.getString("id"));
            case "tasks.save":
                return upsertRecord(db, "tasks", payload);
            case "tasks.softDelete":
                return setDeletedAt(db, "tasks", payload.getString("id"), payload.optString("deletedAt", isoNow()));
            case "tasks.restore":
                return setDeletedAt(db, "tasks", payload.getString("id"), null);

            case "habits.list":
                return listCollection(db, "habits", false);
            case "habits.getById":
                return getRecord(db, "habits", payload.getString("id"));
            case "habits.save":
                return upsertRecord(db, "habits", payload);
            case "habits.softDelete":
                return setDeletedAt(db, "habits", payload.getString("id"), payload.optString("deletedAt", isoNow()));
            case "habits.restore":
                return setDeletedAt(db, "habits", payload.getString("id"), null);
            case "habits.listLogs":
                return listCollection(db, "habitLogs", false);

            case "notes.list":
                return listCollection(db, "notes", false);
            case "notes.getById":
                return getRecord(db, "notes", payload.getString("id"));
            case "notes.save":
                return upsertRecord(db, "notes", payload);
            case "notes.softDelete":
                return setDeletedAt(db, "notes", payload.getString("id"), payload.optString("deletedAt", isoNow()));
            case "notes.restore":
                return setDeletedAt(db, "notes", payload.getString("id"), null);

            case "focus.list":
                return listCollection(db, "focusSessions", false);
            case "focus.save":
                return upsertRecord(db, "focusSessions", payload);
            case "focus.softDelete":
                return setDeletedAt(db, "focusSessions", payload.getString("id"), payload.optString("deletedAt", isoNow()));

            case "projects.list":
                return listCollection(db, "projects", false);
            case "projects.save":
                return upsertRecord(db, "projects", payload);
            case "projects.softDelete":
                return setDeletedAt(db, "projects", payload.getString("id"), payload.optString("deletedAt", isoNow()));

            case "tags.list":
                return listCollection(db, "tags", false);
            case "tags.save":
                return upsertRecord(db, "tags", payload);
            case "tags.softDelete":
                return setDeletedAt(db, "tags", payload.getString("id"), payload.optString("deletedAt", isoNow()));

            case "settings.get":
                return getRecord(db, "settings", "user_settings");
            case "settings.save": {
                payload.put("id", "user_settings");
                return upsertRecord(db, "settings", payload);
            }
            default:
                throw new IllegalArgumentException("Unsupported BridgeOperation: " + op);
        }
    }

    private JSONArray listCollection(SQLiteDatabase db, String collection, boolean includeDeleted) throws Exception {
        JSONArray arr = new JSONArray();
        String sql = includeDeleted
            ? "SELECT json_payload FROM kairos_records WHERE collection = ?"
            : "SELECT json_payload FROM kairos_records WHERE collection = ? AND (deleted_at IS NULL OR deleted_at = '')";
        try (Cursor c = db.rawQuery(sql, new String[]{collection})) {
            while (c.moveToNext()) {
                arr.put(new JSONObject(c.getString(0)));
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

    private JSONObject upsertRecord(SQLiteDatabase db, String collection, JSONObject record) throws Exception {
        String id = record.getString("id");
        String deletedAt = record.isNull("deletedAt") ? null : record.optString("deletedAt", null);
        String updatedAt = record.optString("updatedAt", isoNow());
        db.execSQL(
            "INSERT OR REPLACE INTO kairos_records (collection, id, deleted_at, updated_at, json_payload) VALUES (?, ?, ?, ?, ?)",
            new Object[]{collection, id, deletedAt, updatedAt, record.toString()}
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
        obj.put("updatedAt", isoNow());
        obj.put("revision", obj.optInt("revision", 1) + 1);
        return upsertRecord(db, collection, obj);
    }

    private static String isoNow() {
        return java.time.Instant.now().toString();
    }
}
