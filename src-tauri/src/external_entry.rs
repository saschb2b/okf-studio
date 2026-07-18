//! Guarded OS and CLI entry points.
//!
//! Parsing is deliberately inert: a deep link or shell command can only add a
//! bounded preview to the pending queue. A separate command asks for native
//! confirmation when no persisted Rust grant covers the decoded path.

use crate::bundle_grant::{BundleGrantKind, BundleGrantState};
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

pub const EVENT: &str = "external-entry-requested";
const MAX_RAW_BYTES: usize = 8 * 1024;
const MAX_PATH_CHARS: usize = 2_048;
const MAX_FIELD_CHARS: usize = 1_024;
const MAX_DRAFT_CHARS: usize = 4_096;
const MAX_QUERY_FIELDS: usize = 12;
const MAX_OMITTED_FIELDS: usize = 8;
const MAX_PENDING: usize = 16;
const MAX_RECENT: usize = 32;
const DUPLICATE_WINDOW: Duration = Duration::from_secs(5);

const TASK_IDS: &[&str] = &[
    "okf-create",
    "okf-enrich",
    "okf-audit",
    "okf-repair",
    "okf-research",
    "okf-change-impact",
    "okf-migrate",
];

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExternalEntryAction {
    Open,
    Inspect,
    Validate,
    Task,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExternalEntrySource {
    DeepLink,
    Cli,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalEntryPreview {
    pub request_id: String,
    pub source: ExternalEntrySource,
    pub action: ExternalEntryAction,
    pub bundle_root: String,
    pub concept_id: Option<String>,
    pub task_id: Option<String>,
    pub prompt_draft: Option<String>,
    pub omitted_fields: Vec<String>,
}

#[derive(Clone, Debug)]
struct ParsedEntry {
    source: ExternalEntrySource,
    action: ExternalEntryAction,
    bundle_root: String,
    concept_id: Option<String>,
    task_id: Option<String>,
    prompt_draft: Option<String>,
    omitted_fields: Vec<String>,
}

struct PendingEntries {
    entries: VecDeque<ExternalEntryPreview>,
    recent: VecDeque<(String, Instant)>,
}

pub struct ExternalEntryState {
    pending: Mutex<PendingEntries>,
}

impl Default for ExternalEntryState {
    fn default() -> Self {
        Self {
            pending: Mutex::new(PendingEntries {
                entries: VecDeque::new(),
                recent: VecDeque::new(),
            }),
        }
    }
}

impl ExternalEntryState {
    fn queue(&self, parsed: ParsedEntry) -> Result<Option<ExternalEntryPreview>, String> {
        let digest = entry_digest(&parsed);
        let now = Instant::now();
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "External entry state is unavailable.".to_string())?;
        pending
            .recent
            .retain(|(_, seen)| now.saturating_duration_since(*seen) <= DUPLICATE_WINDOW);
        if pending.recent.iter().any(|(seen, _)| seen == &digest) {
            return Ok(None);
        }
        if pending.entries.len() >= MAX_PENDING {
            return Err("Too many external requests are waiting for review.".to_string());
        }
        let preview = ExternalEntryPreview {
            request_id: format!("external-{}", uuid::Uuid::new_v4()),
            source: parsed.source,
            action: parsed.action,
            bundle_root: parsed.bundle_root,
            concept_id: parsed.concept_id,
            task_id: parsed.task_id,
            prompt_draft: parsed.prompt_draft,
            omitted_fields: parsed.omitted_fields,
        };
        pending.entries.push_back(preview.clone());
        pending.recent.push_back((digest, now));
        while pending.recent.len() > MAX_RECENT {
            pending.recent.pop_front();
        }
        Ok(Some(preview))
    }

    fn list(&self) -> Result<Vec<ExternalEntryPreview>, String> {
        self.pending
            .lock()
            .map(|pending| pending.entries.iter().cloned().collect())
            .map_err(|_| "External entry state is unavailable.".to_string())
    }

    fn get(&self, request_id: &str) -> Result<ExternalEntryPreview, String> {
        self.pending
            .lock()
            .map_err(|_| "External entry state is unavailable.".to_string())?
            .entries
            .iter()
            .find(|entry| entry.request_id == request_id)
            .cloned()
            .ok_or_else(|| "This external request is no longer waiting for review.".to_string())
    }

    fn remove(&self, request_id: &str) -> Result<bool, String> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "External entry state is unavailable.".to_string())?;
        let before = pending.entries.len();
        pending
            .entries
            .retain(|entry| entry.request_id != request_id);
        Ok(pending.entries.len() != before)
    }
}

