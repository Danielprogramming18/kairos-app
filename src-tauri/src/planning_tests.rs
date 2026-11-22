use super::*;

fn database() -> KairosSqliteDatabase {
    let db=KairosSqliteDatabase{db_path:PathBuf::from(":memory:"),conn:Mutex::new(Connection::open_in_memory().unwrap())};
    db.run_migrations().unwrap();db
}
fn state() -> Value {
    let mut state=planning::empty_state();state["revision"]=json!(1);state["projects"]=json!([{"id":"project-1","title":"پروژه","description":"حفظ اطلاعات","archived":false,"stages":[]}]);state
}
fn seed_legacy(db:&KairosSqliteDatabase,state:&Value){
    let conn=db.conn.lock().unwrap();let raw:String=conn.query_row("SELECT json_data FROM settings WHERE id='default'",[],|r|r.get(0)).unwrap();let mut settings:Value=serde_json::from_str(&raw).unwrap();settings["planning"]=state.clone();conn.execute("UPDATE settings SET json_data=?1 WHERE id='default'",params![settings.to_string()]).unwrap();
}

#[test]
fn planning_migration_is_verified_and_recoverable_after_sql_failure(){
    let db=database();let original=state();seed_legacy(&db,&original);
    db.conn.lock().unwrap().execute_batch("CREATE TRIGGER fail_planning BEFORE INSERT ON planning_records WHEN NEW.key <> 'meta' BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;").unwrap();
    assert!(db.get_planning_page(&json!({"cursor":0})).is_err());
    assert_eq!(db.get_settings().unwrap()["planning"],original);
    {let conn=db.conn.lock().unwrap();let count:i64=conn.query_row("SELECT COUNT(*) FROM planning_records",[],|r|r.get(0)).unwrap();assert_eq!(count,0);let recovered:i64=conn.query_row("SELECT COUNT(*) FROM kv_state WHERE key=?1",params![planning::RECOVERY_KEY],|r|r.get(0)).unwrap();assert_eq!(recovered,0);conn.execute_batch("DROP TRIGGER fail_planning").unwrap();}
    db.get_planning_page(&json!({"cursor":0})).unwrap();assert!(db.get_settings().unwrap().get("planning").is_none());
    {let conn=db.conn.lock().unwrap();let recovered:String=conn.query_row("SELECT json_value FROM kv_state WHERE key=?1",params![planning::RECOVERY_KEY],|r|r.get(0)).unwrap();assert_eq!(serde_json::from_str::<Value>(&recovered).unwrap(),original);assert_eq!(planning::join(&KairosSqliteDatabase::read_planning_records(&conn).unwrap()).unwrap(),original);}
    db.ensure_planning_records().unwrap();assert_eq!(db.export_backup().unwrap()["payload"]["planning"],original);
}

#[test]
fn planning_patch_checks_tasks_atomically_and_restore_rollback_preserve_records(){
    let db=database();db.get_planning_page(&json!({})).unwrap();
    let first=db.upsert_task(&json!({"task":{"id":"t1","title":"one","targetDate":"2026-11-18","duration":30}})).unwrap();let second=db.upsert_task(&json!({"task":{"id":"t2","title":"two","targetDate":"2026-11-18","duration":30}})).unwrap();
    let expected=json!({"t1":first["revision"]});let value=state();let mut patch=json!({"storageVersion":1,"expectedRevision":0,"revision":1,"upserts":planning::split(&value).unwrap(),"deletes":[],"expectedTaskRevisions":expected});
    assert_eq!(db.save_planning_patch(&patch).unwrap_err().code,"CONFLICT_STALE_REVISION");assert_eq!(db.export_backup().unwrap()["payload"]["planning"]["revision"],0);
    patch["expectedTaskRevisions"]["t2"]=second["revision"].clone();db.save_planning_patch(&patch).unwrap();assert_eq!(db.save_planning_patch(&patch).unwrap_err().code,"CONFLICT_STALE_REVISION");
    let before = db.export_backup().unwrap();
    let mut replacement = before.clone();
    replacement["payload"]["planning"] = planning::empty_state();
    replacement["payload"]["tasks"] = json!([]);
    db.restore_backup(&json!({"envelope":replacement,"strategy":"replace"})).unwrap();
    assert_eq!(db.export_backup().unwrap()["payload"]["planning"]["revision"], 2);
    db.rollback_last_restore().unwrap();
    let restored = db.export_backup().unwrap();
    let mut expected = value;
    expected["revision"] = json!(3);
    assert_eq!(restored["payload"]["planning"], expected);
    assert_eq!(restored["payload"]["tasks"], before["payload"]["tasks"]);
    assert_eq!(db.save_planning_patch(&patch).unwrap_err().code, "CONFLICT_STALE_REVISION");
}

#[test]
fn restoring_an_empty_plan_keeps_merge_available_and_protects_revision_zero_preferences() {
    let db = database();
    let mut backup = db.export_backup().unwrap();
    db.restore_backup(&json!({"envelope": backup, "strategy": "replace"})).unwrap();
    assert_eq!(db.export_backup().unwrap()["payload"]["planning"]["revision"], 1);
    db.restore_backup(&json!({"envelope": backup, "strategy": "merge"})).unwrap();
    backup["payload"]["planning"]["layout"]["mobile"]["hidden"] = json!(["projects"]);
    assert!(db.restore_backup(&json!({"envelope": backup, "strategy": "merge"})).is_err());
    backup["payload"]["planning"]["revision"] = json!(50);
    db.restore_backup(&json!({"envelope": backup, "strategy": "replace"})).unwrap();
    assert_eq!(db.export_backup().unwrap()["payload"]["planning"]["revision"], 50);
    db.rollback_last_restore().unwrap();
    assert_eq!(db.export_backup().unwrap()["payload"]["planning"]["revision"], 51);
    assert_eq!(db.has_pre_restore_snapshot().unwrap()["exists"], false);
}

#[test]
fn native_planning_pages_are_bounded_and_revision_checked(){
    let db=database();let mut value=state();value["projects"]=Value::Array((0..150).map(|index|json!({"id":format!("p{}",index),"title":"پروژه","description":"آ".repeat(4000),"archived":false,"stages":[]})).collect());seed_legacy(&db,&value);
    let page=db.get_planning_page(&json!({"cursor":0})).unwrap();assert!(page["records"].to_string().len()<=planning::PAGE_LIMIT+1024);assert!(page["nextCursor"].is_number());assert_eq!(page["revision"],1);
    assert_eq!(db.get_planning_page(&json!({"cursor":page["nextCursor"],"expectedRevision":2})).unwrap_err().code,"CONFLICT_STALE_REVISION");
}

#[test]
fn scenario_confirmation_rolls_back_the_task_on_failure() {
    let db = database();
    let task = json!({"id":"offer","title":"Offer","duration":30,"targetDate":"2030-01-02","priority":3});
    let mut patch = json!({"storageVersion":1,"expectedRevision":0,"revision":1,"createTask":task,
        "expectedTaskRevisions":{},"upserts":[], "deletes":[]});
    assert!(db.dispatch("planning.createTaskAndSave", &patch).is_err());
    assert!(db.export_backup().unwrap()["payload"]["tasks"].as_array().unwrap().is_empty());
    patch["upserts"] = json!(planning::split(&state()).unwrap());
    db.dispatch("planning.createTaskAndSave", &patch).unwrap();
    assert_eq!(db.export_backup().unwrap()["payload"]["tasks"][0]["id"], "offer");
    assert!(db.dispatch("planning.createTaskAndSave", &patch).is_err());
}
