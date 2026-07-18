//! Rust-owned, deterministic OKF routines and their recovery ledger.
//!
//! Definitions are declarative. The first schema deliberately has no agent
//! executor: health and bundle-source fingerprint checks are offline, read-only,
//! serialized per bundle, and re-authorized for every run.

use crate::bundle_grant::BundleGrantState;
use okf_core::health;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const ROUTINES_FILE: &str = "okf-routines.json";
const LEDGER_FILE: &str = "okf-routine-runs.json";
const SCHEMA_VERSION: u32 = 1;
const MAX_ROUTINES: usize = 32;
const MAX_RUNS: usize = 512;
const MAX_FILE_BYTES: u64 = 512 * 1024;
const MAX_SOURCE_BYTES: u64 = 32 * 1024 * 1024;
const MIN_INTERVAL_MINUTES: u32 = 15;
const MAX_INTERVAL_MINUTES: u32 = 7 * 24 * 60;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RoutineTask {
    HealthRescan,
    SourceFingerprintCheck,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RoutineTriggerMode {
    Manual,
    Scheduled,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineTrigger {
    pub mode: RoutineTriggerMode,
    pub interval_minutes: Option<u32>,
    pub catch_up_after_downtime: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoutineSource {
    pub relative_path: String,
    pub expected_sha256: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoutineScope {
    pub bundle_root: String,
    pub task: RoutineTask,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub tool_ids: Vec<String>,
    pub network_mode: String,
    pub sources: Vec<RoutineSource>,
    pub staging_allowed: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoutineDefinition {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub trigger: RoutineTrigger,
    pub scope: RoutineScope,
    pub timeout_seconds: u32,
    pub next_run_at_ms: Option<u64>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveRoutineInput {
    pub id: Option<String>,
    pub name: String,
    pub enabled: bool,
    pub trigger: RoutineTrigger,
    pub scope: RoutineScope,
    pub timeout_seconds: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RoutineOutcome {
    Running,
    Healthy,
    Attention,
    Failed,
    Blocked,
    Skipped,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoutineRun {
    pub schema_version: u32,
    pub id: String,
    pub routine_id: String,
    pub routine_name: String,
    pub bundle_root: String,
    pub scheduled_time_ms: Option<u64>,
    pub actual_start_ms: u64,
    pub completed_at_ms: u64,
    pub scope_fingerprint: String,
    pub outcome: RoutineOutcome,
    pub recovery_state: String,
    pub reason: String,
    pub next_action: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineWorkspace {
    pub schema_version: u32,
    pub routines: Vec<RoutineDefinition>,
    pub runs: Vec<RoutineRun>,
}

#[derive(Default)]
struct RoutineRegistry {
    routines: Vec<RoutineDefinition>,
    runs: Vec<RoutineRun>,
    active_bundles: HashSet<String>,
    active_routines: HashSet<String>,
}

pub struct RoutineState {
    routines_file: PathBuf,
    ledger_file: PathBuf,
    registry: Mutex<RoutineRegistry>,
}

impl RoutineState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let data = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Studio could not locate routine storage: {error}"))?;
        Ok(Self::load_from(
            data.join(ROUTINES_FILE),
            data.join(LEDGER_FILE),
        ))
    }

    fn load_from(routines_file: PathBuf, ledger_file: PathBuf) -> Self {
        let routines = read_bounded::<Vec<RoutineDefinition>>(&routines_file)
            .unwrap_or_default()
            .into_iter()
            .filter(|routine| validate_definition(routine).is_ok())
            .take(MAX_ROUTINES)
            .collect();
        let runs = read_bounded::<Vec<RoutineRun>>(&ledger_file)
            .unwrap_or_default()
            .into_iter()
            .filter(valid_run)
            .map(recover_interrupted_run)
            .take(MAX_RUNS)
            .collect();
        Self {
            routines_file,
            ledger_file,
            registry: Mutex::new(RoutineRegistry {
                routines,
                runs,
                ..RoutineRegistry::default()
            }),
        }
    }

    pub fn workspace(&self, bundle_root: &str) -> RoutineWorkspace {
        let registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        RoutineWorkspace {
            schema_version: SCHEMA_VERSION,
            routines: registry
                .routines
                .iter()
                .filter(|routine| routine.scope.bundle_root == bundle_root)
                .cloned()
                .collect(),
            runs: registry
                .runs
                .iter()
                .filter(|run| run.bundle_root == bundle_root)
                .take(100)
                .cloned()
                .collect(),
        }
    }

    pub fn save(
        &self,
        grants: &BundleGrantState,
        input: SaveRoutineInput,
    ) -> Result<RoutineDefinition, String> {
        let root = grants.authorize_bundle(Path::new(&input.scope.bundle_root))?;
        let root_label = root.to_string_lossy().into_owned();
        let now = now_ms();
        let id = input
            .id
            .unwrap_or_else(|| format!("routine-{}", Uuid::new_v4()));
        let mut definition = RoutineDefinition {
            schema_version: SCHEMA_VERSION,
            id,
            name: input.name.trim().to_string(),
            enabled: input.enabled,
            trigger: input.trigger,
            scope: RoutineScope {
                bundle_root: root_label,
                ..input.scope
            },
            timeout_seconds: input.timeout_seconds,
            next_run_at_ms: None,
            created_at_ms: now,
            updated_at_ms: now,
        };
        for source in &mut definition.scope.sources {
            if source.expected_sha256.is_empty() {
                source.expected_sha256 = source_digest(&root, &source.relative_path)?;
            }
        }
        validate_definition(&definition)?;
        if definition.enabled && definition.trigger.mode == RoutineTriggerMode::Scheduled {
            definition.next_run_at_ms = Some(next_scheduled_time(&definition, now)?);
        }
        let mut registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if let Some(existing) = registry
            .routines
            .iter()
            .position(|item| item.id == definition.id)
        {
            if registry.routines[existing].scope.bundle_root != definition.scope.bundle_root {
                return Err("A routine cannot move to another bundle.".to_string());
            }
            definition.created_at_ms = registry.routines[existing].created_at_ms;
            registry.routines[existing] = definition.clone();
        } else {
            if registry.routines.len() >= MAX_ROUTINES {
                return Err(format!(
                    "Studio supports at most {MAX_ROUTINES} local routines."
                ));
            }
            registry.routines.push(definition.clone());
        }
        write_json(&self.routines_file, &registry.routines)?;
        Ok(definition)
    }

    pub fn remove(&self, routine_id: &str) -> Result<bool, String> {
        let mut registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let before = registry.routines.len();
        registry.routines.retain(|routine| routine.id != routine_id);
        if before == registry.routines.len() {
            return Ok(false);
        }
        write_json(&self.routines_file, &registry.routines)?;
        Ok(true)
    }

    pub fn run(
        &self,
        grants: &BundleGrantState,
        routine_id: &str,
        scheduled_time_ms: Option<u64>,
    ) -> Result<RoutineRun, String> {
        let (definition, pending) = {
            let mut registry = self
                .registry
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let definition = registry
                .routines
                .iter()
                .find(|routine| routine.id == routine_id)
                .cloned()
                .ok_or_else(|| "The routine no longer exists.".to_string())?;
            if registry.active_routines.contains(&definition.id)
                || registry
                    .active_bundles
                    .contains(&definition.scope.bundle_root)
            {
                return Err("A routine is already running for this bundle.".to_string());
            }
            registry.active_routines.insert(definition.id.clone());
            registry
                .active_bundles
                .insert(definition.scope.bundle_root.clone());
            let pending = pending_run(&definition, scheduled_time_ms);
            registry.runs.insert(0, pending.clone());
            registry.runs.truncate(MAX_RUNS);
            if let Err(error) = write_json(&self.ledger_file, &registry.runs) {
                registry.active_routines.remove(&definition.id);
                registry
                    .active_bundles
                    .remove(&definition.scope.bundle_root);
                registry.runs.retain(|run| run.id != pending.id);
                return Err(error);
            }
            (definition, pending)
        };
        let run = self.execute(grants, &definition, &pending);
        let mut registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        registry.active_routines.remove(&definition.id);
        registry
            .active_bundles
            .remove(&definition.scope.bundle_root);
        let run = run.unwrap_or_else(|reason| failed_run(&definition, &pending, reason));
        if let Some(saved) = registry.runs.iter_mut().find(|item| item.id == pending.id) {
            *saved = run.clone();
        } else {
            registry.runs.insert(0, run.clone());
            registry.runs.truncate(MAX_RUNS);
        }
        if let Some(saved) = registry
            .routines
            .iter_mut()
            .find(|item| item.id == definition.id)
        {
            saved.next_run_at_ms =
                if saved.enabled && saved.trigger.mode == RoutineTriggerMode::Scheduled {
                    next_scheduled_time(saved, now_ms()).ok()
                } else {
                    None
                };
            saved.updated_at_ms = now_ms();
        }
        write_json(&self.ledger_file, &registry.runs)?;
        write_json(&self.routines_file, &registry.routines)?;
        Ok(run)
    }

    fn execute(
        &self,
        grants: &BundleGrantState,
        definition: &RoutineDefinition,
        pending: &RoutineRun,
    ) -> Result<RoutineRun, String> {
        validate_definition(definition)?;
        let root = grants.authorize_bundle(Path::new(&definition.scope.bundle_root))?;
        let start = now_ms();
        let (outcome, reason, next_action) = match definition.scope.task {
            RoutineTask::HealthRescan => {
                let bundle = okf_core::read_bundle(&root);
                let report = health::analyze(&bundle).map_err(|limit| {
                    format!("Health analysis exceeded its {} limit.", limit.dimension)
                })?;
                if report.findings.is_empty() {
                    (
                        RoutineOutcome::Healthy,
                        "No health findings detected.",
                        "None",
                    )
                } else {
                    (
                        RoutineOutcome::Attention,
                        "Health findings need review.",
                        "Open Health",
                    )
                }
            }
            RoutineTask::SourceFingerprintCheck => {
                let changed = definition
                    .scope
                    .sources
                    .iter()
                    .filter(|source| source_changed(&root, source).unwrap_or(true))
                    .count();
                if changed == 0 {
                    (
                        RoutineOutcome::Healthy,
                        "Source fingerprints are current.",
                        "None",
                    )
                } else {
                    (
                        RoutineOutcome::Attention,
                        "Bundle sources changed.",
                        "Review sources",
                    )
                }
            }
        };
        if now_ms().saturating_sub(start) > u64::from(definition.timeout_seconds) * 1_000 {
            return Err("The routine exceeded its saved timeout.".to_string());
        }
        Ok(RoutineRun {
            schema_version: SCHEMA_VERSION,
            id: pending.id.clone(),
            routine_id: definition.id.clone(),
            routine_name: definition.name.clone(),
            bundle_root: definition.scope.bundle_root.clone(),
            scheduled_time_ms: pending.scheduled_time_ms,
            actual_start_ms: pending.actual_start_ms,
            completed_at_ms: now_ms(),
            scope_fingerprint: scope_fingerprint(&definition.scope),
            outcome,
            recovery_state: "complete".to_string(),
            reason: reason.to_string(),
            next_action: next_action.to_string(),
        })
    }

    pub fn run_due(&self, grants: &BundleGrantState, now: u64) -> Result<Vec<RoutineRun>, String> {
        let due = {
            let registry = self
                .registry
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            registry
                .routines
                .iter()
                .filter(|routine| {
                    routine.enabled
                        && routine.trigger.mode == RoutineTriggerMode::Scheduled
                        && routine
                            .next_run_at_ms
                            .is_some_and(|scheduled| scheduled <= now)
                })
                .map(|routine| {
                    (
                        routine.id.clone(),
                        routine.next_run_at_ms,
                        routine.trigger.catch_up_after_downtime,
                    )
                })
                .collect::<Vec<_>>()
        };
        let mut completed = Vec::new();
        for (id, scheduled, catch_up) in due {
            if catch_up {
                completed.push(self.run(grants, &id, scheduled)?);
            } else {
                completed.push(self.skip_missed(&id, scheduled)?);
            }
        }
        Ok(completed)
    }

    fn skip_missed(&self, routine_id: &str, scheduled: Option<u64>) -> Result<RoutineRun, String> {
        let mut registry = self
            .registry
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let definition = registry
            .routines
            .iter_mut()
            .find(|routine| routine.id == routine_id)
            .ok_or_else(|| "The routine no longer exists.".to_string())?;
        let run = RoutineRun {
            schema_version: SCHEMA_VERSION,
            id: format!("run-{}", Uuid::new_v4()),
            routine_id: definition.id.clone(),
            routine_name: definition.name.clone(),
            bundle_root: definition.scope.bundle_root.clone(),
            scheduled_time_ms: scheduled,
            actual_start_ms: now_ms(),
            completed_at_ms: now_ms(),
            scope_fingerprint: scope_fingerprint(&definition.scope),
            outcome: RoutineOutcome::Skipped,
            recovery_state: "missed-run-skipped".to_string(),
            reason: "A missed run was skipped by the saved catch-up policy.".to_string(),
            next_action: "Run now".to_string(),
        };
        definition.next_run_at_ms = next_scheduled_time(definition, now_ms()).ok();
        registry.runs.insert(0, run.clone());
        registry.runs.truncate(MAX_RUNS);
        write_json(&self.ledger_file, &registry.runs)?;
        write_json(&self.routines_file, &registry.routines)?;
        Ok(run)
    }
}

fn validate_definition(definition: &RoutineDefinition) -> Result<(), String> {
    if definition.schema_version != SCHEMA_VERSION
        || !safe_text(&definition.id, 128)
        || !safe_text(&definition.name, 80)
        || definition.timeout_seconds == 0
        || definition.timeout_seconds > 300
    {
        return Err("The routine definition is invalid.".to_string());
    }
    if definition.scope.agent_id.is_some()
        || definition.scope.model_id.is_some()
        || !definition.scope.tool_ids.is_empty()
        || definition.scope.network_mode != "offline"
        || definition.scope.staging_allowed
    {
        return Err(
            "This routine schema permits only deterministic offline work without staging."
                .to_string(),
        );
    }
    match definition.trigger.mode {
        RoutineTriggerMode::Manual if definition.trigger.interval_minutes.is_some() => {
            return Err("A manual routine cannot declare an interval.".to_string());
        }
        RoutineTriggerMode::Scheduled => {
            let interval = definition
                .trigger
                .interval_minutes
                .ok_or_else(|| "A scheduled routine needs an interval.".to_string())?;
            if !(MIN_INTERVAL_MINUTES..=MAX_INTERVAL_MINUTES).contains(&interval) {
                return Err(
                    "The routine interval must be between 15 minutes and 7 days.".to_string(),
                );
            }
        }
        RoutineTriggerMode::Manual => {}
    }
    if definition.scope.sources.len() > 32 {
        return Err("A routine can check at most 32 bundle sources.".to_string());
    }
    for source in &definition.scope.sources {
        validate_relative_path(&source.relative_path)?;
        if source.expected_sha256.len() != 64
            || !source
                .expected_sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit())
        {
            return Err("A routine source fingerprint is invalid.".to_string());
        }
    }
    if definition.scope.task == RoutineTask::HealthRescan && !definition.scope.sources.is_empty() {
        return Err("A health routine cannot carry source paths.".to_string());
    }
    if definition.scope.task == RoutineTask::SourceFingerprintCheck
        && definition.scope.sources.is_empty()
    {
        return Err("A source check needs at least one bundle source.".to_string());
    }
    Ok(())
}

fn validate_relative_path(value: &str) -> Result<(), String> {
    if !safe_text(value, 1_024) {
        return Err("A routine source path is invalid.".to_string());
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(
            "A routine source must be a bundle-relative path without traversal.".to_string(),
        );
    }
    Ok(())
}

fn source_changed(root: &Path, source: &RoutineSource) -> Result<bool, String> {
    Ok(source_digest(root, &source.relative_path)? != source.expected_sha256.to_ascii_lowercase())
}

fn source_digest(root: &Path, relative_path: &str) -> Result<String, String> {
    validate_relative_path(relative_path)?;
    let path = root.join(relative_path);
    let canonical = dunce::canonicalize(&path)
        .map_err(|_| "A routine source is no longer available.".to_string())?;
    if !canonical.starts_with(root) || !canonical.is_file() {
        return Err("A routine source escaped the active bundle.".to_string());
    }
    let metadata =
        fs::metadata(&canonical).map_err(|_| "A routine source is unavailable.".to_string())?;
    if metadata.len() > MAX_SOURCE_BYTES {
        return Err("A routine source exceeds the 32 MiB limit.".to_string());
    }
    let bytes =
        fs::read(canonical).map_err(|_| "A routine source could not be read.".to_string())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn next_scheduled_time(definition: &RoutineDefinition, now: u64) -> Result<u64, String> {
    let minutes = definition
        .trigger
        .interval_minutes
        .ok_or_else(|| "A scheduled routine needs an interval.".to_string())?;
    Ok(now.saturating_add(u64::from(minutes) * 60_000))
}

fn failed_run(definition: &RoutineDefinition, pending: &RoutineRun, reason: String) -> RoutineRun {
    let grant_failure = reason.contains("not granted") || reason.contains("no longer");
    RoutineRun {
        schema_version: SCHEMA_VERSION,
        id: pending.id.clone(),
        routine_id: definition.id.clone(),
        routine_name: definition.name.clone(),
        bundle_root: definition.scope.bundle_root.clone(),
        scheduled_time_ms: pending.scheduled_time_ms,
        actual_start_ms: pending.actual_start_ms,
        completed_at_ms: now_ms(),
        scope_fingerprint: scope_fingerprint(&definition.scope),
        outcome: if grant_failure {
            RoutineOutcome::Blocked
        } else {
            RoutineOutcome::Failed
        },
        recovery_state: if grant_failure {
            "grant-revoked"
        } else {
            "failed"
        }
        .to_string(),
        reason: if grant_failure {
            "Bundle access must be granted again before this routine can run.".to_string()
        } else {
            bounded_reason(&reason)
        },
        next_action: if grant_failure {
            "Open bundle"
        } else {
            "Review routine"
        }
        .to_string(),
    }
}

fn pending_run(definition: &RoutineDefinition, scheduled_time_ms: Option<u64>) -> RoutineRun {
    let start = now_ms();
    RoutineRun {
        schema_version: SCHEMA_VERSION,
        id: format!("run-{}", Uuid::new_v4()),
        routine_id: definition.id.clone(),
        routine_name: definition.name.clone(),
        bundle_root: definition.scope.bundle_root.clone(),
        scheduled_time_ms,
        actual_start_ms: start,
        completed_at_ms: start,
        scope_fingerprint: scope_fingerprint(&definition.scope),
        outcome: RoutineOutcome::Running,
        recovery_state: "in-progress".to_string(),
        reason: "Routine work started.".to_string(),
        next_action: "Wait".to_string(),
    }
}

fn recover_interrupted_run(mut run: RoutineRun) -> RoutineRun {
    if run.outcome == RoutineOutcome::Running || run.recovery_state == "in-progress" {
        run.outcome = RoutineOutcome::Failed;
        run.recovery_state = "interrupted-on-exit".to_string();
        run.reason = "The previous routine run ended before completion was recorded.".to_string();
        run.next_action = "Run again".to_string();
    }
    run
}

fn scope_fingerprint(scope: &RoutineScope) -> String {
    let bytes = serde_json::to_vec(scope).unwrap_or_default();
    format!("sha256-{:x}", Sha256::digest(bytes))
}

fn safe_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control)
}

fn bounded_reason(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control())
        .take(240)
        .collect()
}

fn valid_run(run: &RoutineRun) -> bool {
    run.schema_version == SCHEMA_VERSION
        && safe_text(&run.id, 128)
        && safe_text(&run.routine_id, 128)
        && safe_text(&run.bundle_root, 2_048)
        && safe_text(&run.reason, 240)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

pub fn current_time_ms() -> u64 {
    now_ms()
}

fn read_bounded<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    if fs::metadata(path)
        .map(|meta| meta.len() > MAX_FILE_BYTES)
        .unwrap_or(false)
    {
        return Err("Routine storage exceeds its size limit.".to_string());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not prepare routine storage: {error}"))?;
    }
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Could not encode routine storage: {error}"))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Routine storage exceeds its size limit.".to_string());
    }
    fs::write(path, bytes).map_err(|error| format!("Could not save routine storage: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition(root: &Path) -> RoutineDefinition {
        RoutineDefinition {
            schema_version: SCHEMA_VERSION,
            id: "routine-health".to_string(),
            name: "Daily health".to_string(),
            enabled: true,
            trigger: RoutineTrigger {
                mode: RoutineTriggerMode::Scheduled,
                interval_minutes: Some(60),
                catch_up_after_downtime: false,
            },
            scope: RoutineScope {
                bundle_root: root.to_string_lossy().into_owned(),
                task: RoutineTask::HealthRescan,
                agent_id: None,
                model_id: None,
                tool_ids: Vec::new(),
                network_mode: "offline".to_string(),
                sources: Vec::new(),
                staging_allowed: false,
            },
            timeout_seconds: 30,
            next_run_at_ms: Some(1),
            created_at_ms: 1,
            updated_at_ms: 1,
        }
    }

    #[test]
    fn v1_rejects_agent_network_tool_and_staging_scope() {
        let root = std::env::temp_dir();
        for mutate in [
            |scope: &mut RoutineScope| scope.agent_id = Some("agent".to_string()),
            |scope: &mut RoutineScope| scope.network_mode = "full".to_string(),
            |scope: &mut RoutineScope| scope.tool_ids.push("fs/write".to_string()),
            |scope: &mut RoutineScope| scope.staging_allowed = true,
        ] {
            let mut candidate = definition(&root);
            mutate(&mut candidate.scope);
            assert!(validate_definition(&candidate).is_err());
        }
    }

    #[test]
    fn source_paths_are_relative_and_fingerprints_are_exact() {
        let root = std::env::temp_dir();
        let mut candidate = definition(&root);
        candidate.scope.task = RoutineTask::SourceFingerprintCheck;
        candidate.scope.sources = vec![RoutineSource {
            relative_path: "assets/source.json".to_string(),
            expected_sha256: "a".repeat(64),
        }];
        assert!(validate_definition(&candidate).is_ok());
        candidate.scope.sources[0].relative_path = "../secret".to_string();
        assert!(validate_definition(&candidate).is_err());
    }

    #[test]
    fn missed_runs_are_explicitly_skipped_when_catch_up_is_off() {
        let directory = std::env::temp_dir().join(format!("okf-routine-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("fixture directory");
        let state =
            RoutineState::load_from(directory.join("routines.json"), directory.join("runs.json"));
        {
            let mut registry = state.registry.lock().expect("registry");
            registry.routines.push(definition(&directory));
        }
        let run = state
            .skip_missed("routine-health", Some(1))
            .expect("skip receipt");
        assert_eq!(run.outcome, RoutineOutcome::Skipped);
        assert_eq!(run.recovery_state, "missed-run-skipped");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn an_in_progress_receipt_recovers_as_interrupted_not_successful() {
        let root = std::env::temp_dir();
        let interrupted = pending_run(&definition(&root), Some(1));
        let recovered = recover_interrupted_run(interrupted);
        assert_eq!(recovered.outcome, RoutineOutcome::Failed);
        assert_eq!(recovered.recovery_state, "interrupted-on-exit");
        assert_eq!(recovered.next_action, "Run again");
    }
}