pub fn queue_deep_link(app: &AppHandle, raw: &str) -> Result<(), String> {
    let parsed = parse_deep_link(raw)?;
    queue_and_emit(app, parsed)
}

pub fn queue_cli(app: &AppHandle, args: Vec<OsString>) -> Result<(), String> {
    if let Some(parsed) = parse_cli(args)? {
        queue_and_emit(app, parsed)?;
    }
    Ok(())
}

fn queue_and_emit(app: &AppHandle, parsed: ParsedEntry) -> Result<(), String> {
    let state = app
        .try_state::<ExternalEntryState>()
        .ok_or_else(|| "External entry state is not ready.".to_string())?;
    if let Some(preview) = state.queue(parsed)? {
        app.emit(EVENT, preview)
            .map_err(|error| format!("Could not show the external request: {error}"))?;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

pub fn pending(state: &ExternalEntryState) -> Result<Vec<ExternalEntryPreview>, String> {
    state.list()
}

pub async fn accept(
    app: AppHandle,
    state: &ExternalEntryState,
    grants: &BundleGrantState,
    request_id: &str,
) -> Result<Option<ExternalEntryPreview>, String> {
    let mut preview = state.get(request_id)?;
    let requested = PathBuf::from(&preview.bundle_root);
    let canonical = match grants.authorize_within_folder_grant(&requested) {
        Ok(root) => root,
        Err(_) => {
            let display = preview.bundle_root.clone();
            let approved = tauri::async_runtime::spawn_blocking(move || {
                app.dialog()
                    .message(format!(
                        "Allow OKF Studio to open this folder?\n\n{display}\n\nThis grants read access to this folder. Agent work still requires its own visible task and reviewed writes."
                    ))
                    .title("Open external OKF request")
                    .kind(MessageDialogKind::Warning)
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Allow and open".to_string(),
                        "Cancel".to_string(),
                    ))
                    .blocking_show()
            })
            .await
            .map_err(|_| "The native confirmation did not complete.".to_string())?;
            if !approved {
                state.remove(request_id)?;
                return Ok(None);
            }
            let root = PathBuf::from(grants.grant(&requested, BundleGrantKind::LocalFolder)?);
            grants.register_bundle_roots(&root, [root.clone()])?;
            root
        }
    };
    preview.bundle_root = canonical.to_string_lossy().into_owned();
    state.remove(request_id)?;
    Ok(Some(preview))
}

pub fn dismiss(state: &ExternalEntryState, request_id: &str) -> Result<bool, String> {
    state.remove(request_id)
}

fn parse_deep_link(raw: &str) -> Result<ParsedEntry, String> {
    if raw.len() > MAX_RAW_BYTES {
        return Err("The OKF Studio link is too large.".to_string());
    }
    let url = url::Url::parse(raw).map_err(|_| "The OKF Studio link is malformed.".to_string())?;
    if url.scheme() != "okf-studio"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
        || (url.path() != "" && url.path() != "/")
    {
        return Err("The OKF Studio link has an unsupported authority or path.".to_string());
    }
    let action = parse_action(url.host_str().unwrap_or_default())?;
    let mut seen = HashSet::new();
    let mut bundle = None;
    let mut concept = None;
    let mut task = None;
    let mut prompt = None;
    let mut omitted = Vec::new();
    for (index, (key, value)) in url.query_pairs().enumerate() {
        if index >= MAX_QUERY_FIELDS {
            return Err("The OKF Studio link has too many fields.".to_string());
        }
        let key = key.into_owned();
        if !seen.insert(key.clone()) {
            return Err(format!("The OKF Studio link repeats the {key} field."));
        }
        match key.as_str() {
            "bundle" => bundle = Some(bounded_field(&value, MAX_PATH_CHARS, "bundle path")?),
            "concept" => concept = Some(bounded_field(&value, MAX_FIELD_CHARS, "concept")?),
            "task" => task = Some(valid_task_id(&value)?),
            "prompt" => prompt = Some(bounded_field(&value, MAX_DRAFT_CHARS, "prompt draft")?),
            _ if omitted.len() < MAX_OMITTED_FIELDS => omitted.push(bounded_omitted_name(&key)?),
            _ => return Err("The OKF Studio link has too many unsupported fields.".to_string()),
        }
    }
    parsed_entry(
        ExternalEntrySource::DeepLink,
        action,
        bundle,
        concept,
        task,
        prompt,
        omitted,
    )
}

