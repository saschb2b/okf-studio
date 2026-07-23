//! Reviewed staging for Compatibility Clinic normalizations.
//!
//! The frontend identifies a live report finding, never replacement content.
//! This boundary regenerates the report, derives the repair from the current
//! bundle, and routes the resulting complete file through `SessionStages`.

use crate::agent_stage::{
    AgentCheckpointRestoreInfo, AgentStageMode, AgentStagedApplyInfo, AgentStagedChangesInfo,
    AgentStagedFileDiff, AgentStagedValidationInfo, AgentWriteGrantAuthority, AgentWriteGrantMode,
    SessionStages, MAX_STAGED_FILES, MAX_STAGED_FILE_BYTES, MAX_STAGED_TOTAL_BYTES,
};
use okf_core::compatibility;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct CompatibilityStageState {
    inner: Arc<CompatibilityStages>,
}

struct CompatibilityStages {
    stages: SessionStages,
    sessions: Mutex<SessionRegistry>,
}

#[derive(Default)]
struct SessionRegistry {
    next_id: u64,
    by_root: HashMap<PathBuf, String>,
}

impl CompatibilityStageState {
    pub fn persistent(checkpoint_directory: PathBuf) -> Self {
        Self {
            inner: Arc::new(CompatibilityStages {
                stages: SessionStages::persistent(checkpoint_directory),
                sessions: Mutex::new(SessionRegistry::default()),
            }),
        }
    }

    pub fn stage_normalization(
        &self,
        bundle_root: &Path,
        file: &str,
        rule_id: &str,
        authored: &str,
    ) -> Result<CompatibilityReview, String> {
        if rule_id != "okf.portability.relative-link" {
            return Err("This compatibility rule has no staged normalization.".to_string());
        }

        let report = compatibility::analyze(&okf_core::read_bundle(bundle_root));
        let repair = report
            .findings
            .into_iter()
            .filter(|finding| finding.file == file && finding.rule_id == rule_id)
            .filter_map(|finding| finding.repair)
            .find(|repair| repair.authored == authored)
            .ok_or_else(|| {
                "The compatibility finding changed. Refresh the report before reviewing it."
                    .to_string()
            })?;

        let path = bundle_root.join(file);
        let size = fs::metadata(&path)
            .map_err(|_| "The compatibility source file is no longer available.".to_string())?
            .len();
        if size > MAX_STAGED_FILE_BYTES as u64 {
            return Err("The compatibility source file exceeds the 1 MB review limit.".to_string());
        }
        let raw = fs::read_to_string(&path)
            .map_err(|_| "The compatibility source file is not UTF-8 Markdown.".to_string())?;
        let (_, body) = okf_core::frontmatter::split(&raw);
        let prefix_length = raw.len().saturating_sub(body.len());
        let normalized_body = compatibility::apply_repairs(body, &[repair])?;
        let normalized = format!("{}{}", &raw[..prefix_length], normalized_body);

        let session_id = self.session_for(bundle_root)?;
        self.inner.stages.discard(&session_id)?;
        self.inner
            .stages
            .stage_write(&session_id, &path, normalized)?;
        let changes = self.inner.stages.staged_diff(&session_id, file)?;
        Ok(CompatibilityReview {
            staged: self
                .inner
                .stages
                .set_mode(&session_id, AgentStageMode::Enhance)?,
            diff: changes,
        })
    }

    pub fn stage_concept_move(
        &self,
        bundle_root: &Path,
        source_id: &str,
        destination_path: &str,
    ) -> Result<ConceptMoveReview, String> {
        let bundle = okf_core::read_bundle(bundle_root);
        let markdown = read_move_markdown(bundle_root, &bundle)?;
        let plan = okf_core::maintenance::plan_concept_move(
            &bundle,
            &markdown,
            source_id,
            destination_path,
        )?;
        if plan.changes.len() > MAX_STAGED_FILES {
            return Err(format!(
                "This move affects {} files; reviewed maintenance is limited to {MAX_STAGED_FILES}.",
                plan.changes.len()
            ));
        }
        let writes = plan
            .changes
            .iter()
            .map(|change| (bundle_root.join(&change.path), change.content.clone()))
            .collect();
        let session_id = self.session_for(bundle_root)?;
        self.inner.stages.discard(&session_id)?;
        let staged = self.inner.stages.stage_writes(&session_id, writes)?;
        Ok(ConceptMoveReview { plan, staged })
    }

