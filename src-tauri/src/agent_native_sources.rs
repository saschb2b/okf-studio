use crate::agent_local::{LocalToolCall, LocalToolDefinition};
use crate::agent_sources::AgentSourceInput;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub(crate) const SOURCE_INVENTORY_TOOL: &str = "studio_source_inventory";
pub(crate) const SOURCE_READ_TOOL: &str = "studio_source_read";
const MAX_SOURCE_ID_CHARS: usize = 32;
const MAX_READ_LINE: usize = 1_000_000;
const DEFAULT_READ_LINES: usize = 200;
const MAX_READ_LINES: usize = 1_000;
const MAX_READ_CONTENT_CHARS: usize = 65_536;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryInput {}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReadInput {
    source_id: String,
    line: Option<usize>,
    limit: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceInventory<'a> {
    source_count: usize,
    sources: Vec<SourceSummary<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceSummary<'a> {
    source_id: String,
    title: &'a str,
    origin: Option<&'a str>,
    media_type: Option<&'a str>,
    warning: Option<&'a str>,
    source_digest: Option<&'a str>,
    content_sha256: String,
    content_chars: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceRead<'a> {
    source_id: String,
    title: &'a str,
    origin: Option<&'a str>,
    media_type: Option<&'a str>,
    warning: Option<&'a str>,
    source_digest: Option<&'a str>,
    content_sha256: String,
    line: usize,
    limit: usize,
    total_lines: usize,
    truncated: bool,
    content: String,
}

pub(crate) fn native_tool_definitions(
    sources: &[AgentSourceInput],
) -> Result<Vec<LocalToolDefinition>, String> {
    if sources.is_empty() {
        return Ok(Vec::new());
    }
    if sources.iter().any(|source| source.image_data.is_some()) {
        return Err("Native local source tools do not accept images yet.".to_string());
    }
    Ok(vec![
        LocalToolDefinition {
            name: SOURCE_INVENTORY_TOOL,
            description: "List the text sources the user explicitly attached to this turn. Returns synthetic source IDs, provenance, extraction warnings, digests, and sizes without filesystem paths.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: SOURCE_READ_TOOL,
            description: "Read a bounded line range from one user-attached text source by its synthetic source_id. The source exists only for this turn and grants no filesystem or network access.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "source_id": {"type": "string", "pattern": "^source-[1-8]$", "maxLength": MAX_SOURCE_ID_CHARS},
                    "line": {"type": "integer", "minimum": 1, "maximum": MAX_READ_LINE},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_READ_LINES}
                },
                "required": ["source_id"],
                "additionalProperties": false
            }),
        },
    ])
}

pub(crate) fn is_native_source_tool(name: &str) -> bool {
    matches!(name, SOURCE_INVENTORY_TOOL | SOURCE_READ_TOOL)
}

pub(crate) fn execute_native_tool(
    sources: &[AgentSourceInput],
    call: &LocalToolCall,
) -> Result<String, String> {
    let value = match call.name.as_str() {
        SOURCE_INVENTORY_TOOL => {
            let _: InventoryInput = native_input(call)?;
            serde_json::to_value(SourceInventory {
                source_count: sources.len(),
                sources: sources
                    .iter()
                    .enumerate()
                    .map(|(index, source)| SourceSummary {
                        source_id: source_id(index),
                        title: source.title.trim(),
                        origin: source.origin.as_deref(),
                        media_type: source.media_type.as_deref(),
                        warning: source.warning.as_deref(),
                        source_digest: source.source_digest.as_deref(),
                        content_sha256: content_digest(source),
                        content_chars: source.content.chars().count(),
                    })
                    .collect(),
            })
        }
        SOURCE_READ_TOOL => {
            let input: ReadInput = native_input(call)?;
            if input.source_id.chars().count() > MAX_SOURCE_ID_CHARS {
                return Err("Choose a source_id returned by source inventory.".to_string());
            }
            let index = source_index(&input.source_id)?;
            let source = sources
                .get(index)
                .ok_or_else(|| "Choose a source_id returned by source inventory.".to_string())?;
            let line = input.line.unwrap_or(1);
            let limit = input.limit.unwrap_or(DEFAULT_READ_LINES);
            if line == 0 || line > MAX_READ_LINE || limit == 0 || limit > MAX_READ_LINES {
                return Err("Choose a bounded source line and limit.".to_string());
            }
            let lines = source.content.lines().collect::<Vec<_>>();
            let start = line.saturating_sub(1).min(lines.len());
            let end = start.saturating_add(limit).min(lines.len());
            let selected = lines[start..end].join("\n");
            let content_was_bounded = selected.chars().count() > MAX_READ_CONTENT_CHARS;
            let content = bounded_chars(&selected, MAX_READ_CONTENT_CHARS);
            serde_json::to_value(SourceRead {
                source_id: input.source_id,
                title: source.title.trim(),
                origin: source.origin.as_deref(),
                media_type: source.media_type.as_deref(),
                warning: source.warning.as_deref(),
                source_digest: source.source_digest.as_deref(),
                content_sha256: content_digest(source),
                line,
                limit,
                total_lines: lines.len(),
                truncated: end < lines.len() || content_was_bounded,
                content,
            })
        }
        _ => return Err("The model requested a tool that Studio did not offer.".to_string()),
    }
    .map_err(|_| "Studio could not encode the attached-source result.".to_string())?;
    serde_json::to_string(&value)
        .map_err(|_| "Studio could not encode the attached-source result.".to_string())
}