fn parse_cli(args: Vec<OsString>) -> Result<Option<ParsedEntry>, String> {
    if args.is_empty() {
        return Ok(None);
    }
    let mut args = args.into_iter();
    let Some(first) = args.next() else {
        return Ok(None);
    };
    let first = bounded_os_string(first, MAX_RAW_BYTES)?;
    if first.starts_with("okf-studio://") {
        return parse_deep_link(&first).map(Some);
    }
    let action = match parse_action(&first) {
        Ok(action) => action,
        Err(_) => return Ok(None),
    };
    let bundle = args
        .next()
        .map(|value| bounded_os_string(value, MAX_PATH_CHARS))
        .transpose()?;
    let mut concept = None;
    let mut task = None;
    let mut prompt = None;
    let mut omitted = Vec::new();
    while let Some(flag) = args.next() {
        let flag = bounded_os_string(flag, 64)?;
        let value = args
            .next()
            .ok_or_else(|| format!("{flag} requires a value."))?;
        match flag.as_str() {
            "--concept" => concept = Some(bounded_os_string(value, MAX_FIELD_CHARS)?),
            "--task" => task = Some(valid_task_id(&bounded_os_string(value, MAX_FIELD_CHARS)?)?),
            "--prompt" => prompt = Some(bounded_os_string(value, MAX_DRAFT_CHARS)?),
            "--attachment" if omitted.len() < MAX_OMITTED_FIELDS => {
                let _ = bounded_os_string(value, MAX_PATH_CHARS)?;
                omitted.push("attachment".to_string());
            }
            _ => return Err(format!("Unsupported OKF Studio option: {flag}")),
        }
    }
    parsed_entry(
        ExternalEntrySource::Cli,
        action,
        bundle,
        concept,
        task,
        prompt,
        omitted,
    )
    .map(Some)
}

fn parsed_entry(
    source: ExternalEntrySource,
    action: ExternalEntryAction,
    bundle_root: Option<String>,
    concept_id: Option<String>,
    task_id: Option<String>,
    prompt_draft: Option<String>,
    omitted_fields: Vec<String>,
) -> Result<ParsedEntry, String> {
    let bundle_root = bundle_root
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "The external request requires an absolute bundle path.".to_string())?;
    validate_inert_path(&bundle_root)?;
    if action == ExternalEntryAction::Task && task_id.is_none() {
        return Err("A task request requires a supported --task value.".to_string());
    }
    if action != ExternalEntryAction::Task && task_id.is_some() {
        return Err("Only a task request can name a task.".to_string());
    }
    Ok(ParsedEntry {
        source,
        action,
        bundle_root,
        concept_id,
        task_id,
        prompt_draft,
        omitted_fields,
    })
}

fn parse_action(value: &str) -> Result<ExternalEntryAction, String> {
    match value {
        "open" => Ok(ExternalEntryAction::Open),
        "inspect" => Ok(ExternalEntryAction::Inspect),
        "validate" => Ok(ExternalEntryAction::Validate),
        "task" => Ok(ExternalEntryAction::Task),
        _ => Err("The external request names an unsupported action.".to_string()),
    }
}

