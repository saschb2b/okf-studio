//! Per-session write grant and in-memory staged tree (WP8).
//!
//! Opening a bundle grants no writes. A thread's ACP session accepts
//! `fs/write_text_file` only after the user grants **Allow edits in this
//! thread**, and a granted write never touches the bundle: it lands in this
//! bounded in-memory staged tree, keyed by bundle-relative path, until a later
//! reviewed apply ships. Reads overlay staged content so the agent observes
//! its own writes. See docs/architecture/agent-system.md.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use similar::{DiffOp, DiffTag, TextDiff};

pub(crate) const MAX_STAGED_FILE_BYTES: usize = 1024 * 1024;
pub(crate) const MAX_STAGED_TOTAL_BYTES: usize = 8 * 1024 * 1024;
pub(crate) const MAX_STAGED_FILES: usize = 64;
pub(crate) const MAX_STAGED_PATH_CHARS: usize = 1024;

pub(crate) const MAX_DIFF_CHARS: usize = 256 * 1024;
const MAX_VALIDATION_FILES: usize = 4096;
const MAX_VALIDATION_BYTES: usize = 32 * 1024 * 1024;
const MAX_VALIDATION_ISSUES: usize = 512;
const CHECKPOINT_VERSION: u32 = 1;
const MAX_CHECKPOINT_CONTENT_BYTES: usize = MAX_STAGED_TOTAL_BYTES * 2;
const MAX_CHECKPOINT_BYTES: u64 = 100 * 1024 * 1024;

pub(crate) const WRITE_GRANT_MESSAGE: &str =
    "Bundle write denied: writes require the Allow edits in this thread grant.";

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStageMode {
    #[default]
    Edit,
    Create,
}

/// One staged file as it crosses IPC: a bundle-relative forward-slash path,
/// the staged byte count, and whether the write creates or modifies the file.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStagedFileInfo {
    pub path: String,
    pub bytes: usize,
    pub kind: &'static str,
}

/// A session's staged-change snapshot as it crosses IPC.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStagedChangesInfo {
    pub session_id: String,
    pub granted: bool,
    pub mode: AgentStageMode,
    pub can_restore: bool,
    pub files: Vec<AgentStagedFileInfo>,
}

/// One selectable change cluster in a staged file diff.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStagedDiffHunk {
    pub index: usize,
    pub header: String,
    pub unified: String,
    pub selected: bool,
}