pub(crate) fn native_tool_display(call: &LocalToolCall) -> (&'static str, &'static str) {
    match call.name.as_str() {
        SOURCE_INVENTORY_TOOL => ("Inspect attached sources", "search"),
        SOURCE_READ_TOOL => ("Read attached source", "read"),
        _ => ("Use attached source", "other"),
    }
}

fn native_input<T: for<'de> Deserialize<'de>>(call: &LocalToolCall) -> Result<T, String> {
    serde_json::from_value(call.arguments.clone())
        .map_err(|_| format!("The model returned invalid arguments for {}.", call.name))
}

fn source_id(index: usize) -> String {
    format!("source-{}", index + 1)
}

fn source_index(source_id: &str) -> Result<usize, String> {
    let value = source_id
        .strip_prefix("source-")
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| (1..=8).contains(value))
        .ok_or_else(|| "Choose a source_id returned by source inventory.".to_string())?;
    Ok(value - 1)
}

fn content_digest(source: &AgentSourceInput) -> String {
    format!("{:x}", Sha256::digest(source.content.as_bytes()))
}

fn bounded_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source() -> AgentSourceInput {
        AgentSourceInput {
            title: "research.pdf".to_string(),
            content: "Page one\n\nFinding with provenance".to_string(),
            origin: Some("research.pdf".to_string()),
            media_type: Some("application/pdf".to_string()),
            source_digest: Some("a".repeat(64)),
            warning: Some("One page had no text.".to_string()),
            image_data: None,
        }
    }

    #[test]
    fn exposes_only_attached_text_through_synthetic_ids() {
        let sources = vec![source()];
        let tools = native_tool_definitions(&sources).expect("source tools");
        assert_eq!(
            tools.iter().map(|tool| tool.name).collect::<Vec<_>>(),
            [SOURCE_INVENTORY_TOOL, SOURCE_READ_TOOL]
        );
        let inventory = execute_native_tool(
            &sources,
            &LocalToolCall {
                id: "tool-1".to_string(),
                name: SOURCE_INVENTORY_TOOL.to_string(),
                arguments: serde_json::json!({}),
            },
        )
        .expect("source inventory");
        assert!(inventory.contains("source-1"));
        assert!(inventory.contains("One page had no text."));

        let read = LocalToolCall {
            id: "tool-2".to_string(),
            name: SOURCE_READ_TOOL.to_string(),
            arguments: serde_json::json!({"source_id": "source-1", "line": 2, "limit": 2}),
        };
        let output = execute_native_tool(&sources, &read).expect("source read");
        assert!(output.contains("Finding with provenance"));
        assert!(!output.contains("Page one"));
        assert_eq!(native_tool_display(&read), ("Read attached source", "read"));

        let mut invalid = read;
        invalid.arguments = serde_json::json!({"source_id": "source-1", "path": "../secret"});
        assert!(execute_native_tool(&sources, &invalid).is_err());
    }

    #[test]
    fn withholds_source_tools_without_text_attachments() {
        assert!(native_tool_definitions(&[]).expect("no source tools").is_empty());
        let mut image = source();
        image.content.clear();
        image.image_data = Some("encoded".to_string());
        assert!(native_tool_definitions(&[image]).is_err());
    }
}
