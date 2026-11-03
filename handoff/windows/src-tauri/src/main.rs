// Canonical Tauri v2 host project is located at `/src-tauri/` (`Cargo.toml`, `src/lib.rs`, `src/db.rs`, `src/main.rs`).
// This file mirrors the protocol constants and entry point for legacy handoff path compatibility.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

pub const BRIDGE_CONTRACT_VERSION: &str = "1.0.0";
pub const MAX_BRIDGE_PAYLOAD_BYTES: usize = 5 * 1024 * 1024;
pub const CONFLICT_ERROR_CODE: &str = "CONFLICT_STALE_REVISION";

fn main() {
    // Canonical entry point in `/src-tauri/src/main.rs` invokes `kairos_desktop_lib::run()`
    // which initializes `KairosSqliteDatabase` inside `%LOCALAPPDATA%\com.kairos.workspace\data\kairos_v2.sqlite`
    // and registers `#[tauri::command] fn kairos_bridge_invoke`.
}