    pub fn select_hunk(
        &self,
        bundle_root: &Path,
        path: &str,
        revision: &str,
        hunk_index: usize,
        selected: bool,
    ) -> Result<AgentStagedFileDiff, String> {
        let session_id = self.existing_session(bundle_root)?;
        self.inner
            .stages
            .set_hunk_selection(&session_id, path, revision, hunk_index, selected)
    }

    pub fn diff(&self, bundle_root: &Path, path: &str) -> Result<AgentStagedFileDiff, String> {
        let session_id = self.existing_session(bundle_root)?;
        self.inner.stages.staged_diff(&session_id, path)
    }

    pub fn validate(&self, bundle_root: &Path) -> Result<AgentStagedValidationInfo, String> {
        let session_id = self.existing_session(bundle_root)?;
        self.inner.stages.validate_staged(&session_id)
    }

    pub fn apply(
        &self,
        bundle_root: &Path,
        revision: &str,
    ) -> Result<AgentStagedApplyInfo, String> {
        let session_id = self.existing_session(bundle_root)?;
        self.inner.stages.apply_staged(&session_id, revision)
    }

    pub fn discard(&self, bundle_root: &Path) -> Result<AgentStagedChangesInfo, String> {
        let session_id = self.existing_session(bundle_root)?;
        self.inner.stages.discard(&session_id)
    }

    pub fn restore(&self, bundle_root: &Path) -> Result<AgentCheckpointRestoreInfo, String> {
        let session_id = self.session_for(bundle_root)?;
        self.inner.stages.restore_checkpoint(&session_id)
    }

