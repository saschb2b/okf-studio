//! Tauri layer: thin command/event wrappers over `okf-core`. The frontend never
//! touches the filesystem; it calls these commands and listens for events.

mod watch;

use okf_core::{Bundle, BundleRoot};
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use watch::WatchState;

#[tauri::command]
fn scan_bundles(folder: String) -> Vec<BundleRoot> {
    okf_core::scan_bundles(Path::new(&folder))
}

#[tauri::command]
fn read_bundle(root: String) -> Bundle {
    okf_core::read_bundle(Path::new(&root))
}

/// Begin watching `folder` recursively for filesystem changes, emitting a
/// debounced `bundle-changed` event on each burst. Replaces any active watch.
#[tauri::command]
fn start_watch(app: AppHandle, state: State<'_, WatchState>, folder: String) {
    watch::start(app, state.inner(), folder);
}

/// Stop the active watch, if any.
#[tauri::command]
fn stop_watch(state: State<'_, WatchState>) {
    watch::stop(state.inner());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(WatchState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_bundles,
            read_bundle,
            start_watch,
            stop_watch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
