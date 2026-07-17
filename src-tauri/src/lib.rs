//! Tauri layer: thin command/event wrappers over `okf-core`. The frontend never
//! touches the filesystem; it calls these commands and listens for events.

// The agent backend is grouped into domain folders under `src/agent/`. The
// module names keep their `agent_` prefix (avoiding collisions with std and
// crate modules like `process`, `url`, `csv`, and `json`); `#[path]` maps each
// to its file. See docs/architecture/agent-system.md for the domains.
//
// host — the running ACP and MCP process host.
#[path = "agent/host/agent_protocol.rs"]
mod agent_protocol;
#[path = "agent/host/agent_process.rs"]
mod agent_process;
#[path = "agent/host/agent_sandbox.rs"]
mod agent_sandbox;
#[path = "agent/host/agent_mcp.rs"]
mod agent_mcp;
#[path = "agent/host/agent_transcript.rs"]
mod agent_transcript;
// registry — agent discovery, installation, and the managed runtime.
#[path = "agent/registry/agent_catalog.rs"]
mod agent_catalog;
#[path = "agent/registry/agent_install.rs"]
mod agent_install;
#[path = "agent/registry/agent_runtime.rs"]
mod agent_runtime;
#[path = "agent/registry/agent_custom.rs"]
mod agent_custom;
// provider — the native Studio Agent and its tools.
#[path = "agent/provider/agent_local.rs"]
mod agent_local;
#[path = "agent/provider/agent_native_sources.rs"]
mod agent_native_sources;
#[path = "agent/provider/agent_native_stage.rs"]
mod agent_native_stage;
#[path = "agent/provider/agent_studio.rs"]
mod agent_studio;
#[path = "agent/provider/agent_credentials.rs"]
mod agent_credentials;
// sources — attached-source intake and extraction.
#[path = "agent/sources/agent_sources.rs"]
mod agent_sources;
#[path = "agent/sources/agent_pdf.rs"]
mod agent_pdf;
#[path = "agent/sources/agent_csv.rs"]
mod agent_csv;
#[path = "agent/sources/agent_json.rs"]
mod agent_json;
#[path = "agent/sources/agent_url.rs"]
mod agent_url;
// stage — the reviewed-write engine shared by the host and native provider.
#[path = "agent/agent_stage.rs"]
mod agent_stage;
mod bundle_create;
mod bundle_grant;
mod remote;
mod watch;

use okf_core::{Bundle, BundleRoot};
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use watch::WatchState;

pub fn run_agent_mcp(bundle_root: std::path::PathBuf) -> Result<(), String> {
    agent_mcp::run(bundle_root)
}

pub fn run_pdf_extractor() -> Result<(), String> {
    agent_pdf::run_helper()
}

#[tauri::command]
fn pick_bundle_folder(
    app: AppHandle,
    grants: State<'_, bundle_grant::BundleGrantState>,
) -> Result<Option<String>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("Open a folder of OKF bundles")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let folder = selected
        .into_path()
        .map_err(|_| "The selected bundle folder is not available on this platform.".to_string())?;
    grants
        .grant(&folder, bundle_grant::BundleGrantKind::LocalFolder)
        .map(Some)
}

/// Static, agent-free bundle creation: the user picks a parent folder in the
/// OS dialog, the generator writes a small conformant bundle there (see
/// bundle_create.rs), and the result is granted like any picked folder so the
/// frontend can open it. Returns None when the picker is cancelled.
#[tauri::command]
fn create_bundle(
    app: AppHandle,
    grants: State<'_, bundle_grant::BundleGrantState>,
    input: bundle_create::CreateBundleInput,
) -> Result<Option<String>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("Choose where to create the new bundle")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let parent = selected
        .into_path()
        .map_err(|_| "The selected destination folder is not available on this platform.".to_string())?;
    let created = bundle_create::create_bundle(&parent, &input)?;
    grants
        .grant(&created, bundle_grant::BundleGrantKind::LocalFolder)
        .map(Some)
}

#[tauri::command]
fn revoke_bundle_grant(
    grants: State<'_, bundle_grant::BundleGrantState>,
    folder: String,
) -> Result<bool, String> {
    grants.revoke(&folder)
}

#[tauri::command]
fn scan_bundles(
    grants: State<'_, bundle_grant::BundleGrantState>,
    folder: String,
    max_depth: usize,
) -> Result<Vec<BundleRoot>, String> {
    let folder = grants.authorize_folder(Path::new(&folder))?;
    let roots = okf_core::scan_bundles_with_depth(&folder, max_depth);
    grants.register_bundle_roots(
        &folder,
        roots.iter().map(|root| Path::new(&root.root).to_path_buf()),
    )?;
    Ok(roots)
}

