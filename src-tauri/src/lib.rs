//! Tauri layer: thin command/event wrappers over `okf-core`. The frontend never
//! touches the filesystem; it calls these commands and listens for events.

mod agent_catalog;
mod agent_custom;
mod agent_csv;
mod agent_install;
mod agent_json;
mod agent_mcp;
mod agent_pdf;
mod agent_protocol;
mod agent_runtime;
mod agent_sources;
mod agent_stage;
mod agent_transcript;
mod agent_url;
mod remote;
mod watch;

use okf_core::{Bundle, BundleRoot};
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use watch::WatchState;

pub fn run_agent_mcp(bundle_root: std::path::PathBuf) -> Result<(), String> {
    agent_mcp::run(bundle_root)
}

pub fn run_pdf_extractor() -> Result<(), String> {
    agent_pdf::run_helper()
}

#[tauri::command]
fn scan_bundles(folder: String, max_depth: usize) -> Vec<BundleRoot> {
    okf_core::scan_bundles_with_depth(Path::new(&folder), max_depth)
}

#[tauri::command]
fn read_bundle(root: String) -> Bundle {
    okf_core::read_bundle(Path::new(&root))
}

#[tauri::command]
fn agent_catalog() -> Result<agent_catalog::AgentCatalog, String> {
    agent_catalog::load()
}

#[tauri::command]
fn custom_agents(app: AppHandle) -> Result<Vec<agent_custom::CustomAgentProfile>, String> {
    agent_custom::list(&app)
}

#[tauri::command]
fn save_custom_agent(
    app: AppHandle,
    input: agent_custom::CustomAgentInput,
) -> Result<agent_custom::CustomAgentProfile, String> {
    agent_custom::save(&app, input)
}

#[tauri::command]
fn remove_custom_agent(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    profile_id: String,
) -> Result<bool, String> {
    agent_protocol::disconnect_profile(&app, state.inner(), &profile_id)?;
    agent_custom::remove(&app, &profile_id)
}

#[tauri::command]
async fn connect_custom_agent(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    profile_id: String,
) -> Result<agent_protocol::AgentConnectionInfo, String> {
    agent_protocol::connect_custom(&app, state.inner(), &profile_id).await
}

#[tauri::command]
async fn connect_catalog_agent(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    agent_id: String,
) -> Result<agent_protocol::AgentConnectionInfo, String> {
    agent_protocol::connect_catalog(&app, state.inner(), &agent_id).await
}

#[tauri::command]
fn disconnect_agent(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
) -> Result<bool, String> {
    agent_protocol::disconnect(&app, state.inner(), &connection_id)
}

#[tauri::command]
async fn new_agent_session(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    bundle_root: String,
) -> Result<agent_protocol::AgentSessionInfo, String> {
    agent_protocol::new_session(state.inner(), &connection_id, bundle_root).await
}

#[tauri::command]
async fn list_agent_sessions(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    bundle_root: String,
) -> Result<agent_protocol::AgentSessionHistoryPage, String> {
    agent_protocol::list_sessions(state.inner(), &connection_id, bundle_root).await
}

#[tauri::command]
async fn load_agent_session(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    bundle_root: String,
    session_id: String,
) -> Result<agent_protocol::AgentLoadedSessionInfo, String> {
    agent_protocol::load_session(
        state.inner(),
        &connection_id,
        bundle_root,
        session_id,
    )
    .await
}

#[tauri::command]
async fn authenticate_agent(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    method_id: String,
) -> Result<bool, String> {
    agent_protocol::authenticate(state.inner(), &connection_id, method_id).await
}

#[tauri::command]
async fn prompt_agent(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    text: String,
    context_paths: Vec<String>,
    sources: Vec<agent_sources::AgentSourceInput>,
) -> Result<agent_protocol::AgentTurnInfo, String> {
    agent_protocol::prompt(
        state.inner(),
        &connection_id,
        session_id,
        text,
        context_paths,
        sources,
    )
    .await
}