/// One staged file's bounded, structured diff against the current bundle file.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStagedFileDiff {
    pub path: String,
    pub kind: &'static str,
    pub revision: String,
    pub hunks: Vec<AgentStagedDiffHunk>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStagedValidationIssue {
    pub path: Option<String>,
    pub level: &'static str,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStagedValidationInfo {
    pub session_id: String,
    pub revision: String,
    pub errors: usize,
    pub warnings: usize,
    pub issues: Vec<AgentStagedValidationIssue>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStagedApplyInfo {
    pub session_id: String,
    pub revision: String,
    pub applied_files: usize,
    pub changes: AgentStagedChangesInfo,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentCheckpointRestoreInfo {
    pub session_id: String,
    pub restored_files: usize,
    pub changes: AgentStagedChangesInfo,
}

#[derive(Clone, PartialEq, Eq)]
struct SessionStage {
    bundle_root: PathBuf,
    granted: bool,
    mode: AgentStageMode,
    files: BTreeMap<String, StagedFile>,
    checkpoint: Option<AppliedCheckpoint>,
}

#[derive(Clone, PartialEq, Eq)]
struct StagedFile {
    content: String,
    kind: &'static str,
    selection: Option<HunkSelection>,
}

#[derive(Clone, PartialEq, Eq)]
struct HunkSelection {
    revision: String,
    rejected: BTreeSet<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AppliedCheckpoint {
    id: String,
    files: Vec<CheckpointFile>,
    created_directories: Vec<PathBuf>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentWriteGrantMode {
    Interactive,
    Unattended,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct CheckpointFile {
    target: PathBuf,
    backup: Option<PathBuf>,
    original_content: Option<String>,
    applied_content: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedCheckpoint {
    version: u32,
    id: String,
    bundle_fingerprint: String,
    files: Vec<PersistedCheckpointFile>,
    created_directories: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedCheckpointFile {
    path: String,
    original_content: Option<String>,
    applied_content: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedApplyTransaction {
    version: u32,
    checkpoint: PersistedCheckpoint,
    previous_checkpoint: Option<PersistedCheckpoint>,
    artifacts: Vec<PersistedApplyArtifact>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedApplyArtifact {
    path: String,
    temporary: String,
    backup: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedRestoreTransaction {
    version: u32,
    checkpoint: PersistedCheckpoint,
    artifacts: Vec<PersistedRestoreArtifact>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedRestoreArtifact {
    path: String,
    original_temporary: Option<String>,
    applied_temporary: String,
}

/// One full-text ACP diff report before it enters the authoritative staged
/// tree. `old_text` is used only as a compare-and-stage precondition.
pub(crate) struct AgentReportedDiff {
    pub path: PathBuf,
    pub old_text: Option<String>,
    pub new_text: String,
}

/// All write-grant and staged-tree state for one agent connection. Sessions
/// register on creation or load with their canonical bundle root; the state
/// drops with the connection, so grants never outlive their process.
pub struct SessionStages {
    sessions: Mutex<HashMap<String, SessionStage>>,
    checkpoint_directory: Option<PathBuf>,
}

impl Default for SessionStages {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            checkpoint_directory: None,
        }
    }
}

impl Drop for SessionStages {
    fn drop(&mut self) {
        let sessions = self
            .sessions
            .get_mut()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for (_, stage) in sessions.drain() {
            if let Some(checkpoint) = stage.checkpoint {
                discard_checkpoint(checkpoint);
            }
        }
    }
}

impl SessionStages {
    /// Persist the latest successful apply for each bundle in app-owned data.
    /// Grants and staged files remain connection-only.
    pub fn persistent(checkpoint_directory: PathBuf) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            checkpoint_directory: Some(checkpoint_directory),
        }
    }

    /// Register (or reset) a session. Creating and loading both start with the
    /// grant revoked and the staged tree empty: a restored session never
    /// inherits an earlier grant.
    pub fn register_session(
        &self,
        session_id: &str,
        bundle_root: &Path,
    ) -> Result<AgentStagedChangesInfo, String> {
        self.recover_interrupted_transaction(bundle_root)?;
        let checkpoint = match self.load_persisted_checkpoint(bundle_root) {
            Ok(checkpoint) => checkpoint,
            Err(error) => {
                self.quarantine_persisted_checkpoint(bundle_root)?;
                return Err(format!(
                    "{error} Studio quarantined the record; retry the session."
                ));
            }
        };
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        if let Some(previous) = sessions.remove(session_id) {
            if let Some(checkpoint) = previous.checkpoint {
                discard_checkpoint(checkpoint);
            }
        }
        let stage = SessionStage {
            bundle_root: bundle_root.to_path_buf(),
            granted: false,
            mode: AgentStageMode::Edit,
            files: BTreeMap::new(),
            checkpoint,
        };
        let changes = snapshot(session_id, &stage);
        sessions.insert(session_id.to_string(), stage);
        Ok(changes)
    }

    /// Grant or revoke writes for one registered session through a declared
    /// interaction mode. External ACP processes are not sandboxed, so an
    /// unattended grant fails closed until the process host can enforce it.
    pub fn set_grant_for_mode(
        &self,
        session_id: &str,
        granted: bool,
        mode: AgentWriteGrantMode,
    ) -> Result<AgentStagedChangesInfo, String> {
        if granted && mode == AgentWriteGrantMode::Unattended {
            return Err(
                "Unattended writes denied: external ACP agents are not running in an enforcement-capable sandbox. Use the interactive thread grant."
                    .to_string(),
            );
        }
        self.set_grant(session_id, granted)
    }

    /// Apply the interactive thread toggle. Revoking keeps staged files
    /// visible so the user can still review or discard them.
    fn set_grant(
        &self,
        session_id: &str,
        granted: bool,
    ) -> Result<AgentStagedChangesInfo, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "The ACP session is not active.".to_string())?;
        stage.granted = granted;
        Ok(snapshot(session_id, stage))
    }

    /// Select whether staged writes overlay the open bundle or describe a
    /// fresh bundle. The mode can change only while the staged tree is empty.
    pub fn set_mode(
        &self,
        session_id: &str,
        mode: AgentStageMode,
    ) -> Result<AgentStagedChangesInfo, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "The ACP session is not active.".to_string())?;
        if !stage.files.is_empty() && stage.mode != mode {
            return Err(
                "Resolve the current staged changes before changing the staging mode.".to_string(),
            );
        }
        stage.mode = mode;
        Ok(snapshot(session_id, stage))
    }

    /// Discard every staged file for one session; the grant is untouched.
    pub fn discard(&self, session_id: &str) -> Result<AgentStagedChangesInfo, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "The ACP session is not active.".to_string())?;
        stage.files.clear();
        Ok(snapshot(session_id, stage))
    }

    /// Stage one agent write. The write is accepted only for a registered,
    /// granted session and a path that stays inside the bundle root; content
    /// and tree size are bounded. Nothing reaches the filesystem.
    pub fn stage_write(
        &self,
        session_id: &str,
        path: &Path,
        content: String,
    ) -> Result<AgentStagedChangesInfo, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "Bundle write denied: the ACP session is not active.".to_string())?;
        if !stage.granted {
            return Err(WRITE_GRANT_MESSAGE.to_string());
        }
        stage_write_into(stage, path, content)?;
        Ok(snapshot(session_id, stage))
    }

    /// Reduce a complete ACP diff-content replacement into the staged tree.
    /// The batch is atomic and accepted only when every agent-supplied old
    /// text matches the current disk-or-staged view. This makes ACP content a
    /// proposal rather than evidence that Studio applied a filesystem change.
    pub fn stage_reported_diffs(
        &self,
        session_id: &str,
        diffs: Vec<AgentReportedDiff>,
    ) -> Result<AgentStagedChangesInfo, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "Bundle write denied: the ACP session is not active.".to_string())?;
        if !stage.granted {
            return Err(WRITE_GRANT_MESSAGE.to_string());
        }
        if diffs.len() > MAX_STAGED_FILES {
            return Err(format!(
                "Bundle write denied: one ACP update may report at most {MAX_STAGED_FILES} files."
            ));
        }

        let mut candidate = stage.clone();
        let mut seen = BTreeSet::new();
        for diff in diffs {
            let relative = bundle_relative_write_path(&candidate.bundle_root, &diff.path)?;
            if !seen.insert(relative.clone()) {
                return Err(
                    "Bundle write denied: an ACP diff reported the same path twice.".to_string(),
                );
            }
            if diff
                .old_text
                .as_ref()
                .is_some_and(|text| text.len() > MAX_STAGED_FILE_BYTES)
            {
                return Err("Bundle write denied: an ACP diff base is too large.".to_string());
            }
            if candidate
                .files
                .get(&relative)
                .is_some_and(|file| file.content == diff.new_text)
            {
                continue;
            }
            let matches_staged = candidate
                .files
                .get(&relative)
                .is_some_and(|file| diff.old_text.as_deref() == Some(file.content.as_str()));
            let disk = disk_text(&candidate, &relative)?;
            if !matches_staged && diff.old_text.as_deref() != disk.as_deref() {
                return Err(
                    "ACP diff not staged: its base does not match the current bundle or staged tree."
                        .to_string(),
                );
            }
            stage_write_into(&mut candidate, &diff.path, diff.new_text)?;
        }
        *stage = candidate;
        Ok(snapshot(session_id, stage))
    }

    /// Remove one staged file, identified by the bundle-relative path the
    /// snapshot reported. The grant is untouched.
    pub fn discard_file(
        &self,
        session_id: &str,
        path: &str,
    ) -> Result<AgentStagedChangesInfo, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "The ACP session is not active.".to_string())?;
        if stage.files.remove(path).is_none() {
            return Err("This file is not staged.".to_string());
        }
        Ok(snapshot(session_id, stage))
    }

    /// A bounded unified diff between the current bundle file and the staged
    /// content, identified by the bundle-relative path the snapshot reported.
    /// Never touches the filesystem beyond one bounded read of the original.
    pub fn staged_diff(&self, session_id: &str, path: &str) -> Result<AgentStagedFileDiff, String> {
        // Copy what the diff needs, then release the lock before file I/O.
        let (bundle_root, content, kind, selection) = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "Agent staging state is unavailable.".to_string())?;
            let stage = sessions
                .get(session_id)
                .ok_or_else(|| "The ACP session is not active.".to_string())?;
            let file = stage
                .files
                .get(path)
                .ok_or_else(|| "This file is not staged.".to_string())?;
            let selection = file
                .selection
                .as_ref()
                .map(|selection| (selection.revision.clone(), selection.rejected.clone()));
            (
                stage.bundle_root.clone(),
                file.content.clone(),
                file.kind,
                selection,
            )
        };
        let original = read_original(&bundle_root, path, kind)?;
        Ok(build_staged_diff(
            path,
            kind,
            &original,
            &content,
            selection.as_ref(),
        ))
    }

    /// Select or reject one hunk for a future apply. The supplied revision
    /// binds the choice to the exact original and staged text reviewed by the
    /// user. A later agent write or external file edit makes it stale.
    pub fn set_hunk_selection(
        &self,
        session_id: &str,
        path: &str,
        revision: &str,
        hunk_index: usize,
        selected: bool,
    ) -> Result<AgentStagedFileDiff, String> {
        let (bundle_root, content, kind, current_selection) = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "Agent staging state is unavailable.".to_string())?;
            let stage = sessions
                .get(session_id)
                .ok_or_else(|| "The ACP session is not active.".to_string())?;
            let file = stage
                .files
                .get(path)
                .ok_or_else(|| "This file is not staged.".to_string())?;
            let selection = file
                .selection
                .as_ref()
                .map(|selection| (selection.revision.clone(), selection.rejected.clone()));
            (
                stage.bundle_root.clone(),
                file.content.clone(),
                file.kind,
                selection,
            )
        };
        let original = read_original(&bundle_root, path, kind)?;
        let mut diff =
            build_staged_diff(path, kind, &original, &content, current_selection.as_ref());
        if diff.revision != revision {
            return Err("The staged diff changed. Review the file again.".to_string());
        }
        let hunk = diff
            .hunks
            .iter_mut()
            .find(|hunk| hunk.index == hunk_index)
            .ok_or_else(|| "This staged diff hunk is unavailable.".to_string())?;
        if diff.truncated {
            return Err("Hunk choices are unavailable for a truncated diff.".to_string());
        }
        hunk.selected = selected;

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "The ACP session is not active.".to_string())?;
        let file = stage
            .files
            .get_mut(path)
            .ok_or_else(|| "This file is not staged.".to_string())?;
        if file.content != content || file.kind != kind {
            return Err("The staged diff changed. Review the file again.".to_string());
        }
        let selection = file.selection.get_or_insert_with(|| HunkSelection {
            revision: revision.to_string(),
            rejected: BTreeSet::new(),
        });
        if selection.revision != revision {
            selection.revision = revision.to_string();
            selection.rejected.clear();
        }
        if selected {
            selection.rejected.remove(&hunk_index);
        } else {
            selection.rejected.insert(hunk_index);
        }
        Ok(diff)
    }

    /// Validate the selected staged outcome in an isolated Markdown mirror of
    /// the bundle. The returned revision binds later apply work to the exact
    /// disk bases, staged text, and hunk choices validated here.
    pub fn validate_staged(&self, session_id: &str) -> Result<AgentStagedValidationInfo, String> {
        let (bundle_root, mode, files) = {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| "Agent staging state is unavailable.".to_string())?;
            let stage = sessions
                .get(session_id)
                .ok_or_else(|| "The ACP session is not active.".to_string())?;
            if stage.files.is_empty() {
                return Err("There are no staged changes to validate.".to_string());
            }
            (stage.bundle_root.clone(), stage.mode, stage.files.clone())
        };

        let prepared = prepare_selected_stage(&bundle_root, &files, mode)?;
        validate_prepared(session_id, &bundle_root, &prepared, mode)
    }

    /// Apply the exact zero-error staged revision the user validated. The
    /// session lock freezes agent staging while validation and the transaction
    /// run. Disk bases and path containment are checked again immediately
    /// before same-directory replacements; ordinary failures roll back every
    /// file already replaced.
    pub fn apply_staged(
        &self,
        session_id: &str,
        expected_revision: &str,
    ) -> Result<AgentStagedApplyInfo, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "The ACP session is not active.".to_string())?;
        if stage.mode == AgentStageMode::Create {
            return Err(
                "Fresh bundle drafts cannot be applied to the active bundle. Choose a destination instead."
                    .to_string(),
            );
        }
        if self.checkpoint_directory.is_some() {
            self.recover_interrupted_transaction(&stage.bundle_root)?;
            stage.checkpoint = self.load_persisted_checkpoint(&stage.bundle_root)?;
        }
        if stage.files.is_empty() {
            return Err("There are no staged changes to apply.".to_string());
        }

        let prepared = prepare_selected_stage(&stage.bundle_root, &stage.files, stage.mode)?;
        let revision = selected_stage_revision(&prepared);
        if revision != expected_revision {
            return Err("The staged changes or bundle files changed. Validate them again.".to_string());
        }
        let validation = validate_prepared(session_id, &stage.bundle_root, &prepared, stage.mode)?;
        if validation.errors > 0 {
            return Err(format!(
                "Apply blocked: staged validation found {} error{}.",
                validation.errors,
                if validation.errors == 1 { "" } else { "s" }
            ));
        }
        validate_checkpoint_size(&prepared)?;

        let mut transaction = plan_apply_transaction(&stage.bundle_root, &prepared)?;
        transaction.previous_checkpoint = stage.checkpoint.clone();
        if self.checkpoint_directory.is_some() {
            self.persist_apply_transaction(&stage.bundle_root, &transaction)?;
        }
        let mut checkpoint = match execute_apply_transaction(&transaction, None) {
            Ok(checkpoint) => checkpoint,
            Err(error) => {
                return match self.remove_apply_transaction(&stage.bundle_root) {
                    Ok(()) => Err(error),
                    Err(remove_error) => Err(format!("{error} {remove_error}")),
                };
            }
        };
        let applied_files = checkpoint.files.len();
        if !checkpoint.files.is_empty() && self.checkpoint_directory.is_some() {
            let commit = (|| -> Result<(), String> {
                if let Some(previous) = stage.checkpoint.as_ref() {
                    self.remove_persisted_checkpoint(&stage.bundle_root, &previous.id)?;
                }
                self.persist_checkpoint(&stage.bundle_root, &checkpoint)
            })();
            if let Err(error) = commit {
                let rollback = self.rollback_apply_transaction(&stage.bundle_root, &transaction);
                discard_checkpoint(checkpoint);
                return match rollback {
                    Ok(()) => Err(error),
                    Err(rollback_error) => Err(format!(
                        "{error} The applied files could not be rolled back: {rollback_error}"
                    )),
                };
            }
            recover_committed_apply(&transaction)?;
            self.remove_apply_transaction(&stage.bundle_root)?;
            discard_checkpoint_backups(&mut checkpoint);
        }
        if let Some(previous) = stage.checkpoint.take() {
            discard_checkpoint(previous);
        }
        stage.checkpoint = (!checkpoint.files.is_empty()).then_some(checkpoint);
        stage.files.clear();
        Ok(AgentStagedApplyInfo {
            session_id: session_id.to_string(),
            revision,
            applied_files,
            changes: snapshot(session_id, stage),
        })
    }

    /// Restore the latest successful apply while every applied file still
    /// matches the checkpoint. New staged work must be resolved first.
    pub fn restore_checkpoint(
        &self,
        session_id: &str,
    ) -> Result<AgentCheckpointRestoreInfo, String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Agent staging state is unavailable.".to_string())?;
        let stage = sessions
            .get_mut(session_id)
            .ok_or_else(|| "The ACP session is not active.".to_string())?;
        if self.checkpoint_directory.is_some() {
            self.recover_interrupted_transaction(&stage.bundle_root)?;
            stage.checkpoint = self.load_persisted_checkpoint(&stage.bundle_root)?;
        }
        if !stage.files.is_empty() {
            return Err("Discard or apply the current staged changes before restoring.".to_string());
        }
        let checkpoint = stage
            .checkpoint
            .as_ref()
            .ok_or_else(|| "There is no restorable checkpoint for this thread.".to_string())?;
        self.require_persisted_checkpoint(&stage.bundle_root, &checkpoint.id)?;
        let transaction = plan_restore_transaction(&stage.bundle_root, checkpoint)?;
        if self.checkpoint_directory.is_some() {
            self.persist_restore_transaction(&stage.bundle_root, &transaction)?;
        }
        if let Err(error) = execute_restore_transaction(&transaction, None) {
            return match self.remove_restore_transaction(&stage.bundle_root) {
                Ok(()) => Err(error),
                Err(remove_error) => Err(format!("{error} {remove_error}")),
            };
        }
        let restored_files = checkpoint.files.len();
        self.remove_persisted_checkpoint(&stage.bundle_root, &checkpoint.id)?;
        self.remove_restore_transaction(&stage.bundle_root)?;
        stage.checkpoint = None;
        Ok(AgentCheckpointRestoreInfo {
            session_id: session_id.to_string(),
            restored_files,
            changes: snapshot(session_id, stage),
        })
    }

    fn checkpoint_file(&self, bundle_root: &Path) -> Option<PathBuf> {
        self.checkpoint_directory.as_ref().map(|directory| {
            directory.join(format!("{}.json", bundle_fingerprint(bundle_root)))
        })
    }

    fn apply_transaction_file(&self, bundle_root: &Path) -> Option<PathBuf> {
        self.checkpoint_directory.as_ref().map(|directory| {
            directory.join(format!(
                "{}.apply.json",
                bundle_fingerprint(bundle_root)
            ))
        })
    }

    fn restore_transaction_file(&self, bundle_root: &Path) -> Option<PathBuf> {
        self.checkpoint_directory.as_ref().map(|directory| {
            directory.join(format!(
                "{}.restore.json",
                bundle_fingerprint(bundle_root)
            ))
        })
    }

    fn recover_interrupted_transaction(&self, bundle_root: &Path) -> Result<(), String> {
        let Some(apply_file) = self.apply_transaction_file(bundle_root) else {
            return Ok(());
        };
        let restore_file = self
            .restore_transaction_file(bundle_root)
            .expect("persistent transaction paths are paired");
        if apply_file.exists() && restore_file.exists() {
            return Err(
                "Studio found overlapping interrupted bundle transactions. No files were changed."
                    .to_string(),
            );
        }
        if apply_file.exists() {
            let transaction = match read_private_json_file::<PersistedApplyTransaction>(
                &apply_file,
                "apply transaction",
            )
            .and_then(|persisted| persisted_apply_transaction(bundle_root, persisted))
            {
                Ok(transaction) => transaction,
                Err(error) => {
                    quarantine_transaction_file(&apply_file, "apply")?;
                    return Err(format!(
                        "{error} Studio quarantined the transaction; retry the session."
                    ));
                }
            };
            let saved_checkpoint = self.load_persisted_checkpoint(bundle_root)?;
            if saved_checkpoint
                .as_ref()
                .is_some_and(|checkpoint| checkpoint.id == transaction.checkpoint.id)
            {
                recover_committed_apply(&transaction)?;
            } else {
                if let Some(checkpoint) = &saved_checkpoint {
                    let previous_matches = transaction
                        .previous_checkpoint
                        .as_ref()
                        .is_some_and(|previous| previous.id == checkpoint.id);
                    if !previous_matches {
                        return Err(
                            "Interrupted apply recovery found a different saved checkpoint. No files were changed."
                                .to_string(),
                        );
                    }
                }
                recover_uncommitted_apply(&transaction)?;
                if saved_checkpoint.is_none() {
                    if let Some(previous) = &transaction.previous_checkpoint {
                        self.persist_checkpoint(bundle_root, previous)?;
                    }
                }
            }
            std::fs::remove_file(&apply_file).map_err(|_| {
                "Studio recovered an interrupted apply but could not clear its transaction record."
                    .to_string()
            })?;
        } else if restore_file.exists() {
            let transaction = match read_private_json_file::<PersistedRestoreTransaction>(
                &restore_file,
                "restore transaction",
            )
            .and_then(|persisted| persisted_restore_transaction(bundle_root, persisted))
            {
                Ok(transaction) => transaction,
                Err(error) => {
                    quarantine_transaction_file(&restore_file, "restore")?;
                    return Err(format!(
                        "{error} Studio quarantined the transaction; retry the session."
                    ));
                }
            };
            if let Some(checkpoint) = self.load_persisted_checkpoint(bundle_root)? {
                if checkpoint.id != transaction.checkpoint.id {
                    return Err(
                        "Interrupted restore recovery found a different saved checkpoint. No files were changed."
                            .to_string(),
                    );
                }
            }
            recover_interrupted_restore(&transaction)?;
            self.remove_persisted_checkpoint(bundle_root, &transaction.checkpoint.id)?;
            std::fs::remove_file(&restore_file).map_err(|_| {
                "Studio recovered an interrupted restore but could not clear its transaction record."
                    .to_string()
            })?;
        }
        Ok(())
    }

    fn load_persisted_checkpoint(
        &self,
        bundle_root: &Path,
    ) -> Result<Option<AppliedCheckpoint>, String> {
        let Some(file) = self.checkpoint_file(bundle_root) else {
            return Ok(None);
        };
        if !file.exists() {
            return Ok(None);
        }
        let persisted: PersistedCheckpoint =
            read_private_json_file(&file, "apply checkpoint")?;
        persisted_checkpoint(bundle_root, persisted).map(Some)
    }

    fn persist_apply_transaction(
        &self,
        bundle_root: &Path,
        transaction: &ApplyTransaction,
    ) -> Result<(), String> {
        let Some(file) = self.apply_transaction_file(bundle_root) else {
            return Ok(());
        };
        let persisted = serialize_apply_transaction(bundle_root, transaction)?;
        write_private_json_file(&file, &persisted, "apply transaction")
    }

    fn persist_restore_transaction(
        &self,
        bundle_root: &Path,
        transaction: &RestoreTransaction,
    ) -> Result<(), String> {
        let Some(file) = self.restore_transaction_file(bundle_root) else {
            return Ok(());
        };
        let persisted = serialize_restore_transaction(bundle_root, transaction)?;
        write_private_json_file(&file, &persisted, "restore transaction")
    }

    fn remove_apply_transaction(&self, bundle_root: &Path) -> Result<(), String> {
        remove_transaction_file(self.apply_transaction_file(bundle_root), "apply")
    }

    fn remove_restore_transaction(&self, bundle_root: &Path) -> Result<(), String> {
        remove_transaction_file(self.restore_transaction_file(bundle_root), "restore")
    }

    fn rollback_apply_transaction(
        &self,
        bundle_root: &Path,
        transaction: &ApplyTransaction,
    ) -> Result<(), String> {
        let saved = self.load_persisted_checkpoint(bundle_root)?;
        if let Some(checkpoint) = &saved {
            if checkpoint.id == transaction.checkpoint.id {
                self.remove_persisted_checkpoint(bundle_root, &checkpoint.id)?;
            } else if transaction
                .previous_checkpoint
                .as_ref()
                .is_none_or(|previous| previous.id != checkpoint.id)
            {
                return Err(
                    "A different checkpoint appeared while apply was being rolled back."
                        .to_string(),
                );
            }
        }
        recover_uncommitted_apply(transaction)?;
        if self.load_persisted_checkpoint(bundle_root)?.is_none() {
            if let Some(previous) = &transaction.previous_checkpoint {
                self.persist_checkpoint(bundle_root, previous)?;
            }
        }
        self.remove_apply_transaction(bundle_root)
    }

    fn persist_checkpoint(
        &self,
        bundle_root: &Path,
        checkpoint: &AppliedCheckpoint,
    ) -> Result<(), String> {
        let Some(file) = self.checkpoint_file(bundle_root) else {
            return Ok(());
        };
        let persisted = serialize_checkpoint(bundle_root, checkpoint)?;
        write_checkpoint_file(&file, &persisted)
    }

    fn quarantine_persisted_checkpoint(&self, bundle_root: &Path) -> Result<(), String> {
        let Some(file) = self.checkpoint_file(bundle_root) else {
            return Ok(());
        };
        if !file.exists() {
            return Ok(());
        }
        let parent = file
            .parent()
            .ok_or_else(|| "Studio could not quarantine its invalid apply checkpoint.".to_string())?;
        let quarantined = parent.join(format!(
            ".okf-studio-invalid-checkpoint-{}.json",
            uuid::Uuid::new_v4()
        ));
        std::fs::rename(file, quarantined)
            .map_err(|_| "Studio could not quarantine its invalid apply checkpoint.".to_string())
    }

    fn require_persisted_checkpoint(
        &self,
        bundle_root: &Path,
        expected_id: &str,
    ) -> Result<(), String> {
        if self.checkpoint_directory.is_none() {
            return Ok(());
        }
        let checkpoint = self
            .load_persisted_checkpoint(bundle_root)?
            .ok_or_else(|| "The saved apply checkpoint is no longer available.".to_string())?;
        if checkpoint.id != expected_id {
            return Err("A newer apply checkpoint replaced this one.".to_string());
        }
        Ok(())
    }

    fn remove_persisted_checkpoint(
        &self,
        bundle_root: &Path,
        expected_id: &str,
    ) -> Result<(), String> {
        let Some(file) = self.checkpoint_file(bundle_root) else {
            return Ok(());
        };
        if !file.exists() {
            return Ok(());
        }
        let checkpoint = self
            .load_persisted_checkpoint(bundle_root)?
            .ok_or_else(|| "The saved apply checkpoint is no longer available.".to_string())?;
        if checkpoint.id != expected_id {
            return Err("A newer apply checkpoint replaced this one.".to_string());
        }
        std::fs::remove_file(file)
            .map_err(|_| "Studio could not remove its saved apply checkpoint.".to_string())
    }

    /// The staged content for a path, if that exact bundle file was staged.
    /// Used by the read bridge so a granted agent observes its own writes.
    pub fn staged_content(&self, session_id: &str, path: &Path) -> Option<String> {
        let sessions = self.sessions.lock().ok()?;
        let stage = sessions.get(session_id)?;
        let relative = bundle_relative_write_path(&stage.bundle_root, path).ok()?;
        stage.files.get(&relative).map(|file| file.content.clone())
    }

    /// The current snapshot for one session, when registered.
    #[cfg(test)]
    pub fn summary(&self, session_id: &str) -> Option<AgentStagedChangesInfo> {
        let sessions = self.sessions.lock().ok()?;
        sessions
            .get(session_id)
            .map(|stage| snapshot(session_id, stage))
    }
}