#[tauri::command]
fn read_bundle(
    grants: State<'_, bundle_grant::BundleGrantState>,
    root: String,
) -> Result<Bundle, String> {
    let root = grants.authorize_bundle(Path::new(&root))?;
    Ok(okf_core::read_bundle(&root))
}

#[tauri::command]
fn agent_catalog() -> Result<agent_catalog::AgentCatalog, String> {
    agent_catalog::load()
}

#[tauri::command]
async fn agent_security_host_status() -> agent_sandbox::AgentSecurityHostStatus {
    agent_sandbox::status().await
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
fn local_model_profiles(
    app: AppHandle,
) -> Result<Vec<agent_local::LocalModelProfile>, String> {
    agent_local::list(&app)
}

#[tauri::command]
async fn save_local_model_profile(
    app: AppHandle,
    input: agent_local::LocalModelProfileInput,
) -> Result<agent_local::LocalModelProfile, String> {
    tauri::async_runtime::spawn_blocking(move || agent_local::save(&app, input))
        .await
        .map_err(|_| "Studio could not finish saving the model profile.".to_string())?
}

#[tauri::command]
async fn remove_local_model_profile(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    profile_id: String,
) -> Result<bool, String> {
    agent_protocol::disconnect_profile(&app, state.inner(), &profile_id)?;
    tauri::async_runtime::spawn_blocking(move || agent_local::remove(&app, &profile_id))
        .await
        .map_err(|_| "Studio could not finish removing the model profile.".to_string())?
}

#[tauri::command]
async fn test_local_model_endpoint(
    input: agent_local::LocalModelProfileInput,
) -> Result<agent_local::LocalModelProbe, String> {
    tauri::async_runtime::spawn_blocking(move || agent_local::probe(input))
        .await
        .map_err(|_| "Studio could not finish the local endpoint test.".to_string())?
}

#[tauri::command]
async fn connect_local_model(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    profile_id: String,
    model: String,
) -> Result<agent_protocol::AgentConnectionInfo, String> {
    agent_protocol::connect_local(&app, state.inner(), &profile_id, model).await
}

#[tauri::command]
async fn connect_custom_agent(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    grants: State<'_, bundle_grant::BundleGrantState>,
    profile_id: String,
    bundle_root: String,
    mode: agent_protocol::AgentConnectionMode,
) -> Result<agent_protocol::AgentConnectionInfo, String> {
    let bundle_root = grants.authorize_bundle(Path::new(&bundle_root))?;
    agent_protocol::connect_custom(&app, state.inner(), &profile_id, bundle_root, mode).await
}

#[tauri::command]
async fn connect_catalog_agent(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    grants: State<'_, bundle_grant::BundleGrantState>,
    agent_id: String,
    bundle_root: String,
) -> Result<agent_protocol::AgentConnectionInfo, String> {
    let bundle_root = grants.authorize_bundle(Path::new(&bundle_root))?;
    agent_protocol::connect_catalog(&app, state.inner(), &agent_id, bundle_root).await
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
    grants: State<'_, bundle_grant::BundleGrantState>,
    connection_id: String,
    bundle_root: String,
) -> Result<agent_protocol::AgentSessionInfo, String> {
    let bundle_root = grants
        .authorize_bundle(Path::new(&bundle_root))?
        .to_string_lossy()
        .into_owned();
    agent_protocol::new_session(state.inner(), &connection_id, bundle_root).await
}

#[tauri::command]
async fn list_agent_sessions(
    state: State<'_, agent_protocol::AgentHostState>,
    grants: State<'_, bundle_grant::BundleGrantState>,
    connection_id: String,
    bundle_root: String,
) -> Result<agent_protocol::AgentSessionHistoryPage, String> {
    let bundle_root = grants
        .authorize_bundle(Path::new(&bundle_root))?
        .to_string_lossy()
        .into_owned();
    agent_protocol::list_sessions(state.inner(), &connection_id, bundle_root).await
}

#[tauri::command]
async fn load_agent_session(
    state: State<'_, agent_protocol::AgentHostState>,
    grants: State<'_, bundle_grant::BundleGrantState>,
    connection_id: String,
    bundle_root: String,
    session_id: String,
) -> Result<agent_protocol::AgentLoadedSessionInfo, String> {
    let bundle_root = grants
        .authorize_bundle(Path::new(&bundle_root))?
        .to_string_lossy()
        .into_owned();
    agent_protocol::load_session(
        state.inner(),
        &connection_id,
        bundle_root,
        session_id,
    )
    .await
}

#[tauri::command]
async fn set_agent_session_config_option(
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    config_id: String,
    value: agent_protocol::AgentSessionConfigValueInput,
) -> Result<agent_protocol::AgentSessionConfigSnapshot, String> {
    agent_protocol::set_session_config_option(
        state.inner(),
        &connection_id,
        session_id,
        config_id,
        value,
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
    remember_for_thread: bool,
) -> Result<bool, String> {
    agent_protocol::respond_permission(
        state.inner(),
        &request_id,
        option_id,
        remember_for_thread,
    )
}

#[tauri::command]
async fn test_saved_local_model_endpoint(
    app: AppHandle,
    profile_id: String,
) -> Result<agent_local::LocalModelProbe, String> {
    tauri::async_runtime::spawn_blocking(move || agent_local::probe_saved(&app, &profile_id))
        .await
        .map_err(|_| "Studio could not finish the saved endpoint test.".to_string())?
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

/// Create the exact validated fresh draft below a user-selected parent folder.
#[tauri::command]
async fn create_agent_staged_bundle(
    app: AppHandle,
    state: State<'_, agent_protocol::AgentHostState>,
    connection_id: String,
    session_id: String,
    revision: String,
    folder_name: String,
) -> Result<Option<agent_stage::AgentStagedCreateInfo>, String> {
    agent_protocol::create_staged_bundle(
        &app,
        state.inner(),
        &connection_id,
        &session_id,
        &revision,
        &folder_name,
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

#[tauri::command]
fn uninstall_agent(
    app: AppHandle,
    install_state: State<'_, agent_install::AgentInstallState>,
    host_state: State<'_, agent_protocol::AgentHostState>,
    agent_id: String,
) -> Result<(), String> {
    if install_state.is_installing(&agent_id)? {
        return Err("Finish or cancel the running installation first.".to_string());
    }
    if host_state.has_profile_connection(&format!("catalog-{agent_id}")) {
        return Err("Disconnect this agent before removing it.".to_string());
    }
    agent_install::uninstall(&app, &agent_id)
}

/// Fetch a remote bundle (a GitHub repo tarball or a direct archive URL) into a
/// local cache directory and return that directory's path, which the frontend
/// then opens like any picked folder. It runs only on an explicit user action;
/// other network paths have separate provider, install, update, or source APIs.
/// Blocking I/O runs off the UI thread.
/// See `remote.rs` and docs/architecture/ipc-and-security.md.
#[tauri::command]
async fn fetch_remote_bundle(
    app: AppHandle,
    grants: State<'_, bundle_grant::BundleGrantState>,
    source: remote::RemoteSource,
) -> Result<String, String> {
    let folder = tauri::async_runtime::spawn_blocking(move || remote::fetch(&app, source))
        .await
        .map_err(|e| format!("Fetch task failed: {e}"))??;
    grants.grant(
        Path::new(&folder),
        bundle_grant::BundleGrantKind::RemoteCache,
    )
}

/// Read one companion asset's text (an ODSF `*.example.html` or a `styles/*.css`
/// it links) for the design-system renderer. `rel` is a bundle-relative path;
/// the core guards against escaping the bundle root and only serves text assets.
/// Returns `null` to the frontend when the asset is absent or not permitted.
#[tauri::command]
fn read_asset(
    grants: State<'_, bundle_grant::BundleGrantState>,
    root: String,
    rel: String,
) -> Result<Option<String>, String> {
    let root = grants.authorize_bundle(Path::new(&root))?;
    Ok(okf_core::read_asset(&root, &rel))
}

/// Read a local bundle image as a `data:` URL so the reader can render it inline
/// without a network fetch (the offline stance). Returns `null` when the image
/// is absent, not an image type, or escapes the bundle root.
#[tauri::command]
fn read_asset_data_url(
    grants: State<'_, bundle_grant::BundleGrantState>,
    root: String,
    rel: String,
) -> Result<Option<String>, String> {
    let root = grants.authorize_bundle(Path::new(&root))?;
    Ok(okf_core::read_asset_data_url(&root, &rel))
}

/// Begin watching `folder` recursively for filesystem changes, emitting a
/// debounced `bundle-changed` event on each burst. Replaces any active watch.
#[tauri::command]
fn start_watch(
    app: AppHandle,
    state: State<'_, WatchState>,
    grants: State<'_, bundle_grant::BundleGrantState>,
    folder: String,
) -> Result<(), String> {
    let folder = grants
        .authorize_bundle(Path::new(&folder))?
        .to_string_lossy()
        .into_owned();
    watch::start(app, state.inner(), folder);
    Ok(())
}

/// Stop the active watch, if any.
#[tauri::command]
fn stop_watch(state: State<'_, WatchState>) {
    watch::stop(state.inner());
}

/// Diagnostic sink: print a frontend message to the host terminal. The webview
/// console is invisible in `tauri dev` output, so crash forensics (uncaught
/// errors, heap samples) route through here.
const MAX_FRONTEND_LOG_CHARS: usize = 16 * 1024;
const FRONTEND_LOG_TRUNCATION_MARKER: &str = " … [truncated]";

fn bounded_frontend_diagnostic(message: &str) -> String {
    let mut diagnostic = String::new();
    let mut separated = false;
    let mut characters = message.trim().chars();
    for character in characters.by_ref().take(MAX_FRONTEND_LOG_CHARS) {
        if character.is_whitespace() {
            if !separated && !diagnostic.is_empty() {
                diagnostic.push(' ');
                separated = true;
            }
            continue;
        }
        if character.is_control() {
            continue;
        }
        diagnostic.push(character);
        separated = false;
    }
    if characters.next().is_some() {
        let available = MAX_FRONTEND_LOG_CHARS
            .saturating_sub(FRONTEND_LOG_TRUNCATION_MARKER.chars().count());
        diagnostic = diagnostic.chars().take(available).collect();
        diagnostic.push_str(FRONTEND_LOG_TRUNCATION_MARKER);
    }
    if diagnostic.is_empty() {
        "(empty diagnostic)".to_string()
    } else {
        diagnostic
    }
}

#[tauri::command]
fn frontend_log(message: String) {
    eprintln!("[frontend] {}", bounded_frontend_diagnostic(&message));
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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init());

    // Opt-in updater — the user triggers a check from Settings; the app never
    // checks on its own (see docs/ux/settings.md). `process` is needed to
    // relaunch after an update installs. Desktop only. window-state restores
    // the main window's size, position, and maximized/fullscreen state across
    // launches; reader pop-outs keep their per-open geometry instead.
    #[cfg(desktop)]
    let builder = builder
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filter(|label| label == "main")
                // Windows are created hidden (`visible: false` in
                // tauri.conf.json) and revealed by the frontend after its
                // first painted frame; restoring VISIBLE here would flash the
                // transparent, undecorated shell before the webview paints.
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .setup(|app| {
            app.manage(bundle_grant::BundleGrantState::load(app.handle()).map_err(
                |error| std::io::Error::other(format!("could not load bundle grants: {error}")),
            )?);
            app.manage(WatchState::default());
            app.manage(agent_install::AgentInstallState::default());
            app.manage(agent_protocol::AgentHostState::default());

            // Show-on-ready watchdog. The main window starts hidden and the
            // frontend reveals it after its first painted frame (src/App.tsx),
            // so the transparent, undecorated shell is never shown while the
            // webview boots. If the frontend dies before that (a script error,
            // a dev-server hiccup), show the window anyway so a broken launch
            // is a visible blank window instead of a ghost process.
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    if let Some(window) = handle.get_webview_window("main") {
                        if !window.is_visible().unwrap_or(true) {
                            let _ = window.show();
                        }
                    }
                });
            }

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
            pick_bundle_folder,
            create_bundle,
            revoke_bundle_grant,
            scan_bundles,
            read_bundle,
            agent_catalog,
            agent_security_host_status,
            custom_agents,
            save_custom_agent,
            remove_custom_agent,
            local_model_profiles,
            save_local_model_profile,
            remove_local_model_profile,
            test_local_model_endpoint,
            test_saved_local_model_endpoint,
            connect_local_model,
            connect_custom_agent,
            connect_catalog_agent,
            disconnect_agent,
            authenticate_agent,
            new_agent_session,
            list_agent_sessions,
            load_agent_session,
            set_agent_session_config_option,
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
            create_agent_staged_bundle,
            restore_agent_staged_checkpoint,
            agent_install_preflight,
            install_agent,
            cancel_agent_install,
            uninstall_agent,
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

#[cfg(test)]
mod tests {
    use super::{
        bounded_frontend_diagnostic, FRONTEND_LOG_TRUNCATION_MARKER, MAX_FRONTEND_LOG_CHARS,
    };

    #[test]
    fn frontend_diagnostics_are_single_line_control_free_and_bounded() {
        assert_eq!(
            bounded_frontend_diagnostic(" first\u{1b}[31m\r\nsecond\tline\u{2028}three\0 "),
            "first[31m second line three"
        );
        assert_eq!(bounded_frontend_diagnostic("\r\n\t"), "(empty diagnostic)");

        let oversized = "é".repeat(MAX_FRONTEND_LOG_CHARS + 1);
        let bounded = bounded_frontend_diagnostic(&oversized);
        assert!(bounded.ends_with(FRONTEND_LOG_TRUNCATION_MARKER));
        assert_eq!(bounded.chars().count(), MAX_FRONTEND_LOG_CHARS);
        assert_eq!(
            bounded.matches('é').count(),
            MAX_FRONTEND_LOG_CHARS - FRONTEND_LOG_TRUNCATION_MARKER.chars().count()
        );
    }
}
