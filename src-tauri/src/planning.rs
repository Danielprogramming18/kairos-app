use crate::db::DbError;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

pub const RECORD_LIMIT: usize = 256 * 1024;
pub const PAGE_LIMIT: usize = 512 * 1024;
pub const STATE_LIMIT: usize = 16 * 1024 * 1024;
pub const RECOVERY_KEY: &str = "kairos_planning_settings_recovery_v1";

const ENTITY_GROUPS: [&str; 7] = [
    "projects", "templates", "events", "availability", "commitments", "feedback", "predictions",
];
const SLOT_GROUPS: [&str; 2] = ["allocations", "previousAllocations"];

pub fn empty_state() -> Value {
    json!({
        "schemaVersion": 1, "revision": 0, "projects": [], "templates": [], "events": [],
        "metrics": [], "availability": [], "commitments": [], "excludedDates": [], "allocations": [],
        "layout": {
            "desktop": {"order": [], "hidden": [], "pinned": []},
            "mobile": {"order": [], "hidden": [], "pinned": []}
        },
        "breakMinutes": 0, "minimumSamples": 3, "feedback": [], "predictions": []
    })
}

pub fn has_content(state: &Value) -> bool {
    let populated = ENTITY_GROUPS.iter().chain(SLOT_GROUPS.iter()).chain(["metrics", "excludedDates"].iter())
        .any(|&group| state[group].as_array().is_some_and(|items| !items.is_empty()));
    if populated || state["breakMinutes"] != 0 || state["minimumSamples"] != 3 {
        return true;
    }
    // Recognize both the old sparse defaults and the explicit menu layout saved by the web app.
    let order = ["dashboard", "workspace", "projects", "calendar", "pomodoro", "habits",
        "useful_info", "events", "tracking", "capacity", "planner", "analytics", "sync"];
    ["desktop", "mobile"].iter().any(|&mode| {
        let menu = &state["layout"][mode];
        let empty = json!([]);
        let default_main = if mode == "desktop" { &order[..5] } else { &order[..3] };
        menu["pinned"] != empty || menu["hidden"] != empty
            || (menu["order"] != empty && menu["order"] != json!(order))
            || menu.get("main").is_some_and(|main| main != &json!(default_main))
            || (menu.get("main").is_none() && menu["order"] != empty)
    })
}

// Match JavaScript's encodeURIComponent exactly for persistent keys, including UTF-8 identifiers.
fn encode(value: &str) -> String {
    let mut result = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            result.push(byte as char);
        } else {
            result.push_str(&format!("%{:02X}", byte));
        }
    }
    result
}

fn key(collection: &str, id: &str) -> String {
    format!("{}:{}", collection, encode(id))
}

fn record(collection: &str, id: &str, position: usize, value: &Value) -> Value {
    json!({ "key": key(collection, id), "collection": collection, "position": position, "value": value })
}

fn array<'a>(value: &'a Value, field: &str) -> Result<&'a Vec<Value>, DbError> {
    value[field].as_array().ok_or_else(|| DbError::validation(format!("فهرست {} نامعتبر است.", field)))
}

fn text<'a>(value: &'a Value, field: &str) -> Result<&'a str, DbError> {
    value[field].as_str().filter(|s| !s.is_empty())
        .ok_or_else(|| DbError::validation(format!("فیلد {} در برنامه‌ریزی نامعتبر است.", field)))
}

pub fn validate_record(row: &Value) -> Result<(), DbError> {
    let id = text(row, "key")?;
    let group = text(row, "collection")?;
    let known = ENTITY_GROUPS.contains(&group) || SLOT_GROUPS.contains(&group)
        || matches!(group, "meta" | "metrics" | "metricEntries" | "excludedDates");
    if id.len() > 2048 || !known || (id == "meta") != (group == "meta")
        || row["position"].as_u64().is_none() || row.get("value").is_none() {
        return Err(DbError::validation("رکورد برنامه‌ریزی نامعتبر است."));
    }
    if row.to_string().len() > RECORD_LIMIT {
        return Err(DbError::validation("اندازهٔ رکورد برنامه‌ریزی از ۲۵۶ کیبی‌بایت بیشتر است."));
    }
    Ok(())
}

