package com.kairos.app;

import android.content.Context;
import android.content.res.Configuration;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.ArrayList;
import java.util.Collections;
import java.nio.charset.StandardCharsets;

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
 *   ws.setAllowFileAccessFromFileURLs(false);
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
        "planning.get",
        "planning.save",
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
        ws.setAllowFileAccessFromFileURLs(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ws.setForceDark(WebSettings.FORCE_DARK_AUTO);
        }
    }

    /**
     * Reads the Android device's current Day/Night configuration (UI_MODE_NIGHT_MASK)
     * and returns "dark" or "light" (defaulting to "light" if undetectable).
     */
    public static String resolveAndroidDeviceTheme(Context context) {
        if (context == null || context.getResources() == null) {
            return "light";
        }
        Configuration config = context.getResources().getConfiguration();
        if (config == null) {
            return "light";
        }
        int nightModeFlags = config.uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return (nightModeFlags == Configuration.UI_MODE_NIGHT_YES) ? "dark" : "light";
    }

    /**
     * Propagates the phone's current light/dark theme into the running Kairos WebView
     * immediately without reloading the page, clearing forms, or stopping timers.
     * Call this in WebViewClient.onPageFinished(...) and Activity.onConfigurationChanged(...).
     */
    public static void syncDeviceThemeToWebView(Context context, WebView webView) {
        if (webView == null) return;
        final String theme = resolveAndroidDeviceTheme(context);
        final String js =
            "(function(){window.__KAIROS_HOST_THEME__='" + theme + "';" +
            "if(typeof window.__KAIROS_SET_HOST_THEME__==='function'){" +
            "window.__KAIROS_SET_HOST_THEME__('" + theme + "');}})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    public static void attachToWebView(Context context, WebView webView) {
        configureWebViewForModeA(webView);
        webView.addJavascriptInterface(new KairosAndroidBridge(context), "KairosAndroidBridge");
        syncDeviceThemeToWebView(context, webView);
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
            if (rawRequestJson == null || rawRequestJson.getBytes(StandardCharsets.UTF_8).length > MAX_BRIDGE_PAYLOAD_BYTES) {
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
            String serialized=res.toString();
            if(serialized.getBytes(StandardCharsets.UTF_8).length>MAX_BRIDGE_PAYLOAD_BYTES)return buildErrorEnvelope(requestId,"PAYLOAD_TOO_LARGE","Native response exceeds the 5 MiB bridge limit");
            return serialized;
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
                if (existing != JSONObject.NULL) {
                    JSONObject saved = (JSONObject) existing;
                    saved.put("theme", "system");
                    return saved;
                }
                JSONObject defaults = new JSONObject();
                defaults.put("id", "user_settings");
                defaults.put("theme", "system");
                defaults.put("soundEnabled", true);
                defaults.put("pomodoroWorkMinutes", 25);
                defaults.put("pomodoroShortBreakMinutes", 5);
                defaults.put("pomodoroLongBreakMinutes", 15);
                defaults.put("updatedAt", isoNow());
                return defaults;
            }
            case "settings.save": {
                db.beginTransaction();
                try {
                JSONObject incoming = payload.has("settings") ? payload.getJSONObject("settings") : payload;
                if(incoming.has("planning"))throw new BridgeExecutionException("VALIDATION_ERROR","Upgrade the interface to use the independent planning repository");
                Object existingObj = getRecord(db, "settings", "user_settings");
                JSONObject merged = existingObj != JSONObject.NULL ? (JSONObject) existingObj : new JSONObject();
                Iterator<String> keys = incoming.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    merged.put(k, incoming.get(k));
                }
                merged.put("id", "user_settings");
                Object result = upsertRecordWithConcurrency(db, "settings", merged, null);
                db.setTransactionSuccessful();
                return result;
                } finally { db.endTransaction(); }
            }

            case "planning.get": return getPlanningPage(db,payload);
            case "planning.save": return savePlanningPatch(db,payload);
            // Capture, validate, and apply against the same SQLite snapshot.
            case "backup.export": {
                ensurePlanningRecords(db);
                db.beginTransactionNonExclusive();
                try {
                    JSONObject envelope = exportBackupInTransaction(db);
                    db.setTransactionSuccessful();
                    return envelope;
                } finally {
                    db.endTransaction();
                }
            }
            case "backup.restore": {
                ensurePlanningRecords(db);
                String strategy = payload.optString("strategy", "replace");
                if (!"replace".equals(strategy) && !"merge".equals(strategy)) {
                    throw new BridgeExecutionException("VALIDATION_ERROR", "Unknown restore strategy");
                }
                JSONObject data = backupPayload(payload.getJSONObject("envelope"));
                db.beginTransaction();
                try {
                    JSONObject snapshot = exportBackupInTransaction(db);
                    if ("merge".equals(strategy) && (hasPlanningContent(snapshot.getJSONObject("payload").optJSONObject("planning"))
                        || hasPlanningContent(data.optJSONObject("planning")) || hasPlanningContent(legacyPlanning(data)))) {
                        throw new BridgeExecutionException("VALIDATION_ERROR", "Use replace to restore planning data");
                    }
                    snapshot.put("id", "pre_restore_snapshot").put("createdAt", isoNow());
                    writeRestoredRecord(db, "snapshots", snapshot);
                    JSONObject counts = applyBackupInTransaction(db, data, "replace".equals(strategy));
                    db.setTransactionSuccessful();
                    return new JSONObject().put("restoredCounts", counts).put("snapshotKey", "pre_restore_snapshot");
                } finally {
                    db.endTransaction();
                }
            }
            case "backup.hasPreRestoreSnapshot": {
                Object snapshot = getRecord(db, "snapshots", "pre_restore_snapshot");
                JSONObject info = new JSONObject().put("exists", snapshot != JSONObject.NULL);
                if (snapshot instanceof JSONObject) {
                    info.put("createdAt", ((JSONObject) snapshot).optString("createdAt", ""));
                }
                return info;
            }
            case "backup.rollback": {
                ensurePlanningRecords(db);
                db.beginTransaction();
                try {
                    Object snapshot = getRecord(db, "snapshots", "pre_restore_snapshot");
                    if (!(snapshot instanceof JSONObject)) {
                        throw new BridgeExecutionException("STORAGE_ERROR", "No pre-restore snapshot found");
                    }
                    JSONObject counts = applyBackupInTransaction(db, backupPayload((JSONObject) snapshot), true);
                    db.execSQL("DELETE FROM kairos_records WHERE collection='snapshots' AND id='pre_restore_snapshot'");
                    db.setTransactionSuccessful();
                    return new JSONObject().put("restoredCounts", counts);
                } finally {
                    db.endTransaction();
                }
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

    private static final int PLANNING_RECORD_BYTES=256*1024;
    private static final int PLANNING_PAGE_BYTES=512*1024;
    private JSONObject emptyPlanning() throws Exception {
        return new JSONObject("{\"schemaVersion\":1,\"revision\":0,\"projects\":[],\"templates\":[],\"events\":[],\"metrics\":[],\"layout\":{\"desktop\":{\"order\":[],\"hidden\":[],\"pinned\":[]},\"mobile\":{\"order\":[],\"hidden\":[],\"pinned\":[]}},\"availability\":[],\"commitments\":[],\"excludedDates\":[],\"allocations\":[],\"breakMinutes\":0,\"minimumSamples\":3,\"feedback\":[],\"predictions\":[]}");
    }
    private String planningKey(String collection,String id) {
        StringBuilder encoded=new StringBuilder();
        for(byte signed:id.getBytes(StandardCharsets.UTF_8)){int value=signed&255;if(value>='A'&&value<='Z'||value>='a'&&value<='z'||value>='0'&&value<='9'||"-_.!~*'()".indexOf(value)>=0)encoded.append((char)value);else encoded.append(String.format("%%%02X",value));}
        return collection+":"+encoded;
    }
    private JSONObject planningRecord(String collection,String id,int position,Object value) throws Exception {
        return new JSONObject().put("key",planningKey(collection,id)).put("collection",collection).put("position",position).put("value",value);
    }
    private void validatePlanningRecord(JSONObject record) throws Exception {
        String key=record.optString("key","");String collection=record.optString("collection","");
        Set<String> allowed=new HashSet<>(Arrays.asList("meta","projects","templates","events","metrics","metricEntries","availability","commitments","feedback","predictions","allocations","previousAllocations","excludedDates"));
        if(key.isEmpty()||key.length()>2048||!allowed.contains(collection)||record.optLong("position",-1)<0||!record.has("value")||"meta".equals(key)!= "meta".equals(collection))throw new BridgeExecutionException("VALIDATION_ERROR","Invalid planning record");
        if(record.toString().getBytes(StandardCharsets.UTF_8).length>PLANNING_RECORD_BYTES)throw new BridgeExecutionException("PAYLOAD_TOO_LARGE","A planning record exceeds 256 KiB");
    }
    private JSONArray splitPlanning(JSONObject state) throws Exception {
        if(state.optInt("schemaVersion",-1)!=1||state.optLong("revision",-1)<0)throw new BridgeExecutionException("VALIDATION_ERROR","Invalid planning schema/revision");
        if(state.toString().getBytes(StandardCharsets.UTF_8).length>16*1024*1024)throw new BridgeExecutionException("PAYLOAD_TOO_LARGE","Planning exceeds 16 MiB");
        JSONObject preferences=new JSONObject(state.toString());
        String[] collections={"projects","templates","events","availability","commitments","feedback","predictions"};
        for(String collection:collections)preferences.remove(collection);
        for(String collection:new String[]{"metrics","allocations","previousAllocations","excludedDates"})preferences.remove(collection);
        preferences.put("storageVersion",1);preferences.put("previousAllocationsPresent",state.has("previousAllocations"));
        JSONArray rows=new JSONArray().put(new JSONObject().put("key","meta").put("collection","meta").put("position",0).put("value",preferences));
        for(String collection:collections){JSONArray items=state.getJSONArray(collection);for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);rows.put(planningRecord(collection,item.getString("id"),i,item));}}
        JSONArray metrics=state.getJSONArray("metrics");
        for(int i=0;i<metrics.length();i++){JSONObject metric=metrics.getJSONObject(i);String id=metric.getString("id");JSONObject definition=new JSONObject(metric.toString());definition.remove("entries");rows.put(planningRecord("metrics",id,i,definition));JSONArray entries=metric.getJSONArray("entries");for(int j=0;j<entries.length();j++){JSONObject entry=entries.getJSONObject(j);JSONObject row=planningRecord("metricEntries",id,j,entry);row.put("key",planningKey("metricEntries",id)+"/"+planningKey("",entry.getString("id")).substring(1));row.put("ownerId",id);rows.put(row);}}
        for(String collection:new String[]{"allocations","previousAllocations"}){JSONArray items=state.optJSONArray(collection);if(items==null)continue;java.util.HashMap<String,Integer> duplicates=new java.util.HashMap<>();for(int i=0;i<items.length();i++){JSONObject item=items.getJSONObject(i);String id=item.getString("taskId")+"/"+item.getString("start");Integer previous=duplicates.get(id);int occurrence=previous==null?0:previous;duplicates.put(id,occurrence+1);JSONObject row=planningRecord(collection,id,i,item);row.put("key",row.getString("key")+"/"+occurrence);rows.put(row);}}
        JSONArray excluded=state.getJSONArray("excludedDates");for(int i=0;i<excluded.length();i++)rows.put(planningRecord("excludedDates",excluded.getString(i),i,excluded.get(i)));
        Set<String> keys=new HashSet<>();for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);validatePlanningRecord(row);if(!keys.add(row.getString("key")))throw new BridgeExecutionException("VALIDATION_ERROR","Duplicate planning identifier");}return rows;
    }
    private ArrayList<JSONObject> orderedPlanning(JSONArray records,String collection) throws Exception {
        ArrayList<JSONObject> items=new ArrayList<>();for(int i=0;i<records.length();i++){JSONObject row=records.getJSONObject(i);if(collection.equals(row.optString("collection")))items.add(row);}Collections.sort(items,(a,b)->Long.compare(a.optLong("position"),b.optLong("position")));return items;
    }
    private JSONObject joinPlanning(JSONArray records) throws Exception {
        if(records.length()==0)return emptyPlanning();JSONObject preferences=null;
        for(int i=0;i<records.length();i++)if("meta".equals(records.getJSONObject(i).optString("key")))preferences=records.getJSONObject(i).getJSONObject("value");
        if(preferences==null||preferences.optInt("storageVersion",-1)!=1)throw new BridgeExecutionException("STORAGE_ERROR","Missing planning metadata");
        JSONObject state=new JSONObject(preferences.toString());state.remove("storageVersion");boolean previous=state.optBoolean("previousAllocationsPresent");state.remove("previousAllocationsPresent");
        for(String collection:new String[]{"projects","templates","events","availability","commitments","feedback","predictions","allocations","excludedDates","previousAllocations"}){if("previousAllocations".equals(collection)&&!previous)continue;JSONArray items=new JSONArray();for(JSONObject row:orderedPlanning(records,collection))items.put(row.get("value"));state.put(collection,items);}
        java.util.Map<String, JSONArray> histories = new java.util.HashMap<>();
        for (JSONObject row : orderedPlanning(records, "metricEntries")) {
            String owner = row.getString("ownerId");
            JSONArray entries = histories.get(owner);
            if (entries == null) {
                entries = new JSONArray();
                histories.put(owner, entries);
            }
            entries.put(row.get("value"));
        }
        JSONArray metrics = new JSONArray();
        for (JSONObject row : orderedPlanning(records, "metrics")) {
            JSONObject metric = new JSONObject(row.getJSONObject("value").toString());
            JSONArray entries = histories.remove(metric.getString("id"));
            metric.put("entries", entries == null ? new JSONArray() : entries);
            metrics.put(metric);
        }
        if (!histories.isEmpty()) throw new BridgeExecutionException("STORAGE_ERROR", "A measurement has no matching metric");
        state.put("metrics",metrics);
        if(state.toString().getBytes(StandardCharsets.UTF_8).length>16*1024*1024)throw new BridgeExecutionException("PAYLOAD_TOO_LARGE","Planning exceeds 16 MiB");return state;
    }
    private JSONArray readPlanningRecords(SQLiteDatabase db) throws Exception {
        JSONArray records=new JSONArray();try(Cursor cursor=db.rawQuery("SELECT json_payload FROM kairos_records WHERE collection='planningRecords' ORDER BY id",null)){while(cursor.moveToNext())records.put(new JSONObject(cursor.getString(0)));}return records;
    }
    private void writePlanningRecord(SQLiteDatabase db,JSONObject record) throws Exception {
        validatePlanningRecord(record);db.execSQL("INSERT OR REPLACE INTO kairos_records (collection,id,deleted_at,updated_at,revision,json_payload) VALUES ('planningRecords',?,NULL,?,1,?)",new Object[]{record.getString("key"),isoNow(),record.toString()});
    }
    private boolean sameJson(Object a,Object b) throws Exception {
        if(a instanceof JSONObject&&b instanceof JSONObject){JSONObject x=(JSONObject)a,y=(JSONObject)b;if(x.length()!=y.length())return false;Iterator<String> keys=x.keys();while(keys.hasNext()){String k=keys.next();if(!y.has(k)||!sameJson(x.get(k),y.get(k)))return false;}return true;}
        if(a instanceof JSONArray&&b instanceof JSONArray){JSONArray x=(JSONArray)a,y=(JSONArray)b;if(x.length()!=y.length())return false;for(int i=0;i<x.length();i++)if(!sameJson(x.get(i),y.get(i)))return false;return true;}
        if(a instanceof Number&&b instanceof Number)return Double.compare(((Number)a).doubleValue(),((Number)b).doubleValue())==0;return a==null?b==null:a.equals(b);
    }
    private void ensurePlanningRecords(SQLiteDatabase db) throws Exception {
        db.beginTransaction();try{
            if(getRecord(db,"planningRecords","meta")==JSONObject.NULL){
                Object raw=getRecord(db,"settings","user_settings");JSONObject settings=raw instanceof JSONObject?new JSONObject(raw.toString()):new JSONObject();JSONObject legacy=settings.optJSONObject("planning");JSONObject state=legacy==null?emptyPlanning():legacy;JSONArray rows=splitPlanning(state);
                if(legacy!=null)db.execSQL("INSERT OR IGNORE INTO kairos_records (collection,id,updated_at,revision,json_payload) VALUES ('planningRecovery','legacy-settings-v1',?,1,?)",new Object[]{isoNow(),legacy.toString()});
                for(int i=0;i<rows.length();i++)writePlanningRecord(db,rows.getJSONObject(i));
                if(!sameJson(joinPlanning(readPlanningRecords(db)),state))throw new BridgeExecutionException("STORAGE_ERROR","Planning migration verification failed; original settings retained");
                if(legacy!=null){settings.remove("planning");db.execSQL("UPDATE kairos_records SET json_payload=? WHERE collection='settings' AND id='user_settings'",new Object[]{settings.toString()});}
            }db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
    private JSONObject getPlanningPage(SQLiteDatabase db,JSONObject payload) throws Exception {
        ensurePlanningRecords(db);db.beginTransactionNonExclusive();try{
            JSONObject metadata=(JSONObject)getRecord(db,"planningRecords","meta");long revision=metadata.getJSONObject("value").getLong("revision");
            if(payload.has("expectedRevision")&&!payload.isNull("expectedRevision")&&payload.getLong("expectedRevision")!=revision)throw new BridgeExecutionException("CONFLICT_STALE_REVISION","Planning changed while paging");
            int cursor=payload.optInt("cursor",0),total;try(Cursor count=db.rawQuery("SELECT COUNT(*) FROM kairos_records WHERE collection='planningRecords'",null)){count.moveToFirst();total=count.getInt(0);}if(cursor<0||cursor>total)throw new BridgeExecutionException("VALIDATION_ERROR","Invalid planning cursor");
            JSONArray page=new JSONArray();int bytes=0;try(Cursor rows=db.rawQuery("SELECT json_payload FROM kairos_records WHERE collection='planningRecords' ORDER BY id LIMIT -1 OFFSET ?",new String[]{String.valueOf(cursor)})){while(rows.moveToNext()){String raw=rows.getString(0);int size=raw.getBytes(StandardCharsets.UTF_8).length;if(page.length()>0&&bytes+size>PLANNING_PAGE_BYTES)break;bytes+=size;page.put(new JSONObject(raw));}}
            int next=cursor+page.length();db.setTransactionSuccessful();return new JSONObject().put("revision",revision).put("records",page).put("nextCursor",next<total?next:JSONObject.NULL);
        }finally{db.endTransaction();}
    }
    private JSONObject savePlanningPatch(SQLiteDatabase db,JSONObject payload) throws Exception {
        ensurePlanningRecords(db);db.beginTransaction();try{
            JSONObject taskRevisions=payload.optJSONObject("expectedTaskRevisions");if(taskRevisions!=null){int count=0;try(Cursor cursor=db.rawQuery("SELECT id,revision FROM kairos_records WHERE collection='tasks' AND (deleted_at IS NULL OR deleted_at='')",null)){while(cursor.moveToNext()){count++;if(!taskRevisions.has(cursor.getString(0))||taskRevisions.optLong(cursor.getString(0),-1)!=cursor.getLong(1))throw new BridgeExecutionException("CONFLICT_STALE_REVISION","Tasks changed before schedule confirmation");}}if(count!=taskRevisions.length())throw new BridgeExecutionException("CONFLICT_STALE_REVISION","Tasks changed before schedule confirmation");}
            long actual=planningRevision(db),expected=payload.optLong("expectedRevision",-1),revision=payload.optLong("revision",-1);
            if(actual<0||actual>=9_007_199_254_740_991L)throw new BridgeExecutionException("VALIDATION_ERROR","Planning revision is outside its safe range");
            if(actual!=expected||revision!=actual+1)throw new BridgeExecutionException("CONFLICT_STALE_REVISION","Planning changed; refresh before saving");
            if(payload.optInt("storageVersion",-1)!=1)throw new BridgeExecutionException("VALIDATION_ERROR","Unsupported planning storage version");
            JSONArray upserts=payload.getJSONArray("upserts"),deletes=payload.getJSONArray("deletes");for(int i=0;i<upserts.length();i++)writePlanningRecord(db,upserts.getJSONObject(i));for(int i=0;i<deletes.length();i++)db.execSQL("DELETE FROM kairos_records WHERE collection='planningRecords' AND id=?",new Object[]{deletes.getString(i)});
            if(joinPlanning(readPlanningRecords(db)).getLong("revision")!=revision)throw new BridgeExecutionException("VALIDATION_ERROR","Planning metadata revision mismatch");db.setTransactionSuccessful();return new JSONObject().put("revision",revision);
        }finally{db.endTransaction();}
    }

    private static final String[] BACKUP_COLLECTIONS = {"tasks", "habits", "habitEntries", "notes", "focusSessions"};

    private long planningRevision(SQLiteDatabase db) throws Exception {
        return ((JSONObject)getRecord(db, "planningRecords", "meta")).getJSONObject("value").getLong("revision");
    }

    private JSONObject backupPayload(JSONObject envelope) throws Exception {
        return envelope.has("payload") ? envelope.getJSONObject("payload") : envelope;
    }

    private JSONObject legacyPlanning(JSONObject data) {
        JSONObject settings = data.optJSONObject("settings");
        return settings == null ? null : settings.optJSONObject("planning");
    }

    private boolean hasPlanningContent(JSONObject state) throws Exception {
        if (state == null) return false;
        if (state.getInt("breakMinutes") != 0 || state.getInt("minimumSamples") != 3) return true;
        for (String key : new String[]{"projects", "templates", "events", "metrics", "allocations", "previousAllocations",
            "availability", "commitments", "excludedDates", "feedback", "predictions"}) {
            JSONArray items = state.optJSONArray(key);
            if (items != null && items.length() > 0) return true;
        }
        String[] order = {"dashboard", "workspace", "projects", "calendar", "pomodoro", "habits", "useful_info",
            "events", "tracking", "capacity", "planner", "analytics", "sync"};
        for (String mode : new String[]{"desktop", "mobile"}) {
            JSONObject menu = state.getJSONObject("layout").getJSONObject(mode);
            JSONArray menuOrder = menu.getJSONArray("order");
            if (menu.getJSONArray("pinned").length() > 0 || menu.getJSONArray("hidden").length() > 0) return true;
            if (menuOrder.length() > 0 && (!menu.has("main") || !sameJson(menuOrder, new JSONArray(Arrays.asList(order))))) return true;
            JSONArray main = menu.optJSONArray("main");
            int defaultCount = "desktop".equals(mode) ? 5 : 3;
            if (main != null && !sameJson(main, new JSONArray(Arrays.asList(order).subList(0, defaultCount)))) return true;
        }
        return false;
    }

    private JSONObject exportBackupInTransaction(SQLiteDatabase db) throws Exception {
        JSONObject data = new JSONObject();
        for (String collection : BACKUP_COLLECTIONS) data.put(collection, listCollection(db, collection, true, null));
        Object settings = getRecord(db, "settings", "user_settings");
        data.put("settings", settings == JSONObject.NULL ? dispatchOperation("settings.get", new JSONObject()) : settings);
        data.put("planning", joinPlanning(readPlanningRecords(db)));
        JSONObject envelope = new JSONObject().put("app", "Kairos").put("appId", "kairos")
            .put("formatVersion", 2).put("schemaVersion", 2).put("platform", "android_webview")
            .put("encrypted", false).put("exportedAt", isoNow()).put("payload", data);
        if (envelope.toString().getBytes(StandardCharsets.UTF_8).length + 1024 > MAX_BRIDGE_PAYLOAD_BYTES) {
            throw new BridgeExecutionException("PAYLOAD_TOO_LARGE", "Native backup exceeds the 5 MiB bridge limit");
        }
        return envelope;
    }

    private JSONObject applyBackupInTransaction(SQLiteDatabase db, JSONObject data, boolean replace) throws Exception {
        if (replace) {
            JSONObject state = data.optJSONObject("planning");
            if (state == null) state = legacyPlanning(data);
            state = state == null ? emptyPlanning() : new JSONObject(state.toString());
            long current = planningRevision(db);
            long imported = state.getLong("revision");
            long limit = 9_007_199_254_740_991L;
            if (current < 0 || current >= limit || imported < 0 || imported > limit) {
                throw new BridgeExecutionException("VALIDATION_ERROR", "Planning revision is outside its safe range");
            }
            state.put("revision", Math.max(current + 1, imported));
            JSONArray records = splitPlanning(state);
            db.execSQL("DELETE FROM kairos_records WHERE collection IN ('tasks','habits','habitEntries','notes','focusSessions','planningRecords')");
            for (int i = 0; i < records.length(); i++) writePlanningRecord(db, records.getJSONObject(i));
        }
        JSONObject counts = new JSONObject();
        for (String collection : BACKUP_COLLECTIONS) {
            JSONArray items = data.optJSONArray(collection);
            int count = items == null ? 0 : items.length();
            for (int i = 0; i < count; i++) {
                JSONObject record = items.getJSONObject(i);
                if (replace) writeRestoredRecord(db, collection, record);
                else upsertRecordWithConcurrency(db, collection, record, null);
            }
            counts.put(collection, count);
        }
        JSONObject settings = data.optJSONObject("settings");
        if (settings != null) {
            JSONObject clean = new JSONObject(settings.toString());
            clean.remove("planning");
            clean.put("id", "user_settings");
            if (replace) writeRestoredRecord(db, "settings", clean);
            else upsertRecordWithConcurrency(db, "settings", clean, null);
        }
        return counts;
    }

    private void writeRestoredRecord(SQLiteDatabase db, String collection, JSONObject record) throws Exception {
        String deletedAt = record.isNull("deletedAt") ? null : record.getString("deletedAt");
        db.execSQL("INSERT OR REPLACE INTO kairos_records (collection,id,deleted_at,updated_at,revision,json_payload) VALUES (?,?,?,?,?,?)",
            new Object[]{collection, record.getString("id"), deletedAt, record.optString("updatedAt", isoNow()),
                record.optLong("revision", 1), record.toString()});
    }

    // SQLite CursorWindow can be smaller than a valid legacy settings row or restore snapshot.
    private JSONObject readLargeRecord(SQLiteDatabase db, String collection, String id) throws Exception {
        db.beginTransactionNonExclusive();
        try {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            int pageBytes = 128 * 1024;
            for (int offset = 1; ; offset += pageBytes) {
                String sql = "SELECT substr(CAST(json_payload AS BLOB), ?, ?) FROM kairos_records WHERE collection=? AND id=?";
                try (Cursor page = db.rawQuery(sql, new String[]{String.valueOf(offset), String.valueOf(pageBytes), collection, id})) {
                    if (!page.moveToFirst()) throw new BridgeExecutionException("STORAGE_ERROR", "Record changed during read");
                    byte[] bytes = page.getBlob(0);
                    output.write(bytes);
                    if (bytes.length < pageBytes) break;
                }
            }
            JSONObject record = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            db.setTransactionSuccessful();
            return record;
        } finally {
            db.endTransaction();
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
            "SELECT CASE WHEN length(CAST(json_payload AS BLOB)) <= 524288 THEN json_payload ELSE NULL END FROM kairos_records WHERE collection = ? AND id = ?",
            new String[]{collection, id}
        )) {
            if (c.moveToFirst()) {
                if (!c.isNull(0)) return new JSONObject(c.getString(0));
            } else {
                return JSONObject.NULL;
            }
        }
        return readLargeRecord(db, collection, id);
    }

    private JSONObject upsertRecordWithConcurrency(
        SQLiteDatabase db,
        String collection,
        JSONObject record,
        Integer expectedRevision
    ) throws Exception {
        if (db.inTransaction()) return upsertRecordInTransaction(db, collection, record, expectedRevision);
        db.beginTransaction();
        try {
            JSONObject saved = upsertRecordInTransaction(db, collection, record, expectedRevision);
            db.setTransactionSuccessful();
            return saved;
        } finally {
            db.endTransaction();
        }
    }

    private JSONObject upsertRecordInTransaction(SQLiteDatabase db, String collection, JSONObject record,
                                                Integer expectedRevision) throws Exception {
        String id = record.getString("id");
        Object existingObj = getRecord(db, collection, id);
        int nextRev = 1;
        if (existingObj != JSONObject.NULL) {
            JSONObject existing = (JSONObject) existingObj;
            int currentRev = existing.optInt("revision", 1);
            if (expectedRevision != null && currentRev != expectedRevision) {
                throw new BridgeExecutionException(
                    "CONFLICT_STALE_REVISION",
                    "Expected revision " + expectedRevision + ", actual " + currentRev
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