fn stage_write_into(stage: &mut SessionStage, path: &Path, content: String) -> Result<(), String> {
    let relative = bundle_relative_write_path(&stage.bundle_root, path)?;
    if content.len() > MAX_STAGED_FILE_BYTES {
        return Err(format!(
            "Bundle write denied: staged files are limited to {MAX_STAGED_FILE_BYTES} bytes."
        ));
    }
    let existing = stage.files.get(&relative);
    let used: usize = stage
        .files
        .iter()
        .filter(|(staged_path, _)| *staged_path != &relative)
        .map(|(_, file)| file.content.len())
        .sum();
    if used + content.len() > MAX_STAGED_TOTAL_BYTES {
        return Err(format!(
            "Bundle write denied: staged changes are limited to {MAX_STAGED_TOTAL_BYTES} bytes in total."
        ));
    }
    if existing.is_none() && stage.files.len() >= MAX_STAGED_FILES {
        return Err(format!(
            "Bundle write denied: staged changes are limited to {MAX_STAGED_FILES} files."
        ));
    }
    if existing.is_some_and(|file| file.content == content) {
        return Ok(());
    }
    // A fresh-bundle draft has no originals. Edit mode decides whether this
    // write creates or modifies against the active bundle once, then keeps it
    // stable across repeated writes to the path.
    let kind = existing.map_or_else(
        || {
            if stage.mode == AgentStageMode::Edit
                && stage.bundle_root.join(Path::new(&relative)).is_file()
            {
                "modify"
            } else {
                "create"
            }
        },
        |file| file.kind,
    );
    stage.files.insert(
        relative,
        StagedFile {
            content,
            kind,
            selection: None,
        },
    );
    Ok(())
}

fn disk_text(stage: &SessionStage, relative: &str) -> Result<Option<String>, String> {
    if stage.mode == AgentStageMode::Create {
        return Ok(None);
    }
    let path = stage.bundle_root.join(Path::new(relative));
    if !path.exists() {
        return Ok(None);
    }
    if !path.is_file() {
        return Err("ACP diff not staged: its target is not a text file.".to_string());
    }
    let bytes = std::fs::read(path)
        .map_err(|_| "ACP diff not staged: its current file could not be read.".to_string())?;
    if bytes.len() > MAX_STAGED_FILE_BYTES {
        return Err("ACP diff not staged: its current file is too large.".to_string());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "ACP diff not staged: its current file is not UTF-8 text.".to_string())
}

fn selected_staged_content(
    path: &str,
    file: &StagedFile,
    original: &str,
) -> Result<(Option<String>, String), String> {
    let current = build_staged_diff(path, file.kind, original, &file.content, None);
    let Some(selection) = &file.selection else {
        return Ok((Some(file.content.clone()), current.revision));
    };
    if selection.revision != current.revision {
        return Err(format!(
            "Staged validation needs a fresh review of {path}; its diff changed."
        ));
    }

    let diff = TextDiff::from_lines(original, &file.content);
    let mut hunk_for_op = HashMap::<DiffOp, usize>::new();
    for (hunk_index, ops) in diff.grouped_ops(3).into_iter().enumerate() {
        for op in ops {
            if op.tag() != DiffTag::Equal {
                hunk_for_op.insert(op, hunk_index);
            }
        }
    }
    let mut output = String::new();
    for op in diff.ops() {
        let selected = hunk_for_op
            .get(op)
            .is_none_or(|index| !selection.rejected.contains(index));
        let range = if op.tag() == DiffTag::Equal || !selected {
            op.old_range()
        } else {
            op.new_range()
        };
        let slices = if op.tag() == DiffTag::Equal || !selected {
            diff.old_slices()
        } else {
            diff.new_slices()
        };
        for line in &slices[range] {
            output.push_str(line);
        }
    }
    let content = if file.kind == "create" && output.is_empty() {
        None
    } else {
        Some(output)
    };
    Ok((content, current.revision))
}

#[derive(Clone)]
struct PreparedStagedFile {
    path: String,
    kind: &'static str,
    original: String,
    effective: Option<String>,
    diff_revision: String,
}

fn prepare_selected_stage(
    bundle_root: &Path,
    files: &BTreeMap<String, StagedFile>,
    mode: AgentStageMode,
) -> Result<Vec<PreparedStagedFile>, String> {
    files
        .iter()
        .map(|(path, file)| {
            let target = bundle_root.join(Path::new(path));
            let relative = bundle_relative_write_path(bundle_root, &target)?;
            if relative != *path {
                return Err("A staged path no longer resolves to its reviewed file.".to_string());
            }
            if mode == AgentStageMode::Edit && file.kind == "create" && target.exists() {
                return Err(format!(
                    "Staged apply needs a fresh review of {path}; the file now exists."
                ));
            }
            let original = read_original(bundle_root, path, file.kind)?;
            let (effective, diff_revision) =
                selected_staged_content(path, file, &original)?;
            Ok(PreparedStagedFile {
                path: path.clone(),
                kind: file.kind,
                original,
                effective,
                diff_revision,
            })
        })
        .collect()
}

fn selected_stage_revision(prepared: &[PreparedStagedFile]) -> String {
    let mut digest = Sha256::new();
    for file in prepared {
        for part in [file.path.as_bytes(), file.diff_revision.as_bytes()] {
            digest.update((part.len() as u64).to_le_bytes());
            digest.update(part);
        }
        match &file.effective {
            Some(content) => {
                digest.update([1]);
                digest.update((content.len() as u64).to_le_bytes());
                digest.update(content.as_bytes());
            }
            None => digest.update([0]),
        }
    }
    format!("{:x}", digest.finalize())
}

fn validate_prepared(
    session_id: &str,
    bundle_root: &Path,
    prepared: &[PreparedStagedFile],
    mode: AgentStageMode,
) -> Result<AgentStagedValidationInfo, String> {
    let mirror = ValidationMirror::create()?;
    if mode == AgentStageMode::Edit {
        copy_markdown_tree(bundle_root, &mirror.path)?;
    }
    for file in prepared {
        if !file.path.to_ascii_lowercase().ends_with(".md") {
            continue;
        }
        let target = mirror.path.join(Path::new(&file.path));
        if let Some(content) = &file.effective {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|_| {
                    "Staged validation workspace could not be prepared.".to_string()
                })?;
            }
            std::fs::write(target, content)
                .map_err(|_| "Staged validation workspace could not be written.".to_string())?;
        } else if target.exists() {
            std::fs::remove_file(target)
                .map_err(|_| "Staged validation workspace could not be updated.".to_string())?;
        }
    }

    let bundle = okf_core::read_bundle(&mirror.path);
    let errors = bundle
        .issues
        .iter()
        .filter(|issue| issue.level == okf_core::IssueLevel::Error)
        .count();
    let warnings = bundle.issues.len().saturating_sub(errors);
    let truncated = bundle.issues.len() > MAX_VALIDATION_ISSUES;
    let issues = bundle
        .issues
        .into_iter()
        .take(MAX_VALIDATION_ISSUES)
        .map(|issue| AgentStagedValidationIssue {
            path: issue.concept_id.map(|id| format!("{id}.md")),
            level: match issue.level {
                okf_core::IssueLevel::Error => "error",
                okf_core::IssueLevel::Warning => "warning",
            },
            message: bounded_validation_message(&issue.message),
        })
        .collect();
    Ok(AgentStagedValidationInfo {
        session_id: session_id.to_string(),
        revision: selected_stage_revision(prepared),
        errors,
        warnings,
        issues,
        truncated,
    })
}

struct PendingReplacement {
    target: PathBuf,
    temporary: PathBuf,
    backup: Option<PathBuf>,
    kind: &'static str,
    original: String,
    applied_content: String,
}

struct AppliedReplacement {
    target: PathBuf,
    backup: Option<PathBuf>,
}

struct ApplyTransaction {
    checkpoint: AppliedCheckpoint,
    previous_checkpoint: Option<AppliedCheckpoint>,
    pending: Vec<PendingReplacement>,
}

fn validate_checkpoint_size(prepared: &[PreparedStagedFile]) -> Result<(), String> {
    let mut bytes = 0usize;
    for file in prepared {
        let Some(effective) = &file.effective else {
            continue;
        };
        bytes = bytes
            .checked_add(effective.len())
            .and_then(|total| {
                total.checked_add(if file.kind == "modify" {
                    file.original.len()
                } else {
                    0
                })
            })
            .ok_or_else(|| "Apply blocked: the restore checkpoint is too large.".to_string())?;
        if bytes > MAX_CHECKPOINT_CONTENT_BYTES {
            return Err(format!(
                "Apply blocked: original and applied text exceed the {MAX_CHECKPOINT_CONTENT_BYTES}-byte restore checkpoint limit."
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
fn apply_prepared_transaction(
    bundle_root: &Path,
    prepared: &[PreparedStagedFile],
    fail_after: Option<usize>,
) -> Result<AppliedCheckpoint, String> {
    let transaction = plan_apply_transaction(bundle_root, prepared)?;
    execute_apply_transaction(&transaction, fail_after)
}

fn plan_apply_transaction(
    bundle_root: &Path,
    prepared: &[PreparedStagedFile],
) -> Result<ApplyTransaction, String> {
    let mut pending = Vec::new();
    let mut created_directories = Vec::new();
    for file in prepared {
        let Some(content) = &file.effective else {
            continue;
        };
        let target = bundle_root.join(Path::new(&file.path));
        verify_prepared_base(bundle_root, file, &target)?;
        let Some(parent) = target.parent() else {
            return Err("A staged file has no parent directory.".to_string());
        };
        plan_transaction_directories(bundle_root, parent, &mut created_directories)?;
        let relative = bundle_relative_write_path(bundle_root, &target)?;
        if relative != file.path {
            return Err("A staged path changed while preparing the transaction.".to_string());
        }

        let transaction_id = uuid::Uuid::new_v4();
        let temporary = parent.join(format!(".okf-studio-{transaction_id}.tmp"));
        let backup = (file.kind == "modify")
            .then(|| parent.join(format!(".okf-studio-{transaction_id}.bak")));
        pending.push(PendingReplacement {
            target,
            temporary,
            backup,
            kind: file.kind,
            original: file.original.clone(),
            applied_content: content.clone(),
        });
    }

    let checkpoint = AppliedCheckpoint {
        id: uuid::Uuid::new_v4().to_string(),
        files: pending
            .iter()
            .map(|replacement| CheckpointFile {
                target: replacement.target.clone(),
                backup: replacement.backup.clone(),
                original_content: (replacement.kind == "modify")
                    .then(|| replacement.original.clone()),
                applied_content: replacement.applied_content.clone(),
            })
            .collect(),
        created_directories,
    };
    Ok(ApplyTransaction {
        checkpoint,
        previous_checkpoint: None,
        pending,
    })
}

fn execute_apply_transaction(
    transaction: &ApplyTransaction,
    fail_after: Option<usize>,
) -> Result<AppliedCheckpoint, String> {
    let mut created_directories = Vec::new();
    for directory in &transaction.checkpoint.created_directories {
        if directory.exists() {
            cleanup_directories(&created_directories);
            return Err("A staged directory was created while apply was pending.".to_string());
        }
        if std::fs::create_dir(directory).is_err() {
            cleanup_directories(&created_directories);
            return Err("A staged file's directory could not be created.".to_string());
        }
        created_directories.push(directory.clone());
    }

    for (prepared_count, replacement) in transaction.pending.iter().enumerate() {
        if let Err(error) = verify_transaction_base(replacement) {
            cleanup_pending(&transaction.pending[..prepared_count]);
            cleanup_directories(&created_directories);
            return Err(error);
        }
        let write_result = (|| -> Result<(), String> {
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&replacement.temporary)
                .map_err(|_| "A staged transaction file could not be created.".to_string())?;
            output
                .write_all(replacement.applied_content.as_bytes())
                .and_then(|()| output.sync_all())
                .map_err(|_| "A staged transaction file could not be written.".to_string())?;
            if replacement.kind == "modify" {
                let permissions = std::fs::metadata(&replacement.target)
                    .map_err(|_| "A staged file's permissions could not be read.".to_string())?
                    .permissions();
                std::fs::set_permissions(&replacement.temporary, permissions).map_err(|_| {
                    "A staged transaction file's permissions could not be set.".to_string()
                })?;
            }
            Ok(())
        })();
        if let Err(error) = write_result {
            let _ = std::fs::remove_file(&replacement.temporary);
            cleanup_pending(&transaction.pending[..prepared_count]);
            cleanup_directories(&created_directories);
            return Err(error);
        }
    }

    let mut applied = Vec::new();
    for (index, replacement) in transaction.pending.iter().enumerate() {
        if fail_after.is_some_and(|limit| index >= limit) {
            rollback_replacements(&applied);
            cleanup_pending(&transaction.pending);
            cleanup_directories(&created_directories);
            return Err("The staged transaction was interrupted.".to_string());
        }
        if let Err(error) = verify_transaction_base(replacement) {
            rollback_replacements(&applied);
            cleanup_pending(&transaction.pending);
            cleanup_directories(&created_directories);
            return Err(error);
        }
        if let Some(backup) = &replacement.backup {
            if std::fs::rename(&replacement.target, backup).is_err() {
                rollback_replacements(&applied);
                cleanup_pending(&transaction.pending);
                cleanup_directories(&created_directories);
                return Err("A bundle file could not enter the apply transaction.".to_string());
            }
        }
        if std::fs::rename(&replacement.temporary, &replacement.target).is_err() {
            if let Some(backup) = &replacement.backup {
                let _ = std::fs::rename(backup, &replacement.target);
            }
            rollback_replacements(&applied);
            cleanup_pending(&transaction.pending);
            cleanup_directories(&created_directories);
            return Err("A staged file could not be applied; the batch was restored.".to_string());
        }
        applied.push(AppliedReplacement {
            target: replacement.target.clone(),
            backup: replacement.backup.clone(),
        });
    }

    debug_assert_eq!(applied.len(), transaction.checkpoint.files.len());
    Ok(transaction.checkpoint.clone())
}

fn verify_prepared_base(
    bundle_root: &Path,
    file: &PreparedStagedFile,
    target: &Path,
) -> Result<(), String> {
    let relative = bundle_relative_write_path(bundle_root, target)?;
    if relative != file.path {
        return Err("A staged path no longer resolves to its reviewed file.".to_string());
    }
    if target
        .symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err(format!("Apply blocked: {} is a symbolic link.", file.path));
    }
    if file.kind == "create" {
        if target.exists() {
            return Err(format!(
                "Apply blocked: {} was created after validation.",
                file.path
            ));
        }
        return Ok(());
    }
    let current = std::fs::read_to_string(target)
        .map_err(|_| format!("Apply blocked: {} could not be read.", file.path))?;
    if current != file.original {
        return Err(format!(
            "Apply blocked: {} changed after validation.",
            file.path
        ));
    }
    Ok(())
}

fn verify_transaction_base(replacement: &PendingReplacement) -> Result<(), String> {
    if replacement.kind == "create" {
        if replacement.target.exists() {
            return Err("A staged file was created while apply was in progress.".to_string());
        }
        return Ok(());
    }
    let current = std::fs::read_to_string(&replacement.target)
        .map_err(|_| "A bundle file could not be rechecked before apply.".to_string())?;
    if current != replacement.original {
        return Err("A bundle file changed while apply was in progress.".to_string());
    }
    Ok(())
}

fn plan_transaction_directories(
    bundle_root: &Path,
    parent: &Path,
    planned: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let relative = parent
        .strip_prefix(bundle_root)
        .map_err(|_| "A staged directory is outside the bundle.".to_string())?;
    let mut current = bundle_root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        if planned.contains(&current) {
            continue;
        }
        if current.exists() {
            if !current.is_dir() {
                return Err("A staged file's parent is not a directory.".to_string());
            }
            continue;
        }
        planned.push(current.clone());
    }
    Ok(())
}

fn rollback_replacements(applied: &[AppliedReplacement]) {
    for replacement in applied.iter().rev() {
        let _ = std::fs::remove_file(&replacement.target);
        if let Some(backup) = &replacement.backup {
            let _ = std::fs::rename(backup, &replacement.target);
        }
    }
}

fn cleanup_pending(pending: &[PendingReplacement]) {
    for replacement in pending {
        let _ = std::fs::remove_file(&replacement.temporary);
        if replacement.target.exists() {
            continue;
        }
        if let Some(backup) = &replacement.backup {
            let _ = std::fs::rename(backup, &replacement.target);
        }
    }
}

fn cleanup_directories(created: &[PathBuf]) {
    for directory in created.iter().rev() {
        let _ = std::fs::remove_dir(directory);
    }
}

struct RestoredReplacement {
    target: PathBuf,
    applied_temporary: PathBuf,
}

fn recover_committed_apply(transaction: &ApplyTransaction) -> Result<(), String> {
    for file in &transaction.pending {
        let target = recovery_text(&file.target, "applied file")?;
        if target.as_deref() != Some(file.applied_content.as_str()) {
            return Err(
                "Interrupted apply recovery stopped because an applied file changed. No recovery files were overwritten."
                    .to_string(),
            );
        }
        let temporary = recovery_text(&file.temporary, "apply transaction file")?;
        if temporary
            .as_deref()
            .is_some_and(|content| content != file.applied_content)
        {
            return Err(
                "Interrupted apply recovery found a changed transaction file. No recovery files were overwritten."
                    .to_string(),
            );
        }
        if let Some(backup) = &file.backup {
            let original = file.original.as_str();
            let backup_content = recovery_text(backup, "apply backup")?;
            if backup_content
                .as_deref()
                .is_some_and(|content| content != original)
            {
                return Err(
                    "Interrupted apply recovery found a changed backup. No recovery files were overwritten."
                        .to_string(),
                );
            }
        }
    }
    for file in &transaction.pending {
        remove_recovery_file(&file.temporary, "apply transaction file")?;
        if let Some(backup) = &file.backup {
            remove_recovery_file(backup, "apply backup")?;
        }
    }
    Ok(())
}

fn recover_uncommitted_apply(transaction: &ApplyTransaction) -> Result<(), String> {
    for file in &transaction.pending {
        let target = recovery_text(&file.target, "bundle file")?;
        let target_is_expected = if file.kind == "modify" {
            target.as_deref().is_none_or(|content| {
                content == file.original || content == file.applied_content
            })
        } else {
            target
                .as_deref()
                .is_none_or(|content| content == file.applied_content)
        };
        if !target_is_expected {
            return Err(
                "Interrupted apply recovery stopped because a bundle file changed. Restore its pre-apply or applied text, then retry."
                    .to_string(),
            );
        }
        let temporary = recovery_text(&file.temporary, "apply transaction file")?;
        if temporary
            .as_deref()
            .is_some_and(|content| content != file.applied_content)
        {
            return Err(
                "Interrupted apply recovery found a changed transaction file. No recovery files were overwritten."
                    .to_string(),
            );
        }
        if let Some(backup) = &file.backup {
            let backup_content = recovery_text(backup, "apply backup")?;
            if backup_content
                .as_deref()
                .is_some_and(|content| content != file.original)
            {
                return Err(
                    "Interrupted apply recovery found a changed backup. No recovery files were overwritten."
                        .to_string(),
                );
            }
        }
    }

    for file in &transaction.pending {
        if file.kind == "modify" {
            let target = recovery_text(&file.target, "bundle file")?;
            if target.as_deref() != Some(file.original.as_str()) {
                write_recovery_text(
                    &file.temporary,
                    &file.original,
                    target.as_ref().map(|_| file.target.as_path()).or_else(|| {
                        file.backup.as_deref().filter(|backup| backup.exists())
                    }),
                )?;
                remove_recovery_file(&file.target, "applied bundle file")?;
                std::fs::rename(&file.temporary, &file.target).map_err(|_| {
                    "Interrupted apply recovery could not restore an original file.".to_string()
                })?;
            } else {
                remove_recovery_file(&file.temporary, "apply transaction file")?;
            }
            if let Some(backup) = &file.backup {
                remove_recovery_file(backup, "apply backup")?;
            }
        } else {
            remove_recovery_file(&file.target, "applied bundle file")?;
            remove_recovery_file(&file.temporary, "apply transaction file")?;
        }
    }
    cleanup_recovery_directories(&transaction.checkpoint.created_directories)?;
    verify_recovered_originals(transaction)?;
    Ok(())
}

fn recover_interrupted_restore(transaction: &RestoreTransaction) -> Result<(), String> {
    for file in &transaction.pending {
        let target = recovery_text(&file.target, "bundle file")?;
        let original_temporary = file
            .original_temporary
            .as_ref()
            .map(|path| recovery_text(path, "restore transaction file"))
            .transpose()?
            .flatten();
        let applied_temporary = recovery_text(&file.applied_temporary, "restore undo file")?;
        if original_temporary
            .as_deref()
            .zip(file.original_content.as_deref())
            .is_some_and(|(actual, expected)| actual != expected)
            || applied_temporary
                .as_deref()
                .is_some_and(|content| content != file.applied_content)
        {
            return Err(
                "Interrupted restore recovery found a changed transaction file. No recovery files were overwritten."
                    .to_string(),
            );
        }
        let expected_target = target.as_deref().is_some_and(|content| {
            content == file.applied_content
                || file.original_content.as_deref() == Some(content)
        });
        let completed_creation = file.original_content.is_none() && target.is_none();
        let interrupted_gap = target.is_none()
            && (applied_temporary.is_some() || original_temporary.is_some());
        if !expected_target && !completed_creation && !interrupted_gap {
            return Err(
                "Interrupted restore recovery stopped because a bundle file changed. Restore its applied or original text, then retry."
                    .to_string(),
            );
        }
    }

    for file in &transaction.pending {
        if let Some(original) = &file.original_content {
            let target = recovery_text(&file.target, "bundle file")?;
            if target.as_deref() != Some(original.as_str()) {
                let temporary = file
                    .original_temporary
                    .as_ref()
                    .expect("modified checkpoints have a restore transaction file");
                write_recovery_text(
                    temporary,
                    original,
                    target.as_ref().map(|_| file.target.as_path()),
                )?;
                remove_recovery_file(&file.target, "applied bundle file")?;
                std::fs::rename(temporary, &file.target).map_err(|_| {
                    "Interrupted restore recovery could not restore an original file.".to_string()
                })?;
            }
        } else {
            remove_recovery_file(&file.target, "applied bundle file")?;
        }
        if let Some(temporary) = &file.original_temporary {
            remove_recovery_file(temporary, "restore transaction file")?;
        }
        remove_recovery_file(&file.applied_temporary, "restore undo file")?;
    }
    cleanup_recovery_directories(&transaction.checkpoint.created_directories)?;
    verify_restored_checkpoint(&transaction.checkpoint)
}

fn verify_recovered_originals(transaction: &ApplyTransaction) -> Result<(), String> {
    for file in &transaction.pending {
        let current = recovery_text(&file.target, "bundle file")?;
        let restored = if file.kind == "modify" {
            current.as_deref() == Some(file.original.as_str())
        } else {
            current.is_none()
        };
        if !restored || file.temporary.exists() || file.backup.as_ref().is_some_and(|p| p.exists()) {
            return Err("Studio could not finish interrupted apply recovery.".to_string());
        }
    }
    Ok(())
}

fn verify_restored_checkpoint(checkpoint: &AppliedCheckpoint) -> Result<(), String> {
    for file in &checkpoint.files {
        let current = recovery_text(&file.target, "bundle file")?;
        let restored = file.original_content.as_deref().map_or_else(
            || current.is_none(),
            |original| current.as_deref() == Some(original),
        );
        if !restored {
            return Err("Studio could not finish interrupted restore recovery.".to_string());
        }
    }
    Ok(())
}

fn recovery_text(path: &Path, label: &str) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| format!("Studio could not inspect a recovery {label}."))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("A recovery {label} is not a regular file."));
    }
    if metadata.len() > MAX_STAGED_FILE_BYTES as u64 {
        return Err(format!("A recovery {label} exceeds its size limit."));
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|_| format!("Studio could not read a recovery {label}."))
}

