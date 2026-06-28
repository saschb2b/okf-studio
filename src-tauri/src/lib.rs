//! Tauri layer: thin command/event wrappers over `okf-core`. The frontend never
//! touches the filesystem; it calls these commands and listens for events.
//! TODO(src-tauri agent): add pick_folder helpers as needed, file watching
//! (start_watch/stop_watch) via `notify` emitting `bundle-changed`, and
//! `scan-progress` events. See docs/architecture/ipc-and-security.md.

use okf_core::{Bundle, BundleRoot};
use std::path::Path;

#[tauri::command]
fn scan_bundles(folder: String) -> Vec<BundleRoot> {
    okf_core::scan_bundles(Path::new(&folder))
}

#[tauri::command]
fn read_bundle(root: String) -> Bundle {
    okf_core::read_bundle(Path::new(&root))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_bundles, read_bundle])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
