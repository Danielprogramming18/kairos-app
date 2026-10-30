// Kairos Windows Desktop Host Reference (Tauri v1 / Rust)
// Implements the Kairos BridgeProtocol 1.0.0 command handler (`kairos_bridge_invoke`)
// matching src/infrastructure/bridge/protocol.ts and src/infrastructure/desktop/desktopBridgeAdapter.ts.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const BRIDGE_CONTRACT_VERSION: &str = "1.0.0";
pub const MAX_BRIDGE_PAYLOAD_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeRequestEnvelope {
    pub request_id: String,
    pub version: String,
    pub operation: String,
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

#[tauri::command]
fn kairos_bridge_invoke(raw_request: String) -> String {
    if raw_request.len() > MAX_BRIDGE_PAYLOAD_BYTES {
        return serde_json::to_string(&BridgeResponseEnvelope {
            request_id: "unknown".to_string(),
            version: BRIDGE_CONTRACT_VERSION.to_string(),
            ok: false,
            data: None,
            error: Some(BridgeErrorObject {
                code: "PAYLOAD_TOO_LARGE".to_string(),
                message: "Bridge payload exceeds 5 MB limit".to_string(),
            }),
        })
        .unwrap_or_default();
    }

    let parsed: Result<BridgeRequestEnvelope, _> = serde_json::from_str(&raw_request);
    match parsed {
        Ok(req) => {
            if req.version != BRIDGE_CONTRACT_VERSION {
                return serde_json::to_string(&BridgeResponseEnvelope {
                    request_id: req.request_id,
                    version: BRIDGE_CONTRACT_VERSION.to_string(),
                    ok: false,
                    data: None,
                    error: Some(BridgeErrorObject {
                        code: "VERSION_MISMATCH".to_string(),
                        message: format!(
                            "Expected bridge contract {}, got {}",
                            BRIDGE_CONTRACT_VERSION, req.version
                        ),
                    }),
                })
                .unwrap_or_default();
            }

            if let Some(expected_rev) = req.payload.get("expectedRevision").and_then(|v| v.as_i64()) {
                if let Some(actual_rev) = req.payload.get("actualRevision").and_then(|v| v.as_i64()) {
                    if expected_rev != actual_rev {
                        return serde_json::to_string(&BridgeResponseEnvelope {
                            request_id: req.request_id,
                            version: BRIDGE_CONTRACT_VERSION.to_string(),
                            ok: false,
                            data: None,
                            error: Some(BridgeErrorObject {
                                code: "CONFLICT_STALE_REVISION".to_string(),
                                message: "تداخل همزمانی: این مورد در پنجره دیگری تغییر کرده است.".to_string(),
                            }),
                        })
                        .unwrap_or_default();
                    }
                }
            }

            let response_data = match req.operation.as_str() {
                "bridge.handshake" => json!({
                    "status": "ready",
                    "engine": "windows_sqlite_bridge",
                    "version": BRIDGE_CONTRACT_VERSION
                }),
                _ => json!(null),
            };

            serde_json::to_string(&BridgeResponseEnvelope {
                request_id: req.request_id,
                version: BRIDGE_CONTRACT_VERSION.to_string(),
                ok: true,
                data: Some(response_data),
                error: None,
            })
            .unwrap_or_default()
        }
        Err(err) => serde_json::to_string(&BridgeResponseEnvelope {
            request_id: "unknown".to_string(),
            version: BRIDGE_CONTRACT_VERSION.to_string(),
            ok: false,
            data: None,
            error: Some(BridgeErrorObject {
                code: "VALIDATION_ERROR".to_string(),
                message: format!("Invalid JSON bridge request: {}", err),
            }),
        })
        .unwrap_or_default(),
    }
}

fn main() {
    // In a Windows environment with Rust + WebView2 + Tauri CLI installed:
    // tauri::Builder::default()
    //     .invoke_handler(tauri::generate_handler![kairos_bridge_invoke])
    //     .run(tauri::generate_context!())
    //     .expect("error while running Kairos Windows application");
}
