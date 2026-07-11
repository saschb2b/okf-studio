use okf_core::query::{self, TraversalDirection, ValidationLevel};
use okf_core::Bundle;
use rmcp::handler::server::{router::tool::ToolRouter, wrapper::Parameters};
use rmcp::{
    model::{Implementation, ProtocolVersion, ServerCapabilities, ServerInfo},
    schemars::JsonSchema,
    tool, tool_handler, tool_router, Json, ServerHandler, ServiceExt,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

const DEFAULT_SEARCH_LIMIT: usize = 12;
const MAX_SEARCH_LIMIT: usize = 50;
const DEFAULT_TRAVERSAL_LIMIT: usize = 50;
const MAX_TRAVERSAL_LIMIT: usize = 200;
const DEFAULT_TRAVERSAL_DEPTH: usize = 1;
const MAX_TRAVERSAL_DEPTH: usize = 3;
const MAX_QUERY_CHARS: usize = 512;
const MAX_CONCEPT_ID_CHARS: usize = 1024;
const DEFAULT_INVENTORY_LIMIT: usize = 50;
const MAX_INVENTORY_LIMIT: usize = 200;
const DEFAULT_VALIDATION_LIMIT: usize = 50;
const MAX_VALIDATION_LIMIT: usize = 200;
const MAX_FILTER_CHARS: usize = 1024;
const MAX_OFFSET: usize = 1_000_000;
const MAX_OUTPUT_ID_CHARS: usize = 4096;
const MAX_OUTPUT_FIELD_CHARS: usize = 512;
const MAX_OUTPUT_PROSE_CHARS: usize = 2048;
const DEFAULT_READ_LIMIT: usize = 200;
const MAX_READ_LIMIT: usize = 1000;
const MAX_READ_CONTENT_CHARS: usize = 65_536;
const DEFAULT_SOURCE_LIMIT: usize = 50;
const MAX_SOURCE_LIMIT: usize = 200;

#[derive(Debug, Deserialize, JsonSchema)]
struct InventoryInput {
    /// Optional case-insensitive concept ID prefix, such as tables/ or product/.
    prefix: Option<String>,
    /// Optional exact concept type, matched case-insensitively.
    r#type: Option<String>,
    /// Optional exact tag, matched case-insensitively.
    tag: Option<String>,
    /// Zero-based page offset. Use nextOffset from the previous response.
    offset: Option<usize>,
    /// Maximum concept summaries. Defaults to 50 and cannot exceed 200.
    limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct InventoryOutput {
    name: String,
    okf_version: Option<String>,
    odsf_version: Option<String>,
    confidence: String,
    concept_count: usize,
    matching_count: usize,
    error_count: usize,
    warning_count: usize,
    types: Vec<ValueCount>,
    tags: Vec<ValueCount>,
    concepts: Vec<InventoryItem>,
    next_offset: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
struct ValueCount {
    value: String,
    count: usize,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct InventoryItem {
    id: String,
    title: String,
    #[serde(rename = "type")]
    concept_type: String,
    description: String,
    tags: Vec<String>,
    outgoing_links: usize,
    incoming_links: usize,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ReadInput {
    /// Bundle-relative concept ID without the .md suffix.
    concept_id: String,
    /// One-based first body line. Defaults to 1.
    line: Option<usize>,
    /// Maximum body lines. Defaults to 200 and cannot exceed 1000.
    limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ReadOutput {
    id: String,
    title: String,
    #[serde(rename = "type")]
    concept_type: String,
    description: String,
    tags: Vec<String>,
    timestamp: Option<String>,
    resource: Option<String>,
    total_lines: usize,
    start_line: usize,
    content: String,
    content_truncated: bool,
    next_line: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SearchInput {
    /// Case-insensitive text to find in concept titles, paths, types, tags, descriptions, or bodies.
    query: String,
    /// Maximum result count. Defaults to 12 and cannot exceed 50.
    limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SearchOutput {
    matches: Vec<SearchItem>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SearchItem {
    id: String,
    title: String,
    #[serde(rename = "type")]
    concept_type: String,
    description: String,
    snippet: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SourcesInput {
    /// Optional exact bundle-relative concept ID without the .md suffix.
    concept_id: Option<String>,
    /// Zero-based page offset. Use nextOffset from the previous response.
    offset: Option<usize>,
    /// Maximum source references. Defaults to 50 and cannot exceed 200.
    limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SourcesOutput {
    matching_count: usize,
    sources: Vec<SourceItem>,
    next_offset: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SourceItem {
    uri: String,
    kinds: Vec<String>,
    concept_ids: Vec<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct TraverseInput {
    /// Bundle-relative concept ID without the .md suffix.
    concept_id: String,
    /// Link direction: outgoing, incoming, or both. Defaults to both.
    direction: Option<String>,
    /// Breadth-first hop count. Defaults to 1 and cannot exceed 3.
    depth: Option<usize>,
    /// Maximum concept count. Defaults to 50 and cannot exceed 200.
    limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct TraverseOutput {
    concepts: Vec<TraversalItem>,
    edges: Vec<TraversalEdge>,
    truncated: bool,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct TraversalItem {
    id: String,
    title: String,
    #[serde(rename = "type")]
    concept_type: String,
    depth: usize,
}

#[derive(Debug, Serialize, JsonSchema)]
struct TraversalEdge {
    source: String,
    target: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ValidateInput {
    /// Severity filter: all, error, or warning. Defaults to all.
    level: Option<String>,
    /// Zero-based page offset. Use nextOffset from the previous response.
    offset: Option<usize>,
    /// Maximum issues. Defaults to 50 and cannot exceed 200.
    limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ValidateOutput {
    error_count: usize,
    warning_count: usize,
    matching_count: usize,
    issues: Vec<ValidationItem>,
    next_offset: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct ValidationItem {
    concept_id: Option<String>,
    level: String,
    message: String,
}

#[derive(Clone, Debug)]
struct OkfMcpServer {
    bundle: Arc<Bundle>,
    #[allow(dead_code)] // Read by the rmcp-generated ServerHandler implementation.
    tool_router: ToolRouter<Self>,
}

impl OkfMcpServer {
    fn new(bundle: Bundle) -> Self {
        Self {
            bundle: Arc::new(bundle),
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl OkfMcpServer {
    #[tool(
        description = "Inspect the active OKF bundle before reading files. Returns bundle metadata, validation counts, type and tag counts, and paged concept summaries."
    )]
    fn okf_inventory(
        &self,
        Parameters(input): Parameters<InventoryInput>,
    ) -> Result<Json<InventoryOutput>, String> {
        validate_optional_filter("prefix", input.prefix.as_deref())?;
        validate_optional_filter("type", input.r#type.as_deref())?;
        validate_optional_filter("tag", input.tag.as_deref())?;
        let offset = bounded_offset(input.offset)?;
        let limit = input
            .limit
            .unwrap_or(DEFAULT_INVENTORY_LIMIT)
            .clamp(1, MAX_INVENTORY_LIMIT);
        let result = query::inventory(
            &self.bundle,
            input.prefix.as_deref(),
            input.r#type.as_deref(),
            input.tag.as_deref(),
            offset,
            limit,
        );
        Ok(Json(InventoryOutput {
            name: bounded_output(&result.name, MAX_OUTPUT_FIELD_CHARS),
            okf_version: result
                .okf_version
                .map(|value| bounded_output(&value, MAX_OUTPUT_FIELD_CHARS)),
            odsf_version: result
                .odsf_version
                .map(|value| bounded_output(&value, MAX_OUTPUT_FIELD_CHARS)),
            confidence: result.confidence,
            concept_count: result.concept_count,
            matching_count: result.matching_count,
            error_count: result.error_count,
            warning_count: result.warning_count,
            types: result
                .types
                .into_iter()
                .map(|item| ValueCount {
                    value: bounded_output(&item.value, MAX_OUTPUT_FIELD_CHARS),
                    count: item.count,
                })
                .collect(),
            tags: result
                .tags
                .into_iter()
                .map(|item| ValueCount {
                    value: bounded_output(&item.value, MAX_OUTPUT_FIELD_CHARS),
                    count: item.count,
                })
                .collect(),
            concepts: result
                .concepts
                .into_iter()
                .map(|item| InventoryItem {
                    id: bounded_output(&item.id, MAX_OUTPUT_ID_CHARS),
                    title: bounded_output(&item.title, MAX_OUTPUT_FIELD_CHARS),
                    concept_type: bounded_output(&item.concept_type, MAX_OUTPUT_FIELD_CHARS),
                    description: bounded_output(&item.description, MAX_OUTPUT_PROSE_CHARS),
                    tags: item
                        .tags
                        .into_iter()
                        .map(|tag| bounded_output(&tag, MAX_OUTPUT_FIELD_CHARS))
                        .collect(),
                    outgoing_links: item.outgoing_links,
                    incoming_links: item.incoming_links,
                })
                .collect(),
            next_offset: result.next_offset,
        }))
    }

    #[tool(
        description = "Read one parsed OKF concept by ID. Returns core metadata and a bounded, line-paged Markdown body without exposing an arbitrary file path."
    )]
    fn okf_read(
        &self,
        Parameters(input): Parameters<ReadInput>,
    ) -> Result<Json<ReadOutput>, String> {
        let concept_id = bounded_concept_id(&input.concept_id)?;
        let line = input.line.unwrap_or(1);
        if line == 0 || line > MAX_OFFSET {
            return Err(format!("line must be between 1 and {MAX_OFFSET}"));
        }
        let limit = input
            .limit
            .unwrap_or(DEFAULT_READ_LIMIT)
            .clamp(1, MAX_READ_LIMIT);
        let result = query::read_concept(&self.bundle, concept_id, line, limit)
            .ok_or_else(|| format!("concept not found: {concept_id}"))?;
        let content_truncated = result.content.len() > MAX_READ_CONTENT_CHARS;
        Ok(Json(ReadOutput {
            id: bounded_output(&result.id, MAX_OUTPUT_ID_CHARS),
            title: bounded_output(&result.title, MAX_OUTPUT_FIELD_CHARS),
            concept_type: bounded_output(&result.concept_type, MAX_OUTPUT_FIELD_CHARS),
            description: bounded_output(&result.description, MAX_OUTPUT_PROSE_CHARS),
            tags: result
                .tags
                .into_iter()
                .map(|tag| bounded_output(&tag, MAX_OUTPUT_FIELD_CHARS))
                .collect(),
            timestamp: result
                .timestamp
                .map(|value| bounded_output(&value, MAX_OUTPUT_FIELD_CHARS)),
            resource: result
                .resource
                .map(|value| bounded_output(&value, MAX_OUTPUT_ID_CHARS)),
            total_lines: result.total_lines,
            start_line: result.start_line,
            content: bounded_utf8_bytes(&result.content, MAX_READ_CONTENT_CHARS),
            content_truncated,
            next_line: result.next_line,
        }))
    }

    #[tool(
        description = "Search the active OKF bundle without reading every file. Returns bounded concept metadata and matching Markdown snippets in relevance order."
    )]
    fn okf_search(
        &self,
        Parameters(input): Parameters<SearchInput>,
    ) -> Result<Json<SearchOutput>, String> {
        let needle = input.query.trim();
        if needle.is_empty() {
            return Err("query must not be empty".to_string());
        }
        if needle.chars().count() > MAX_QUERY_CHARS {
            return Err(format!("query cannot exceed {MAX_QUERY_CHARS} characters"));
        }
        let limit = input
            .limit
            .unwrap_or(DEFAULT_SEARCH_LIMIT)
            .clamp(1, MAX_SEARCH_LIMIT);
        let matches = query::search(&self.bundle, needle, limit)
            .into_iter()
            .map(|item| SearchItem {
                id: bounded_output(&item.id, MAX_OUTPUT_ID_CHARS),
                title: bounded_output(&item.title, MAX_OUTPUT_FIELD_CHARS),
                concept_type: bounded_output(&item.concept_type, MAX_OUTPUT_FIELD_CHARS),
                description: bounded_output(&item.description, MAX_OUTPUT_PROSE_CHARS),
                snippet: item.snippet,
            })
            .collect();
        Ok(Json(SearchOutput { matches }))
    }

    #[tool(
        description = "List canonical resource URIs and external citations authored in the active OKF bundle. Deduplicates references and reports their referring concept IDs without fetching them."
    )]
    fn okf_sources(
        &self,
        Parameters(input): Parameters<SourcesInput>,
    ) -> Result<Json<SourcesOutput>, String> {
        let concept_id = input
            .concept_id
            .as_deref()
            .map(bounded_concept_id)
            .transpose()?;
        if concept_id.is_some_and(|id| !self.bundle.concepts.iter().any(|item| item.id == id)) {
            return Err(format!(
                "concept not found: {}",
                concept_id.unwrap_or_default()
            ));
        }
        let offset = bounded_offset(input.offset)?;
        let limit = input
            .limit
            .unwrap_or(DEFAULT_SOURCE_LIMIT)
            .clamp(1, MAX_SOURCE_LIMIT);
        let result = query::sources(&self.bundle, concept_id, offset, limit);
        Ok(Json(SourcesOutput {
            matching_count: result.matching_count,
            sources: result
                .sources
                .into_iter()
                .map(|item| SourceItem {
                    uri: bounded_output(&item.uri, MAX_OUTPUT_ID_CHARS),
                    kinds: item.kinds,
                    concept_ids: item
                        .concept_ids
                        .into_iter()
                        .map(|id| bounded_output(&id, MAX_OUTPUT_ID_CHARS))
                        .collect(),
                })
                .collect(),
            next_offset: result.next_offset,
        }))
    }

    #[tool(
        description = "Traverse resolved links and backlinks from one concept in the active OKF bundle. Uses a bounded, cycle-safe breadth-first traversal."
    )]
    fn okf_traverse(
        &self,
        Parameters(input): Parameters<TraverseInput>,
    ) -> Result<Json<TraverseOutput>, String> {
        let concept_id = input.concept_id.trim();
        if concept_id.is_empty() || concept_id.chars().count() > MAX_CONCEPT_ID_CHARS {
            return Err("concept_id must be a bounded non-empty OKF concept ID".to_string());
        }
        let direction = match input.direction.as_deref().unwrap_or("both") {
            "outgoing" => TraversalDirection::Outgoing,
            "incoming" => TraversalDirection::Incoming,
            "both" => TraversalDirection::Both,
            _ => return Err("direction must be outgoing, incoming, or both".to_string()),
        };
        let depth = input
            .depth
            .unwrap_or(DEFAULT_TRAVERSAL_DEPTH)
            .clamp(1, MAX_TRAVERSAL_DEPTH);
        let limit = input
            .limit
            .unwrap_or(DEFAULT_TRAVERSAL_LIMIT)
            .clamp(1, MAX_TRAVERSAL_LIMIT);
        let result = query::traverse(&self.bundle, concept_id, direction, depth, limit)
            .ok_or_else(|| format!("concept not found: {concept_id}"))?;
        Ok(Json(TraverseOutput {
            concepts: result
                .concepts
                .into_iter()
                .map(|item| TraversalItem {
                    id: bounded_output(&item.id, MAX_OUTPUT_ID_CHARS),
                    title: bounded_output(&item.title, MAX_OUTPUT_FIELD_CHARS),
                    concept_type: bounded_output(&item.concept_type, MAX_OUTPUT_FIELD_CHARS),
                    depth: item.depth,
                })
                .collect(),
            edges: result
                .edges
                .into_iter()
                .map(|edge| TraversalEdge {
                    source: bounded_output(&edge.source, MAX_OUTPUT_ID_CHARS),
                    target: bounded_output(&edge.target, MAX_OUTPUT_ID_CHARS),
                })
                .collect(),
            truncated: result.truncated,
        }))
    }

    #[tool(
        description = "Inspect conformance errors and warnings already computed for the active OKF bundle. Returns severity totals and paged issue details."
    )]
    fn okf_validate(
        &self,
        Parameters(input): Parameters<ValidateInput>,
    ) -> Result<Json<ValidateOutput>, String> {
        let level = match input.level.as_deref().unwrap_or("all") {
            "all" => ValidationLevel::All,
            "error" => ValidationLevel::Error,
            "warning" => ValidationLevel::Warning,
            _ => return Err("level must be all, error, or warning".to_string()),
        };
        let offset = bounded_offset(input.offset)?;
        let limit = input
            .limit
            .unwrap_or(DEFAULT_VALIDATION_LIMIT)
            .clamp(1, MAX_VALIDATION_LIMIT);
        let result = query::validation_issues(&self.bundle, level, offset, limit);
        Ok(Json(ValidateOutput {
            error_count: result.error_count,
            warning_count: result.warning_count,
            matching_count: result.matching_count,
            issues: result
                .issues
                .into_iter()
                .map(|issue| ValidationItem {
                    concept_id: issue
                        .concept_id
                        .map(|id| bounded_output(&id, MAX_OUTPUT_ID_CHARS)),
                    level: issue.level,
                    message: bounded_output(&issue.message, MAX_OUTPUT_PROSE_CHARS),
                })
                .collect(),
            next_offset: result.next_offset,
        }))
    }
}

fn validate_optional_filter(name: &str, value: Option<&str>) -> Result<(), String> {
    if value.is_some_and(|item| item.chars().count() > MAX_FILTER_CHARS) {
        return Err(format!(
            "{name} cannot exceed {MAX_FILTER_CHARS} characters"
        ));
    }
    Ok(())
}

fn bounded_concept_id(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > MAX_CONCEPT_ID_CHARS {
        return Err("concept_id must be a bounded non-empty OKF concept ID".to_string());
    }
    Ok(value)
}

fn bounded_offset(offset: Option<usize>) -> Result<usize, String> {
    let offset = offset.unwrap_or_default();
    if offset > MAX_OFFSET {
        return Err(format!("offset cannot exceed {MAX_OFFSET}"));
    }
    Ok(offset)
}

fn bounded_output(value: &str, max_chars: usize) -> String {
    let mut output = value.chars().take(max_chars).collect::<String>();
    if value.chars().count() > max_chars {
        output.push('…');
    }
    output
}

fn bounded_utf8_bytes(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_string()
}

#[tool_handler]
impl ServerHandler for OkfMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("okf-studio", env!("CARGO_PKG_VERSION")))
            .with_protocol_version(ProtocolVersion::V_2024_11_05)
            .with_instructions(
                "Read-only tools to inspect, read, search, trace sources, traverse, and validate the active Open Knowledge Format bundle.",
            )
    }
}

pub fn run(bundle_root: PathBuf) -> Result<(), String> {
    let bundle_root = bundle_root
        .canonicalize()
        .map_err(|_| "OKF Studio MCP bundle root is unavailable.".to_string())?;
    if !bundle_root.is_dir() {
        return Err("OKF Studio MCP bundle root is not a directory.".to_string());
    }
    let bundle = okf_core::read_bundle(&bundle_root);
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("OKF Studio MCP runtime failed: {error}"))?;
    runtime.block_on(async move {
        let service = OkfMcpServer::new(bundle)
            .serve(rmcp::transport::stdio())
            .await
            .map_err(|error| format!("OKF Studio MCP startup failed: {error}"))?;
        service
            .waiting()
            .await
            .map_err(|error| format!("OKF Studio MCP stopped with an error: {error}"))?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::CallToolRequestParams;

    #[test]
    fn tools_inspect_read_search_sources_traverse_and_validate_the_docs_bundle() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../docs");
        let server = OkfMcpServer::new(okf_core::read_bundle(&root));
        let Json(inventory) = server
            .okf_inventory(Parameters(InventoryInput {
                prefix: Some("features/".to_string()),
                r#type: Some("Feature".to_string()),
                tag: None,
                offset: None,
                limit: Some(5),
            }))
            .unwrap();
        assert!(inventory.concept_count >= inventory.matching_count);
        assert!(inventory
            .concepts
            .iter()
            .all(|item| item.id.starts_with("features/")));

        let Json(read) = server
            .okf_read(Parameters(ReadInput {
                concept_id: "features/agent-panel".to_string(),
                line: Some(1),
                limit: Some(5),
            }))
            .unwrap();
        assert_eq!(read.id, "features/agent-panel");
        assert!(!read.content.is_empty());
        assert!(read.next_line.is_some());

        let Json(search) = server
            .okf_search(Parameters(SearchInput {
                query: "agent panel".to_string(),
                limit: Some(5),
            }))
            .unwrap();
        assert!(search
            .matches
            .iter()
            .any(|item| item.id == "features/agent-panel"));

        let Json(sources) = server
            .okf_sources(Parameters(SourcesInput {
                concept_id: Some("features/agent-panel".to_string()),
                offset: None,
                limit: Some(10),
            }))
            .unwrap();
        assert_eq!(sources.matching_count, sources.sources.len());
        assert!(sources
            .sources
            .iter()
            .all(|source| source.concept_ids == ["features/agent-panel"]));

        let Json(traversal) = server
            .okf_traverse(Parameters(TraverseInput {
                concept_id: "features/agent-panel".to_string(),
                direction: Some("both".to_string()),
                depth: Some(1),
                limit: Some(20),
            }))
            .unwrap();
        assert_eq!(traversal.concepts[0].id, "features/agent-panel");
        assert!(!traversal.edges.is_empty());

        let Json(validation) = server
            .okf_validate(Parameters(ValidateInput {
                level: Some("all".to_string()),
                offset: None,
                limit: Some(10),
            }))
            .unwrap();
        assert_eq!(validation.error_count, 0);
        assert_eq!(
            validation.matching_count,
            validation.error_count + validation.warning_count
        );
    }

    #[test]
    fn tools_reject_invalid_inputs() {
        let server = OkfMcpServer::new(Bundle {
            root: String::new(),
            name: "Empty".to_string(),
            okf_version: None,
            odsf_version: None,
            concepts: Vec::new(),
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: okf_core::Confidence::Candidate,
        });
        assert!(server
            .okf_search(Parameters(SearchInput {
                query: " ".to_string(),
                limit: None
            }))
            .is_err());
        assert!(server
            .okf_read(Parameters(ReadInput {
                concept_id: "missing".to_string(),
                line: Some(0),
                limit: None,
            }))
            .is_err());
        assert!(server
            .okf_sources(Parameters(SourcesInput {
                concept_id: Some("missing".to_string()),
                offset: None,
                limit: None,
            }))
            .is_err());
        assert!(server
            .okf_traverse(Parameters(TraverseInput {
                concept_id: "missing".to_string(),
                direction: Some("sideways".to_string()),
                depth: None,
                limit: None,
            }))
            .is_err());
        assert!(server
            .okf_inventory(Parameters(InventoryInput {
                prefix: Some("x".repeat(MAX_FILTER_CHARS + 1)),
                r#type: None,
                tag: None,
                offset: None,
                limit: None,
            }))
            .is_err());
        assert!(server
            .okf_validate(Parameters(ValidateInput {
                level: Some("fatal".to_string()),
                offset: None,
                limit: None,
            }))
            .is_err());
    }

    #[test]
    fn output_strings_are_bounded_on_character_boundaries() {
        let output = bounded_output(
            &"Ã¶".repeat(MAX_OUTPUT_FIELD_CHARS + 1),
            MAX_OUTPUT_FIELD_CHARS,
        );
        assert_eq!(output.chars().count(), MAX_OUTPUT_FIELD_CHARS + 1);
        assert!(output.ends_with('…'));
        let body = bounded_utf8_bytes(&"ö".repeat(MAX_READ_CONTENT_CHARS), MAX_READ_CONTENT_CHARS);
        assert_eq!(body.len(), MAX_READ_CONTENT_CHARS);
        assert!(body.is_char_boundary(body.len()));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn serves_tools_over_an_mcp_transport() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../docs");
        let (server_transport, client_transport) = tokio::io::duplex(16 * 1024);
        let server = OkfMcpServer::new(okf_core::read_bundle(&root));
        let server_task = tokio::spawn(async move {
            let service = server.serve(server_transport).await.expect("serve MCP");
            service.waiting().await.expect("MCP closes cleanly");
        });
        let client = ().serve(client_transport).await.expect("connect MCP client");
        let tools = client
            .list_tools(Default::default())
            .await
            .expect("list tools");
        assert_eq!(
            tools
                .tools
                .iter()
                .map(|tool| tool.name.as_ref())
                .collect::<Vec<_>>(),
            [
                "okf_inventory",
                "okf_read",
                "okf_search",
                "okf_sources",
                "okf_traverse",
                "okf_validate"
            ]
        );
        let result = client
            .call_tool(
                CallToolRequestParams::new("okf_search").with_arguments(
                    serde_json::json!({ "query": "agent panel", "limit": 3 })
                        .as_object()
                        .expect("object")
                        .clone(),
                ),
            )
            .await
            .expect("call search tool");
        let structured = result.structured_content.expect("structured search output");
        assert!(structured["matches"]
            .as_array()
            .is_some_and(|matches| !matches.is_empty()));
        drop(client);
        server_task.await.expect("join MCP server");
    }
}
