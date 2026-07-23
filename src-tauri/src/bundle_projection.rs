use okf_core::projection::{
    self, ErasureAuditReport, ProjectionInput, ProjectionOmissionKind, ProjectionPlan,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const MARKER_FILE: &str = ".okf-projection.json";
const MAX_VALIDATION_ISSUES: usize = 512;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionExportInput {
    pub plan_revision: String,
    pub projection: ProjectionInput,
    pub overwrite_confirmed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProjectionExportStatus {
    Exported,
    BlockedByAudit,
    ExistingDestination,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionValidationIssue {
    pub level: &'static str,
    pub path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionValidation {
    pub errors: usize,
    pub warnings: usize,
    pub issues: Vec<ProjectionValidationIssue>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionExportResult {
    pub schema_version: u32,
    pub status: ProjectionExportStatus,
    pub destination: String,
    pub destination_folder_name: String,
    pub audit_report: String,
    pub audit: ErasureAuditReport,
    pub validation: ProjectionValidation,
    pub source_unchanged: bool,
    pub replaced_existing_projection: bool,
}

pub fn export(
    source_root: &Path,
    parent: &Path,
    input: &ProjectionExportInput,
) -> Result<ProjectionExportResult, String> {
    let source_root = dunce::canonicalize(source_root)
        .map_err(|_| "The source bundle is no longer available.".to_string())?;
    let parent = dunce::canonicalize(parent)
        .map_err(|_| "The selected projection parent is no longer available.".to_string())?;
    if !parent.is_dir() {
        return Err("Choose an existing destination parent.".to_string());
    }
    let source_bundle = okf_core::read_bundle(&source_root);
    let source_before = okf_core::health::bundle_fingerprint(&source_bundle);
    let plan = projection::plan(&source_root, &source_bundle, &input.projection)?;
    if plan.revision != input.plan_revision {
        return Err(
            "The source bundle or projection choices changed. Review a refreshed plan.".to_string(),
        );
    }
    if plan.included.is_empty() {
        return Err("The reviewed projection contains no concepts.".to_string());
    }
    let destination = parent.join(&plan.destination_folder_name);
    if destination.starts_with(&source_root) || source_root.starts_with(&destination) {
        return Err(
            "Choose a destination outside the source bundle and its ancestor path.".to_string(),
        );
    }
    let temporary = parent.join(format!(
        ".{}.okf-projection-{}.tmp",
        plan.destination_folder_name,
        uuid::Uuid::new_v4()
    ));
    fs::create_dir(&temporary)
        .map_err(|_| "Studio could not prepare the projection directory.".to_string())?;

    let prepared = prepare_projection(&source_root, &temporary, &source_bundle, &plan, input);
    if let Err(error) = prepared {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    let projected_bundle = okf_core::read_bundle(&temporary);
    let validation = projection_validation(&projected_bundle);
    if validation.errors > 0 {
        let _ = fs::remove_dir_all(&temporary);
        return Err("The recipient projection failed OKF validation.".to_string());
    }
    let terms = projection::erasure_terms(
        &source_bundle,
        &plan.omissions,
        &input.projection.sensitive_terms,
    );
    let audit = projection::audit_directory(&temporary, &terms);
    let audit_path = match write_audit_report(&parent, &plan, &audit) {
        Ok(path) => path,
        Err(error) => {
            let _ = fs::remove_dir_all(&temporary);
            return Err(error);
        }
    };
    let audit_display = audit_path.to_string_lossy().to_string();
    let destination_display = destination.to_string_lossy().to_string();
    let source_unchanged =
        okf_core::health::bundle_fingerprint(&okf_core::read_bundle(&source_root)) == source_before;
    if !source_unchanged {
        let _ = fs::remove_dir_all(&temporary);
        return Err(
            "The source bundle changed during projection. Studio kept the audit but did not export."
                .to_string(),
        );
    }
    if !audit.passed {
        let _ = fs::remove_dir_all(&temporary);
        return Ok(ProjectionExportResult {
            schema_version: 1,
            status: ProjectionExportStatus::BlockedByAudit,
            destination: destination_display,
            destination_folder_name: plan.destination_folder_name,
            audit_report: audit_display,
            audit,
            validation,
            source_unchanged,
            replaced_existing_projection: false,
        });
    }

    if destination.symlink_metadata().is_ok() && !input.overwrite_confirmed {
        let _ = fs::remove_dir_all(&temporary);
        return Ok(ProjectionExportResult {
            schema_version: 1,
            status: ProjectionExportStatus::ExistingDestination,
            destination: destination_display,
            destination_folder_name: plan.destination_folder_name,
            audit_report: audit_display,
            audit,
            validation,
            source_unchanged,
            replaced_existing_projection: false,
        });
    }

    let replaced_existing_projection = if destination.symlink_metadata().is_ok() {
        match replace_existing_projection(&temporary, &destination) {
            Ok(replaced) => replaced,
            Err(error) => {
                let _ = fs::remove_dir_all(&temporary);
                return Err(error);
            }
        }
    } else {
        if fs::rename(&temporary, &destination).is_err() {
            let _ = fs::remove_dir_all(&temporary);
            return Err("Studio could not move the complete projection into place.".to_string());
        }
        false
    };
    sync_directory(&parent);
    Ok(ProjectionExportResult {
        schema_version: 1,
        status: ProjectionExportStatus::Exported,
        destination: destination_display,
        destination_folder_name: plan.destination_folder_name,
        audit_report: audit_display,
        audit,
        validation,
        source_unchanged,
        replaced_existing_projection,
    })
}

fn prepare_projection(
    source_root: &Path,
    temporary: &Path,
    source_bundle: &okf_core::Bundle,
    plan: &ProjectionPlan,
    input: &ProjectionExportInput,
) -> Result<(), String> {
    let omitted_ids = plan
        .omissions
        .iter()
        .filter(|item| item.kind == ProjectionOmissionKind::Concept)
        .map(|item| item.id.clone())
        .collect::<BTreeSet<_>>();
    let terms = projection::erasure_terms(
        source_bundle,
        &plan.omissions,
        &input.projection.sensitive_terms,
    );
    for concept in &plan.included {
        let raw = fs::read_to_string(source_root.join(format!("{}.md", concept.id)))
            .map_err(|_| format!("Studio could not read {}.md.", concept.id))?;
        let rendered = projection::render_concept(&raw, &concept.id, &omitted_ids, &terms)?;
        write_new_file(
            &temporary.join(format!("{}.md", concept.id)),
            rendered.content.as_bytes(),
        )?;
    }
    write_new_file(
        &temporary.join("index.md"),
        generated_index(plan).as_bytes(),
    )?;
    write_new_file(&temporary.join("log.md"), generated_log(plan)?.as_bytes())?;
    write_new_file(
        &temporary.join(MARKER_FILE),
        b"{\n  \"schemaVersion\": 1,\n  \"producer\": \"OKF Studio\",\n  \"kind\": \"recipient-projection\"\n}\n",
    )?;
    Ok(())
}

fn generated_index(plan: &ProjectionPlan) -> String {
    let recipient = yaml_string(&plan.recipient);
    let title = markdown_text(&plan.recipient);
    let mut output = format!(
        "---\nokf_version: \"0.1\"\nprojection_recipient: {recipient}\nprojection_policy: reviewed-least-disclosure\n---\n\n# Knowledge for {title}\n\nThis recipient bundle was created from an explicit, reviewed projection in OKF Studio. Audience and sensitivity values remain advisory; this copy does not grant access to its source.\n\n# Included concepts\n"
    );
    for concept in &plan.included {
        output.push_str(&format!(
            "* [{}]({}.md) - {}\n",
            markdown_link_label(&concept.title),
            portable_concept_path(&concept.id),
            match concept.reason {
                projection::ProjectionInclusionReason::Explicit => "Selected explicitly",
                projection::ProjectionInclusionReason::TransitiveLink => {
                    "Included through a retained concept link"
                }
            }
        ));
    }
    output
}

fn generated_log(plan: &ProjectionPlan) -> Result<String, String> {
    Ok(format!(
        "# Log\n\n## {}\n\n* **Creation**: Created a reviewed recipient projection for {} with {} included concept{}, {} omitted item{}, {} rewritten link consequence{}, and {} planned redaction{}.\n",
        current_day()?,
        markdown_text(&plan.recipient),
        plan.included.len(),
        plural(plan.included.len()),
        plan.omissions.len(),
        plural(plan.omissions.len()),
        plan.link_consequences
            .iter()
            .filter(|item| matches!(
                item.outcome,
                projection::ProjectionLinkOutcome::RewrittenOmitted
            ))
            .map(|item| item.occurrences)
            .sum::<usize>(),
        plural(
            plan.link_consequences
                .iter()
                .filter(|item| matches!(
                    item.outcome,
                    projection::ProjectionLinkOutcome::RewrittenOmitted
                ))
                .map(|item| item.occurrences)
                .sum()
        ),
        plan.redactions.iter().map(|item| item.occurrences).sum::<usize>(),
        plural(plan.redactions.iter().map(|item| item.occurrences).sum()),
    ))
}

fn projection_validation(bundle: &okf_core::Bundle) -> ProjectionValidation {
    let errors = bundle
        .issues
        .iter()
        .filter(|issue| issue.level == okf_core::IssueLevel::Error)
        .count();
    let warnings = bundle
        .issues
        .iter()
        .filter(|issue| issue.level == okf_core::IssueLevel::Warning)
        .count();
    let truncated = bundle.issues.len() > MAX_VALIDATION_ISSUES;
    let issues = bundle
        .issues
        .iter()
        .take(MAX_VALIDATION_ISSUES)
        .map(|issue| ProjectionValidationIssue {
            level: match issue.level {
                okf_core::IssueLevel::Error => "error",
                okf_core::IssueLevel::Warning => "warning",
            },
            path: issue
                .message
                .split_once(':')
                .map(|(path, _)| path.to_string()),
            message: issue.message.clone(),
        })
        .collect();
    ProjectionValidation {
        errors,
        warnings,
        issues,
        truncated,
    }
}

fn write_audit_report(
    parent: &Path,
    plan: &ProjectionPlan,
    audit: &ErasureAuditReport,
) -> Result<PathBuf, String> {
    let revision = plan
        .revision
        .strip_prefix("okf-projection-")
        .unwrap_or(&plan.revision);
    let short_revision = &revision[..revision.len().min(12)];
    let base = format!(
        "{}.{}.erasure-audit.json",
        plan.destination_folder_name, short_revision
    );
    let mut path = parent.join(&base);
    if path.symlink_metadata().is_ok() {
        path = parent.join(format!(
            "{}.{}.erasure-audit.json",
            plan.destination_folder_name,
            uuid::Uuid::new_v4()
        ));
    }
    let bytes = serde_json::to_vec_pretty(audit)
        .map_err(|_| "Studio could not encode the erasure audit.".to_string())?;
    write_new_file(&path, &bytes)?;
    Ok(path)
}

fn replace_existing_projection(temporary: &Path, destination: &Path) -> Result<bool, String> {
    let metadata = fs::symlink_metadata(destination)
        .map_err(|_| "The existing projection destination could not be inspected.".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(
            "Studio replaces only a real directory created as a prior recipient projection."
                .to_string(),
        );
    }
    let marker = fs::read_to_string(destination.join(MARKER_FILE))
        .map_err(|_| "The existing folder is not a marked OKF Studio projection.".to_string())?;
    let marker: serde_json::Value = serde_json::from_str(&marker)
        .map_err(|_| "The existing projection marker is invalid.".to_string())?;
    if marker
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
        || marker.get("producer").and_then(serde_json::Value::as_str) != Some("OKF Studio")
        || marker.get("kind").and_then(serde_json::Value::as_str) != Some("recipient-projection")
    {
        return Err("The existing folder is not a marked OKF Studio projection.".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "The projection destination has no parent.".to_string())?;
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The projection destination name is invalid.".to_string())?;
    let backup = parent.join(format!(
        ".{name}.okf-projection-backup-{}",
        uuid::Uuid::new_v4()
    ));
    fs::rename(destination, &backup).map_err(|_| {
        "Studio could not preserve the prior projection before replacement.".to_string()
    })?;
    if let Err(error) = fs::rename(temporary, destination) {
        let _ = fs::rename(&backup, destination);
        return Err(format!(
            "Studio could not replace the prior projection: {error}"
        ));
    }
    if let Err(error) = fs::remove_dir_all(&backup) {
        return Err(format!(
            "The new projection is complete, but Studio could not remove its guarded backup: {error}"
        ));
    }
    Ok(true)
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| "Studio could not prepare a projection subdirectory.".to_string())?;
    }
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|_| "Studio could not create a projection file.".to_string())?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(|_| "Studio could not finish a projection file.".to_string())
}

fn yaml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"recipient\"".to_string())
}

fn markdown_text(value: &str) -> String {
    value
        .replace(['\n', '\r'], " ")
        .replace(['#', '<', '>'], "")
        .trim()
        .to_string()
}

fn markdown_link_label(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

fn portable_concept_path(id: &str) -> String {
    id.split('/')
        .map(|segment| {
            let mut encoded = String::new();
            for byte in segment.as_bytes() {
                if byte.is_ascii_alphanumeric() || matches!(*byte, b'-' | b'_' | b'.' | b'~') {
                    encoded.push(char::from(*byte));
                } else {
                    encoded.push_str(&format!("%{byte:02X}"));
                }
            }
            encoded
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn plural(count: usize) -> &'static str {
    if count == 1 {
        ""
    } else {
        "s"
    }
}

fn current_day() -> Result<String, String> {
    let format = time::format_description::parse_borrowed::<3>("[year]-[month]-[day]")
        .map_err(|_| "Studio could not prepare the projection date.".to_string())?;
    time::OffsetDateTime::now_utc()
        .format(&format)
        .map_err(|_| "Studio could not format the projection date.".to_string())
}

fn sync_directory(path: &Path) {
    if let Ok(directory) = fs::File::open(path) {
        let _ = directory.sync_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("okf-export-{name}-{nonce}"));
        fs::create_dir_all(&path).expect("temp directory");
        dunce::canonicalize(path).expect("canonical temp")
    }

    #[test]
    fn exports_a_valid_audited_copy_without_changing_the_source() {
        let source = temp_dir("source");
        let parent = temp_dir("parent");
        fs::write(
            source.join("index.md"),
            "---\nokf_version: \"0.1\"\n---\n# Source\n",
        )
        .expect("index");
        fs::write(
            source.join("public.md"),
            "---\ntype: Note\nsensitivity: public\n---\n# Public\n\n[Secret plan](secret.md)\n",
        )
        .expect("public");
        fs::write(
            source.join("secret.md"),
            "---\ntype: Note\nsensitivity: restricted\nstable_id: secret-plan-id\n---\n# Secret plan\n",
        )
        .expect("secret");
        let source_before = fs::read_to_string(source.join("public.md")).expect("source before");
        let projection = ProjectionInput {
            recipient: "Partner".to_string(),
            recipient_audiences: vec![],
            max_sensitivity: "public".to_string(),
            include_unknown_sensitivity: true,
            selected_concept_ids: vec!["public".to_string()],
            sensitive_terms: vec![],
        };
        let plan =
            projection::plan(&source, &okf_core::read_bundle(&source), &projection).expect("plan");
        let result = export(
            &source,
            &parent,
            &ProjectionExportInput {
                plan_revision: plan.revision,
                projection,
                overwrite_confirmed: false,
            },
        )
        .expect("export");

        assert!(matches!(result.status, ProjectionExportStatus::Exported));
        assert!(result.audit.passed);
        assert_eq!(result.validation.errors, 0);
        assert!(result.source_unchanged);
        assert_eq!(
            fs::read_to_string(source.join("public.md")).expect("source after"),
            source_before
        );
        let output = fs::read_to_string(parent.join("partner-okf/public.md")).expect("output");
        assert!(!output.to_ascii_lowercase().contains("secret"));
        assert!(Path::new(&result.audit_report).is_file());
        let _ = fs::remove_dir_all(source);
        let _ = fs::remove_dir_all(parent);
    }

    #[test]
    fn refuses_to_replace_an_unmarked_folder_even_with_confirmation() {
        let source = temp_dir("replace-source");
        let parent = temp_dir("replace-parent");
        fs::write(
            source.join("index.md"),
            "---\nokf_version: \"0.1\"\n---\n# Source\n",
        )
        .expect("index");
        fs::write(source.join("note.md"), "---\ntype: Note\n---\n# Note\n").expect("note");
        fs::create_dir(parent.join("recipient-okf")).expect("existing");
        let projection = ProjectionInput {
            recipient: "Recipient".to_string(),
            recipient_audiences: vec![],
            max_sensitivity: "restricted".to_string(),
            include_unknown_sensitivity: true,
            selected_concept_ids: vec!["note".to_string()],
            sensitive_terms: vec![],
        };
        let plan =
            projection::plan(&source, &okf_core::read_bundle(&source), &projection).expect("plan");
        let error = export(
            &source,
            &parent,
            &ProjectionExportInput {
                plan_revision: plan.revision,
                projection,
                overwrite_confirmed: true,
            },
        )
        .expect_err("unmarked destination");
        assert!(error.contains("not a marked OKF Studio projection"));
        let _ = fs::remove_dir_all(source);
        let _ = fs::remove_dir_all(parent);
    }

    #[test]
    fn rejects_a_stale_reviewed_plan_before_writing() {
        let source = temp_dir("stale-source");
        let parent = temp_dir("stale-parent");
        fs::write(
            source.join("index.md"),
            "---\nokf_version: \"0.1\"\n---\n# Source\n",
        )
        .expect("index");
        fs::write(
            source.join("note.md"),
            "---\ntype: Note\nsensitivity: public\n---\n# Note\n",
        )
        .expect("note");
        let projection = ProjectionInput {
            recipient: "Recipient".to_string(),
            recipient_audiences: vec![],
            max_sensitivity: "public".to_string(),
            include_unknown_sensitivity: false,
            selected_concept_ids: vec!["note".to_string()],
            sensitive_terms: vec![],
        };
        let plan =
            projection::plan(&source, &okf_core::read_bundle(&source), &projection).expect("plan");
        fs::write(
            source.join("note.md"),
            "---\ntype: Note\nsensitivity: public\n---\n# Updated note\n",
        )
        .expect("changed source");

        let error = export(
            &source,
            &parent,
            &ProjectionExportInput {
                plan_revision: plan.revision,
                projection,
                overwrite_confirmed: false,
            },
        )
        .expect_err("stale review");
        assert!(error.contains("changed"));
        assert_eq!(fs::read_dir(&parent).expect("parent").count(), 0);
        let _ = fs::remove_dir_all(source);
        let _ = fs::remove_dir_all(parent);
    }
}