fn write_recovery_text(
    temporary: &Path,
    content: &str,
    permissions_source: Option<&Path>,
) -> Result<(), String> {
    remove_recovery_file(temporary, "transaction file")?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temporary)
        .map_err(|_| "Studio could not create a recovery transaction file.".to_string())?;
    output
        .write_all(content.as_bytes())
        .and_then(|()| output.sync_all())
        .map_err(|_| "Studio could not write a recovery transaction file.".to_string())?;
    if let Some(source) = permissions_source {
        let permissions = std::fs::metadata(source)
            .map_err(|_| "Studio could not inspect recovery file permissions.".to_string())?
            .permissions();
        std::fs::set_permissions(temporary, permissions)
            .map_err(|_| "Studio could not preserve recovery file permissions.".to_string())?;
    }
    Ok(())
}

fn remove_recovery_file(path: &Path, label: &str) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(format!("Studio could not remove a recovery {label}.")),
    }
}

fn cleanup_recovery_directories(created: &[PathBuf]) -> Result<(), String> {
    for directory in created.iter().rev() {
        match std::fs::remove_dir(directory) {
            Ok(()) => {}
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty
                ) => {}
            Err(_) => {
                return Err(
                    "Studio could not clean up a directory from an interrupted transaction."
                        .to_string(),
                );
            }
        }
    }
    Ok(())
}

struct PendingCheckpointRestore {
    target: PathBuf,
    original_temporary: Option<PathBuf>,
    applied_temporary: PathBuf,
    original_content: Option<String>,
    applied_content: String,
}

struct RestoreTransaction {
    checkpoint: AppliedCheckpoint,
    pending: Vec<PendingCheckpointRestore>,
}

fn plan_restore_transaction(
    bundle_root: &Path,
    checkpoint: &AppliedCheckpoint,
) -> Result<RestoreTransaction, String> {
    let mut pending = Vec::new();
    for file in &checkpoint.files {
        bundle_relative_write_path(bundle_root, &file.target)?;
        if file
            .target
            .symlink_metadata()
            .is_ok_and(|metadata| metadata.file_type().is_symlink())
        {
            return Err("Checkpoint restore blocked: an applied path is now a symbolic link.".to_string());
        }
        let current = std::fs::read_to_string(&file.target)
            .map_err(|_| "Checkpoint restore blocked: an applied file could not be read.".to_string())?;
        if current != file.applied_content {
            return Err("Checkpoint restore blocked: an applied file changed after apply.".to_string());
        }
        let parent = file
            .target
            .parent()
            .ok_or_else(|| "Checkpoint restore could not resolve a file parent.".to_string())?;
        let transaction_id = uuid::Uuid::new_v4();
        let original_temporary = file.original_content.as_ref().map(|_| {
            parent.join(format!(".okf-studio-{transaction_id}-restore.tmp"))
        });
        let applied_temporary =
            parent.join(format!(".okf-studio-{transaction_id}-undo.tmp"));
        pending.push(PendingCheckpointRestore {
            target: file.target.clone(),
            original_temporary,
            applied_temporary,
            original_content: file.original_content.clone(),
            applied_content: file.applied_content.clone(),
        });
    }
    Ok(RestoreTransaction {
        checkpoint: checkpoint.clone(),
        pending,
    })
}

fn execute_restore_transaction(
    transaction: &RestoreTransaction,
    fail_after: Option<usize>,
) -> Result<(), String> {
    for (prepared_count, file) in transaction.pending.iter().enumerate() {
        if let (Some(original), Some(temporary)) =
            (&file.original_content, &file.original_temporary)
        {
            let write_result = (|| -> Result<(), String> {
                let mut output = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(temporary)
                    .map_err(|_| {
                        "Checkpoint restore could not create an original file.".to_string()
                    })?;
                output
                    .write_all(original.as_bytes())
                    .and_then(|()| output.sync_all())
                    .map_err(|_| {
                        "Checkpoint restore could not write an original file.".to_string()
                    })?;
                let permissions = std::fs::metadata(&file.target)
                    .map_err(|_| {
                        "Checkpoint restore could not inspect an applied file.".to_string()
                    })?
                    .permissions();
                std::fs::set_permissions(temporary, permissions).map_err(|_| {
                    "Checkpoint restore could not preserve file permissions.".to_string()
                })
            })();
            if let Err(error) = write_result {
                let _ = std::fs::remove_file(temporary);
                cleanup_checkpoint_restore(&transaction.pending[..prepared_count]);
                return Err(error);
            }
        }
    }

    let mut restored = Vec::new();
    for (index, file) in transaction.pending.iter().enumerate() {
        if fail_after.is_some_and(|limit| index >= limit) {
            rollback_checkpoint_restore(&restored);
            cleanup_checkpoint_restore(&transaction.pending);
            return Err("The checkpoint restore transaction was interrupted.".to_string());
        }
        let current = match std::fs::read_to_string(&file.target) {
            Ok(current) => current,
            Err(_) => {
                rollback_checkpoint_restore(&restored);
                cleanup_checkpoint_restore(&transaction.pending);
                return Err(
                    "Checkpoint restore blocked: an applied file could not be rechecked."
                        .to_string(),
                );
            }
        };
        if current != file.applied_content {
            rollback_checkpoint_restore(&restored);
            cleanup_checkpoint_restore(&transaction.pending);
            return Err("Checkpoint restore blocked: an applied file changed during restore.".to_string());
        }
        if std::fs::rename(&file.target, &file.applied_temporary).is_err() {
            rollback_checkpoint_restore(&restored);
            cleanup_checkpoint_restore(&transaction.pending);
            return Err("Checkpoint restore could not move an applied file.".to_string());
        }
        if let Some(original) = &file.original_temporary {
            if std::fs::rename(original, &file.target).is_err() {
                let _ = std::fs::rename(&file.applied_temporary, &file.target);
                rollback_checkpoint_restore(&restored);
                cleanup_checkpoint_restore(&transaction.pending);
                return Err("Checkpoint restore could not replace an applied file.".to_string());
            }
        }
        restored.push(RestoredReplacement {
            target: file.target.clone(),
            applied_temporary: file.applied_temporary.clone(),
        });
    }

    for file in &restored {
        let _ = std::fs::remove_file(&file.applied_temporary);
    }
    for file in &transaction.checkpoint.files {
        if let Some(backup) = &file.backup {
            let _ = std::fs::remove_file(backup);
        }
    }
    cleanup_directories(&transaction.checkpoint.created_directories);
    Ok(())
}

fn cleanup_checkpoint_restore(pending: &[PendingCheckpointRestore]) {
    for file in pending {
        if let Some(original) = &file.original_temporary {
            let _ = std::fs::remove_file(original);
        }
    }
}

fn rollback_checkpoint_restore(restored: &[RestoredReplacement]) {
    for file in restored.iter().rev() {
        let _ = std::fs::remove_file(&file.target);
        let _ = std::fs::rename(&file.applied_temporary, &file.target);
    }
}

fn discard_checkpoint_backups(checkpoint: &mut AppliedCheckpoint) {
    for file in &mut checkpoint.files {
        if let Some(backup) = file.backup.take() {
            let _ = std::fs::remove_file(backup);
        }
    }
}

fn discard_checkpoint(mut checkpoint: AppliedCheckpoint) {
    discard_checkpoint_backups(&mut checkpoint);
}

