use crate::agent_local::{LocalToolCall, LocalToolDefinition};
use crate::agent_stage::{
    AgentStagedChangesInfo, AgentStagedFileDiff, AgentStagedValidationInfo, SessionStages,
    MAX_STAGED_PATH_CHARS,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub(crate) const STAGE_PROPOSE_TOOL: &str = "studio_stage_propose";
pub(crate) const STAGE_INVENTORY_TOOL: &str = "studio_stage_inventory";
pub(crate) const STAGE_DIFF_TOOL: &str = "studio_stage_diff";
pub(crate) const STAGE_VALIDATE_TOOL: &str = "studio_stage_validate";
const MAX_PROPOSAL_FILES: usize = 16;
const MAX_PROPOSAL_FILE_BYTES: usize = 64 * 1024;
const MAX_PROPOSAL_TOTAL_BYTES: usize = 192 * 1024;
const MAX_DIFF_OUTPUT_CHARS: usize = 64 * 1024;
const MAX_VALIDATION_ISSUES: usize = 100;
const MAX_VALIDATION_NODES: usize = 50;
const MAX_VALIDATION_EDGES: usize = 100;
const MAX_VALIDATION_FIELD_CHARS: usize = 1_024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProposeInput {
    files: Vec<ProposedFile>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProposedFile {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyInput {}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DiffInput {
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProposalOutput {
    staged_files: usize,
    staged_bytes: usize,
    changes: AgentStagedChangesInfo,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffOutput {
    path: String,
    kind: &'static str,
    revision: String,
    hunks: Vec<DiffHunkOutput>,
    truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiffHunkOutput {
    index: usize,
    header: String,
    unified: String,
    selected: bool,
    reviewed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationOutput {
    revision: String,
    errors: usize,
    warnings: usize,
    issues: Vec<ValidationIssueOutput>,
    issues_truncated: bool,
    preview: ValidationPreviewOutput,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationIssueOutput {
    path: Option<String>,
    level: &'static str,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationPreviewOutput {
    nodes: Vec<ValidationNodeOutput>,
    edges: Vec<ValidationEdgeOutput>,
    total_nodes: usize,
    total_edges: usize,
    truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ValidationNodeOutput {
    id: String,
    title: String,
    concept_type: String,
    staged: bool,
    access: okf_core::access::AccessHints,
}

#[derive(Debug, Serialize)]
struct ValidationEdgeOutput {
    source: String,
    target: String,
}

#[derive(Debug)]
pub(crate) struct NativeStageExecution {
    pub output: String,
    pub changes: Option<AgentStagedChangesInfo>,
    pub change_state: Option<&'static str>,
}

pub(crate) fn native_tool_definitions() -> Vec<LocalToolDefinition> {
    vec![
        LocalToolDefinition {
            name: STAGE_INVENTORY_TOOL,
            description: "Inspect the current in-memory staged proposal for this thread. Returns bundle-relative paths and sizes, never file contents. Staged files are not applied to the bundle.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: STAGE_PROPOSE_TOOL,
            description: "Propose an atomic batch of complete UTF-8 Markdown files in Studio's in-memory staged tree. Requires the user's Allow edits in this thread grant. Paths must be bundle-relative forward-slash .md paths. This never applies files to disk.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "files": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": MAX_PROPOSAL_FILES,
                        "items": {
                            "type": "object",
                            "properties": {
                                "path": {"type": "string", "minLength": 1, "maxLength": MAX_STAGED_PATH_CHARS, "pattern": "^[^\\\\]+\\.md$"},
                                "content": {"type": "string", "maxLength": MAX_PROPOSAL_FILE_BYTES}
                            },
                            "required": ["path", "content"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["files"],
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: STAGE_DIFF_TOOL,
            description: "Review a bounded unified diff for one path returned by staged inventory. This is read-only and cannot keep, reject, approve, or apply changes.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "minLength": 1, "maxLength": MAX_STAGED_PATH_CHARS}
                },
                "required": ["path"],
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: STAGE_VALIDATE_TOOL,
            description: "Validate the current selected staged outcome in Studio's isolated OKF mirror and return bounded issues and graph structure. This cannot approve or apply changes; the user must still review and apply them.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        },
    ]
}

pub(crate) fn is_native_stage_tool(name: &str) -> bool {
    matches!(
        name,
        STAGE_PROPOSE_TOOL | STAGE_INVENTORY_TOOL | STAGE_DIFF_TOOL | STAGE_VALIDATE_TOOL
    )
}

pub(crate) fn native_tool_display(call: &LocalToolCall) -> (String, &'static str) {
    match call.name.as_str() {
        STAGE_PROPOSE_TOOL => {
            let count = serde_json::from_value::<ProposeInput>(call.arguments.clone())
                .map(|input| input.files.len())
                .unwrap_or(0);
            (
                if count == 1 {
                    "Propose 1 staged file".to_string()
                } else if count > 1 {
                    format!("Propose {count} staged files")
                } else {
                    "Propose staged files".to_string()
                },
                "edit",
            )
        }
        STAGE_INVENTORY_TOOL => ("Inspect staged proposal".to_string(), "search"),
        STAGE_DIFF_TOOL => ("Review staged diff".to_string(), "read"),
        STAGE_VALIDATE_TOOL => ("Validate staged proposal".to_string(), "search"),
        _ => ("Use staged proposal".to_string(), "other"),
    }
}

pub(crate) fn execute_native_tool(
    stages: &SessionStages,
    session_id: &str,
    bundle_root: &Path,
    call: &LocalToolCall,
) -> Result<NativeStageExecution, String> {
    match call.name.as_str() {
        STAGE_INVENTORY_TOOL => {
            let _: EmptyInput = native_input(call)?;
            let changes = stage_summary(stages, session_id)?;
            execution(&changes, None, None)
        }
        STAGE_PROPOSE_TOOL => {
            let input: ProposeInput = native_input(call)?;
            let (writes, staged_bytes) = proposed_writes(bundle_root, input)?;
            let staged_files = writes.len();
            let changes = stages.stage_writes(session_id, writes)?;
            let output = ProposalOutput {
                staged_files,
                staged_bytes,
                changes: changes.clone(),
            };
            execution(&output, Some(changes), Some("staged"))
        }
        STAGE_DIFF_TOOL => {
            let input: DiffInput = native_input(call)?;
            validate_reported_path(&input.path)?;
            let diff = stages.staged_diff(session_id, &input.path)?;
            execution(&bounded_diff(diff), None, None)
        }
        STAGE_VALIDATE_TOOL => {
            let _: EmptyInput = native_input(call)?;
            let validation = stages.validate_staged(session_id)?;
            execution(&bounded_validation(validation), None, None)
        }
        _ => Err("The model requested a tool that Studio did not offer.".to_string()),
    }
}

fn proposed_writes(
    bundle_root: &Path,
    input: ProposeInput,
) -> Result<(Vec<(PathBuf, String)>, usize), String> {
    if input.files.is_empty() || input.files.len() > MAX_PROPOSAL_FILES {
        return Err(format!(
            "Propose between 1 and {MAX_PROPOSAL_FILES} Markdown files at a time."
        ));
    }
    let mut paths = HashSet::new();
    let mut total = 0usize;
    let mut writes = Vec::with_capacity(input.files.len());
    for file in input.files {
        validate_reported_path(&file.path)?;
        let bytes = file.content.len();
        if bytes > MAX_PROPOSAL_FILE_BYTES {
            return Err(format!(
                "A native staged proposal file is limited to {MAX_PROPOSAL_FILE_BYTES} bytes."
            ));
        }
        total = total.saturating_add(bytes);
        if total > MAX_PROPOSAL_TOTAL_BYTES {
            return Err(format!(
                "One native proposal batch is limited to {MAX_PROPOSAL_TOTAL_BYTES} bytes."
            ));
        }
        let key = file.path.to_ascii_lowercase();
        if !paths.insert(key) {
            return Err("A native proposal batch cannot repeat a path.".to_string());
        }
        writes.push((bundle_root.join(Path::new(&file.path)), file.content));
    }
    Ok((writes, total))
}

fn validate_reported_path(path: &str) -> Result<(), String> {
    if path.is_empty()
        || path.chars().count() > MAX_STAGED_PATH_CHARS
        || path.contains('\\')
        || Path::new(path).is_absolute()
        || !path.ends_with(".md")
        || path.split('/').any(|part| {
            part.is_empty() || matches!(part, "." | "..") || part.chars().any(char::is_control)
        })
    {
        return Err(
            "Choose a bundle-relative forward-slash Markdown path returned by staged inventory or intended for this proposal."
                .to_string(),
        );
    }
    Ok(())
}

fn stage_summary(
    stages: &SessionStages,
    session_id: &str,
) -> Result<AgentStagedChangesInfo, String> {
    stages
        .summary(session_id)
        .ok_or_else(|| "The Studio Agent session is not active.".to_string())
}

fn bounded_diff(diff: AgentStagedFileDiff) -> DiffOutput {
    let mut remaining = MAX_DIFF_OUTPUT_CHARS;
    let mut output_truncated = diff.truncated;
    let hunks = diff
        .hunks
        .into_iter()
        .map(|hunk| {
            let header = bounded_chars(&hunk.header, remaining.min(MAX_VALIDATION_FIELD_CHARS));
            remaining = remaining.saturating_sub(header.chars().count());
            let unified = bounded_chars(&hunk.unified, remaining);
            if unified.chars().count() < hunk.unified.chars().count() {
                output_truncated = true;
            }
            remaining = remaining.saturating_sub(unified.chars().count());
            DiffHunkOutput {
                index: hunk.index,
                header,
                unified,
                selected: hunk.selected,
                reviewed: hunk.reviewed,
            }
        })
        .collect();
    DiffOutput {
        path: diff.path,
        kind: diff.kind,
        revision: diff.revision,
        hunks,
        truncated: output_truncated,
    }
}

fn bounded_validation(validation: AgentStagedValidationInfo) -> ValidationOutput {
    let issues_truncated = validation.truncated || validation.issues.len() > MAX_VALIDATION_ISSUES;
    let issues = validation
        .issues
        .into_iter()
        .take(MAX_VALIDATION_ISSUES)
        .map(|issue| ValidationIssueOutput {
            path: issue
                .path
                .map(|path| bounded_chars(&path, MAX_VALIDATION_FIELD_CHARS)),
            level: issue.level,
            message: bounded_chars(&issue.message, MAX_VALIDATION_FIELD_CHARS),
        })
        .collect();
    let preview_truncated = validation.preview.truncated
        || validation.preview.nodes.len() > MAX_VALIDATION_NODES
        || validation.preview.edges.len() > MAX_VALIDATION_EDGES;
    let nodes = validation
        .preview
        .nodes
        .into_iter()
        .take(MAX_VALIDATION_NODES)
        .map(|node| ValidationNodeOutput {
            id: bounded_chars(&node.id, MAX_VALIDATION_FIELD_CHARS),
            title: bounded_chars(&node.title, MAX_VALIDATION_FIELD_CHARS),
            concept_type: bounded_chars(&node.concept_type, MAX_VALIDATION_FIELD_CHARS),
            staged: node.staged,
            access: node.access,
        })
        .collect();
    let edges = validation
        .preview
        .edges
        .into_iter()
        .take(MAX_VALIDATION_EDGES)
        .map(|edge| ValidationEdgeOutput {
            source: bounded_chars(&edge.source, MAX_VALIDATION_FIELD_CHARS),
            target: bounded_chars(&edge.target, MAX_VALIDATION_FIELD_CHARS),
        })
        .collect();
    ValidationOutput {
        revision: validation.revision,
        errors: validation.errors,
        warnings: validation.warnings,
        issues,
        issues_truncated,
        preview: ValidationPreviewOutput {
            nodes,
            edges,
            total_nodes: validation.preview.total_nodes,
            total_edges: validation.preview.total_edges,
            truncated: preview_truncated,
        },
    }
}

fn execution(
    value: &impl Serialize,
    changes: Option<AgentStagedChangesInfo>,
    change_state: Option<&'static str>,
) -> Result<NativeStageExecution, String> {
    let output = serde_json::to_string(value)
        .map_err(|_| "Studio could not encode the staged-proposal result.".to_string())?;
    Ok(NativeStageExecution {
        output,
        changes,
        change_state,
    })
}

fn native_input<T: for<'de> Deserialize<'de>>(call: &LocalToolCall) -> Result<T, String> {
    serde_json::from_value(call.arguments.clone())
        .map_err(|_| format!("The model returned invalid arguments for {}.", call.name))
}

fn bounded_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_stage::AgentWriteGrantMode;
    use std::fs;

    fn temp_bundle(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "okf-studio-native-stage-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("create temp bundle");
        root.canonicalize().expect("canonical temp bundle")
    }

    fn call(name: &str, arguments: serde_json::Value) -> LocalToolCall {
        LocalToolCall {
            id: "tool-1".to_string(),
            name: name.to_string(),
            arguments,
        }
    }

    #[test]
    fn proposes_only_granted_relative_markdown_as_one_atomic_batch() {
        let root = temp_bundle("proposal");
        let stages = SessionStages::default();
        stages
            .register_session("session-1", &root)
            .expect("session");
        let proposal = call(
            STAGE_PROPOSE_TOOL,
            serde_json::json!({"files": [
                {"path": "index.md", "content": "---\ntype: index\n---\n# Index\n"},
                {"path": "concepts/new.md", "content": "---\ntype: concept\n---\n# New\n"}
            ]}),
        );
        let denied = execute_native_tool(&stages, "session-1", &root, &proposal)
            .expect_err("grant required");
        assert!(denied.contains("Allow edits in this thread"));
        stages
            .set_grant_for_mode(
                "session-1",
                true,
                AgentWriteGrantMode::Interactive,
                crate::agent_stage::AgentWriteGrantAuthority::InteractiveOnly,
            )
            .expect("grant");
        let result =
            execute_native_tool(&stages, "session-1", &root, &proposal).expect("stage proposal");
        assert_eq!(result.change_state, Some("staged"));
        assert_eq!(result.changes.expect("changes").files.len(), 2);
        assert!(!root.join("index.md").exists());

        let invalid = call(
            STAGE_PROPOSE_TOOL,
            serde_json::json!({"files": [
                {"path": "keep.md", "content": "keep"},
                {"path": "../escape.md", "content": "escape"}
            ]}),
        );
        assert!(execute_native_tool(&stages, "session-1", &root, &invalid).is_err());
        assert!(!stages
            .summary("session-1")
            .expect("summary")
            .files
            .iter()
            .any(|file| file.path == "keep.md"));
        fs::remove_dir_all(root).expect("remove temp bundle");
    }

    #[test]
    fn exposes_bounded_read_only_review_tools() {
        let root = temp_bundle("review");
        fs::write(root.join("index.md"), "---\ntype: index\n---\n# Before\n")
            .expect("write original");
        let stages = SessionStages::default();
        stages
            .register_session("session-1", &root)
            .expect("session");
        stages
            .set_grant_for_mode(
                "session-1",
                true,
                AgentWriteGrantMode::Interactive,
                crate::agent_stage::AgentWriteGrantAuthority::InteractiveOnly,
            )
            .expect("grant");
        execute_native_tool(
            &stages,
            "session-1",
            &root,
            &call(
                STAGE_PROPOSE_TOOL,
                serde_json::json!({"files": [{"path": "index.md", "content": "---\ntype: index\n---\n# After\n"}]}),
            ),
        )
        .expect("proposal");

        let inventory = execute_native_tool(
            &stages,
            "session-1",
            &root,
            &call(STAGE_INVENTORY_TOOL, serde_json::json!({})),
        )
        .expect("inventory");
        assert!(inventory.output.contains("index.md"));
        let diff = execute_native_tool(
            &stages,
            "session-1",
            &root,
            &call(STAGE_DIFF_TOOL, serde_json::json!({"path": "index.md"})),
        )
        .expect("diff");
        assert!(diff.output.contains("# Before"));
        assert!(diff.output.contains("# After"));
        let validation = execute_native_tool(
            &stages,
            "session-1",
            &root,
            &call(STAGE_VALIDATE_TOOL, serde_json::json!({})),
        )
        .expect("validation");
        assert!(validation.output.contains("revision"));
        assert!(validation.changes.is_none());
        fs::remove_dir_all(root).expect("remove temp bundle");
    }
}