#[tauri::command]
async fn pick_agent_text_sources(
    app: AppHandle,
    limit: usize,
) -> Result<Vec<agent_sources::AgentSourceInput>, String> {
    agent_sources::pick_text_sources(&app, limit)
}

#[tauri::command]
async fn pick_agent_source_folder(
    app: AppHandle,
    limit: usize,
) -> Result<Vec<agent_sources::AgentSourceInput>, String> {
    agent_sources::pick_source_folder(&app, limit)
}

#[tauri::command]
async fn pick_agent_image_sources(
    app: AppHandle,
    limit: usize,
) -> Result<Vec<agent_sources::AgentSourceInput>, String> {
    agent_sources::pick_image_sources(&app, limit)
}

#[tauri::command]
async fn fetch_agent_source_url(
    url: String,
) -> Result<agent_sources::AgentSourceInput, String> {
    tauri::async_runtime::spawn_blocking(move || agent_url::fetch(url))
        .await
        .map_err(|error| format!("The URL source task failed: {error}"))?
}

#[tauri::command]
async fn export_agent_transcript(
    app: AppHandle,
    suggested_name: String,
    markdown: String,
) -> Result<Option<String>, String> {
    agent_transcript::export(&app, suggested_name, markdown).await
}

#[tauri::command]
async fn cancel_agent_turn(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    turn_id: String,
) -> Result<bool, String> {
    agent_protocol::cancel_turn(
        state.inner(),
        &connection_id,
        session_id,
        turn_id,
    )
    .await
}

#[tauri::command]
fn respond_agent_permission(
    state: State<'_, agent_protocol::AgentHostState>,
    request_id: String,
    option_id: Option<String>,
) -> Result<bool, String> {
    agent_protocol::respond_permission(state.inner(), &request_id, option_id)
}

/// Grant or revoke writes for one live ACP session through a declared mode.
/// The current UI uses the interactive thread grant. Unattended external
/// writes fail closed until the process host has an enforcement sandbox.
#[tauri::command]
fn set_agent_write_grant(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    granted: bool,
    mode: agent_stage::AgentWriteGrantMode,
) -> Result<agent_stage::AgentStagedChangesInfo, String> {
    agent_protocol::set_write_grant(
        &app,
        state.inner(),
        &connection_id,
        &session_id,
        granted,
        mode,
    )
}

/// Select whether the empty staged tree overlays the active bundle or models
/// a fresh bundle. A non-empty tree must be resolved before this can change.
#[tauri::command]
fn set_agent_stage_mode(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    mode: agent_stage::AgentStageMode,
) -> Result<agent_stage::AgentStagedChangesInfo, String> {
    agent_protocol::set_stage_mode(
        &app,
        state.inner(),
        &connection_id,
        &session_id,
        mode,
    )
}

/// Discard every staged file for one live ACP session; the grant is untouched.
#[tauri::command]
fn discard_agent_staged_changes(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
) -> Result<agent_stage::AgentStagedChangesInfo, String> {
    agent_protocol::discard_staged_changes(&app, state.inner(), &connection_id, &session_id)
}

/// Discard one staged file by its reported bundle-relative path.
#[tauri::command]
fn discard_agent_staged_file(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    path: String,
) -> Result<agent_stage::AgentStagedChangesInfo, String> {
    agent_protocol::discard_staged_file(&app, state.inner(), &connection_id, &session_id, &path)
}

/// A bounded unified diff between the bundle file and one staged file.
#[tauri::command]
async fn agent_staged_file_diff(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    path: String,
) -> Result<agent_stage::AgentStagedFileDiff, String> {
    agent_protocol::staged_file_diff(state.inner(), &connection_id, &session_id, &path).await
}

