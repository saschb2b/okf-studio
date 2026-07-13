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

use serde::Serialize;
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

pub(crate) const WRITE_GRANT_MESSAGE: &str =
    "Bundle write denied: writes require the Allow edits in this thread grant.";

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

#[derive(Clone, PartialEq, Eq)]
struct SessionStage {
    bundle_root: PathBuf,
    granted: bool,
    files: BTreeMap<String, StagedFile>,
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
#[derive(Default)]
pub struct SessionStages {
    sessions: Mutex<HashMap<String, SessionStage>>,
}

impl SessionStages {
    /// Register (or reset) a session. Creating and loading both start with the
    /// grant revoked and the staged tree empty: a restored session never
    /// inherits an earlier grant.
    pub fn register_session(&self, session_id: &str, bundle_root: &Path) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.insert(
                session_id.to_string(),
                SessionStage {
                    bundle_root: bundle_root.to_path_buf(),
                    granted: false,
                    files: BTreeMap::new(),
                },
            );
        }
    }

    /// Grant or revoke writes for one registered session. Revoking keeps the
    /// staged files visible so the user can still review or discard them.
    pub fn set_grant(
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
        let (bundle_root, files) = {
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
            (stage.bundle_root.clone(), stage.files.clone())
        };

        let prepared = prepare_selected_stage(&bundle_root, &files)?;
        validate_prepared(session_id, &bundle_root, &prepared)
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
        if stage.files.is_empty() {
            return Err("There are no staged changes to apply.".to_string());
        }

        let prepared = prepare_selected_stage(&stage.bundle_root, &stage.files)?;
        let revision = selected_stage_revision(&prepared);
        if revision != expected_revision {
            return Err("The staged changes or bundle files changed. Validate them again.".to_string());
        }
        let validation = validate_prepared(session_id, &stage.bundle_root, &prepared)?;
        if validation.errors > 0 {
            return Err(format!(
                "Apply blocked: staged validation found {} error{}.",
                validation.errors,
                if validation.errors == 1 { "" } else { "s" }
            ));
        }

        let applied_files = apply_prepared_transaction(&stage.bundle_root, &prepared, None)?;
        stage.files.clear();
        Ok(AgentStagedApplyInfo {
            session_id: session_id.to_string(),
            revision,
            applied_files,
            changes: snapshot(session_id, stage),
        })
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
    // Whether this write creates or modifies is decided against the real
    // bundle once, then kept stable across repeated writes to the path.
    let kind = existing.map_or_else(
        || {
            if stage.bundle_root.join(Path::new(&relative)).is_file() {
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
) -> Result<Vec<PreparedStagedFile>, String> {
    files
        .iter()
        .map(|(path, file)| {
            let target = bundle_root.join(Path::new(path));
            let relative = bundle_relative_write_path(bundle_root, &target)?;
            if relative != *path {
                return Err("A staged path no longer resolves to its reviewed file.".to_string());
            }
            if file.kind == "create" && target.exists() {
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
) -> Result<AgentStagedValidationInfo, String> {
    let mirror = ValidationMirror::create()?;
    copy_markdown_tree(bundle_root, &mirror.path)?;
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
}

struct AppliedReplacement {
    target: PathBuf,
    backup: Option<PathBuf>,
}

fn apply_prepared_transaction(
    bundle_root: &Path,
    prepared: &[PreparedStagedFile],
    fail_after: Option<usize>,
) -> Result<usize, String> {
    let mut pending = Vec::new();
    let mut created_directories = Vec::new();
    for file in prepared {
        let Some(content) = &file.effective else {
            continue;
        };
        let target = bundle_root.join(Path::new(&file.path));
        if let Err(error) = verify_prepared_base(bundle_root, file, &target) {
            cleanup_pending(&pending);
            cleanup_directories(&created_directories);
            return Err(error);
        }
        let Some(parent) = target.parent() else {
            cleanup_pending(&pending);
            cleanup_directories(&created_directories);
            return Err("A staged file has no parent directory.".to_string());
        };
        if let Err(error) =
            create_transaction_directories(bundle_root, parent, &mut created_directories)
        {
            cleanup_pending(&pending);
            cleanup_directories(&created_directories);
            return Err(error);
        }
        let relative = bundle_relative_write_path(bundle_root, &target)?;
        if relative != file.path {
            cleanup_pending(&pending);
            cleanup_directories(&created_directories);
            return Err("A staged path changed while preparing the transaction.".to_string());
        }

        let transaction_id = uuid::Uuid::new_v4();
        let temporary = parent.join(format!(".okf-studio-{transaction_id}.tmp"));
        let backup = (file.kind == "modify")
            .then(|| parent.join(format!(".okf-studio-{transaction_id}.bak")));
        let write_result = (|| -> Result<(), String> {
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| "A staged transaction file could not be created.".to_string())?;
            output
                .write_all(content.as_bytes())
                .and_then(|()| output.sync_all())
                .map_err(|_| "A staged transaction file could not be written.".to_string())?;
            if file.kind == "modify" {
                let permissions = std::fs::metadata(&target)
                    .map_err(|_| "A staged file's permissions could not be read.".to_string())?
                    .permissions();
                std::fs::set_permissions(&temporary, permissions).map_err(|_| {
                    "A staged transaction file's permissions could not be set.".to_string()
                })?;
            }
            Ok(())
        })();
        if let Err(error) = write_result {
            let _ = std::fs::remove_file(&temporary);
            cleanup_pending(&pending);
            cleanup_directories(&created_directories);
            return Err(error);
        }
        pending.push(PendingReplacement {
            target,
            temporary,
            backup,
            kind: file.kind,
            original: file.original.clone(),
        });
    }

    let mut applied = Vec::new();
    for (index, replacement) in pending.iter().enumerate() {
        if fail_after.is_some_and(|limit| index >= limit) {
            rollback_replacements(&applied);
            cleanup_pending(&pending);
            cleanup_directories(&created_directories);
            return Err("The staged transaction was interrupted.".to_string());
        }
        if let Err(error) = verify_transaction_base(replacement) {
            rollback_replacements(&applied);
            cleanup_pending(&pending);
            cleanup_directories(&created_directories);
            return Err(error);
        }
        if let Some(backup) = &replacement.backup {
            if std::fs::rename(&replacement.target, backup).is_err() {
                rollback_replacements(&applied);
                cleanup_pending(&pending);
                cleanup_directories(&created_directories);
                return Err("A bundle file could not enter the apply transaction.".to_string());
            }
        }
        if std::fs::rename(&replacement.temporary, &replacement.target).is_err() {
            if let Some(backup) = &replacement.backup {
                let _ = std::fs::rename(backup, &replacement.target);
            }
            rollback_replacements(&applied);
            cleanup_pending(&pending);
            cleanup_directories(&created_directories);
            return Err("A staged file could not be applied; the batch was restored.".to_string());
        }
        applied.push(AppliedReplacement {
            target: replacement.target.clone(),
            backup: replacement.backup.clone(),
        });
    }

    for replacement in &applied {
        if let Some(backup) = &replacement.backup {
            let _ = std::fs::remove_file(backup);
        }
    }
    Ok(applied.len())
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

fn create_transaction_directories(
    bundle_root: &Path,
    parent: &Path,
    created: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let relative = parent
        .strip_prefix(bundle_root)
        .map_err(|_| "A staged directory is outside the bundle.".to_string())?;
    let mut current = bundle_root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        if current.exists() {
            if !current.is_dir() {
                return Err("A staged file's parent is not a directory.".to_string());
            }
            continue;
        }
        std::fs::create_dir(&current)
            .map_err(|_| "A staged file's directory could not be created.".to_string())?;
        created.push(current.clone());
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
/// the canonical root, and no component may target Git metadata. A symbolic
/// link anywhere on an existing prefix of the path must not escape the root.
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
        if part.eq_ignore_ascii_case(".git") {
            return Err("Bundle write denied: Git metadata is protected.".to_string());
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
        stages.register_session("session-1", root);
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
    fn rejects_traversal_outside_root_and_git_metadata() {
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
            (root.clone(), "root itself"),
            (PathBuf::from("relative.md"), "must be absolute"),
        ] {
            let error = stages
                .stage_write("session-1", &path, "text".to_string())
                .expect_err("invalid path should fail");
            assert!(error.contains(expected), "{path:?}: {error}");
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
        let prepared = prepare_selected_stage(&root, &files).expect("prepare transaction");

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
        stages.register_session("session-1", &root);
        assert!(!stages.summary("session-1").expect("summary").granted);
        let error = stages
            .stage_write("session-1", &root.join("a.md"), "text".to_string())
            .expect_err("restored session requires a fresh grant");
        assert!(error.contains("Allow edits in this thread"));
    }
}
