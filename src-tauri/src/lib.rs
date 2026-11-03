pub mod db;

use db::KairosSqliteDatabase;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Manager;

pub const BRIDGE_CONTRACT_VERSION: &str = "1.0.0";
pub const MAX_BRIDGE_PAYLOAD_BYTES: usize = 5 * 1024 * 1024;

pub struct AppState {
    pub db: KairosSqliteDatabase,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeRequestEnvelope {
    pub request_id: String,
    pub version: String,
    pub operation: String,
    #[serde(default)]
    pub payload: Value,
    pub sent_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeErrorObject {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeResponseEnvelope {
    pub request_id: String,
    pub version: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeErrorObject>,
}

pub fn execute_bridge_request(db: &KairosSqliteDatabase, raw_request: &str) -> String {
    if raw_request.len() > MAX_BRIDGE_PAYLOAD_BYTES {
        return serde_json::to_string(&BridgeResponseEnvelope {
            request_id: "unknown".to_string(),
            version: BRIDGE_CONTRACT_VERSION.to_string(),
            ok: false,
            data: None,
            error: Some(BridgeErrorObject {
                code: "PAYLOAD_TOO_LARGE".to_string(),
                message: "حجم پیام ارسالی به پل دسکتاپ ویندوز بیش از حد مجاز (۵ مگابایت) است.".to_string(),
            }),
        })
        .unwrap_or_default();
    }

    let parsed: Result<BridgeRequestEnvelope, _> = serde_json::from_str(raw_request);
    match parsed {
        Ok(req) => {
            if req.request_id.trim().is_empty() {
                return serde_json::to_string(&BridgeResponseEnvelope {
                    request_id: "unknown".to_string(),
                    version: BRIDGE_CONTRACT_VERSION.to_string(),
                    ok: false,
                    data: None,
                    error: Some(BridgeErrorObject {
                        code: "VALIDATION_ERROR".to_string(),
                        message: "شناسهٔ درخواست (requestId) الزامی است.".to_string(),
                    }),
                })
                .unwrap_or_default();
            }

            if req.version != BRIDGE_CONTRACT_VERSION {
                return serde_json::to_string(&BridgeResponseEnvelope {
                    request_id: req.request_id,
                    version: BRIDGE_CONTRACT_VERSION.to_string(),
                    ok: false,
                    data: None,
                    error: Some(BridgeErrorObject {
                        code: "VERSION_MISMATCH".to_string(),
                        message: format!(
                            "عدم تطابق نسخهٔ قرارداد پل دسکتاپ: نسخهٔ مورد انتظار {}، دریافتی {}",
                            BRIDGE_CONTRACT_VERSION, req.version
                        ),
                    }),
                })
                .unwrap_or_default();
            }

            match db.dispatch(&req.operation, &req.payload) {
                Ok(data) => serde_json::to_string(&BridgeResponseEnvelope {
                    request_id: req.request_id,
                    version: BRIDGE_CONTRACT_VERSION.to_string(),
                    ok: true,
                    data: Some(data),
                    error: None,
                })
                .unwrap_or_default(),
                Err(err) => serde_json::to_string(&BridgeResponseEnvelope {
                    request_id: req.request_id,
                    version: BRIDGE_CONTRACT_VERSION.to_string(),
                    ok: false,
                    data: None,
                    error: Some(BridgeErrorObject {
                        code: err.code,
                        message: err.message,
                    }),
                })
                .unwrap_or_default(),
            }
        }
        Err(err) => serde_json::to_string(&BridgeResponseEnvelope {
            request_id: "unknown".to_string(),
            version: BRIDGE_CONTRACT_VERSION.to_string(),
            ok: false,
            data: None,
            error: Some(BridgeErrorObject {
                code: "VALIDATION_ERROR".to_string(),
                message: format!("ساختار JSON درخواست پل ارتباطی نامعتبر است: {}", err),
            }),
        })
        .unwrap_or_default(),
    }
}

#[tauri::command]
fn kairos_bridge_invoke(state: tauri::State<'_, AppState>, raw_request: String) -> String {
    execute_bridge_request(&state.db, &raw_request)
}

const BRIDGE_INIT_SCRIPT: &str = r#"
(function() {
  if (!window.__KAIROS_DESKTOP_BRIDGE__) {
    window.__KAIROS_DESKTOP_BRIDGE__ = {
      invoke: async function(rawRequestJson) {
        if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
          return await window.__TAURI_INTERNALS__.invoke('kairos_bridge_invoke', {
            rawRequest: String(rawRequestJson || '')
          });
        }
        throw new Error('رابط داخلی Tauri در دسترس نیست.');
      }
    };
  }
})();
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_local_data_dir = app.path().app_local_data_dir().map_err(|e| {
                format!(
                    "امکان دریافت مسیر دادهٔ محلی کاربر ویندوز (AppLocalData) وجود ندارد: {}",
                    e
                )
            })?;

            let db = KairosSqliteDatabase::open_in_app_data_dir(&app_local_data_dir).map_err(
                |e| format!("خطا در راه‌اندازی پایگاه‌داده SQLite کایروس: {}", e.message),
            )?;

            app.manage(AppState { db });

            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.eval(BRIDGE_INIT_SCRIPT);
            }

            Ok(())
        })
        .on_page_load(|webview, _payload| {
            let _ = webview.eval(BRIDGE_INIT_SCRIPT);
        })
        .invoke_handler(tauri::generate_handler![kairos_bridge_invoke])
        .run(tauri::generate_context!())
        .expect("خطا در اجرای برنامهٔ دسکتاپ ویندوز کایروس");
}
