use time::{macros::format_description, OffsetDateTime};
use crate::planning;
#[cfg(test)]
#[path = "planning_tests.rs"]
mod planning_storage_tests;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const PRE_RESTORE_SNAPSHOT_KEY: &str = "kairos_pre_restore_snapshot_v2";
pub const ACTIVE_TIMER_STATE_KEY: &str = "kairos_active_timer_state_v2";

#[derive(Debug)]
pub struct DbError {
    pub code: String,
    pub message: String,
}

impl DbError {
    pub fn storage(msg: impl Into<String>) -> Self {
        Self {
            code: "STORAGE_ERROR".to_string(),
            message: msg.into(),
        }
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        Self {
            code: "VALIDATION_ERROR".to_string(),
            message: msg.into(),
        }
    }

    pub fn conflict(entity_id: &str, expected: i64, actual: i64) -> Self {
        Self {
            code: "CONFLICT_STALE_REVISION".to_string(),
            message: format!(
                "تداخل همزمانی برای رکورد ({}): نسخهٔ فعلی در پایگاه‌داده ({}) با نسخهٔ ارسالی ({}) تفاوت دارد.",
                entity_id, actual, expected
            ),
        }
    }
}

impl From<rusqlite::Error> for DbError {
    fn from(err: rusqlite::Error) -> Self {
        Self::storage(format!("خطای SQLite دسکتاپ ویندوز: {}", err))
    }
}

pub struct KairosSqliteDatabase {
    db_path: PathBuf,
    conn: Mutex<Connection>,
}

fn iso_utc(time: OffsetDateTime) -> String {
    time.format(format_description!("[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z"))
        .expect("formatting a UTC timestamp")
}

fn now_iso_string() -> String {
    iso_utc(OffsetDateTime::now_utc())
}

fn legacy_timestamp_to_iso(value: &str) -> Option<String> {
    let seconds = value.strip_prefix("unix_")?;
    if seconds.is_empty() || !seconds.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let seconds = seconds.parse::<i64>().ok()?;
    OffsetDateTime::from_unix_timestamp(seconds).ok().map(iso_utc)
}

fn normalize_record_timestamps(record: &mut Value) -> bool {
    let Some(fields) = record.as_object_mut() else { return false; };
    let mut changed = false;
    for key in ["createdAt", "updatedAt", "deletedAt", "completedAt", "startedAt", "endedAt", "exportedAt"] {
        let normalized = fields.get(key).and_then(Value::as_str).and_then(legacy_timestamp_to_iso);
        if let Some(timestamp) = normalized {
            fields.insert(key.to_string(), json!(timestamp));
            changed = true;
        }
    }
    changed
}

fn compute_fnv1a_checksum(serialized: &str) -> String {
    let mut hash: u32 = 2166136261;
    for unit in serialized.encode_utf16() {
        hash ^= unit as u32;
        hash = hash.wrapping_mul(16777619);
    }
    format!("fnv1a_{:x}_{}", hash, serialized.encode_utf16().count())
}

impl KairosSqliteDatabase {
    /// Opens or creates the per-user local SQLite database inside the OS AppLocalData directory
    /// (e.g. `%LOCALAPPDATA%\com.kairos.workspace\data\kairos_v2.sqlite` on Windows).
    pub fn open_in_app_data_dir(app_local_data_dir: &Path) -> Result<Self, DbError> {
        let data_dir = app_local_data_dir.join("data");
        fs::create_dir_all(&data_dir).map_err(|e| {
            DbError::storage(format!(
                "امکان ایجاد پوشهٔ دادهٔ کاربر در مسیر {:?} وجود ندارد: {}",
                data_dir, e
            ))
        })?;

        let db_path = data_dir.join("kairos_v2.sqlite");
        let conn = Connection::open(&db_path)?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;

        let instance = Self {
            db_path,
            conn: Mutex::new(conn),
        };
        instance.run_migrations()?;
        Ok(instance)
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    fn run_migrations(&self) -> Result<(), DbError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس SQLite در دسترس نیست."))?;

        let tx = conn.transaction()?;

        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                target_date TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'todo',
                priority INTEGER NOT NULL DEFAULT 1,
                category TEXT NOT NULL DEFAULT 'work',
                updated_at TEXT NOT NULL,
                deleted_at TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                json_data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_target_date ON tasks(target_date);
            CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);

            CREATE TABLE IF NOT EXISTS habits (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL DEFAULT 'health',
                archived INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                deleted_at TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                json_data TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS habit_entries (
                id TEXT PRIMARY KEY,
                habit_id TEXT NOT NULL,
                date_key TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                deleted_at TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                json_data TEXT NOT NULL,
                UNIQUE(habit_id, date_key)
            );
            CREATE INDEX IF NOT EXISTS idx_habit_entries_habit_date ON habit_entries(habit_id, date_key);

            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'work',
                pinned INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                deleted_at TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                json_data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notes_kind ON notes(kind);

            CREATE TABLE IF NOT EXISTS focus_sessions (
                id TEXT PRIMARY KEY,
                date_key TEXT NOT NULL,
                task_id TEXT,
                started_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT,
                revision INTEGER NOT NULL DEFAULT 1,
                json_data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_focus_date_key ON focus_sessions(date_key);

            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY,
                updated_at TEXT NOT NULL,
                json_data TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS kv_state (
                key TEXT PRIMARY KEY,
                updated_at TEXT NOT NULL,
                json_value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS planning_records (
                key TEXT PRIMARY KEY,
                json_data TEXT NOT NULL
            );",
        )?;

        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            params![1, now_iso_string()],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            params![2, now_iso_string()],
        )?;

        // Ensure default settings row exists with 'system' («هماهنگ با دستگاه») as initial default
        let existing_settings: Option<String> = tx
            .query_row(
                "SELECT json_data FROM settings WHERE id = 'default'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        if existing_settings.is_none() {
            let now = now_iso_string();
            let default_settings = json!({
                "id": "default",
                "theme": "system",
                "soundEnabled": true,
                "pomodoroWorkMinutes": 45,
                "pomodoroShortBreakMinutes": 10,
                "pomodoroLongBreakMinutes": 20,
                "pomodoroCyclesBeforeLongBreak": 4,
                "calendarPreference": "jalali",
                "updatedAt": now
            });
            tx.execute(
                "INSERT INTO settings (id, updated_at, json_data) VALUES ('default', ?1, ?2)",
                params![now, default_settings.to_string()],
            )?;
        }

        Self::migrate_legacy_timestamps_in_tx(&tx)?;
        tx.commit()?;
        Ok(())
    }