fn serialize_checkpoint(
    bundle_root: &Path,
    checkpoint: &AppliedCheckpoint,
) -> Result<PersistedCheckpoint, String> {
    let files = checkpoint
        .files
        .iter()
        .map(|file| {
            let path = bundle_relative_write_path(bundle_root, &file.target)?;
            Ok(PersistedCheckpointFile {
                path,
                original_content: file.original_content.clone(),
                applied_content: file.applied_content.clone(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let created_directories = checkpoint
        .created_directories
        .iter()
        .map(|directory| bundle_relative_write_path(bundle_root, directory))
        .collect::<Result<Vec<_>, String>>()?;
    Ok(PersistedCheckpoint {
        version: CHECKPOINT_VERSION,
        id: checkpoint.id.clone(),
        bundle_fingerprint: bundle_fingerprint(bundle_root),
        files,
        created_directories,
    })
}

fn serialize_apply_transaction(
    bundle_root: &Path,
    transaction: &ApplyTransaction,
) -> Result<PersistedApplyTransaction, String> {
    let artifacts = transaction
        .pending
        .iter()
        .map(|file| {
            Ok(PersistedApplyArtifact {
                path: bundle_relative_write_path(bundle_root, &file.target)?,
                temporary: bundle_relative_write_path(bundle_root, &file.temporary)?,
                backup: file
                    .backup
                    .as_ref()
                    .map(|path| bundle_relative_write_path(bundle_root, path))
                    .transpose()?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(PersistedApplyTransaction {
        version: CHECKPOINT_VERSION,
        checkpoint: serialize_checkpoint(bundle_root, &transaction.checkpoint)?,
        previous_checkpoint: transaction
            .previous_checkpoint
            .as_ref()
            .map(|checkpoint| serialize_checkpoint(bundle_root, checkpoint))
            .transpose()?,
        artifacts,
    })
}

fn persisted_apply_transaction(
    bundle_root: &Path,
    persisted: PersistedApplyTransaction,
) -> Result<ApplyTransaction, String> {
    if persisted.version != CHECKPOINT_VERSION {
        return Err("Studio's saved apply transaction is invalid.".to_string());
    }
    let checkpoint = persisted_checkpoint(bundle_root, persisted.checkpoint)?;
    let previous_checkpoint = persisted
        .previous_checkpoint
        .map(|checkpoint| persisted_checkpoint(bundle_root, checkpoint))
        .transpose()?;
    if previous_checkpoint
        .as_ref()
        .is_some_and(|previous| previous.id == checkpoint.id)
    {
        return Err("Studio's saved apply transaction repeats its checkpoint.".to_string());
    }
    if persisted.artifacts.len() != checkpoint.files.len() {
        return Err("Studio's saved apply transaction has an invalid file count.".to_string());
    }
    let mut pending = Vec::with_capacity(checkpoint.files.len());
    for (artifact, file) in persisted.artifacts.into_iter().zip(&checkpoint.files) {
        let path = bundle_relative_write_path(bundle_root, &file.target)?;
        if artifact.path != path {
            return Err("Studio's saved apply transaction contains mismatched paths.".to_string());
        }
        let (temporary, transaction_id) = checked_transaction_artifact(
            bundle_root,
            &file.target,
            &artifact.temporary,
            ".tmp",
        )?;
        let backup = artifact
            .backup
            .as_deref()
            .map(|relative| {
                let (backup, backup_id) = checked_transaction_artifact(
                    bundle_root,
                    &file.target,
                    relative,
                    ".bak",
                )?;
                if backup_id != transaction_id {
                    return Err(
                        "Studio's saved apply transaction contains mismatched artifacts."
                            .to_string(),
                    );
                }
                Ok(backup)
            })
            .transpose()?;
        if backup.is_some() != file.original_content.is_some() {
            return Err("Studio's saved apply transaction contains invalid artifacts.".to_string());
        }
        pending.push(PendingReplacement {
            target: file.target.clone(),
            temporary,
            backup,
            kind: if file.original_content.is_some() {
                "modify"
            } else {
                "create"
            },
            original: file.original_content.clone().unwrap_or_default(),
            applied_content: file.applied_content.clone(),
        });
    }
    Ok(ApplyTransaction {
        checkpoint,
        previous_checkpoint,
        pending,
    })
}

fn serialize_restore_transaction(
    bundle_root: &Path,
    transaction: &RestoreTransaction,
) -> Result<PersistedRestoreTransaction, String> {
    let artifacts = transaction
        .pending
        .iter()
        .map(|file| {
            Ok(PersistedRestoreArtifact {
                path: bundle_relative_write_path(bundle_root, &file.target)?,
                original_temporary: file
                    .original_temporary
                    .as_ref()
                    .map(|path| bundle_relative_write_path(bundle_root, path))
                    .transpose()?,
                applied_temporary: bundle_relative_write_path(
                    bundle_root,
                    &file.applied_temporary,
                )?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(PersistedRestoreTransaction {
        version: CHECKPOINT_VERSION,
        checkpoint: serialize_checkpoint(bundle_root, &transaction.checkpoint)?,
        artifacts,
    })
}

fn persisted_restore_transaction(
    bundle_root: &Path,
    persisted: PersistedRestoreTransaction,
) -> Result<RestoreTransaction, String> {
    if persisted.version != CHECKPOINT_VERSION {
        return Err("Studio's saved restore transaction is invalid.".to_string());
    }
    let checkpoint = persisted_checkpoint(bundle_root, persisted.checkpoint)?;
    if persisted.artifacts.len() != checkpoint.files.len() {
        return Err("Studio's saved restore transaction has an invalid file count.".to_string());
    }
    let mut pending = Vec::with_capacity(checkpoint.files.len());
    for (artifact, file) in persisted.artifacts.into_iter().zip(&checkpoint.files) {
        let path = bundle_relative_write_path(bundle_root, &file.target)?;
        if artifact.path != path {
            return Err("Studio's saved restore transaction contains mismatched paths.".to_string());
        }
        let (applied_temporary, transaction_id) = checked_transaction_artifact(
            bundle_root,
            &file.target,
            &artifact.applied_temporary,
            "-undo.tmp",
        )?;
        let original_temporary = artifact
            .original_temporary
            .as_deref()
            .map(|relative| {
                let (temporary, original_id) = checked_transaction_artifact(
                    bundle_root,
                    &file.target,
                    relative,
                    "-restore.tmp",
                )?;
                if original_id != transaction_id {
                    return Err(
                        "Studio's saved restore transaction contains mismatched artifacts."
                            .to_string(),
                    );
                }
                Ok(temporary)
            })
            .transpose()?;
        if original_temporary.is_some() != file.original_content.is_some() {
            return Err("Studio's saved restore transaction contains invalid artifacts.".to_string());
        }
        pending.push(PendingCheckpointRestore {
            target: file.target.clone(),
            original_temporary,
            applied_temporary,
            original_content: file.original_content.clone(),
            applied_content: file.applied_content.clone(),
        });
    }
    Ok(RestoreTransaction {
        checkpoint,
        pending,
    })
}

fn checked_transaction_artifact(
    bundle_root: &Path,
    target: &Path,
    relative: &str,
    suffix: &str,
) -> Result<(PathBuf, String), String> {
    let artifact = bundle_root.join(Path::new(relative));
    let reduced = bundle_relative_write_path(bundle_root, &artifact)
        .map_err(|_| "Studio's saved transaction contains an invalid artifact path.".to_string())?;
    if reduced != relative || artifact.parent() != target.parent() {
        return Err("Studio's saved transaction contains an invalid artifact path.".to_string());
    }
    let name = artifact
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Studio's saved transaction contains an invalid artifact name.".to_string())?;
    let id = name
        .strip_prefix(".okf-studio-")
        .and_then(|name| name.strip_suffix(suffix))
        .ok_or_else(|| "Studio's saved transaction contains an invalid artifact name.".to_string())?;
    let id = uuid::Uuid::parse_str(id)
        .map_err(|_| "Studio's saved transaction contains an invalid artifact name.".to_string())?;
    Ok((artifact, id.to_string()))
}

fn persisted_checkpoint(
    bundle_root: &Path,
    persisted: PersistedCheckpoint,
) -> Result<AppliedCheckpoint, String> {
    if persisted.version != CHECKPOINT_VERSION
        || persisted.bundle_fingerprint != bundle_fingerprint(bundle_root)
        || uuid::Uuid::parse_str(&persisted.id).is_err()
    {
        return Err("Studio's saved apply checkpoint is invalid.".to_string());
    }
    if persisted.files.is_empty() || persisted.files.len() > MAX_STAGED_FILES {
        return Err("Studio's saved apply checkpoint has an invalid file count.".to_string());
    }

    let mut paths = BTreeSet::new();
    let mut total_bytes = 0usize;
    let mut created_ancestors = BTreeSet::new();
    let mut files = Vec::with_capacity(persisted.files.len());
    for file in persisted.files {
        if file.applied_content.len() > MAX_STAGED_FILE_BYTES
            || file
                .original_content
                .as_ref()
                .is_some_and(|content| content.len() > MAX_STAGED_FILE_BYTES)
        {
            return Err("Studio's saved apply checkpoint contains an oversized file.".to_string());
        }
        total_bytes = total_bytes
            .checked_add(file.applied_content.len())
            .and_then(|total| {
                total.checked_add(file.original_content.as_ref().map_or(0, String::len))
            })
            .ok_or_else(|| "Studio's saved apply checkpoint is too large.".to_string())?;
        if total_bytes > MAX_CHECKPOINT_CONTENT_BYTES {
            return Err("Studio's saved apply checkpoint is too large.".to_string());
        }
        let target = bundle_root.join(Path::new(&file.path));
        let reduced = bundle_relative_write_path(bundle_root, &target)
            .map_err(|_| "Studio's saved apply checkpoint contains an invalid path.".to_string())?;
        if reduced != file.path || !paths.insert(file.path.clone()) {
            return Err("Studio's saved apply checkpoint contains an invalid path.".to_string());
        }
        if file.original_content.is_none() {
            let mut ancestor = Path::new(&file.path).parent();
            while let Some(directory) = ancestor {
                if directory.as_os_str().is_empty() {
                    break;
                }
                created_ancestors.insert(path_to_forward_slashes(directory)?);
                ancestor = directory.parent();
            }
        }
        files.push(CheckpointFile {
            target,
            backup: None,
            original_content: file.original_content,
            applied_content: file.applied_content,
        });
    }

    let mut directories = BTreeSet::new();
    let mut created_directories = Vec::with_capacity(persisted.created_directories.len());
    for relative in persisted.created_directories {
        let directory = bundle_root.join(Path::new(&relative));
        let reduced = bundle_relative_write_path(bundle_root, &directory).map_err(|_| {
            "Studio's saved apply checkpoint contains an invalid directory.".to_string()
        })?;
        if reduced != relative
            || !created_ancestors.contains(&relative)
            || !directories.insert(relative)
        {
            return Err(
                "Studio's saved apply checkpoint contains an invalid directory.".to_string(),
            );
        }
        created_directories.push(directory);
    }

    Ok(AppliedCheckpoint {
        id: persisted.id,
        files,
        created_directories,
    })
}

fn path_to_forward_slashes(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in path.components() {
        let std::path::Component::Normal(part) = component else {
            return Err("Studio's saved apply checkpoint contains an invalid path.".to_string());
        };
        let part = part
            .to_str()
            .ok_or_else(|| "Studio's saved apply checkpoint contains a non-Unicode path.".to_string())?;
        parts.push(part);
    }
    Ok(parts.join("/"))
}

fn bundle_fingerprint(bundle_root: &Path) -> String {
    let mut hasher = Sha256::new();
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        hasher.update(bundle_root.as_os_str().as_bytes());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        for unit in bundle_root.as_os_str().encode_wide() {
            hasher.update(unit.to_le_bytes());
        }
    }
    #[cfg(not(any(unix, windows)))]
    hasher.update(bundle_root.to_string_lossy().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn write_checkpoint_file(file: &Path, checkpoint: &PersistedCheckpoint) -> Result<(), String> {
    write_private_json_file(file, checkpoint, "apply checkpoint")
}

fn read_private_json_file<T: DeserializeOwned>(file: &Path, label: &str) -> Result<T, String> {
    let metadata = std::fs::symlink_metadata(file)
        .map_err(|_| format!("Studio could not inspect its saved {label}."))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("Studio's saved {label} is not a regular file."));
    }
    if metadata.len() > MAX_CHECKPOINT_BYTES {
        return Err(format!("Studio's saved {label} exceeds its size limit."));
    }
    let bytes = std::fs::read(file)
        .map_err(|_| format!("Studio could not read its saved {label}."))?;
    serde_json::from_slice(&bytes).map_err(|_| format!("Studio's saved {label} is invalid."))
}

fn remove_transaction_file(file: Option<PathBuf>, operation: &str) -> Result<(), String> {
    let Some(file) = file else {
        return Ok(());
    };
    match std::fs::remove_file(file) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(format!(
            "Studio could not remove its saved {operation} transaction."
        )),
    }
}

fn quarantine_transaction_file(file: &Path, operation: &str) -> Result<(), String> {
    let parent = file.parent().ok_or_else(|| {
        format!("Studio could not quarantine its invalid {operation} transaction.")
    })?;
    let quarantined = parent.join(format!(
        ".okf-studio-invalid-{operation}-transaction-{}.json",
        uuid::Uuid::new_v4()
    ));
    std::fs::rename(file, quarantined).map_err(|_| {
        format!("Studio could not quarantine its invalid {operation} transaction.")
    })
}

fn write_private_json_file<T: Serialize>(
    file: &Path,
    value: &T,
    label: &str,
) -> Result<(), String> {
    let parent = file
        .parent()
        .ok_or_else(|| format!("Studio's {label} has no storage directory."))?;
    std::fs::create_dir_all(parent)
        .map_err(|_| format!("Studio could not create its {label} directory."))?;
    let metadata = std::fs::symlink_metadata(parent)
        .map_err(|_| format!("Studio could not inspect its {label} directory."))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(format!(
            "Studio's {label} directory is not a regular directory."
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700)).map_err(|_| {
            format!("Studio could not protect its {label} directory.")
        })?;
    }
    if file.exists() {
        return Err(format!("A saved {label} already exists for this bundle."));
    }
    let bytes = serde_json::to_vec(value)
        .map_err(|_| format!("Studio could not encode its {label}."))?;
    if bytes.len() as u64 > MAX_CHECKPOINT_BYTES {
        return Err(format!("Studio's {label} exceeds its size limit."));
    }
    let temporary = parent.join(format!(
        ".okf-studio-checkpoint-{}.tmp",
        uuid::Uuid::new_v4()
    ));
    let result = (|| -> Result<(), String> {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut output = options
            .open(&temporary)
            .map_err(|_| format!("Studio could not create its {label}."))?;
        output
            .write_all(&bytes)
            .and_then(|()| output.sync_all())
            .map_err(|_| format!("Studio could not write its {label}."))?;
        if file.exists() {
            return Err(format!("A saved {label} already exists for this bundle."));
        }
        std::fs::rename(&temporary, file)
            .map_err(|_| format!("Studio could not activate its {label}."))
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}

struct ValidationMirror {
    path: PathBuf,
}

impl ValidationMirror {
    fn create() -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!(
            "okf-studio-stage-validation-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&path)
            .map_err(|_| "Staged validation workspace could not be created.".to_string())?;
        Ok(Self { path })
    }
}

impl Drop for ValidationMirror {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn copy_markdown_tree(source: &Path, destination: &Path) -> Result<(), String> {
    let mut pending = vec![(source.to_path_buf(), PathBuf::new())];
    let mut file_count = 0usize;
    let mut total_bytes = 0usize;
    while let Some((directory, relative_directory)) = pending.pop() {
        let entries = std::fs::read_dir(&directory)
            .map_err(|_| "The bundle could not be read for staged validation.".to_string())?;
        for entry in entries {
            let entry = entry
                .map_err(|_| "The bundle could not be read for staged validation.".to_string())?;
            let file_type = entry
                .file_type()
                .map_err(|_| "The bundle could not be read for staged validation.".to_string())?;
            if file_type.is_symlink() {
                continue;
            }
            let name = entry.file_name();
            let relative = relative_directory.join(&name);
            if file_type.is_dir() {
                let name = name.to_string_lossy();
                if okf_core::parse::IGNORED_DIRS.contains(&name.as_ref())
                    || (name.starts_with('.') && name.len() > 1)
                {
                    continue;
                }
                pending.push((entry.path(), relative));
                continue;
            }
            if !file_type.is_file()
                || !entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
            {
                continue;
            }
            file_count += 1;
            if file_count > MAX_VALIDATION_FILES {
                return Err("Staged validation is limited to 4,096 Markdown files.".to_string());
            }
            let bytes = std::fs::read(entry.path()).map_err(|_| {
                "A bundle file could not be read for staged validation.".to_string()
            })?;
            total_bytes = total_bytes.saturating_add(bytes.len());
            if total_bytes > MAX_VALIDATION_BYTES {
                return Err("Staged validation is limited to 32 MiB of Markdown.".to_string());
            }
            let target = destination.join(relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|_| {
                    "Staged validation workspace could not be prepared.".to_string()
                })?;
            }
            std::fs::write(target, bytes)
                .map_err(|_| "Staged validation workspace could not be written.".to_string())?;
        }
    }
    Ok(())
}

fn bounded_validation_message(message: &str) -> String {
    message
        .chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'))
        .take(2048)
        .collect()
}

fn read_original(bundle_root: &Path, path: &str, kind: &str) -> Result<String, String> {
    if kind != "modify" {
        return Ok(String::new());
    }
    let bytes = std::fs::read(bundle_root.join(Path::new(path)))
        .map_err(|_| "The original bundle file could not be read.".to_string())?;
    if bytes.len() > MAX_STAGED_FILE_BYTES {
        return Err("The original bundle file is too large to diff.".to_string());
    }
    String::from_utf8(bytes).map_err(|_| "The original bundle file is not UTF-8 text.".to_string())
}

fn build_staged_diff(
    path: &str,
    kind: &'static str,
    original: &str,
    content: &str,
    selection: Option<&(String, BTreeSet<usize>)>,
) -> AgentStagedFileDiff {
    let mut digest = Sha256::new();
    for part in [
        path.as_bytes(),
        kind.as_bytes(),
        original.as_bytes(),
        content.as_bytes(),
    ] {
        digest.update((part.len() as u64).to_le_bytes());
        digest.update(part);
    }
    let revision = format!("{:x}", digest.finalize());
    let rejected = selection
        .filter(|(selection_revision, _)| selection_revision == &revision)
        .map(|(_, rejected)| rejected);

    let text_diff = similar::TextDiff::from_lines(original, content);
    let mut used_chars = format!("--- a/{path}\n+++ b/{path}\n").chars().count();
    let mut truncated = false;
    let mut hunks = Vec::new();
    for (index, hunk) in text_diff
        .unified_diff()
        .context_radius(3)
        .iter_hunks()
        .enumerate()
    {
        let header = hunk.header().to_string();
        let rendered = hunk.to_string();
        let unified = rendered
            .strip_prefix(&format!("{header}\n"))
            .unwrap_or(&rendered)
            .to_string();
        let hunk_chars = header.chars().count() + 1 + unified.chars().count();
        if used_chars + hunk_chars > MAX_DIFF_CHARS {
            truncated = true;
            break;
        }
        used_chars += hunk_chars;
        hunks.push(AgentStagedDiffHunk {
            index,
            header,
            unified,
            selected: rejected.is_none_or(|rejected| !rejected.contains(&index)),
        });
    }
    AgentStagedFileDiff {
        path: path.to_string(),
        kind,
        revision,
        hunks,
        truncated,
    }
}

fn snapshot(session_id: &str, stage: &SessionStage) -> AgentStagedChangesInfo {
    AgentStagedChangesInfo {
        session_id: session_id.to_string(),
        granted: stage.granted,
        mode: stage.mode,
        can_restore: stage.mode == AgentStageMode::Edit && stage.checkpoint.is_some(),
        files: stage
            .files
            .iter()
            .map(|(path, file)| AgentStagedFileInfo {
                path: path.clone(),
                bytes: file.content.len(),
                kind: file.kind,
            })
            .collect(),
    }
}

/// Reduce an agent-supplied absolute write path to a bundle-relative
/// forward-slash path, mirroring the tool-location discipline: every
/// component must be a normal, non-control Unicode segment lexically under
/// the canonical root, and protected paths are always denied. A symbolic link
/// anywhere on an existing prefix of the path must not escape the root.
fn bundle_relative_write_path(bundle_root: &Path, path: &Path) -> Result<String, String> {
    if !path.is_absolute() {
        return Err("Bundle write denied: ACP file paths must be absolute.".to_string());
    }
    let relative = strip_bundle_prefix(bundle_root, path).ok_or_else(|| {
        "Bundle write denied: the file is outside the active bundle root.".to_string()
    })?;
    let mut parts: Vec<&str> = Vec::new();
    for component in relative.components() {
        let std::path::Component::Normal(part) = component else {
            return Err(
                "Bundle write denied: the path may not traverse outside the bundle.".to_string(),
            );
        };
        let part = part
            .to_str()
            .ok_or_else(|| "Bundle write denied: paths must be Unicode.".to_string())?;
        // Verbatim Windows paths parse `..` and `.` as normal components.
        if part == ".." || part == "." {
            return Err(
                "Bundle write denied: the path may not traverse outside the bundle.".to_string(),
            );
        }
        if part.is_empty() || part.chars().any(char::is_control) {
            return Err(
                "Bundle write denied: the path contains unsupported characters.".to_string(),
            );
        }
        parts.push(part);
    }
    if parts.is_empty() {
        return Err("Bundle write denied: the bundle root itself cannot be written.".to_string());
    }
    let joined = parts.join("/");
    if joined.chars().count() > MAX_STAGED_PATH_CHARS {
        return Err("Bundle write denied: the path is too long.".to_string());
    }
    if let Some(reason) = protected_bundle_path_reason(Path::new(&joined)) {
        return Err(format!("Bundle write denied: {reason}"));
    }
    // The target may not exist yet, so canonicalize the deepest existing
    // ancestor and require it to stay under the canonical root. This rejects
    // escape through a symbolic link on any existing prefix.
    let mut ancestor = bundle_root.to_path_buf();
    for part in &parts {
        let next = ancestor.join(part);
        if !next.exists() {
            break;
        }
        ancestor = next;
    }
    let canonical_ancestor = ancestor
        .canonicalize()
        .map_err(|_| "Bundle write denied: the path could not be resolved.".to_string())?;
    if !canonical_ancestor.starts_with(bundle_root) {
        return Err("Bundle write denied: the file is outside the active bundle root.".to_string());
    }
    Ok(joined)
}

/// Return the non-overridable denial for a bundle-relative path. The policy is
/// case-insensitive on every platform so a proposal cannot become more
/// permissive when it moves between Windows and Unix.
pub(crate) fn protected_bundle_path_reason(relative: &Path) -> Option<&'static str> {
    let parts = relative
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(part) => part.to_str(),
            _ => None,
        })
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>();
    let filename = parts.last()?;

    if parts.iter().any(|part| part == ".git") {
        return Some("Git metadata is protected.");
    }

    if parts.iter().any(|part| {
        matches!(
            part.as_str(),
            ".ssh"
                | ".gnupg"
                | ".aws"
                | ".azure"
                | ".kube"
                | ".docker"
                | ".secrets"
                | "secrets"
        )
    }) || filename == ".env"
        || filename.starts_with(".env.")
        || matches!(
            filename.as_str(),
            ".npmrc"
                | ".pypirc"
                | ".netrc"
                | "_netrc"
                | ".git-credentials"
                | "credentials.json"
                | "client_secret.json"
                | "client_secrets.json"
                | "secrets.json"
                | "id_rsa"
                | "id_dsa"
                | "id_ecdsa"
                | "id_ed25519"
        )
        || filename
            .strip_prefix("client_secret_")
            .is_some_and(|suffix| suffix.ends_with(".json"))
        || Path::new(filename)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension,
                    "pem" | "key" | "p12" | "pfx" | "jks" | "keystore" | "kdbx"
                )
            })
    {
        return Some("credential and secret files are protected.");
    }

    if parts
        .iter()
        .any(|part| matches!(part.as_str(), ".agents" | ".claude" | ".codex"))
        || matches!(
            filename.as_str(),
            "agents.md" | "claude.md" | "codex.md" | ".cursorrules"
        )
        || (filename == "copilot-instructions.md"
            && parts.iter().any(|part| part == ".github"))
    {
        return Some("agent instructions and packaged skills are protected.");
    }

    None
}

/// Strip the canonical bundle root off an agent-supplied absolute path. The
/// canonical root is a verbatim `\\?\` path on Windows while agents send
/// plain Win32 paths, so both spellings of the root are accepted.
fn strip_bundle_prefix<'a>(bundle_root: &Path, path: &'a Path) -> Option<&'a Path> {
    if let Ok(relative) = path.strip_prefix(bundle_root) {
        return Some(relative);
    }
    #[cfg(windows)]
    {
        let value = bundle_root.to_string_lossy();
        let win32 = if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
            Some(PathBuf::from(format!(r"\\{rest}")))
        } else {
            value.strip_prefix(r"\\?\").map(PathBuf::from)
        };
        if let Some(win32) = win32 {
            if let Ok(relative) = path.strip_prefix(&win32) {
                return Some(relative);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registered(root: &Path) -> SessionStages {
        let stages = SessionStages::default();
        stages
            .register_session("session-1", root)
            .expect("register session");
        stages
    }

    fn canonical_temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("okf-stage-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp bundle root");
        dir.canonicalize().expect("canonicalize temp bundle root")
    }

    fn seed_valid_bundle(root: &Path) {
        std::fs::write(
            root.join("index.md"),
            "---\nokf_version: 0.1\n---\n# Test bundle\n",
        )
        .expect("seed bundle index");
        std::fs::write(
            root.join("existing.md"),
            "---\ntype: note\n---\n# Existing\n",
        )
        .expect("seed valid concept");
    }

    fn prepared_edit_and_create(root: &Path) -> Vec<PreparedStagedFile> {
        let mut files = BTreeMap::new();
        files.insert(
            "existing.md".to_string(),
            StagedFile {
                content: "---\ntype: note\n---\n# Updated\n".to_string(),
                kind: "modify",
                selection: None,
            },
        );
        files.insert(
            "nested/new.md".to_string(),
            StagedFile {
                content: "---\ntype: note\n---\n# New\n".to_string(),
                kind: "create",
                selection: None,
            },
        );
        prepare_selected_stage(root, &files, AgentStageMode::Edit)
            .expect("prepare edit and creation")
    }

    fn prepare_apply_artifacts(transaction: &ApplyTransaction) {
        for directory in &transaction.checkpoint.created_directories {
            std::fs::create_dir(directory).expect("create planned directory");
        }
        for file in &transaction.pending {
            std::fs::write(&file.temporary, &file.applied_content)
                .expect("write apply transaction file");
        }
    }

    #[test]
    fn denies_writes_without_the_thread_grant() {
        let root = canonical_temp_dir("deny");
        let stages = registered(&root);
        let error = stages
            .stage_write("session-1", &root.join("concept.md"), "text".to_string())
            .expect_err("write without grant should fail");
        assert!(error.contains("Allow edits in this thread"));
        assert_eq!(stages.summary("session-1").expect("summary").files.len(), 0);
    }

    #[test]
    fn rejects_unattended_grants_without_an_enforcement_sandbox() {
        let root = canonical_temp_dir("unattended-grant");
        let stages = registered(&root);

        let error = stages
            .set_grant_for_mode("session-1", true, AgentWriteGrantMode::Unattended)
            .expect_err("unattended external writes should fail closed");
        assert!(error.contains("enforcement-capable sandbox"));
        assert!(!stages.summary("session-1").expect("summary").granted);

        let changes = stages
            .set_grant_for_mode("session-1", true, AgentWriteGrantMode::Interactive)
            .expect("interactive grant should remain available");
        assert!(changes.granted);
        assert_eq!(
            serde_json::from_str::<AgentWriteGrantMode>("\"unattended\"")
                .expect("deserialize wire mode"),
            AgentWriteGrantMode::Unattended
        );
    }

    #[test]
    fn stages_a_granted_write_in_memory_only() {
        let root = canonical_temp_dir("stage");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        let info = stages
            .stage_write(
                "session-1",
                &root.join("notes").join("new.md"),
                "# New".to_string(),
            )
            .expect("granted write should stage");
        assert_eq!(
            info.files,
            vec![AgentStagedFileInfo {
                path: "notes/new.md".to_string(),
                bytes: 5,
                kind: "create",
            }]
        );
        assert!(
            !root.join("notes").exists(),
            "staging must not touch the filesystem"
        );
        assert_eq!(
            stages.staged_content("session-1", &root.join("notes").join("new.md")),
            Some("# New".to_string()),
        );
    }

    #[test]
    fn reduces_reported_diffs_atomically_and_preserves_identical_reviews() {
        let root = canonical_temp_dir("reported-diffs");
        std::fs::write(root.join("existing.md"), "old\n").expect("seed bundle file");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        let reported = || {
            vec![
                AgentReportedDiff {
                    path: root.join("existing.md"),
                    old_text: Some("old\n".to_string()),
                    new_text: "new\n".to_string(),
                },
                AgentReportedDiff {
                    path: root.join("created.md"),
                    old_text: None,
                    new_text: "# Created\n".to_string(),
                },
            ]
        };

        let staged = stages
            .stage_reported_diffs("session-1", reported())
            .expect("matching report should stage");
        assert_eq!(staged.files.len(), 2);
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("unchanged bundle file"),
            "old\n",
        );
        assert!(!root.join("created.md").exists());

        let initial = stages
            .staged_diff("session-1", "existing.md")
            .expect("review reported diff");
        stages
            .set_hunk_selection("session-1", "existing.md", &initial.revision, 0, false)
            .expect("reject hunk");
        stages
            .stage_reported_diffs("session-1", reported())
            .expect("identical report should be idempotent");
        assert!(
            !stages
                .staged_diff("session-1", "existing.md")
                .expect("reopen review")
                .hunks[0]
                .selected
        );

        stages
            .stage_reported_diffs(
                "session-1",
                vec![AgentReportedDiff {
                    path: root.join("existing.md"),
                    old_text: Some("old\n".to_string()),
                    new_text: "newer proposal\n".to_string(),
                }],
            )
            .expect("replacement may retain the unchanged disk base");
        let replaced = stages
            .staged_diff("session-1", "existing.md")
            .expect("review replacement");
        assert!(
            replaced.hunks[0].selected,
            "a revised proposal resets choices"
        );
        assert!(replaced.hunks[0].unified.contains("newer proposal"));

        let error = stages
            .stage_reported_diffs(
                "session-1",
                vec![
                    AgentReportedDiff {
                        path: root.join("existing.md"),
                        old_text: Some("wrong base\n".to_string()),
                        new_text: "replacement\n".to_string(),
                    },
                    AgentReportedDiff {
                        path: root.join("must-not-stage.md"),
                        old_text: None,
                        new_text: "partial\n".to_string(),
                    },
                ],
            )
            .expect_err("mismatched batch should fail");
        assert!(error.contains("base does not match"));
        assert!(stages
            .summary("session-1")
            .expect("summary")
            .files
            .iter()
            .all(|file| file.path != "must-not-stage.md"));
    }

    #[test]
    fn rejects_a_report_after_an_external_process_already_changed_the_file() {
        let root = canonical_temp_dir("reported-diff-external-write");
        let path = root.join("existing.md");
        std::fs::write(&path, "changed outside Studio\n").expect("seed external change");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");

        let error = stages
            .stage_reported_diffs(
                "session-1",
                vec![AgentReportedDiff {
                    path,
                    old_text: Some("original\n".to_string()),
                    new_text: "changed outside Studio\n".to_string(),
                }],
            )
            .expect_err("already-applied report must not become a Studio stage");
        assert!(error.contains("base does not match"));
        assert!(stages
            .summary("session-1")
            .expect("summary")
            .files
            .is_empty());
    }

    #[test]
    fn rejects_a_reported_diff_batch_when_one_path_is_protected() {
        let root = canonical_temp_dir("reported-protected-path");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");

        let error = stages
            .stage_reported_diffs(
                "session-1",
                vec![
                    AgentReportedDiff {
                        path: root.join("allowed.md"),
                        old_text: None,
                        new_text: "# Allowed\n".to_string(),
                    },
                    AgentReportedDiff {
                        path: root.join(".ENV.Local"),
                        old_text: None,
                        new_text: "TOKEN=secret\n".to_string(),
                    },
                ],
            )
            .expect_err("protected path should reject the batch");

        assert!(error.contains("credential and secret files"));
        assert!(
            stages
                .summary("session-1")
                .expect("summary")
                .files
                .is_empty(),
            "a rejected report must not retain earlier files from the batch"
        );
    }

    #[test]
    fn labels_writes_to_existing_files_as_modifications() {
        let root = canonical_temp_dir("modify");
        std::fs::write(root.join("existing.md"), "old").expect("seed bundle file");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        let info = stages
            .stage_write("session-1", &root.join("existing.md"), "new".to_string())
            .expect("stage existing file");
        assert_eq!(info.files[0].kind, "modify");
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("bundle file intact"),
            "old",
        );
    }

    #[test]
    fn rejects_traversal_outside_root_and_protected_paths() {
        let root = canonical_temp_dir("paths");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        let separator = std::path::MAIN_SEPARATOR;
        // Built from a string so `join` cannot collapse the traversal.
        let traversal = PathBuf::from(format!(
            "{}{separator}..{separator}outside.md",
            root.display(),
        ));
        for (path, expected) in [
            (traversal, "traverse"),
            (
                root.parent().expect("parent").join("outside.md"),
                "outside the active bundle root",
            ),
            (root.join(".git").join("config"), "Git metadata"),
            (root.join(".Env"), "credential and secret files"),
            (
                root.join("nested").join("private.PEM"),
                "credential and secret files",
            ),
            (
                root.join(".SSH").join("config"),
                "credential and secret files",
            ),
            (
                root.join(".agents")
                    .join("skills")
                    .join("okf")
                    .join("SKILL.md"),
                "agent instructions and packaged skills",
            ),
            (
                root.join("AGENTS.md"),
                "agent instructions and packaged skills",
            ),
            (root.clone(), "root itself"),
            (PathBuf::from("relative.md"), "must be absolute"),
        ] {
            let error = stages
                .stage_write("session-1", &path, "text".to_string())
                .expect_err("invalid path should fail");
            assert!(error.contains(expected), "{path:?}: {error}");
        }

        for path in ["credentials.md", "security/secrets.md", "agents/overview.md"] {
            stages
                .stage_write("session-1", &root.join(path), "text".to_string())
                .unwrap_or_else(|error| panic!("{path} should remain writable: {error}"));
        }
    }

    // Real agents send plain Win32 paths while the canonical root is verbatim.
    #[cfg(windows)]
    #[test]
    fn accepts_win32_paths_under_a_verbatim_canonical_root() {
        let root = canonical_temp_dir("win32");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        let win32_root = PathBuf::from(
            root.to_string_lossy()
                .strip_prefix(r"\\?\")
                .expect("canonical root should be verbatim")
                .to_string(),
        );
        let info = stages
            .stage_write("session-1", &win32_root.join("doc.md"), "x".to_string())
            .expect("win32 spelling should stage");
        assert_eq!(info.files[0].path, "doc.md");
        assert_eq!(
            stages.staged_content("session-1", &win32_root.join("doc.md")),
            Some("x".to_string()),
        );
    }

    #[test]
    fn bounds_file_size_count_and_total_bytes() {
        let root = canonical_temp_dir("bounds");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        let oversized = "x".repeat(MAX_STAGED_FILE_BYTES + 1);
        let error = stages
            .stage_write("session-1", &root.join("large.md"), oversized)
            .expect_err("oversized file should fail");
        assert!(error.contains("bytes"));
        for index in 0..MAX_STAGED_FILES {
            stages
                .stage_write(
                    "session-1",
                    &root.join(format!("file-{index}.md")),
                    "x".to_string(),
                )
                .expect("staged file within count");
        }
        let error = stages
            .stage_write("session-1", &root.join("overflow.md"), "x".to_string())
            .expect_err("file count above limit should fail");
        assert!(error.contains("files"));
        // Restaging an already-staged path stays within the count limit.
        stages
            .stage_write("session-1", &root.join("file-0.md"), "updated".to_string())
            .expect("replacement write should stage");
    }

    #[test]
    fn diffs_staged_files_against_the_bundle_and_rejects_unknown_paths() {
        let root = canonical_temp_dir("diff");
        std::fs::write(root.join("existing.md"), "alpha\nbeta\n").expect("seed bundle file");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "alpha\ngamma\n".to_string(),
            )
            .expect("stage modification");
        stages
            .stage_write("session-1", &root.join("new.md"), "# New\n".to_string())
            .expect("stage creation");

        let modified = stages
            .staged_diff("session-1", "existing.md")
            .expect("diff");
        assert_eq!(modified.kind, "modify");
        assert!(!modified.truncated);
        assert_eq!(modified.hunks.len(), 1);
        assert!(modified.hunks[0].unified.contains("-beta"));
        assert!(modified.hunks[0].unified.contains("+gamma"));
        assert!(modified.hunks[0].selected);

        let created = stages.staged_diff("session-1", "new.md").expect("diff");
        assert_eq!(created.kind, "create");
        assert!(created.hunks[0].unified.contains("+# New"));

        assert_eq!(
            stages
                .staged_diff("session-1", "missing.md")
                .expect_err("unknown path"),
            "This file is not staged.",
        );
    }

    #[test]
    fn persists_revision_bound_hunk_choices_and_rejects_stale_revisions() {
        let root = canonical_temp_dir("hunk-selection");
        let original =
            "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\ntwelve\n";
        let staged = "ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\nTWELVE\n";
        std::fs::write(root.join("existing.md"), original).expect("seed bundle file");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write("session-1", &root.join("existing.md"), staged.to_string())
            .expect("stage modification");

        let initial = stages
            .staged_diff("session-1", "existing.md")
            .expect("diff");
        assert_eq!(initial.hunks.len(), 2);
        let selected = stages
            .set_hunk_selection("session-1", "existing.md", &initial.revision, 0, false)
            .expect("reject first hunk");
        assert!(!selected.hunks[0].selected);
        assert!(selected.hunks[1].selected);

        let reopened = stages
            .staged_diff("session-1", "existing.md")
            .expect("reopen diff");
        assert!(!reopened.hunks[0].selected);
        assert!(reopened.hunks[1].selected);

        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                format!("{staged}\nrevised\n"),
            )
            .expect("replace staged content");
        assert_eq!(
            stages
                .set_hunk_selection("session-1", "existing.md", &initial.revision, 0, true,)
                .expect_err("stale revision"),
            "The staged diff changed. Review the file again.",
        );
    }

    #[test]
    fn validates_the_staged_tree_without_writing_to_the_bundle() {
        let root = canonical_temp_dir("validate");
        seed_valid_bundle(&root);
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        let invalid = "---\n---\n# Existing\n";
        stages
            .stage_write("session-1", &root.join("existing.md"), invalid.to_string())
            .expect("stage invalid concept");

        let validation = stages.validate_staged("session-1").expect("validate");
        assert!(validation.errors > 0);
        assert!(validation
            .issues
            .iter()
            .any(|issue| issue.path.as_deref() == Some("existing.md")));
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read bundle concept"),
            "---\ntype: note\n---\n# Existing\n",
            "validation must not update the bundle",
        );
    }

    #[test]
    fn fresh_bundle_mode_validates_in_isolation_and_cannot_apply_to_the_source() {
        let root = canonical_temp_dir("create-mode");
        seed_valid_bundle(&root);
        std::fs::write(root.join("existing.md"), "---\n---\n# Invalid source concept\n")
            .expect("make source bundle invalid");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        let mode = stages
            .set_mode("session-1", AgentStageMode::Create)
            .expect("select create mode");
        assert_eq!(mode.mode, AgentStageMode::Create);
        assert!(!mode.can_restore);

        let index = "---\nokf_version: 0.1\n---\n# Fresh bundle\n\n- [Fresh](fresh.md)\n";
        let staged = stages
            .stage_write("session-1", &root.join("index.md"), index.to_string())
            .expect("stage fresh index over source index path");
        stages
            .stage_write(
                "session-1",
                &root.join("fresh.md"),
                "---\ntype: Note\n---\n# Fresh\n".to_string(),
            )
            .expect("stage fresh concept");
        assert_eq!(staged.files[0].kind, "create");
        assert_eq!(
            stages
                .set_mode("session-1", AgentStageMode::Edit)
                .expect_err("non-empty draft must keep its mode"),
            "Resolve the current staged changes before changing the staging mode.",
        );

        let validation = stages.validate_staged("session-1").expect("validate draft");
        assert_eq!(validation.errors, 0, "source bundle issues stay outside the draft");
        assert_eq!(
            stages
                .apply_staged("session-1", &validation.revision)
                .expect_err("creation must not apply to source"),
            "Fresh bundle drafts cannot be applied to the active bundle. Choose a destination instead.",
        );
        assert_eq!(
            std::fs::read_to_string(root.join("index.md")).expect("read source index"),
            "---\nokf_version: 0.1\n---\n# Test bundle\n",
        );
    }

    #[test]
    fn validation_respects_rejected_hunks() {
        let root = canonical_temp_dir("validate-selection");
        seed_valid_bundle(&root);
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\n---\n# Existing\n".to_string(),
            )
            .expect("stage invalid concept");
        let diff = stages
            .staged_diff("session-1", "existing.md")
            .expect("review staged concept");
        assert_eq!(diff.hunks.len(), 1);
        stages
            .set_hunk_selection("session-1", "existing.md", &diff.revision, 0, false)
            .expect("reject invalid hunk");

        let validation = stages.validate_staged("session-1").expect("validate");
        assert_eq!(validation.errors, 0);
    }

    #[test]
    fn applies_the_exact_validated_revision_and_clears_the_stage() {
        let root = canonical_temp_dir("apply");
        seed_valid_bundle(&root);
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\ntype: note\n---\n# Updated\n".to_string(),
            )
            .expect("stage modification");
        stages
            .stage_write(
                "session-1",
                &root.join("nested").join("new.md"),
                "---\ntype: note\n---\n# New\n".to_string(),
            )
            .expect("stage creation");

        let validation = stages.validate_staged("session-1").expect("validate");
        assert_eq!(validation.errors, 0);
        let applied = stages
            .apply_staged("session-1", &validation.revision)
            .expect("apply validated stage");

        assert_eq!(applied.applied_files, 2);
        assert!(applied.changes.files.is_empty());
        assert!(applied.changes.can_restore);
        assert!(applied.changes.granted, "apply keeps the thread grant");
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read modification"),
            "---\ntype: note\n---\n# Updated\n"
        );
        assert_eq!(
            std::fs::read_to_string(root.join("nested").join("new.md"))
                .expect("read creation"),
            "---\ntype: note\n---\n# New\n"
        );
    }

    #[test]
    fn restores_the_latest_apply_when_its_files_are_unchanged() {
        let root = canonical_temp_dir("restore-checkpoint");
        seed_valid_bundle(&root);
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\ntype: note\n---\n# Updated\n".to_string(),
            )
            .expect("stage modification");
        stages
            .stage_write(
                "session-1",
                &root.join("nested").join("new.md"),
                "---\ntype: note\n---\n# New\n".to_string(),
            )
            .expect("stage creation");
        let validation = stages.validate_staged("session-1").expect("validate");
        stages
            .apply_staged("session-1", &validation.revision)
            .expect("apply");

        let restored = stages
            .restore_checkpoint("session-1")
            .expect("restore checkpoint");
        assert_eq!(restored.restored_files, 2);
        assert!(!restored.changes.can_restore);
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read original"),
            "---\ntype: note\n---\n# Existing\n"
        );
        assert!(!root.join("nested").join("new.md").exists());
        assert!(!root.join("nested").exists());
    }

    #[test]
    fn restores_a_persisted_checkpoint_after_the_staging_service_restarts() {
        let root = canonical_temp_dir("restore-persisted-checkpoint");
        let checkpoint_directory = canonical_temp_dir("checkpoint-storage");
        seed_valid_bundle(&root);
        {
            let stages = SessionStages::persistent(checkpoint_directory.clone());
            stages
                .register_session("session-1", &root)
                .expect("register session");
            stages.set_grant("session-1", true).expect("grant");
            stages
                .stage_write(
                    "session-1",
                    &root.join("existing.md"),
                    "---\ntype: note\n---\n# Updated\n".to_string(),
                )
                .expect("stage modification");
            stages
                .stage_write(
                    "session-1",
                    &root.join("nested").join("new.md"),
                    "---\ntype: note\n---\n# New\n".to_string(),
                )
                .expect("stage creation");
            let validation = stages.validate_staged("session-1").expect("validate");
            stages
                .apply_staged("session-1", &validation.revision)
                .expect("apply");

            assert_eq!(
                std::fs::read_dir(&checkpoint_directory)
                    .expect("read checkpoint directory")
                    .count(),
                1
            );
            assert!(std::fs::read_dir(&root)
                .expect("read bundle root")
                .filter_map(Result::ok)
                .all(|entry| !entry.file_name().to_string_lossy().starts_with(".okf-studio-")));
        }

        let resumed = SessionStages::persistent(checkpoint_directory.clone());
        let changes = resumed
            .register_session("session-2", &root)
            .expect("load checkpoint");
        assert!(changes.can_restore);
        assert!(!changes.granted);
        assert!(changes.files.is_empty());

        resumed
            .restore_checkpoint("session-2")
            .expect("restore persisted checkpoint");
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read original"),
            "---\ntype: note\n---\n# Existing\n"
        );
        assert!(!root.join("nested").exists());
        assert_eq!(
            std::fs::read_dir(checkpoint_directory)
                .expect("read checkpoint directory")
                .count(),
            0
        );
    }

    #[test]
    fn rolls_back_an_apply_interrupted_before_its_commit_point() {
        let root = canonical_temp_dir("recover-interrupted-apply");
        let checkpoint_directory = canonical_temp_dir("recover-apply-storage");
        seed_valid_bundle(&root);
        let stages = SessionStages::persistent(checkpoint_directory.clone());
        let transaction =
            plan_apply_transaction(&root, &prepared_edit_and_create(&root)).expect("plan apply");
        stages
            .persist_apply_transaction(&root, &transaction)
            .expect("persist apply intent");
        prepare_apply_artifacts(&transaction);

        let modified = &transaction.pending[0];
        std::fs::rename(
            &modified.target,
            modified.backup.as_ref().expect("modification backup"),
        )
        .expect("move original into backup");
        std::fs::rename(&modified.temporary, &modified.target).expect("apply first file");

        let resumed = SessionStages::persistent(checkpoint_directory.clone());
        let changes = resumed
            .register_session("session-2", &root)
            .expect("recover interrupted apply");
        assert!(!changes.can_restore);
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read original"),
            "---\ntype: note\n---\n# Existing\n"
        );
        assert!(!root.join("nested").exists());
        assert_eq!(
            std::fs::read_dir(&checkpoint_directory)
                .expect("read transaction storage")
                .count(),
            0
        );
    }

    #[test]
    fn finishes_a_committed_apply_interrupted_before_artifact_cleanup() {
        let root = canonical_temp_dir("recover-committed-apply");
        let checkpoint_directory = canonical_temp_dir("recover-committed-storage");
        seed_valid_bundle(&root);
        let stages = SessionStages::persistent(checkpoint_directory.clone());
        let transaction =
            plan_apply_transaction(&root, &prepared_edit_and_create(&root)).expect("plan apply");
        stages
            .persist_apply_transaction(&root, &transaction)
            .expect("persist apply intent");
        let checkpoint =
            execute_apply_transaction(&transaction, None).expect("execute full apply");
        stages
            .persist_checkpoint(&root, &checkpoint)
            .expect("cross apply commit point");

        let resumed = SessionStages::persistent(checkpoint_directory.clone());
        let changes = resumed
            .register_session("session-2", &root)
            .expect("finish committed apply");
        assert!(changes.can_restore);
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read applied file"),
            "---\ntype: note\n---\n# Updated\n"
        );
        assert!(transaction
            .pending
            .iter()
            .all(|file| !file.temporary.exists()
                && file.backup.as_ref().is_none_or(|backup| !backup.exists())));
        assert_eq!(
            std::fs::read_dir(&checkpoint_directory)
                .expect("read checkpoint storage")
                .count(),
            1,
            "only the durable applied checkpoint remains"
        );
    }

    #[test]
    fn recovers_the_previous_checkpoint_when_a_replacement_apply_is_interrupted() {
        let root = canonical_temp_dir("recover-replaced-checkpoint");
        let checkpoint_directory = canonical_temp_dir("recover-replaced-storage");
        seed_valid_bundle(&root);
        let stages = SessionStages::persistent(checkpoint_directory.clone());
        stages
            .register_session("session-1", &root)
            .expect("register session");
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\ntype: note\n---\n# First apply\n".to_string(),
            )
            .expect("stage first apply");
        let validation = stages.validate_staged("session-1").expect("validate first");
        stages
            .apply_staged("session-1", &validation.revision)
            .expect("commit first apply");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\ntype: note\n---\n# Second apply\n".to_string(),
            )
            .expect("stage replacement apply");

        let (files, previous) = {
            let sessions = stages.sessions.lock().expect("lock stages");
            let stage = sessions.get("session-1").expect("active stage");
            (
                stage.files.clone(),
                stage.checkpoint.clone().expect("previous checkpoint"),
            )
        };
        let prepared = prepare_selected_stage(&root, &files, AgentStageMode::Edit)
            .expect("prepare replacement");
        let mut transaction = plan_apply_transaction(&root, &prepared).expect("plan replacement");
        transaction.previous_checkpoint = Some(previous.clone());
        stages
            .persist_apply_transaction(&root, &transaction)
            .expect("persist replacement intent");
        execute_apply_transaction(&transaction, None).expect("execute replacement");
        stages
            .remove_persisted_checkpoint(&root, &previous.id)
            .expect("simulate interruption after removing old checkpoint");
        drop(stages);

        let resumed = SessionStages::persistent(checkpoint_directory.clone());
        let changes = resumed
            .register_session("session-2", &root)
            .expect("recover previous checkpoint");
        assert!(changes.can_restore);
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read first apply"),
            "---\ntype: note\n---\n# First apply\n"
        );
        resumed
            .restore_checkpoint("session-2")
            .expect("restore original checkpoint");
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read original"),
            "---\ntype: note\n---\n# Existing\n"
        );
    }

    #[test]
    fn finishes_a_restore_interrupted_between_file_replacements() {
        let root = canonical_temp_dir("recover-interrupted-restore");
        let checkpoint_directory = canonical_temp_dir("recover-restore-storage");
        seed_valid_bundle(&root);
        let stages = SessionStages::persistent(checkpoint_directory.clone());
        stages
            .register_session("session-1", &root)
            .expect("register session");
        stages.set_grant("session-1", true).expect("grant");
        for (path, content) in [
            ("existing.md", "---\ntype: note\n---\n# Updated\n"),
            ("nested/new.md", "---\ntype: note\n---\n# New\n"),
        ] {
            stages
                .stage_write("session-1", &root.join(path), content.to_string())
                .expect("stage file");
        }
        let validation = stages.validate_staged("session-1").expect("validate");
        stages
            .apply_staged("session-1", &validation.revision)
            .expect("apply");
        let checkpoint = stages
            .sessions
            .lock()
            .expect("lock stages")
            .get("session-1")
            .and_then(|stage| stage.checkpoint.clone())
            .expect("applied checkpoint");
        let transaction = plan_restore_transaction(&root, &checkpoint).expect("plan restore");
        stages
            .persist_restore_transaction(&root, &transaction)
            .expect("persist restore intent");

        let modified = &transaction.pending[0];
        std::fs::write(
            modified
                .original_temporary
                .as_ref()
                .expect("original transaction file"),
            modified.original_content.as_ref().expect("original text"),
        )
        .expect("write original transaction file");
        std::fs::rename(&modified.target, &modified.applied_temporary)
            .expect("move applied file");
        std::fs::rename(
            modified
                .original_temporary
                .as_ref()
                .expect("original transaction file"),
            &modified.target,
        )
        .expect("restore first file");

        drop(stages);
        let resumed = SessionStages::persistent(checkpoint_directory.clone());
        let changes = resumed
            .register_session("session-2", &root)
            .expect("finish interrupted restore");
        assert!(!changes.can_restore);
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read original"),
            "---\ntype: note\n---\n# Existing\n"
        );
        assert!(!root.join("nested").exists());
        assert_eq!(
            std::fs::read_dir(&checkpoint_directory)
                .expect("read checkpoint storage")
                .count(),
            0
        );
    }

    #[test]
    fn blocks_interrupted_apply_recovery_after_external_divergence() {
        let root = canonical_temp_dir("recover-apply-conflict");
        let checkpoint_directory = canonical_temp_dir("recover-conflict-storage");
        seed_valid_bundle(&root);
        let stages = SessionStages::persistent(checkpoint_directory.clone());
        let transaction =
            plan_apply_transaction(&root, &prepared_edit_and_create(&root)).expect("plan apply");
        stages
            .persist_apply_transaction(&root, &transaction)
            .expect("persist apply intent");
        std::fs::write(
            root.join("existing.md"),
            "---\ntype: note\n---\n# External edit\n",
        )
        .expect("diverge bundle file");

        let resumed = SessionStages::persistent(checkpoint_directory.clone());
        let error = resumed
            .register_session("session-2", &root)
            .expect_err("external divergence blocks recovery");
        assert!(error.contains("bundle file changed"));
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read external edit"),
            "---\ntype: note\n---\n# External edit\n"
        );
        assert!(stages
            .apply_transaction_file(&root)
            .expect("apply transaction path")
            .exists());
    }

    #[test]
    fn quarantines_an_invalid_interrupted_transaction_before_retry() {
        let root = canonical_temp_dir("recover-invalid-transaction");
        let checkpoint_directory = canonical_temp_dir("recover-invalid-storage");
        seed_valid_bundle(&root);
        let stages = SessionStages::persistent(checkpoint_directory.clone());
        let transaction =
            plan_apply_transaction(&root, &prepared_edit_and_create(&root)).expect("plan apply");
        let mut persisted =
            serialize_apply_transaction(&root, &transaction).expect("serialize apply intent");
        persisted.artifacts[0].temporary = "../outside.tmp".to_string();
        write_private_json_file(
            &stages
                .apply_transaction_file(&root)
                .expect("apply transaction path"),
            &persisted,
            "apply transaction",
        )
        .expect("write invalid apply intent");

        let error = stages
            .register_session("session-1", &root)
            .expect_err("invalid intent must fail closed");
        assert!(error.contains("invalid artifact path"));
        assert!(error.contains("retry the session"));
        let changes = stages
            .register_session("session-2", &root)
            .expect("retry after quarantine");
        assert!(!changes.can_restore);
        assert!(std::fs::read_dir(checkpoint_directory)
            .expect("read quarantine storage")
            .filter_map(Result::ok)
            .any(|entry| entry
                .file_name()
                .to_string_lossy()
                .starts_with(".okf-studio-invalid-apply-transaction-")));
    }

    #[test]
    fn rolls_apply_back_when_its_durable_checkpoint_cannot_be_saved() {
        let root = canonical_temp_dir("checkpoint-save-failure");
        seed_valid_bundle(&root);
        let storage_parent = canonical_temp_dir("checkpoint-save-file");
        let checkpoint_directory = storage_parent.join("not-a-directory");
        std::fs::write(&checkpoint_directory, "occupied").expect("seed blocking file");
        let stages = SessionStages::persistent(checkpoint_directory);
        stages
            .register_session("session-1", &root)
            .expect("register session");
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\ntype: note\n---\n# Updated\n".to_string(),
            )
            .expect("stage modification");
        let validation = stages.validate_staged("session-1").expect("validate");

        let error = stages
            .apply_staged("session-1", &validation.revision)
            .expect_err("checkpoint failure should roll apply back");
        assert!(error.contains("transaction directory"));
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read rolled back file"),
            "---\ntype: note\n---\n# Existing\n"
        );
        assert_eq!(stages.summary("session-1").expect("summary").files.len(), 1);
    }

    #[test]
    fn rejects_a_persisted_checkpoint_with_an_escaping_path() {
        let root = canonical_temp_dir("checkpoint-invalid-path");
        let checkpoint_directory = canonical_temp_dir("checkpoint-invalid-storage");
        seed_valid_bundle(&root);
        let stages = SessionStages::persistent(checkpoint_directory);
        let file = stages.checkpoint_file(&root).expect("checkpoint path");
        write_checkpoint_file(
            &file,
            &PersistedCheckpoint {
                version: CHECKPOINT_VERSION,
                id: uuid::Uuid::new_v4().to_string(),
                bundle_fingerprint: bundle_fingerprint(&root),
                files: vec![PersistedCheckpointFile {
                    path: "../outside.md".to_string(),
                    original_content: None,
                    applied_content: "outside".to_string(),
                }],
                created_directories: Vec::new(),
            },
        )
        .expect("write malicious checkpoint fixture");

        let error = stages
            .register_session("session-1", &root)
            .expect_err("escaping checkpoint path must fail");
        assert!(error.contains("invalid path"));
        assert!(error.contains("retry the session"));
        assert!(!root.parent().expect("root parent").join("outside.md").exists());
        let changes = stages
            .register_session("session-2", &root)
            .expect("retry after quarantine");
        assert!(!changes.can_restore);
    }

    #[test]
    fn blocks_checkpoint_restore_after_an_applied_file_changes() {
        let root = canonical_temp_dir("restore-stale");
        seed_valid_bundle(&root);
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\ntype: note\n---\n# Updated\n".to_string(),
            )
            .expect("stage modification");
        let validation = stages.validate_staged("session-1").expect("validate");
        stages
            .apply_staged("session-1", &validation.revision)
            .expect("apply");
        std::fs::write(
            root.join("existing.md"),
            "---\ntype: note\n---\n# Later edit\n",
        )
        .expect("later edit");

        let error = stages
            .restore_checkpoint("session-1")
            .expect_err("changed file blocks restore");
        assert!(error.contains("changed after apply"));
        assert!(stages.summary("session-1").expect("summary").can_restore);
    }

    #[test]
    fn blocks_apply_when_the_bundle_changed_after_validation() {
        let root = canonical_temp_dir("apply-stale");
        seed_valid_bundle(&root);
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\ntype: note\n---\n# Proposed\n".to_string(),
            )
            .expect("stage modification");
        let validation = stages.validate_staged("session-1").expect("validate");
        std::fs::write(
            root.join("existing.md"),
            "---\ntype: note\n---\n# External edit\n",
        )
        .expect("external edit");

        let error = stages
            .apply_staged("session-1", &validation.revision)
            .expect_err("stale apply must fail");
        assert!(error.contains("Validate them again"));
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read external edit"),
            "---\ntype: note\n---\n# External edit\n"
        );
        assert_eq!(stages.summary("session-1").expect("summary").files.len(), 1);
    }

    #[test]
    fn blocks_apply_for_a_matching_revision_with_validation_errors() {
        let root = canonical_temp_dir("apply-invalid");
        seed_valid_bundle(&root);
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write(
                "session-1",
                &root.join("existing.md"),
                "---\n---\n# Invalid\n".to_string(),
            )
            .expect("stage invalid concept");
        let validation = stages.validate_staged("session-1").expect("validate");
        assert!(validation.errors > 0);

        let error = stages
            .apply_staged("session-1", &validation.revision)
            .expect_err("invalid stage must fail");
        assert!(error.contains("validation found"));
        assert_eq!(
            std::fs::read_to_string(root.join("existing.md")).expect("read original"),
            "---\ntype: note\n---\n# Existing\n"
        );
    }

    #[test]
    fn restores_every_replacement_when_a_transaction_is_interrupted() {
        let root = canonical_temp_dir("apply-rollback");
        std::fs::write(root.join("one.md"), "one\n").expect("seed first file");
        std::fs::write(root.join("two.md"), "two\n").expect("seed second file");
        let mut files = BTreeMap::new();
        for (path, content) in [("one.md", "ONE\n"), ("two.md", "TWO\n")] {
            files.insert(
                path.to_string(),
                StagedFile {
                    content: content.to_string(),
                    kind: "modify",
                    selection: None,
                },
            );
        }
        let prepared = prepare_selected_stage(&root, &files, AgentStageMode::Edit)
            .expect("prepare transaction");

        let error = apply_prepared_transaction(&root, &prepared, Some(1))
            .expect_err("injected transaction failure");
        assert!(error.contains("interrupted"));
        assert_eq!(std::fs::read_to_string(root.join("one.md")).expect("first"), "one\n");
        assert_eq!(std::fs::read_to_string(root.join("two.md")).expect("second"), "two\n");
        assert!(
            std::fs::read_dir(&root)
                .expect("read root")
                .all(|entry| !entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".okf-studio-")),
            "transaction artifacts must be removed"
        );
    }

    #[test]
    fn discards_a_single_staged_file_by_reported_path() {
        let root = canonical_temp_dir("reject");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write("session-1", &root.join("keep.md"), "keep".to_string())
            .expect("stage first");
        stages
            .stage_write("session-1", &root.join("drop.md"), "drop".to_string())
            .expect("stage second");
        let info = stages
            .discard_file("session-1", "drop.md")
            .expect("discard one");
        assert_eq!(info.files.len(), 1);
        assert_eq!(info.files[0].path, "keep.md");
        assert!(info.granted);
        assert_eq!(
            stages
                .discard_file("session-1", "drop.md")
                .expect_err("already gone"),
            "This file is not staged.",
        );
    }

    #[test]
    fn discard_clears_files_and_restore_resets_the_grant() {
        let root = canonical_temp_dir("reset");
        let stages = registered(&root);
        stages.set_grant("session-1", true).expect("grant");
        stages
            .stage_write("session-1", &root.join("a.md"), "text".to_string())
            .expect("stage file");
        let info = stages.discard("session-1").expect("discard");
        assert!(info.files.is_empty());
        assert!(info.granted, "discard keeps the grant");
        // Re-registration (session load/restore) revokes the earlier grant.
        stages
            .register_session("session-1", &root)
            .expect("reset session");
        assert!(!stages.summary("session-1").expect("summary").granted);
        let error = stages
            .stage_write("session-1", &root.join("a.md"), "text".to_string())
            .expect_err("restored session requires a fresh grant");
        assert!(error.contains("Allow edits in this thread"));
    }
}