fn valid_task_id(value: &str) -> Result<String, String> {
    TASK_IDS
        .contains(&value)
        .then(|| value.to_string())
        .ok_or_else(|| "The external request names an unsupported OKF task.".to_string())
}

fn validate_inert_path(value: &str) -> Result<(), String> {
    let path = Path::new(value);
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err("The external request requires a normalized absolute bundle path.".to_string());
    }
    Ok(())
}

fn bounded_field(value: &str, max: usize, label: &str) -> Result<String, String> {
    if value.chars().count() > max || value.chars().any(char::is_control) {
        return Err(format!("The external request has an invalid {label}."));
    }
    Ok(value.to_string())
}

fn bounded_omitted_name(value: &str) -> Result<String, String> {
    if value.is_empty()
        || value.chars().count() > 64
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("The external request has an invalid field name.".to_string());
    }
    Ok(value.to_string())
}

fn bounded_os_string(value: OsString, max: usize) -> Result<String, String> {
    let value = value
        .into_string()
        .map_err(|_| "External request arguments must be Unicode.".to_string())?;
    bounded_field(&value, max, "argument")
}

fn entry_digest(entry: &ParsedEntry) -> String {
    format!(
        "{:?}\u{1f}{:?}\u{1f}{}\u{1f}{:?}\u{1f}{:?}\u{1f}{:?}",
        entry.source,
        entry.action,
        entry.bundle_root,
        entry.concept_id,
        entry.task_id,
        entry.prompt_draft,
    )
}

#[cfg(test)]
mod tests {
    use super::{parse_cli, parse_deep_link, ExternalEntryAction, ExternalEntryState};
    use std::ffi::OsString;

    fn fixture_root() -> String {
        std::env::temp_dir()
            .join("okf-external-entry-fixture")
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn parses_a_closed_deep_link_without_executing_it() {
        let root =
            url::form_urlencoded::byte_serialize(fixture_root().as_bytes()).collect::<String>();
        let parsed = parse_deep_link(&format!(
            "okf-studio://task?bundle={root}&concept=overview&task=okf-audit&prompt=check%20this&future=value"
        ))
        .expect("parse");
        assert_eq!(parsed.action, ExternalEntryAction::Task);
        assert_eq!(parsed.task_id.as_deref(), Some("okf-audit"));
        assert_eq!(parsed.prompt_draft.as_deref(), Some("check this"));
        assert_eq!(parsed.omitted_fields, ["future"]);
    }

    #[test]
    fn rejects_traversal_duplicates_and_oversize_payloads() {
        assert!(parse_deep_link("okf-studio://open?bundle=C%3A%5Ctmp%5C..%5Csecret").is_err());
        assert!(
            parse_deep_link("okf-studio://open?bundle=C%3A%5Ctmp&bundle=C%3A%5Cother").is_err()
        );
        assert!(
            parse_deep_link(&format!("okf-studio://open?bundle={}", "x".repeat(9_000))).is_err()
        );
        assert!(parse_deep_link("https://example.com/open?bundle=C%3A%5Ctmp").is_err());
    }

    #[test]
    fn cli_uses_the_same_contract_and_keeps_attachments_omitted() {
        let parsed = parse_cli(vec![
            OsString::from("task"),
            OsString::from(fixture_root()),
            OsString::from("--task"),
            OsString::from("okf-enrich"),
            OsString::from("--attachment"),
            OsString::from("outside.txt"),
        ])
        .expect("parse")
        .expect("entry");
        assert_eq!(parsed.omitted_fields, ["attachment"]);
    }

    #[test]
    fn duplicate_launches_are_rate_limited() {
        let root =
            url::form_urlencoded::byte_serialize(fixture_root().as_bytes()).collect::<String>();
        let parsed =
            parse_deep_link(&format!("okf-studio://validate?bundle={root}")).expect("parse");
        let state = ExternalEntryState::default();
        assert!(state.queue(parsed.clone()).expect("queue").is_some());
        assert!(state.queue(parsed).expect("dedupe").is_none());
        assert_eq!(state.list().expect("list").len(), 1);
    }
}