    fn migrate_legacy_timestamps_in_tx(tx: &rusqlite::Transaction<'_>) -> Result<(), DbError> {
        let applied: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 3)",
            [], |row| row.get(0),
        )?;
        if applied { return Ok(()); }

        // Only metadata emitted by the old native clock is converted. User text,
        // calendar dates, revisions and unknown/malformed values stay untouched.
        for table in ["tasks", "habits", "habit_entries", "notes", "focus_sessions", "settings"] {
            let deleted = if table == "settings" { "NULL" } else { "deleted_at" };
            let started = if table == "focus_sessions" { "started_at" } else { "NULL" };
            let query = format!("SELECT id, updated_at, json_data, {}, {} FROM {}", deleted, started, table);
            let records = {
                let mut statement = tx.prepare(&query)?;
                let rows = statement.query_map([], |row| Ok((
                    row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?, row.get::<_, Option<String>>(4)?,
                )))?;
                rows.collect::<Result<Vec<_>, _>>()?
            };
            for (id, updated, raw, deleted, started) in records {
                let Ok(mut record) = serde_json::from_str::<Value>(&raw) else { continue; };
                let changed = normalize_record_timestamps(&mut record);
                let next_updated = legacy_timestamp_to_iso(&updated).unwrap_or_else(|| updated.clone());
                let next_deleted = deleted.as_ref().map(|s| legacy_timestamp_to_iso(s).unwrap_or_else(|| s.clone()));
                let next_started = started.as_ref().map(|s| legacy_timestamp_to_iso(s).unwrap_or_else(|| s.clone()));
                if !changed && next_updated == updated && next_deleted == deleted && next_started == started { continue; }
                let query = if table == "settings" {
                    "UPDATE settings SET updated_at = ?1, json_data = ?2 WHERE id = ?3".to_string()
                } else if table == "focus_sessions" {
                    "UPDATE focus_sessions SET updated_at = ?1, json_data = ?2, deleted_at = ?4, started_at = ?5 WHERE id = ?3".to_string()
                } else {
                    format!("UPDATE {} SET updated_at = ?1, json_data = ?2, deleted_at = ?4 WHERE id = ?3", table)
                };
                if table == "settings" {
                    tx.execute(&query, params![next_updated, record.to_string(), id])?;
                } else if table == "focus_sessions" {
                    tx.execute(&query, params![next_updated, record.to_string(), id, next_deleted, next_started])?;
                } else {
                    tx.execute(&query, params![next_updated, record.to_string(), id, next_deleted])?;
                }
            }
        }

        let snapshot: Option<(String, String)> = tx.query_row(
            "SELECT updated_at, json_value FROM kv_state WHERE key = ?1",
            params![PRE_RESTORE_SNAPSHOT_KEY], |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional()?;
        if let Some((updated, raw)) = snapshot {
            if let Ok(mut envelope) = serde_json::from_str::<Value>(&raw) {
                let mut changed = normalize_record_timestamps(&mut envelope);
                let mut payload_changed = false;
                if let Some(payload) = envelope.get_mut("payload").and_then(Value::as_object_mut) {
                    for collection in ["tasks", "habits", "habitEntries", "notes", "focusSessions"] {
                        if let Some(records) = payload.get_mut(collection).and_then(Value::as_array_mut) {
                            for record in records { payload_changed |= normalize_record_timestamps(record); }
                        }
                    }
                    if let Some(settings) = payload.get_mut("settings") {
                        payload_changed |= normalize_record_timestamps(settings);
                    }
                }
                if payload_changed {
                    let checksum = compute_fnv1a_checksum(&envelope["payload"].to_string());
                    envelope["checksum"] = json!(checksum);
                    changed = true;
                }
                let next_updated = legacy_timestamp_to_iso(&updated).unwrap_or_else(|| updated.clone());
                if changed || next_updated != updated {
                    tx.execute("UPDATE kv_state SET updated_at = ?1, json_value = ?2 WHERE key = ?3",
                        params![next_updated, envelope.to_string(), PRE_RESTORE_SNAPSHOT_KEY])?;
                }
            }
        }
        tx.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?1)", params![now_iso_string()])?;
        Ok(())
    }

    pub fn dispatch(&self, operation: &str, payload: &Value) -> Result<Value, DbError> {
        match operation {
            "bridge.handshake" => Ok(json!({
                "status": "ready",
                "engine": "windows_sqlite_bridge",
                "version": "1.0.0",
                "dbPath": self.db_path.to_string_lossy()
            })),

            // ================= TASKS =================
            "tasks.list" => self.list_tasks(payload),
            "tasks.getById" => self.get_by_id("tasks", payload),
            "tasks.upsert" => self.upsert_task(payload),
            "tasks.upsertBatch" => self.upsert_tasks_batch(payload),
            "tasks.softDelete" => self.soft_delete_row("tasks", payload),
            "tasks.restore" => self.restore_row("tasks", payload),
            "tasks.hardDelete" => self.hard_delete_row("tasks", payload),

            // ================= HABITS =================
            "habits.list" => self.list_habits(payload),
            "habits.getById" => self.get_by_id("habits", payload),
            "habits.upsert" => self.upsert_habit(payload),
            "habits.toggleDate" => self.toggle_habit_date(payload),
            "habits.listEntries" => self.list_habit_entries(payload),
            "habits.softDelete" => self.soft_delete_row("habits", payload),
            "habits.restore" => self.restore_row("habits", payload),
            "habits.hardDelete" => self.hard_delete_row("habits", payload),

            // ================= NOTES =================
            "notes.list" => self.list_notes(payload),
            "notes.upsert" => self.upsert_note(payload),
            "notes.softDelete" => self.soft_delete_row("notes", payload),
            "notes.restore" => self.restore_row("notes", payload),
            "notes.hardDelete" => self.hard_delete_row("notes", payload),

            // ================= FOCUS & TIMER =================
            "focus.listSessions" => self.list_focus_sessions(payload),
            "focus.logSession" => self.log_focus_session(payload),
            "focus.getActiveTimer" => self.get_active_timer(),
            "focus.saveActiveTimer" => self.save_active_timer(payload),

            // ================= SETTINGS =================
            "settings.get" => self.get_settings(),
            "settings.save" => self.save_settings(payload),
            "planning.get" => self.get_planning_page(payload),
            "planning.save" => self.save_planning_patch(payload),
            "planning.createTaskAndSave" if payload["createTask"].is_object() => self.save_planning_patch(payload),

            // ================= BACKUP & RESTORE =================
            "backup.export" => self.export_backup(),
            "backup.restore" => self.restore_backup(payload),
            "backup.hasPreRestoreSnapshot" => self.has_pre_restore_snapshot(),
            "backup.rollback" => self.rollback_last_restore(),

            // ================= NOTIFICATIONS =================
            "notifications.getPermission" => Ok(json!("granted")),
            "notifications.requestPermission" => Ok(json!("granted")),
            "notifications.scheduleReminder" => Ok(Value::Null),
            "notifications.cancelReminder" => Ok(Value::Null),

            _ => Err(DbError {
                code: "UNKNOWN_OPERATION".to_string(),
                message: format!("عملیات ناشناخته در میزبان ویندوز: {}", operation),
            }),
        }
    }

    fn list_tasks(&self, filter: &Value) -> Result<Value, DbError> {
        let include_deleted = filter
            .get("includeDeleted")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let date_filter = filter.get("targetDate").and_then(|v| v.as_str());
        let completed_filter = filter.get("completed").and_then(|v| v.as_bool());

        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;

        let mut stmt = conn.prepare("SELECT json_data FROM tasks ORDER BY priority ASC, updated_at DESC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

        let mut items = Vec::new();
        for row_res in rows {
            let raw = row_res?;
            if let Ok(val) = serde_json::from_str::<Value>(&raw) {
                let is_deleted = val
                    .get("deletedAt")
                    .map(|d| !d.is_null() && d.as_str().map(|s| !s.is_empty()).unwrap_or(false))
                    .unwrap_or(false);
                if !include_deleted && is_deleted {
                    continue;
                }
                if let Some(df) = date_filter {
                    if val.get("targetDate").and_then(|v| v.as_str()) != Some(df) {
                        continue;
                    }
                }
                if let Some(cf) = completed_filter {
                    if val.get("completed").and_then(|v| v.as_bool()) != Some(cf) {
                        continue;
                    }
                }
                items.push(val);
            }
        }
        Ok(Value::Array(items))
    }

    fn get_by_id(&self, table: &str, payload: &Value) -> Result<Value, DbError> {
        let id = payload
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("فیلد id الزامی است."))?;
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let query = format!("SELECT json_data FROM {} WHERE id = ?1", table);
        let raw: Option<String> = conn
            .query_row(&query, params![id], |row| row.get(0))
            .optional()?;
        match raw {
            Some(s) => serde_json::from_str(&s).map_err(|e| DbError::storage(e.to_string())),
            None => Ok(Value::Null),
        }
    }

    fn upsert_task(&self, payload: &Value) -> Result<Value, DbError> {
        let task_val = payload
            .get("task")
            .cloned()
            .ok_or_else(|| DbError::validation("فیلد task الزامی است."))?;
        let expected_rev = payload.get("expectedRevision").and_then(|v| v.as_i64());

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;
        let saved = Self::upsert_task_in_tx(&tx, task_val, expected_rev)?;
        tx.commit()?;
        Ok(saved)
    }

    fn upsert_task_in_tx(
        tx: &rusqlite::Transaction<'_>,
        mut task_val: Value,
        expected_rev: Option<i64>,
    ) -> Result<Value, DbError> {
        let id = task_val
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("شناسهٔ کار (task.id) الزامی است."))?
            .to_string();

        let current_rev: Option<i64> = tx
            .query_row(
                "SELECT revision FROM tasks WHERE id = ?1",
                params![&id],
                |row| row.get(0),
            )
            .optional()?;

        if let (Some(exp), Some(actual)) = (expected_rev, current_rev) {
            if exp != actual {
                return Err(DbError::conflict(&id, exp, actual));
            }
        }

        let next_rev = current_rev.map(|r| r + 1).unwrap_or_else(|| {
            task_val
                .get("revision")
                .and_then(|v| v.as_i64())
                .unwrap_or(1)
                .max(1)
        });

        let updated_at = task_val
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(now_iso_string);
        let target_date = task_val
            .get("targetDate")
            .and_then(|v| v.as_str())
            .unwrap_or("2026-01-01")
            .to_string();
        let completed = if task_val
            .get("completed")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            1
        } else {
            0
        };
        let status = task_val
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or(if completed == 1 { "done" } else { "todo" })
            .to_string();
        let priority = task_val
            .get("priority")
            .and_then(|v| v.as_i64())
            .unwrap_or(1);
        let category = task_val
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("work")
            .to_string();
        let deleted_at = task_val
            .get("deletedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(obj) = task_val.as_object_mut() {
            obj.insert("revision".to_string(), json!(next_rev));
            obj.insert("updatedAt".to_string(), json!(updated_at));
        }

        tx.execute(
            "INSERT OR REPLACE INTO tasks (id, target_date, completed, status, priority, category, updated_at, deleted_at, revision, json_data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                id,
                target_date,
                completed,
                status,
                priority,
                category,
                updated_at,
                deleted_at,
                next_rev,
                task_val.to_string()
            ],
        )?;

        Ok(task_val)
    }

    fn upsert_tasks_batch(&self, payload: &Value) -> Result<Value, DbError> {
        let tasks_arr = payload
            .get("tasks")
            .and_then(|v| v.as_array())
            .ok_or_else(|| DbError::validation("فیلد tasks باید یک آرایه باشد."))?;

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;
        let mut results = Vec::with_capacity(tasks_arr.len());
        for t in tasks_arr {
            results.push(Self::upsert_task_in_tx(&tx, t.clone(), None)?);
        }
        tx.commit()?;
        Ok(Value::Array(results))
    }

    fn list_habits(&self, payload: &Value) -> Result<Value, DbError> {
        let include_deleted = payload
            .get("includeDeleted")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let mut stmt = conn.prepare("SELECT json_data FROM habits ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row_res in rows {
            if let Ok(val) = serde_json::from_str::<Value>(&row_res?) {
                let is_deleted = val
                    .get("deletedAt")
                    .map(|d| !d.is_null() && d.as_str().map(|s| !s.is_empty()).unwrap_or(false))
                    .unwrap_or(false);
                if !include_deleted && is_deleted {
                    continue;
                }
                items.push(val);
            }
        }
        Ok(Value::Array(items))
    }

    fn upsert_habit(&self, payload: &Value) -> Result<Value, DbError> {
        let mut habit_val = payload
            .get("habit")
            .cloned()
            .ok_or_else(|| DbError::validation("فیلد habit الزامی است."))?;
        let expected_rev = payload.get("expectedRevision").and_then(|v| v.as_i64());

        let id = habit_val
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("شناسهٔ عادت (habit.id) الزامی است."))?
            .to_string();

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;

        let current_rev: Option<i64> = tx
            .query_row(
                "SELECT revision FROM habits WHERE id = ?1",
                params![&id],
                |row| row.get(0),
            )
            .optional()?;

        if let (Some(exp), Some(actual)) = (expected_rev, current_rev) {
            if exp != actual {
                return Err(DbError::conflict(&id, exp, actual));
            }
        }

        let next_rev = current_rev.map(|r| r + 1).unwrap_or(1);
        let updated_at = habit_val
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(now_iso_string);
        let category = habit_val
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("health")
            .to_string();
        let archived = if habit_val
            .get("archived")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            1
        } else {
            0
        };
        let deleted_at = habit_val
            .get("deletedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(obj) = habit_val.as_object_mut() {
            obj.insert("revision".to_string(), json!(next_rev));
            obj.insert("updatedAt".to_string(), json!(updated_at));
        }

        tx.execute(
            "INSERT OR REPLACE INTO habits (id, category, archived, updated_at, deleted_at, revision, json_data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                category,
                archived,
                updated_at,
                deleted_at,
                next_rev,
                habit_val.to_string()
            ],
        )?;

        tx.commit()?;
        Ok(habit_val)
    }

    fn toggle_habit_date(&self, payload: &Value) -> Result<Value, DbError> {
        let habit_id = payload
            .get("habitId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("فیلد habitId الزامی است."))?;
        let date_key = payload
            .get("dateKey")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("فیلد dateKey الزامی است."))?;

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;

        let row_opt: Option<(String, i64)> = tx
            .query_row(
                "SELECT json_data, revision FROM habits WHERE id = ?1",
                params![habit_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        let (raw_json, current_rev) = match row_opt {
            Some(pair) => pair,
            None => return Ok(Value::Null),
        };

        let mut habit_val: Value =
            serde_json::from_str(&raw_json).map_err(|e| DbError::storage(e.to_string()))?;
        let next_rev = current_rev + 1;
        let now = now_iso_string();

        let mut completed_map = habit_val
            .get("completedDates")
            .and_then(|v| v.as_object())
            .cloned()
            .unwrap_or_else(Map::new);

        let is_currently_done = completed_map
            .get(date_key)
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let next_done = !is_currently_done;

        if next_done {
            completed_map.insert(date_key.to_string(), json!(true));
            let entry_id = format!("he_{}_{}", habit_id, date_key);
            let entry_json = json!({
                "id": entry_id,
                "habitId": habit_id,
                "dateKey": date_key,
                "completed": true,
                "createdAt": now,
                "updatedAt": now,
                "deletedAt": null,
                "revision": 1
            });
            tx.execute(
                "INSERT OR REPLACE INTO habit_entries (id, habit_id, date_key, completed, updated_at, deleted_at, revision, json_data)
                 VALUES (?1, ?2, ?3, 1, ?4, NULL, 1, ?5)",
                params![entry_id, habit_id, date_key, now, entry_json.to_string()],
            )?;
        } else {
            completed_map.remove(date_key);
            tx.execute(
                "DELETE FROM habit_entries WHERE habit_id = ?1 AND date_key = ?2",
                params![habit_id, date_key],
            )?;
        }

        if let Some(obj) = habit_val.as_object_mut() {
            obj.insert("completedDates".to_string(), Value::Object(completed_map));
            obj.insert("revision".to_string(), json!(next_rev));
            obj.insert("updatedAt".to_string(), json!(now));
        }

        tx.execute(
            "UPDATE habits SET updated_at = ?1, revision = ?2, json_data = ?3 WHERE id = ?4",
            params![now, next_rev, habit_val.to_string(), habit_id],
        )?;

        tx.commit()?;
        Ok(habit_val)
    }

    fn list_habit_entries(&self, payload: &Value) -> Result<Value, DbError> {
        let habit_id = payload.get("habitId").and_then(|v| v.as_str());
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let mut items = Vec::new();
        if let Some(hid) = habit_id {
            let mut stmt =
                conn.prepare("SELECT json_data FROM habit_entries WHERE habit_id = ?1")?;
            let rows = stmt.query_map(params![hid], |row| row.get::<_, String>(0))?;
            for r in rows {
                if let Ok(v) = serde_json::from_str::<Value>(&r?) {
                    items.push(v);
                }
            }
        } else {
            let mut stmt = conn.prepare("SELECT json_data FROM habit_entries")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            for r in rows {
                if let Ok(v) = serde_json::from_str::<Value>(&r?) {
                    items.push(v);
                }
            }
        }
        Ok(Value::Array(items))
    }

    fn list_notes(&self, payload: &Value) -> Result<Value, DbError> {
        let kind_filter = payload.get("kind").and_then(|v| v.as_str());
        let include_deleted = payload
            .get("includeDeleted")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let mut stmt =
            conn.prepare("SELECT json_data FROM notes ORDER BY pinned DESC, updated_at DESC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for r in rows {
            if let Ok(val) = serde_json::from_str::<Value>(&r?) {
                let is_deleted = val
                    .get("deletedAt")
                    .map(|d| !d.is_null() && d.as_str().map(|s| !s.is_empty()).unwrap_or(false))
                    .unwrap_or(false);
                if !include_deleted && is_deleted {
                    continue;
                }
                if let Some(kf) = kind_filter {
                    if val.get("kind").and_then(|v| v.as_str()) != Some(kf) {
                        continue;
                    }
                }
                items.push(val);
            }
        }
        Ok(Value::Array(items))
    }

    fn upsert_note(&self, payload: &Value) -> Result<Value, DbError> {
        let mut note_val = payload
            .get("note")
            .cloned()
            .ok_or_else(|| DbError::validation("فیلد note الزامی است."))?;
        let expected_rev = payload.get("expectedRevision").and_then(|v| v.as_i64());

        let id = note_val
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("شناسهٔ یادداشت (note.id) الزامی است."))?
            .to_string();

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;

        let current_rev: Option<i64> = tx
            .query_row(
                "SELECT revision FROM notes WHERE id = ?1",
                params![&id],
                |row| row.get(0),
            )
            .optional()?;

        if let (Some(exp), Some(actual)) = (expected_rev, current_rev) {
            if exp != actual {
                return Err(DbError::conflict(&id, exp, actual));
            }
        }

        let next_rev = current_rev.map(|r| r + 1).unwrap_or(1);
        let updated_at = note_val
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(now_iso_string);
        let kind = note_val
            .get("kind")
            .and_then(|v| v.as_str())
            .unwrap_or("useful_info")
            .to_string();
        let category = note_val
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("work")
            .to_string();
        let pinned = if note_val
            .get("pinned")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            1
        } else {
            0
        };
        let deleted_at = note_val
            .get("deletedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        if let Some(obj) = note_val.as_object_mut() {
            obj.insert("revision".to_string(), json!(next_rev));
            obj.insert("updatedAt".to_string(), json!(updated_at));
        }

        tx.execute(
            "INSERT OR REPLACE INTO notes (id, kind, category, pinned, updated_at, deleted_at, revision, json_data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                kind,
                category,
                pinned,
                updated_at,
                deleted_at,
                next_rev,
                note_val.to_string()
            ],
        )?;

        tx.commit()?;
        Ok(note_val)
    }

    fn soft_delete_row(&self, table: &str, payload: &Value) -> Result<Value, DbError> {
        let id = payload
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("فیلد id الزامی است."))?;
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;
        let select_q = format!("SELECT json_data, revision FROM {} WHERE id = ?1", table);
        let row_opt: Option<(String, i64)> = tx
            .query_row(&select_q, params![id], |row| Ok((row.get(0)?, row.get(1)?)))
            .optional()?;
        if let Some((raw, rev)) = row_opt {
            let mut val: Value =
                serde_json::from_str(&raw).map_err(|e| DbError::storage(e.to_string()))?;
            let now = now_iso_string();
            let next_rev = rev + 1;
            if let Some(obj) = val.as_object_mut() {
                obj.insert("deletedAt".to_string(), json!(now));
                obj.insert("updatedAt".to_string(), json!(now));
                obj.insert("revision".to_string(), json!(next_rev));
            }
            let update_q = format!(
                "UPDATE {} SET deleted_at = ?1, updated_at = ?2, revision = ?3, json_data = ?4 WHERE id = ?5",
                table
            );
            tx.execute(
                &update_q,
                params![now, now, next_rev, val.to_string(), id],
            )?;
        }
        tx.commit()?;
        Ok(Value::Null)
    }

    fn restore_row(&self, table: &str, payload: &Value) -> Result<Value, DbError> {
        let id = payload
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("فیلد id الزامی است."))?;
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;
        let select_q = format!("SELECT json_data, revision FROM {} WHERE id = ?1", table);
        let row_opt: Option<(String, i64)> = tx
            .query_row(&select_q, params![id], |row| Ok((row.get(0)?, row.get(1)?)))
            .optional()?;
        if let Some((raw, rev)) = row_opt {
            let mut val: Value =
                serde_json::from_str(&raw).map_err(|e| DbError::storage(e.to_string()))?;
            let now = now_iso_string();
            let next_rev = rev + 1;
            if let Some(obj) = val.as_object_mut() {
                obj.insert("deletedAt".to_string(), Value::Null);
                obj.insert("updatedAt".to_string(), json!(now));
                obj.insert("revision".to_string(), json!(next_rev));
            }
            let update_q = format!(
                "UPDATE {} SET deleted_at = NULL, updated_at = ?1, revision = ?2, json_data = ?3 WHERE id = ?4",
                table
            );
            tx.execute(&update_q, params![now, next_rev, val.to_string(), id])?;
            tx.commit()?;
            return Ok(val);
        }
        tx.commit()?;
        Ok(Value::Null)
    }

    fn hard_delete_row(&self, table: &str, payload: &Value) -> Result<Value, DbError> {
        let id = payload
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("فیلد id الزامی است."))?;
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;
        let del_q = format!("DELETE FROM {} WHERE id = ?1", table);
        tx.execute(&del_q, params![id])?;
        if table == "habits" {
            tx.execute("DELETE FROM habit_entries WHERE habit_id = ?1", params![id])?;
        }
        tx.commit()?;
        Ok(Value::Null)
    }

    fn list_focus_sessions(&self, payload: &Value) -> Result<Value, DbError> {
        let include_deleted = payload
            .get("includeDeleted")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let mut stmt =
            conn.prepare("SELECT json_data FROM focus_sessions ORDER BY started_at DESC")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut items = Vec::new();
        for r in rows {
            if let Ok(val) = serde_json::from_str::<Value>(&r?) {
                let is_deleted = val
                    .get("deletedAt")
                    .map(|d| !d.is_null() && d.as_str().map(|s| !s.is_empty()).unwrap_or(false))
                    .unwrap_or(false);
                if !include_deleted && is_deleted {
                    continue;
                }
                items.push(val);
            }
        }
        Ok(Value::Array(items))
    }

    fn log_focus_session(&self, payload: &Value) -> Result<Value, DbError> {
        let session_val = payload
            .get("session")
            .cloned()
            .ok_or_else(|| DbError::validation("فیلد session الزامی است."))?;
        let id = session_val
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| DbError::validation("شناسهٔ جلسه تمرکز الزامی است."))?
            .to_string();
        let date_key = session_val
            .get("dateKey")
            .and_then(|v| v.as_str())
            .unwrap_or("2026-01-01")
            .to_string();
        let task_id = session_val
            .get("taskId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let started_at = session_val
            .get("startedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(now_iso_string);
        let updated_at = session_val
            .get("updatedAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(now_iso_string);

        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        // Idempotent INSERT OR REPLACE by session ID so timer resume after sleep never duplicates a session
        conn.execute(
            "INSERT OR REPLACE INTO focus_sessions (id, date_key, task_id, started_at, updated_at, deleted_at, revision, json_data)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, 1, ?6)",
            params![
                id,
                date_key,
                task_id,
                started_at,
                updated_at,
                session_val.to_string()
            ],
        )?;
        Ok(session_val)
    }

    fn get_active_timer(&self) -> Result<Value, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let raw: Option<String> = conn
            .query_row(
                "SELECT json_value FROM kv_state WHERE key = ?1",
                params![ACTIVE_TIMER_STATE_KEY],
                |row| row.get(0),
            )
            .optional()?;
        match raw {
            Some(s) => serde_json::from_str(&s).map_err(|e| DbError::storage(e.to_string())),
            None => Ok(Value::Null),
        }
    }

    fn save_active_timer(&self, payload: &Value) -> Result<Value, DbError> {
        let state_val = payload.get("state").cloned().unwrap_or(Value::Null);
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        if state_val.is_null() {
            conn.execute(
                "DELETE FROM kv_state WHERE key = ?1",
                params![ACTIVE_TIMER_STATE_KEY],
            )?;
        } else {
            conn.execute(
                "INSERT OR REPLACE INTO kv_state (key, updated_at, json_value) VALUES (?1, ?2, ?3)",
                params![
                    ACTIVE_TIMER_STATE_KEY,
                    now_iso_string(),
                    state_val.to_string()
                ],
            )?;
        }
        Ok(Value::Null)
    }

    fn get_settings(&self) -> Result<Value, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        Self::read_settings(&conn)
    }

    fn read_settings(conn: &Connection) -> Result<Value, DbError> {
        let raw: Option<String> = conn
            .query_row(
                "SELECT json_data FROM settings WHERE id = 'default'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        match raw {
            Some(s) => serde_json::from_str(&s).map_err(|e| DbError::storage(e.to_string())),
            None => Ok(json!({
                "id": "default",
                "theme": "system",
                "soundEnabled": true,
                "pomodoroWorkMinutes": 45,
                "pomodoroShortBreakMinutes": 10,
                "pomodoroLongBreakMinutes": 20,
                "pomodoroCyclesBeforeLongBreak": 4,
                "calendarPreference": "jalali",
                "updatedAt": now_iso_string()
            })),
        }
    }

    fn save_settings(&self, payload: &Value) -> Result<Value, DbError> {
        let partial = payload
            .get("settings")
            .and_then(|v| v.as_object())
            .ok_or_else(|| DbError::validation("فیلد settings الزامی است."))?;
        if partial.contains_key("planning") { return Err(DbError::validation("این نسخه از مخزن مستقل برنامه‌ریزی استفاده می‌کند؛ رابط برنامه را به‌روز کن.")); }

        // Read, compare and write while holding the same database lock.
        let conn = self.conn.lock().map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let raw: String = conn.query_row("SELECT json_data FROM settings WHERE id = 'default'", [], |row| row.get(0))?;
        let mut current: Value = serde_json::from_str(&raw).map_err(|e| DbError::storage(e.to_string()))?;
        let now = now_iso_string();
        if let Some(obj) = current.as_object_mut() {
            for (k, v) in partial {
                obj.insert(k.clone(), v.clone());
            }
            obj.insert("id".to_string(), json!("default"));
            obj.insert("updatedAt".to_string(), json!(now));
        }

        conn.execute(
            "INSERT OR REPLACE INTO settings (id, updated_at, json_data) VALUES ('default', ?1, ?2)",
            params![now, current.to_string()],
        )?;
        Ok(current)
    }

    fn read_planning_records(conn: &Connection) -> Result<Vec<Value>, DbError> {
        let mut statement=conn.prepare("SELECT json_data FROM planning_records ORDER BY key")?;
        let rows=statement.query_map([],|row|row.get::<_,String>(0))?;
        let mut records=Vec::new();for raw in rows {records.push(serde_json::from_str(&raw?).map_err(|e|DbError::storage(e.to_string()))?);}Ok(records)
    }

    fn planning_revision(conn: &Connection) -> Result<i64, DbError> {
        let raw: String = conn.query_row("SELECT json_data FROM planning_records WHERE key='meta'", [], |row| row.get(0))?;
        let meta: Value = serde_json::from_str(&raw).map_err(|e| DbError::storage(e.to_string()))?;
        meta.pointer("/value/revision").and_then(Value::as_i64)
            .ok_or_else(|| DbError::storage("نسخهٔ جاری برنامه‌ریزی نامعتبر است."))
    }

    fn ensure_planning_records(&self) -> Result<(), DbError> {
        let mut conn=self.conn.lock().map_err(|_|DbError::storage("قفل پایگاه‌داده در دسترس نیست."))?;
        let tx=conn.transaction()?;
        let present:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM planning_records WHERE key='meta')",[],|r|r.get(0))?;
        if !present {
            let raw:Option<String>=tx.query_row("SELECT json_data FROM settings WHERE id='default'",[],|r|r.get(0)).optional()?;
            let mut settings:Value=raw.as_ref().map(|s|serde_json::from_str(s)).transpose().map_err(|e|DbError::storage(e.to_string()))?.unwrap_or(json!({"id":"default"}));
            let legacy=settings.get("planning").cloned();let state=legacy.clone().unwrap_or_else(planning::empty_state);
            let records=planning::split(&state)?;
            if let Some(legacy)=legacy {tx.execute("INSERT OR IGNORE INTO kv_state (key,updated_at,json_value) VALUES (?1,?2,?3)",params![planning::RECOVERY_KEY,now_iso_string(),legacy.to_string()])?;}
            for record in records {tx.execute("INSERT INTO planning_records (key,json_data) VALUES (?1,?2)",params![record["key"].as_str(),record.to_string()])?;}
            let verified=planning::join(&Self::read_planning_records(&tx)?)?;
            if verified!=state {return Err(DbError::storage("تأیید مهاجرت برنامه‌ریزی شکست خورد؛ دادهٔ قبلی حفظ شد."));}
            if let Some(settings)=settings.as_object_mut() {settings.remove("planning");}
            if raw.is_some(){tx.execute("UPDATE settings SET json_data=?1 WHERE id='default'",params![settings.to_string()])?;}
            tx.execute("INSERT OR IGNORE INTO schema_migrations (version,applied_at) VALUES (4,?1)",params![now_iso_string()])?;
        }
        tx.commit()?;Ok(())
    }

    fn get_planning_page(&self,payload:&Value)->Result<Value,DbError>{
        self.ensure_planning_records()?;
        let mut conn=self.conn.lock().map_err(|_|DbError::storage("قفل پایگاه‌داده در دسترس نیست."))?;let tx=conn.transaction()?;
        let revision = Self::planning_revision(&tx)?;
        if let Some(expected)=payload.get("expectedRevision").and_then(Value::as_i64){if expected!=revision{return Err(DbError::conflict("planning",expected,revision));}}
        let cursor = match payload.get("cursor") {
            None | Some(Value::Null) => 0,
            Some(value) => value.as_i64().filter(|n| *n >= 0)
                .ok_or_else(|| DbError::validation("شمارهٔ صفحه باید عدد صحیح نامنفی باشد."))?,
        };
        let total: i64 = tx.query_row("SELECT COUNT(*) FROM planning_records", [], |row| row.get(0))?;
        if cursor>total{return Err(DbError::validation("صفحهٔ برنامه‌ریزی نامعتبر است."));}
        let mut page=Vec::new();let mut bytes=0;let mut next=cursor;
        {let mut statement=tx.prepare("SELECT json_data FROM planning_records ORDER BY key LIMIT -1 OFFSET ?1")?;let rows=statement.query_map(params![cursor],|row|row.get::<_,String>(0))?;
        for raw in rows {let raw=raw?;let size=raw.len();if !page.is_empty()&&bytes+size>planning::PAGE_LIMIT{break;}bytes+=size;page.push(serde_json::from_str::<Value>(&raw).map_err(|e|DbError::storage(e.to_string()))?);next+=1;}}
        tx.commit()?;Ok(json!({"revision":revision,"records":page,"nextCursor":if next<total{Some(next)}else{None}}))
    }

    fn save_planning_patch(&self,payload:&Value)->Result<Value,DbError>{
        self.ensure_planning_records()?;
        let mut conn=self.conn.lock().map_err(|_|DbError::storage("قفل پایگاه‌داده در دسترس نیست."))?;let tx=conn.transaction()?;
        if let Some(expected)=payload.get("expectedTaskRevisions").and_then(Value::as_object){
            let mut statement=tx.prepare("SELECT id,revision FROM tasks WHERE deleted_at IS NULL OR deleted_at='' ")?;
            let rows=statement.query_map([],|row|Ok((row.get::<_,String>(0)?,row.get::<_,i64>(1)?)))?;
            let mut count=0;for row in rows {let(id,revision)=row?;count+=1;if expected.get(&id).and_then(Value::as_i64)!=Some(revision){return Err(DbError::conflict("tasks",-1,-1));}}
            if count!=expected.len(){return Err(DbError::conflict("tasks",-1,-1));}
        }
        if let Some(task) = payload.get("createTask").filter(|v| !v.is_null()) {
            let id = task["id"].as_str().ok_or_else(|| DbError::validation("شناسهٔ کار الزامی است."))?;
            let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM tasks WHERE id=?1)", [id], |row| row.get(0))?;
            if exists { return Err(DbError::conflict(id, 0, 1)); }
            Self::upsert_task_in_tx(&tx, task.clone(), None)?;
        }
        let actual = Self::planning_revision(&tx)?;
        let expected=payload.get("expectedRevision").and_then(Value::as_i64).unwrap_or(-1);let revision=payload.get("revision").and_then(Value::as_i64).unwrap_or(-1);
        if !(0..9_007_199_254_740_991_i64).contains(&actual) {
            return Err(DbError::validation("نسخهٔ برنامه‌ریزی خارج از محدوده است."));
        }
        if actual!=expected||revision!=actual+1{return Err(DbError::conflict("planning",expected,actual));}
        if payload.get("storageVersion").and_then(Value::as_i64)!=Some(1){return Err(DbError::validation("نسخهٔ ذخیره‌سازی برنامه‌ریزی نامعتبر است."));}
        let upserts=payload.get("upserts").and_then(Value::as_array).ok_or_else(||DbError::validation("تغییرهای برنامه‌ریزی نامعتبرند."))?;
        let deletes=payload.get("deletes").and_then(Value::as_array).ok_or_else(||DbError::validation("تغییرهای برنامه‌ریزی نامعتبرند."))?;
        for row in upserts {planning::validate_record(row)?;tx.execute("INSERT OR REPLACE INTO planning_records (key,json_data) VALUES (?1,?2)",params![row["key"].as_str(),row.to_string()])?;}
        for key in deletes {let key=key.as_str().ok_or_else(||DbError::validation("شناسهٔ تغییر نامعتبر است."))?;tx.execute("DELETE FROM planning_records WHERE key=?1",params![key])?;}
        let state=planning::join(&Self::read_planning_records(&tx)?)?;
        if state.get("revision").and_then(Value::as_i64)!=Some(revision){return Err(DbError::validation("نسخهٔ رکورد پایه با تغییرها سازگار نیست."));}
        tx.commit()?;Ok(json!({"revision":revision}))
    }

    fn export_backup(&self) -> Result<Value, DbError> {
        self.ensure_planning_records()?;
        let mut conn = self.conn.lock().map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;
        let envelope = Self::backup_in_tx(&tx)?;
        tx.commit()?;
        Ok(envelope)
    }

    fn backup_in_tx(tx: &rusqlite::Transaction<'_>) -> Result<Value, DbError> {
        let mut backup_payload = json!({
            "settings": Self::read_settings(tx)?,
            "planning": planning::join(&Self::read_planning_records(tx)?)?,
        });
        for (name, query) in [
            ("tasks", "SELECT json_data FROM tasks ORDER BY priority ASC, updated_at DESC"),
            ("habits", "SELECT json_data FROM habits ORDER BY updated_at DESC"),
            ("habitEntries", "SELECT json_data FROM habit_entries"),
            ("notes", "SELECT json_data FROM notes ORDER BY pinned DESC, updated_at DESC"),
            ("focusSessions", "SELECT json_data FROM focus_sessions ORDER BY started_at DESC"),
        ] {
            let mut statement = tx.prepare(query)?;
            let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
            let mut items = Vec::new();
            for row in rows {
                let item = serde_json::from_str(&row?).map_err(|e| DbError::storage(e.to_string()))?;
                items.push(item);
            }
            backup_payload[name] = Value::Array(items);
        }

        let payload_str = backup_payload.to_string();
        if payload_str.len()+2048>crate::MAX_BRIDGE_PAYLOAD_BYTES {return Err(DbError{code:"PAYLOAD_TOO_LARGE".to_string(),message:"اندازهٔ پشتیبان بومی از محدودیت ۵ میبی‌بایت پل بیشتر است؛ خروجی ساخته نشد و داده‌ها تغییری نکردند.".to_string()});}
        let checksum = compute_fnv1a_checksum(&payload_str);

        Ok(json!({
            "appId": "kairos",
            "app": "Kairos",
            "formatVersion": 2,
            "schemaVersion": 2,
            "exportedAt": now_iso_string(),
            "platform": "windows_desktop",
            "encrypted": false,
            "checksum": checksum,
            "payload": backup_payload
        }))
    }

    fn restore_backup(&self, payload: &Value) -> Result<Value, DbError> {
        let envelope = payload
            .get("envelope")
            .ok_or_else(|| DbError::validation("فیلد envelope الزامی است."))?;
        let strategy = payload
            .get("strategy")
            .and_then(|v| v.as_str())
            .unwrap_or("replace");

        let data_payload = envelope
            .get("payload")
            .ok_or_else(|| DbError::validation("فیلد envelope.payload الزامی است."))?;
        if !matches!(strategy, "replace" | "merge") {
            return Err(DbError::validation("روش بازیابی نامعتبر است."));
        }
        self.ensure_planning_records()?;

        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;
        let snapshot_envelope = Self::backup_in_tx(&tx)?;
        let snap_now = now_iso_string();
        if strategy == "merge" && [
            snapshot_envelope.pointer("/payload/planning"),
            data_payload.get("planning"),
            data_payload.pointer("/settings/planning"),
        ].into_iter().flatten().any(planning::has_content) {
            return Err(DbError::validation("ادغام برنامه‌ریزی پشتیبانی نمی‌شود؛ از جایگزینی کامل استفاده کن."));
        }

        tx.execute(
            "INSERT OR REPLACE INTO kv_state (key, updated_at, json_value) VALUES (?1, ?2, ?3)",
            params![
                PRE_RESTORE_SNAPSHOT_KEY,
                snap_now,
                snapshot_envelope.to_string()
            ],
        )?;

        Self::apply_payload_in_tx(&tx, data_payload, strategy)?;
        tx.commit()?;

        let tasks_count = data_payload
            .get("tasks")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        let habits_count = data_payload
            .get("habits")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        let notes_count = data_payload
            .get("notes")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        let focus_count = data_payload
            .get("focusSessions")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);

        Ok(json!({
            "restoredCounts": {
                "tasks": tasks_count,
                "habits": habits_count,
                "notes": notes_count,
                "focusSessions": focus_count
            },
            "snapshotKey": PRE_RESTORE_SNAPSHOT_KEY
        }))
    }

    fn apply_payload_in_tx(
        tx: &rusqlite::Transaction<'_>,
        data_payload: &Value,
        strategy: &str,
    ) -> Result<(), DbError> {
        if strategy=="replace" {
            let mut state=data_payload.get("planning").or_else(||data_payload.pointer("/settings/planning")).cloned().unwrap_or_else(planning::empty_state);
            let current = Self::planning_revision(tx)?;
            let imported = state["revision"].as_i64().ok_or_else(|| DbError::validation("نسخهٔ پشتیبان برنامه‌ریزی نامعتبر است."))?;
            let limit: i64 = 9_007_199_254_740_991;
            if !(0..limit).contains(&current) || !(0..=limit).contains(&imported) {
                return Err(DbError::validation("نسخهٔ برنامه‌ریزی خارج از محدوده است."));
            }
            state["revision"] = json!(imported.max(current + 1));
            let records=planning::split(&state)?;
            tx.execute("DELETE FROM planning_records",[])?;
            for record in records {tx.execute("INSERT INTO planning_records (key,json_data) VALUES (?1,?2)",params![record["key"].as_str(),record.to_string()])?;}
        }
        if strategy == "replace" {
            tx.execute_batch(
                "DELETE FROM tasks;
                 DELETE FROM habits;
                 DELETE FROM habit_entries;
                 DELETE FROM notes;
                 DELETE FROM focus_sessions;",
            )?;
        }

        if let Some(tasks) = data_payload.get("tasks").and_then(|v| v.as_array()) {
            for t in tasks {
                let _ = Self::upsert_task_in_tx(tx, t.clone(), None)?;
            }
        }

        if let Some(habits) = data_payload.get("habits").and_then(|v| v.as_array()) {
            for h in habits {
                if let Some(id) = h.get("id").and_then(|v| v.as_str()) {
                    let category = h
                        .get("category")
                        .and_then(|v| v.as_str())
                        .unwrap_or("health");
                    let archived = if h.get("archived").and_then(|v| v.as_bool()).unwrap_or(false)
                    {
                        1
                    } else {
                        0
                    };
                    let updated_at = h
                        .get("updatedAt")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(now_iso_string);
                    let deleted_at = h.get("deletedAt").and_then(|v| v.as_str());
                    let rev = h.get("revision").and_then(|v| v.as_i64()).unwrap_or(1);
                    tx.execute(
                        "INSERT OR REPLACE INTO habits (id, category, archived, updated_at, deleted_at, revision, json_data)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![id, category, archived, updated_at, deleted_at, rev, h.to_string()],
                    )?;
                }
            }
        }

        if let Some(entries) = data_payload.get("habitEntries").and_then(|v| v.as_array()) {
            for e in entries {
                if let (Some(id), Some(hid), Some(dk)) = (
                    e.get("id").and_then(|v| v.as_str()),
                    e.get("habitId").and_then(|v| v.as_str()),
                    e.get("dateKey").and_then(|v| v.as_str()),
                ) {
                    let completed = if e
                        .get("completed")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true)
                    {
                        1
                    } else {
                        0
                    };
                    let updated_at = e
                        .get("updatedAt")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(now_iso_string);
                    let deleted_at = e.get("deletedAt").and_then(|v| v.as_str());
                    let rev = e.get("revision").and_then(|v| v.as_i64()).unwrap_or(1);
                    tx.execute(
                        "INSERT OR REPLACE INTO habit_entries (id, habit_id, date_key, completed, updated_at, deleted_at, revision, json_data)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![id, hid, dk, completed, updated_at, deleted_at, rev, e.to_string()],
                    )?;
                }
            }
        }

        if let Some(notes) = data_payload.get("notes").and_then(|v| v.as_array()) {
            for n in notes {
                if let Some(id) = n.get("id").and_then(|v| v.as_str()) {
                    let kind = n
                        .get("kind")
                        .and_then(|v| v.as_str())
                        .unwrap_or("useful_info");
                    let category = n.get("category").and_then(|v| v.as_str()).unwrap_or("work");
                    let pinned = if n.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false) {
                        1
                    } else {
                        0
                    };
                    let updated_at = n
                        .get("updatedAt")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(now_iso_string);
                    let deleted_at = n.get("deletedAt").and_then(|v| v.as_str());
                    let rev = n.get("revision").and_then(|v| v.as_i64()).unwrap_or(1);
                    tx.execute(
                        "INSERT OR REPLACE INTO notes (id, kind, category, pinned, updated_at, deleted_at, revision, json_data)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![id, kind, category, pinned, updated_at, deleted_at, rev, n.to_string()],
                    )?;
                }
            }
        }

        if let Some(sessions) = data_payload.get("focusSessions").and_then(|v| v.as_array()) {
            for s in sessions {
                if let Some(id) = s.get("id").and_then(|v| v.as_str()) {
                    let date_key = s
                        .get("dateKey")
                        .and_then(|v| v.as_str())
                        .unwrap_or("2026-01-01");
                    let task_id = s.get("taskId").and_then(|v| v.as_str());
                    let started_at = s
                        .get("startedAt")
                        .and_then(|v| v.as_str())
                        .map(|st| st.to_string())
                        .unwrap_or_else(now_iso_string);
                    let updated_at = s
                        .get("updatedAt")
                        .and_then(|v| v.as_str())
                        .map(|up| up.to_string())
                        .unwrap_or_else(now_iso_string);
                    let deleted_at = s.get("deletedAt").and_then(|v| v.as_str());
                    let rev = s.get("revision").and_then(|v| v.as_i64()).unwrap_or(1);
                    tx.execute(
                        "INSERT OR REPLACE INTO focus_sessions (id, date_key, task_id, started_at, updated_at, deleted_at, revision, json_data)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![id, date_key, task_id, started_at, updated_at, deleted_at, rev, s.to_string()],
                    )?;
                }
            }
        }

        if let Some(settings) = data_payload.get("settings") {
            if settings.is_object() {
                let mut settings=settings.clone();if let Some(object)=settings.as_object_mut(){object.remove("planning");}
                let now = now_iso_string();
                tx.execute(
                    "INSERT OR REPLACE INTO settings (id, updated_at, json_data) VALUES ('default', ?1, ?2)",
                    params![now, settings.to_string()],
                )?;
            }
        } else if strategy == "replace" {
            let raw: Option<String> = tx.query_row("SELECT json_data FROM settings WHERE id = 'default'", [], |row| row.get(0)).optional()?;
            if let Some(raw) = raw {
                let mut settings: Value = serde_json::from_str(&raw).map_err(|e| DbError::storage(e.to_string()))?;
                if let Some(obj) = settings.as_object_mut() { obj.remove("planning"); }
                tx.execute("UPDATE settings SET updated_at = ?1, json_data = ?2 WHERE id = 'default'", params![now_iso_string(), settings.to_string()])?;
            }
        }

        Ok(())
    }

    fn has_pre_restore_snapshot(&self) -> Result<Value, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let updated_at: Option<String> = conn
            .query_row(
                "SELECT updated_at FROM kv_state WHERE key = ?1",
                params![PRE_RESTORE_SNAPSHOT_KEY],
                |row| row.get(0),
            )
            .optional()?;
        match updated_at {
            Some(ts) => Ok(json!({ "exists": true, "createdAt": ts })),
            None => Ok(json!({ "exists": false })),
        }
    }

    fn rollback_last_restore(&self) -> Result<Value, DbError> {
        self.ensure_planning_records()?;
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| DbError::storage("قفل دیتابیس در دسترس نیست."))?;
        let tx = conn.transaction()?;

        let raw: Option<String> = tx
            .query_row(
                "SELECT json_value FROM kv_state WHERE key = ?1",
                params![PRE_RESTORE_SNAPSHOT_KEY],
                |row| row.get(0),
            )
            .optional()?;

        let raw_snap = raw.ok_or_else(|| {
            DbError::validation("هیچ اسنپ‌شات پیش از بازیابی در دیتابیس ویندوز یافت نشد.")
        })?;
        let snap_env: Value =
            serde_json::from_str(&raw_snap).map_err(|e| DbError::storage(e.to_string()))?;
        let snap_payload = snap_env
            .get("payload")
            .ok_or_else(|| DbError::storage("ساختار اسنپ‌شات ذخیره شده نامعتبر است."))?;

        Self::apply_payload_in_tx(&tx, snap_payload, "replace")?;
        tx.execute(
            "DELETE FROM kv_state WHERE key = ?1",
            params![PRE_RESTORE_SNAPSHOT_KEY],
        )?;
        tx.commit()?;

        Ok(json!({
            "restoredCounts": {
                "tasks": snap_payload.get("tasks").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "habits": snap_payload.get("habits").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "notes": snap_payload.get("notes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                "focusSessions": snap_payload.get("focusSessions").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0)
            }
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_iso_timestamp(value: &Value) {
        let timestamp = value.as_str().expect("timestamp must be a string");
        OffsetDateTime::parse(timestamp, &time::format_description::well_known::Rfc3339).expect("timestamp must be valid RFC3339");
        assert_eq!(timestamp.len(), 24, "use the same millisecond precision as JavaScript");
        assert!(timestamp.ends_with('Z'), "timestamp must explicitly use UTC");
    }

    #[test]
    fn native_clock_returns_javascript_compatible_utc_timestamps() {
        assert_iso_timestamp(&json!(now_iso_string()));
    }

    #[test]
    fn settings_trash_and_backup_keep_valid_iso_timestamps() {
        let db = KairosSqliteDatabase {
            db_path: PathBuf::from(":memory:"),
            conn: Mutex::new(Connection::open_in_memory().expect("open test database")),
        };
        db.run_migrations().expect("initialize test schema");

        let initial_settings = db.get_settings().expect("read initial settings");
        assert_iso_timestamp(&initial_settings["updatedAt"]);
        let saved_settings = db
            .save_settings(&json!({ "settings": { "theme": "dark" } }))
            .expect("save settings");
        assert_iso_timestamp(&saved_settings["updatedAt"]);

        let task = db
            .upsert_task(&json!({ "task": {
                "id": "iso-regression-task",
                "title": "Timestamp regression",
                "targetDate": "2026-11-17",
                "createdAt": now_iso_string(),
                "duration": 20,
                "completed": false
            } }))
            .expect("create task with a native update timestamp");
        assert_iso_timestamp(&task["updatedAt"]);
        db.soft_delete_row("tasks", &json!({ "id": "iso-regression-task" }))
            .expect("move task to trash");

        let backup = db.export_backup().expect("export native backup");
        assert_iso_timestamp(&backup["exportedAt"]);
        assert_iso_timestamp(&backup["payload"]["settings"]["updatedAt"]);
        let trashed_task = &backup["payload"]["tasks"][0];
        assert_eq!(trashed_task["id"], "iso-regression-task");
        assert_iso_timestamp(&trashed_task["deletedAt"]);
        assert_iso_timestamp(&trashed_task["updatedAt"]);
    }

    #[test]
    fn legacy_timestamp_migration_preserves_trash_and_restore_snapshots() {
        let db = KairosSqliteDatabase {
            db_path: PathBuf::from(":memory:"),
            conn: Mutex::new(Connection::open_in_memory().expect("open test database")),
        };
        db.run_migrations().expect("initialize test schema");
        let old_task = json!({
            "id": "legacy-trash", "title": "Keep this task", "description": "unix_0",
            "createdAt": "unix_0", "updatedAt": "unix_1000", "deletedAt": "unix_1000",
            "targetDate": "2026-11-17", "completed": false, "revision": 7,
            "planning": { "resume": "unix_0" }
        });
        let old_snapshot = json!({
            "exportedAt": "unix_1000", "checksum": "old-checksum",
            "payload": { "tasks": [old_task.clone()] }
        });
        {
            let conn = db.conn.lock().expect("lock test database");
            // Simulate an existing version-2 database before startup migration.
            conn.execute("DELETE FROM schema_migrations WHERE version = 3", []).unwrap();
            conn.execute(
                "INSERT INTO tasks (id, target_date, updated_at, deleted_at, revision, json_data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params!["legacy-trash", "2026-11-17", "unix_1000", "unix_1000", 7, old_task.to_string()],
            ).unwrap();
            conn.execute(
                "INSERT INTO kv_state (key, updated_at, json_value) VALUES (?1, ?2, ?3)",
                params![PRE_RESTORE_SNAPSHOT_KEY, "unix_1000", old_snapshot.to_string()],
            ).unwrap();
        }

        db.run_migrations().expect("migrate legacy timestamps");
        let task = db.get_by_id("tasks", &json!({ "id": "legacy-trash" })).unwrap();
        assert_eq!(task["createdAt"], "1970-01-01T00:00:00.000Z");
        assert_eq!(task["updatedAt"], "1970-01-01T00:16:40.000Z");
        assert_eq!(task["deletedAt"], "1970-01-01T00:16:40.000Z");
        assert_eq!(task["revision"], 7);
        assert_eq!(task["description"], "unix_0");
        assert_eq!(task["planning"]["resume"], "unix_0");
        {
            let conn = db.conn.lock().unwrap();
            let (updated, deleted): (String, String) = conn.query_row(
                "SELECT updated_at, deleted_at FROM tasks WHERE id = 'legacy-trash'", [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).unwrap();
            assert_eq!(updated, task["updatedAt"].as_str().unwrap());
            assert_eq!(deleted, task["deletedAt"].as_str().unwrap());
            let raw: String = conn.query_row(
                "SELECT json_value FROM kv_state WHERE key = ?1", params![PRE_RESTORE_SNAPSHOT_KEY],
                |row| row.get(0),
            ).unwrap();
            let snapshot: Value = serde_json::from_str(&raw).unwrap();
            assert_iso_timestamp(&snapshot["exportedAt"]);
            assert_eq!(snapshot["payload"]["tasks"][0]["deletedAt"], task["deletedAt"]);
            assert_eq!(snapshot["checksum"], compute_fnv1a_checksum(&snapshot["payload"].to_string()));
        }
        db.run_migrations().expect("migration is idempotent");
        assert_eq!(db.get_by_id("tasks", &json!({ "id": "legacy-trash" })).unwrap(), task);
        for malformed in ["unix_", "unix_bad", "unix_-1", "unix_999999999999999999999999"] {
            assert!(legacy_timestamp_to_iso(malformed).is_none());
        }
    }
}