pub fn split(state: &Value) -> Result<Vec<Value>, DbError> {
    if state["schemaVersion"] != 1 || state["revision"].as_u64().is_none()
        || state["revision"].as_u64().unwrap_or(0) > 9_007_199_254_740_991 {
        return Err(DbError::validation("نسخهٔ اطلاعات برنامه‌ریزی نامعتبر است."));
    }
    if state.to_string().len() > STATE_LIMIT {
        return Err(DbError::validation("اطلاعات برنامه‌ریزی بیش از ۱۶ میبی‌بایت است."));
    }
    let mut preferences = state.as_object().cloned().ok_or_else(|| DbError::validation("اطلاعات برنامه‌ریزی نامعتبر است."))?;
    for &group in ENTITY_GROUPS.iter().chain(SLOT_GROUPS.iter()).chain(["metrics", "excludedDates"].iter()) {
        preferences.remove(group);
    }
    preferences.insert("storageVersion".into(), json!(1));
    preferences.insert("previousAllocationsPresent".into(), json!(state.get("previousAllocations").is_some()));
    let mut rows = vec![json!({"key": "meta", "collection": "meta", "position": 0, "value": preferences})];

    for group in ENTITY_GROUPS {
        for (position, item) in array(state, group)?.iter().enumerate() {
            rows.push(record(group, text(item, "id")?, position, item));
        }
    }
    for (position, metric) in array(state, "metrics")?.iter().enumerate() {
        let id = text(metric, "id")?;
        let mut definition = metric.as_object().cloned().ok_or_else(|| DbError::validation("شاخص نامعتبر است."))?;
        definition.remove("entries");
        rows.push(record("metrics", id, position, &Value::Object(definition)));
        for (entry_position, entry) in array(metric, "entries")?.iter().enumerate() {
            rows.push(json!({
                "key": format!("{}/{}", key("metricEntries", id), encode(text(entry, "id")?)),
                "collection": "metricEntries", "ownerId": id, "position": entry_position, "value": entry
            }));
        }
    }
    for group in SLOT_GROUPS {
        if group == "previousAllocations" && state.get(group).is_none() { continue; }
        let mut duplicates = HashMap::<String, usize>::new();
        for (position, slot) in array(state, group)?.iter().enumerate() {
            let identity = format!("{}/{}", text(slot, "taskId")?, text(slot, "start")?);
            let occurrence = duplicates.entry(identity.clone()).or_default();
            rows.push(json!({
                "key": format!("{}/{}", key(group, &identity), occurrence),
                "collection": group, "position": position, "value": slot
            }));
            *occurrence += 1;
        }
    }
    for (position, date) in array(state, "excludedDates")?.iter().enumerate() {
        let id = date.as_str().ok_or_else(|| DbError::validation("تاریخ نامعتبر است."))?;
        rows.push(record("excludedDates", id, position, date));
    }
    let mut keys = HashSet::new();
    for row in &rows {
        validate_record(row)?;
        if !keys.insert(text(row, "key")?) { return Err(DbError::validation("شناسهٔ تکراری در برنامه‌ریزی.")); }
    }
    Ok(rows)
}

pub fn join(rows: &[Value]) -> Result<Value, DbError> {
    if rows.is_empty() { return Ok(empty_state()); }
    let meta = rows.iter().find(|r| r["key"] == "meta").and_then(|r| r["value"].as_object())
        .ok_or_else(|| DbError::storage("اطلاعات پایهٔ برنامه‌ریزی وجود ندارد."))?;
    if meta.get("storageVersion") != Some(&json!(1)) {
        return Err(DbError::validation("نسخهٔ ذخیره‌سازی برنامه‌ریزی پشتیبانی نمی‌شود."));
    }
    let mut state = meta.clone();
    state.remove("storageVersion");
    let previous = state.remove("previousAllocationsPresent").and_then(|v| v.as_bool()).unwrap_or(false);
    let mut groups: HashMap<&str, Vec<&Value>> = HashMap::new();
    for row in rows {
        groups.entry(text(row, "collection")?).or_default().push(row);
    }
    for group in groups.values_mut() {
        group.sort_by_key(|row| row["position"].as_u64().unwrap_or(0));
    }
    for &group in ENTITY_GROUPS.iter().chain(SLOT_GROUPS.iter()).chain(["excludedDates"].iter()) {
        if group == "previousAllocations" && !previous { continue; }
        let values = groups.remove(group).unwrap_or_default().into_iter().map(|row| row["value"].clone()).collect();
        state.insert(group.into(), Value::Array(values));
    }
    let mut entries = HashMap::<&str, Vec<Value>>::new();
    for row in groups.remove("metricEntries").unwrap_or_default() {
        entries.entry(text(row, "ownerId")?).or_default().push(row["value"].clone());
    }
    let mut metrics = Vec::new();
    for row in groups.remove("metrics").unwrap_or_default() {
        let definition = &row["value"];
        let mut metric = definition.as_object().cloned().ok_or_else(|| DbError::storage("رکورد شاخص نامعتبر است."))?;
        metric.insert("entries".into(), Value::Array(entries.remove(text(definition, "id")?).unwrap_or_default()));
        metrics.push(Value::Object(metric));
    }
    if !entries.is_empty() { return Err(DbError::storage("برای یک اندازه‌گیری شاخص متناظر وجود ندارد.")); }
    state.insert("metrics".into(), Value::Array(metrics));
    let result = Value::Object(state);
    if result.to_string().len() > STATE_LIMIT { return Err(DbError::validation("اطلاعات برنامه‌ریزی بیش از حد مجاز است.")); }
    Ok(result)
}