    fn session_for(&self, bundle_root: &Path) -> Result<String, String> {
        let mut registry = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "Compatibility review state is unavailable.".to_string())?;
        if let Some(session_id) = registry.by_root.get(bundle_root) {
            return Ok(session_id.clone());
        }
        registry.next_id += 1;
        let session_id = format!("compatibility-clinic-{}", registry.next_id);
        self.inner
            .stages
            .register_session(&session_id, bundle_root)?;
        self.inner.stages.set_grant_for_mode(
            &session_id,
            true,
            AgentWriteGrantMode::Interactive,
            AgentWriteGrantAuthority::InteractiveOnly,
        )?;
        self.inner
            .stages
            .set_mode(&session_id, AgentStageMode::Enhance)?;
        registry
            .by_root
            .insert(bundle_root.to_path_buf(), session_id.clone());
        Ok(session_id)
    }

    fn existing_session(&self, bundle_root: &Path) -> Result<String, String> {
        self.inner
            .sessions
            .lock()
            .map_err(|_| "Compatibility review state is unavailable.".to_string())?
            .by_root
            .get(bundle_root)
            .cloned()
            .ok_or_else(|| "Open a compatibility normalization review first.".to_string())
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityReview {
    pub staged: AgentStagedChangesInfo,
    pub diff: AgentStagedFileDiff,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConceptMoveReview {
    pub plan: okf_core::maintenance::ConceptMovePlan,
    pub staged: AgentStagedChangesInfo,
}

fn read_move_markdown(
    bundle_root: &Path,
    bundle: &okf_core::Bundle,
) -> Result<BTreeMap<String, String>, String> {
    let mut paths = bundle
        .concepts
        .iter()
        .map(|concept| format!("{}.md", concept.id))
        .collect::<BTreeSet<_>>();
    paths.extend(
        bundle
            .indexes
            .iter()
            .filter(|index| !index.synthesized)
            .map(|index| {
                if index.dir.is_empty() {
                    "index.md".to_string()
                } else {
                    format!("{}/index.md", index.dir)
                }
            }),
    );
    if bundle_root.join("log.md").is_file() {
        paths.insert("log.md".to_string());
    }
    if paths.len() > 4_096 {
        return Err("Move planning is limited to 4,096 Markdown files.".to_string());
    }

    let mut total = 0usize;
    let mut markdown = BTreeMap::new();
    for relative in paths {
        let path = bundle_root.join(&relative);
        let metadata = path
            .symlink_metadata()
            .map_err(|_| format!("Move planning could not inspect {relative}."))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!(
                "Move planning will not read the non-regular file {relative}."
            ));
        }
        let size = usize::try_from(metadata.len())
            .map_err(|_| format!("{relative} is too large for move review."))?;
        if size > MAX_STAGED_FILE_BYTES {
            return Err(format!(
                "{relative} exceeds the 1 MB move-review file limit."
            ));
        }
        total = total
            .checked_add(size)
            .ok_or_else(|| "Move planning exceeded its text budget.".to_string())?;
        if total > MAX_STAGED_TOTAL_BYTES {
            return Err("Move planning is limited to 8 MB of Markdown.".to_string());
        }
        let content = fs::read_to_string(path)
            .map_err(|_| format!("{relative} is not readable UTF-8 Markdown."))?;
        markdown.insert(relative, content);
    }
    Ok(markdown)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Fixture {
        directory: PathBuf,
        bundle: PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let directory = std::env::temp_dir().join(format!("okf-clinic-stage-{nonce}"));
            let bundle = directory.join("bundle");
            fs::create_dir_all(bundle.join("nested")).expect("fixture directories");
            fs::write(bundle.join("index.md"), "# Fixture\n").expect("index");
            fs::write(
                bundle.join("target.md"),
                "---\ntype: Reference\n---\n\nTarget.\n",
            )
            .expect("target");
            fs::write(
                bundle.join("nested/source.md"),
                "---\ntype: Guide\n---\n\n[Target](/target.md)\n",
            )
            .expect("source");
            Self { directory, bundle }
        }

        fn state(&self) -> CompatibilityStageState {
            CompatibilityStageState::persistent(self.directory.join("checkpoints"))
        }

        fn source(&self) -> String {
            fs::read_to_string(self.bundle.join("nested/source.md")).expect("read source")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }

    #[test]
    fn stages_reviews_applies_and_restores_a_live_normalization() {
        let fixture = Fixture::new();
        let original = fixture.source();
        let state = fixture.state();

        let review = state
            .stage_normalization(
                &fixture.bundle,
                "nested/source.md",
                "okf.portability.relative-link",
                "/target.md",
            )
            .expect("stage normalization");
        assert_eq!(fixture.source(), original, "staging must not touch disk");
        assert_eq!(review.diff.path, "nested/source.md");
        assert!(!review.diff.hunks.is_empty());
        assert!(
            state.validate(&fixture.bundle).is_err(),
            "review is required"
        );

        let mut diff = review.diff;
        for hunk in diff.hunks.clone() {
            diff = state
                .select_hunk(
                    &fixture.bundle,
                    &diff.path,
                    &diff.revision,
                    hunk.index,
                    true,
                )
                .expect("keep hunk");
        }
        let validation = state.validate(&fixture.bundle).expect("validate stage");
        assert_eq!(validation.errors, 0);

        let applied = state
            .apply(&fixture.bundle, &validation.revision)
            .expect("apply stage");
        assert_eq!(applied.applied_files, 1);
        assert!(fixture.source().contains("[Target](../target.md)"));
        assert!(applied.changes.can_restore);

        let restored = state.restore(&fixture.bundle).expect("restore apply");
        assert_eq!(restored.restored_files, 1);
        assert_eq!(fixture.source(), original);
    }

    #[test]
    fn rejects_forged_findings_and_a_stale_disk_base() {
        let fixture = Fixture::new();
        let state = fixture.state();
        assert!(state
            .stage_normalization(
                &fixture.bundle,
                "nested/source.md",
                "okf.portability.relative-link",
                "/forged.md",
            )
            .expect_err("forged finding")
            .contains("changed"));

        let review = state
            .stage_normalization(
                &fixture.bundle,
                "nested/source.md",
                "okf.portability.relative-link",
                "/target.md",
            )
            .expect("stage normalization");
        let mut diff = review.diff;
        for hunk in diff.hunks.clone() {
            diff = state
                .select_hunk(
                    &fixture.bundle,
                    &diff.path,
                    &diff.revision,
                    hunk.index,
                    true,
                )
                .expect("keep hunk");
        }
        let validation = state.validate(&fixture.bundle).expect("validate stage");
        fs::write(
            fixture.bundle.join("nested/source.md"),
            "---\ntype: Guide\n---\n\nExternally changed.\n",
        )
        .expect("external edit");

        let error = state
            .apply(&fixture.bundle, &validation.revision)
            .expect_err("stale base");
        assert!(!error.is_empty());
        assert!(fixture.source().contains("Externally changed."));
    }

    #[test]
    fn stages_validates_applies_and_restores_a_concept_move() {
        let fixture = Fixture::new();
        fs::write(
            fixture.bundle.join("target.md"),
            "---\ntype: Reference\nstable_id: reference-target\n---\n\nTarget.\n",
        )
        .expect("stable source");
        fs::write(
            fixture.bundle.join("index.md"),
            "# Fixture\n\n- [Target](target.md)\n",
        )
        .expect("index link");
        fs::write(
            fixture.bundle.join("nested/source.md"),
            "---\ntype: Guide\n---\n\n[Target](../target.md)\n",
        )
        .expect("inbound link");
        let state = fixture.state();

        let review = state
            .stage_concept_move(&fixture.bundle, "target", "archive/Target guide.md")
            .expect("stage move");
        assert_eq!(review.plan.stable_id.as_deref(), Some("reference-target"));
        assert_eq!(review.plan.affected_links, 2);
        assert!(!fixture.bundle.join("archive/Target guide.md").exists());
        assert!(
            state.validate(&fixture.bundle).is_err(),
            "review is required"
        );

        for file in &review.staged.files {
            if file.kind != "modify" {
                continue;
            }
            let mut diff = state
                .inner
                .stages
                .staged_diff(&review.staged.session_id, &file.path)
                .expect("move diff");
            for hunk in diff.hunks.clone() {
                diff = state
                    .select_hunk(
                        &fixture.bundle,
                        &file.path,
                        &diff.revision,
                        hunk.index,
                        true,
                    )
                    .expect("review move hunk");
            }
        }
        let validation = state.validate(&fixture.bundle).expect("validate move");
        assert_eq!(validation.errors, 0);
        let applied = state
            .apply(&fixture.bundle, &validation.revision)
            .expect("apply move");
        assert_eq!(applied.applied_files, 4);
        assert!(fs::read_to_string(fixture.bundle.join("target.md"))
            .expect("redirect")
            .contains("type: Redirect"));
        assert!(fixture.bundle.join("archive/Target guide.md").is_file());
        assert!(fs::read_to_string(fixture.bundle.join("nested/source.md"))
            .expect("updated inbound link")
            .contains("../archive/Target%20guide.md"));

        let restored = state.restore(&fixture.bundle).expect("restore move");
        assert_eq!(restored.restored_files, 4);
        assert!(!fixture.bundle.join("archive/Target guide.md").exists());
        assert!(fs::read_to_string(fixture.bundle.join("target.md"))
            .expect("restored source")
            .contains("reference-target"));
    }
}
