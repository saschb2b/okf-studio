//! Tauri layer: thin command/event wrappers over `okf-core`. The frontend never
//! touches the filesystem; it calls these commands and listens for events.

mod remote;
mod watch;

use okf_core::{Bundle, BundleRoot};
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use watch::WatchState;

#[tauri::command]
fn scan_bundles(folder: String, max_depth: usize) -> Vec<BundleRoot> {
    okf_core::scan_bundles_with_depth(Path::new(&folder), max_depth)
}

#[tauri::command]
fn read_bundle(root: String) -> Bundle {
    okf_core::read_bundle(Path::new(&root))
}

/// Fetch a remote bundle (a GitHub repo tarball or a direct archive URL) into a
/// local cache directory and return that directory's path, which the frontend
/// then opens like any picked folder. The only non-updater network path, and it
/// runs only on an explicit user action. Blocking I/O runs off the UI thread.
/// See `remote.rs` and docs/architecture/ipc-and-security.md.
#[tauri::command]
async fn fetch_remote_bundle(
    app: AppHandle,
    source: remote::RemoteSource,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || remote::fetch(&app, source))
        .await
        .map_err(|e| format!("Fetch task failed: {e}"))?
}

/// Read one companion asset's text (an ODSF `*.example.html` or a `styles/*.css`
/// it links) for the design-system renderer. `rel` is a bundle-relative path;
/// the core guards against escaping the bundle root and only serves text assets.
/// Returns `null` to the frontend when the asset is absent or not permitted.
#[tauri::command]
fn read_asset(root: String, rel: String) -> Option<String> {
    okf_core::read_asset(Path::new(&root), &rel)
}

/// Read a local bundle image as a `data:` URL so the reader can render it inline
/// without a network fetch (the offline stance). Returns `null` when the image
/// is absent, not an image type, or escapes the bundle root.
#[tauri::command]
fn read_asset_data_url(root: String, rel: String) -> Option<String> {
    okf_core::read_asset_data_url(Path::new(&root), &rel)
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

/// Whether the running install can update itself in place. The Tauri updater
/// only replaces an AppImage on Linux, so a `.deb` (or any non-AppImage) install
/// must update by downloading the new package; Windows/macOS self-update fine.
/// The Settings "Check for updates" flow uses this to offer Install vs Download.
#[tauri::command]
fn can_self_update() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("APPIMAGE").is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

// Native-feel reinforcement: browser page-zoom hotkeys are disabled per window.
// The `main` window is declared in tauri.conf.json, so we set
// `"zoomHotkeysEnabled": false` there (the config maps to the same webview
// attribute as the `WebviewWindowBuilder::zoom_hotkeys_enabled(false)` builder
// method — there is no runtime setter on a live window in Tauri 2). On Windows
// this disables WebView2's zoom control; on macOS/Linux it ensures Tauri's
// ctrl/cmd +/- zoom polyfill is never injected. The cross-platform floor — and
// the only guard on Linux/WebKitGTK — is the JS handler in src/native.ts, which
// also remaps the keys/gesture to the reader text-size setting.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init());

    // Opt-in updater — the user triggers a check from Settings; the app never
    // checks on its own (see docs/ux/settings.md). `process` is needed to
    // relaunch after an update installs. Desktop only.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .setup(|app| {
            app.manage(WatchState::default());

            // Linux/WebKitGTK: trackpad pinch is applied as a *native* webview
            // zoom that never reaches JS as a preventable event — unlike WebView2
            // (ctrl+wheel) and WKWebView (gesture events), which src/native.ts
            // already blocks. WebKitGTK drives it from a GtkGestureZoom it stashes
            // on the web view under the private qdata key "wk-view-zoom-gesture";
            // destroying that gesture's signal handlers disables pinch-zoom at the
            // source. (Desktop app — nothing relies on that touch gesture.) We also
            // pin the zoom level to 1.0 as a belt-and-suspenders for any other path.
            // Page-zoom of the whole app isn't a native desktop behavior; reader
            // text-size and graph zoom are the real affordances (docs/ux/settings.md).
            // No-op on Windows/macOS. Ref: tauri-apps/wry#544, tauri#3843.
            #[cfg(target_os = "linux")]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.with_webview(|webview| {
                    use gtk::glib::gobject_ffi;
                    use gtk::glib::prelude::ObjectExt;
                    use webkit2gtk::WebViewExt;
                    let wv = webview.inner();
                    // SAFETY: reading WebKitGTK's own qdata pointer for the zoom
                    // gesture and destroying its handlers on the GTK main thread.
                    unsafe {
                        if let Some(gesture) = wv.data::<gtk::GestureZoom>("wk-view-zoom-gesture") {
                            gobject_ffi::g_signal_handlers_destroy(gesture.as_ptr().cast());
                        }
                    }
                    wv.set_zoom_level(1.0);
                    wv.connect_zoom_level_notify(|wv| {
                        if (wv.zoom_level() - 1.0).abs() > f64::EPSILON {
                            wv.set_zoom_level(1.0);
                        }
                    });
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_bundles,
            read_bundle,
            fetch_remote_bundle,
            read_asset,
            read_asset_data_url,
            start_watch,
            stop_watch,
            can_self_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