/// Select or reject one hunk from the exact staged revision under review.
#[tauri::command]
async fn set_agent_staged_hunk_selection(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    path: String,
    revision: String,
    hunk_index: usize,
    selected: bool,
) -> Result<agent_stage::AgentStagedFileDiff, String> {
    agent_protocol::set_staged_hunk_selection(
        state.inner(),
        &connection_id,
        &session_id,
        &path,
        &revision,
        hunk_index,
        selected,
    )
    .await
}

/// Validate the selected staged tree without changing the open bundle.
#[tauri::command]
async fn validate_agent_staged_changes(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
) -> Result<agent_stage::AgentStagedValidationInfo, String> {
    agent_protocol::validate_staged_changes(state.inner(), &connection_id, &session_id).await
}

/// Apply the exact staged revision that passed validation.
#[tauri::command]
async fn apply_agent_staged_changes(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    revision: String,
) -> Result<agent_stage::AgentStagedApplyInfo, String> {
    agent_protocol::apply_staged_changes(
        &app,
        state.inner(),
        &connection_id,
        &session_id,
        &revision,
    )
    .await
}

#[tauri::command]
async fn restore_agent_staged_checkpoint(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
) -> Result<agent_stage::AgentCheckpointRestoreInfo, String> {
    agent_protocol::restore_staged_checkpoint(
        &app,
        state.inner(),
        &connection_id,
        &session_id,
    )
    .await
}

#[tauri::command]
fn agent_install_preflight(
    app: AppHandle,
    agent_id: String,
) -> Result<agent_install::AgentInstallPreflight, String> {
    agent_install::preflight(&app, &agent_id)
}

#[tauri::command]
async fn install_agent(
    app: AppHandle,
    state: State<'_, agent_install::AgentInstallState>,
    agent_id: String,
    install_id: String,
) -> Result<agent_install::AgentInstallReceipt, String> {
    let cancelled = state.start(&install_id, &agent_id)?;
    let task_app = app.clone();
    let task_agent_id = agent_id.clone();
    let task_install_id = install_id.clone();
    let result = match tauri::async_runtime::spawn_blocking(move || {
        agent_install::install(&task_app, &task_agent_id, &task_install_id, cancelled)
    })
    .await
    {
        Ok(result) => result,
        Err(error) => Err(format!("Install task failed: {error}")),
    };
    state.finish(&install_id);
    result
}

#[tauri::command]
fn cancel_agent_install(
    state: State<'_, agent_install::AgentInstallState>,
    install_id: String,
) -> Result<bool, String> {
    state.cancel(&install_id)
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

/// Diagnostic sink: print a frontend message to the host terminal. The webview
/// console is invisible in `tauri dev` output, so crash forensics (uncaught
/// errors, heap samples) route through here.
#[tauri::command]
fn frontend_log(message: String) {
    eprintln!("[frontend] {message}");
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
            app.manage(agent_install::AgentInstallState::default());
            app.manage(agent_protocol::AgentHostState::default());

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
            agent_catalog,
            custom_agents,
            save_custom_agent,
            remove_custom_agent,
            connect_custom_agent,
            connect_catalog_agent,
            disconnect_agent,
            authenticate_agent,
            new_agent_session,
            list_agent_sessions,
            load_agent_session,
            prompt_agent,
            pick_agent_text_sources,
            pick_agent_source_folder,
            pick_agent_image_sources,
            fetch_agent_source_url,
            export_agent_transcript,
            cancel_agent_turn,
            respond_agent_permission,
            set_agent_write_grant,
            set_agent_stage_mode,
            discard_agent_staged_changes,
            discard_agent_staged_file,
            agent_staged_file_diff,
            set_agent_staged_hunk_selection,
            validate_agent_staged_changes,
            apply_agent_staged_changes,
            restore_agent_staged_checkpoint,
            agent_install_preflight,
            install_agent,
            cancel_agent_install,
            fetch_remote_bundle,
            read_asset,
            read_asset_data_url,
            start_watch,
            stop_watch,
            can_self_update,
            frontend_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
