use okf_core::health::{
    self, HealthBasis, HealthCategory, HealthFinding, HealthRepairability, HealthReport,
    HealthSeverity,
};
use okf_core::query::{self, TraversalDirection, ValidationLevel};
use okf_core::Bundle;
use rmcp::handler::server::{router::tool::ToolRouter, wrapper::Parameters};
use rmcp::{
    model::{Implementation, ProtocolVersion, ServerCapabilities, ServerInfo},
    schemars::JsonSchema,
    tool, tool_handler, tool_router, Json, ServerHandler, ServiceExt,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::agent_capabilities::{self, CapabilityRiskClass};
use crate::agent_local::{LocalToolCall, LocalToolDefinition};

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
const MAX_NATIVE_OUTPUT_BYTES: usize = 96 * 1024;
const DEFAULT_HEALTH_LIMIT: usize = 50;
const MAX_HEALTH_LIMIT: usize = 200;
const MAX_HEALTH_ID_CHARS: usize = 128;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
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

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct HealthSummaryInput {
    /// Optional category filter. Health categories are guidance except conformance.
    category: Option<String>,
    /// Optional evidence basis: fact or heuristic.
    basis: Option<String>,
    /// Optional severity: error, warning, or advisory.
    severity: Option<String>,
    /// Zero-based page offset. Use nextOffset from the previous response.
    offset: Option<usize>,
    /// Maximum finding summaries. Defaults to 50 and cannot exceed 200.
    limit: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct HealthFindingInput {
    /// Stable finding ID returned by okf_health_summary.
    finding_id: String,
    /// Exact bundle fingerprint returned by okf_health_summary.
    bundle_fingerprint: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct HealthAffectedInput {
    /// Stable finding ID returned by okf_health_summary.
    finding_id: String,
    /// Exact bundle fingerprint returned by okf_health_summary.
    bundle_fingerprint: String,
    /// Zero-based affected-concept offset. Use nextOffset from the previous response.
    offset: Option<usize>,
    /// Maximum affected concepts. Defaults to 50 and cannot exceed 200.
    limit: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct HealthSummaryOutput {
    schema_version: u32,
    bundle_fingerprint: String,
    analyzed_concepts: usize,
    analyzed_links: usize,
    errors: usize,
    warnings: usize,
    advisories: usize,
    facts: usize,
    heuristics: usize,
    categories: Vec<ValueCount>,
    matching_count: usize,
    findings: Vec<HealthFindingPreview>,
    next_offset: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct HealthFindingPreview {
    id: String,
    rule_id: String,
    rule_version: String,
    category: String,
    severity: String,
    basis: String,
    summary: String,
    repairability: String,
    affected_concept_count: usize,
    suppression_fingerprint: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct HealthFindingOutput {
    bundle_fingerprint: String,
    finding: HealthFindingDetail,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct HealthFindingDetail {
    id: String,
    rule_id: String,
    rule_version: String,
    category: String,
    severity: String,
    basis: String,
    summary: String,
    why: String,
    evidence: Vec<HealthEvidenceOutput>,
    affected_concept_ids: Vec<String>,
    affected_concept_count: usize,
    affected_concept_ids_truncated: bool,
    repairability: String,
    suppression_fingerprint: String,
}

#[derive(Debug, Serialize, JsonSchema)]
struct HealthEvidenceOutput {
    kind: String,
    label: String,
    value: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct HealthAffectedOutput {
    bundle_fingerprint: String,
    finding_id: String,
    affected_concept_count: usize,
    concepts: Vec<InventoryItem>,
    next_offset: Option<usize>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct HealthRepairOutput {
    bundle_fingerprint: String,
    finding_id: String,
    repairability: String,
    repair: Option<HealthRepairDetail>,
}

#[derive(Debug, Serialize, JsonSchema)]
struct HealthRepairDetail {
    action: String,
    target: String,
    description: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct CapabilityCatalogInput {}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CapabilityCatalogOutput {
    manifest_sha256: String,
    capabilities: Vec<CapabilitySummary>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CapabilitySummary {
    id: String,
    version: String,
    description: String,
    risk_class: String,
    required_tools: Vec<String>,
    artifact_kinds: Vec<String>,
    resource_ids: Vec<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CapabilityResourceInput {
    /// Capability ID returned by okf_capability_catalog.
    capability_id: String,
    /// Resource ID declared for that capability.
    resource_id: String,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CapabilityResourceOutput {
    capability_id: String,
    capability_version: String,
    resource_id: String,
    label: String,
    uri: String,
    media_type: String,
    sha256: String,
    contents: String,
}

#[derive(Clone, Debug)]
struct OkfMcpServer {
    bundle: Arc<Bundle>,
    bundle_root: Option<Arc<PathBuf>>,
    #[allow(dead_code)] // Read by the rmcp-generated ServerHandler implementation.
    tool_router: ToolRouter<Self>,
}

impl OkfMcpServer {
    #[cfg(test)]
    fn new(bundle: Bundle) -> Self {
        Self {
            bundle: Arc::new(bundle),
            bundle_root: None,
            tool_router: Self::tool_router(),
        }
    }

    fn new_live(bundle_root: PathBuf) -> Self {
        let bundle = okf_core::read_bundle(&bundle_root);
        Self {
            bundle: Arc::new(bundle),
            bundle_root: Some(Arc::new(bundle_root)),
            tool_router: Self::tool_router(),
        }
    }

    fn health_snapshot(
        &self,
        expected_fingerprint: Option<&str>,
    ) -> Result<(Bundle, HealthReport), String> {
        let bundle = self.bundle_root.as_deref().map_or_else(
            || (*self.bundle).clone(),
            |root| okf_core::read_bundle(root),
        );
        let report = health::analyze(&bundle).map_err(|limit| {
            format!(
                "Knowledge-health analysis is limited to {} {}; this bundle has {}.",
                limit.maximum, limit.dimension, limit.actual
            )
        })?;
        if expected_fingerprint.is_some_and(|expected| expected != report.bundle_fingerprint) {
            return Err(
                "The bundle changed after this health summary. Run okf_health_summary again."
                    .to_string(),
            );
        }
        if let Some(root) = self.bundle_root.as_deref() {
            let current = okf_core::read_bundle(root);
            if health::bundle_fingerprint(&current) != report.bundle_fingerprint {
                return Err(
                    "The bundle changed during health analysis. Run okf_health_summary again."
                        .to_string(),
                );
            }
        }
        Ok((bundle, report))
    }

    fn health_report(&self, expected_fingerprint: Option<&str>) -> Result<HealthReport, String> {
        self.health_snapshot(expected_fingerprint)
            .map(|(_, report)| report)
    }
}

#[tool_router]
impl OkfMcpServer {
    #[tool(
        description = "List the active versioned OKF capability catalog for generic chat. Select the narrowest matching capability, then load only its required resource with okf_capability_resource."
    )]
    fn okf_capability_catalog(
        &self,
        Parameters(_input): Parameters<CapabilityCatalogInput>,
    ) -> Result<Json<CapabilityCatalogOutput>, String> {
        let capabilities = agent_capabilities::catalog()
            .capabilities
            .iter()
            .map(|capability| CapabilitySummary {
                id: capability.id.clone(),
                version: capability.version.clone(),
                description: capability.description.clone(),
                risk_class: capability_risk_class_name(capability.risk_class).to_string(),
                required_tools: capability.required_tools.clone(),
                artifact_kinds: capability.artifact_kinds.clone(),
                resource_ids: capability
                    .resources
                    .iter()
                    .map(|resource| resource.id.clone())
                    .collect(),
            })
            .collect();
        Ok(Json(CapabilityCatalogOutput {
            manifest_sha256: agent_capabilities::manifest_sha256().to_string(),
            capabilities,
        }))
    }

    #[tool(
        description = "Load one declared, versioned OKF capability resource after selecting it from okf_capability_catalog. The resource is Studio guidance, not evidence about the active bundle, and grants no additional access."
    )]
    fn okf_capability_resource(
        &self,
        Parameters(input): Parameters<CapabilityResourceInput>,
    ) -> Result<Json<CapabilityResourceOutput>, String> {
        let resource = agent_capabilities::resource(&input.capability_id, &input.resource_id)?;
        Ok(Json(CapabilityResourceOutput {
            capability_id: resource.capability_id,
            capability_version: resource.capability_version,
            resource_id: resource.resource_id,
            label: resource.label,
            uri: resource.uri,
            media_type: resource.media_type,
            sha256: resource.sha256,
            contents: resource.contents.to_string(),
        }))
    }

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

    #[tool(
        description = "Summarize deterministic knowledge-health findings for the active OKF bundle. Conformance facts are distinct from advisory heuristics. Returns a bundle fingerprint required by detail tools."
    )]
    fn okf_health_summary(
        &self,
        Parameters(input): Parameters<HealthSummaryInput>,
    ) -> Result<Json<HealthSummaryOutput>, String> {
        let category = input
            .category
            .as_deref()
            .map(parse_health_category)
            .transpose()?;
        let basis = input.basis.as_deref().map(parse_health_basis).transpose()?;
        let severity = input
            .severity
            .as_deref()
            .map(parse_health_severity)
            .transpose()?;
        let offset = bounded_offset(input.offset)?;
        let limit = input
            .limit
            .unwrap_or(DEFAULT_HEALTH_LIMIT)
            .clamp(1, MAX_HEALTH_LIMIT);
        let report = self.health_report(None)?;
        let matching_count = report
            .findings
            .iter()
            .filter(|finding| health_matches(finding, category, basis, severity))
            .count();
        let findings = report
            .findings
            .iter()
            .filter(|finding| health_matches(finding, category, basis, severity))
            .skip(offset)
            .take(limit)
            .map(health_finding_preview)
            .collect::<Vec<_>>();
        let next_offset =
            (offset + findings.len() < matching_count).then_some(offset + findings.len());
        Ok(Json(HealthSummaryOutput {
            schema_version: report.schema_version,
            bundle_fingerprint: report.bundle_fingerprint,
            analyzed_concepts: report.analyzed_concepts,
            analyzed_links: report.analyzed_links,
            errors: report.counts.errors,
            warnings: report.counts.warnings,
            advisories: report.counts.advisories,
            facts: report.counts.facts,
            heuristics: report.counts.heuristics,
            categories: report
                .counts
                .by_category
                .into_iter()
                .map(|(category, count)| ValueCount {
                    value: health_category_name(category).to_string(),
                    count,
                })
                .collect(),
            matching_count,
            findings,
            next_offset,
        }))
    }

    #[tool(
        description = "Return the evidence, rationale, rule version, basis, and repairability for one health finding. Rejects a stale bundle fingerprint."
    )]
    fn okf_health_finding(
        &self,
        Parameters(input): Parameters<HealthFindingInput>,
    ) -> Result<Json<HealthFindingOutput>, String> {
        validate_health_finding_input(&input)?;
        let report = self.health_report(Some(&input.bundle_fingerprint))?;
        let finding = report
            .findings
            .iter()
            .find(|finding| finding.id == input.finding_id)
            .ok_or_else(|| "Health finding not found in this bundle revision.".to_string())?;
        Ok(Json(HealthFindingOutput {
            bundle_fingerprint: report.bundle_fingerprint,
            finding: health_finding_detail(finding),
        }))
    }

    #[tool(
        description = "List bounded concept metadata affected by one health finding. Requires the exact bundle fingerprint from the matching health summary."
    )]
    fn okf_health_affected(
        &self,
        Parameters(input): Parameters<HealthAffectedInput>,
    ) -> Result<Json<HealthAffectedOutput>, String> {
        validate_health_ids(&input.finding_id, &input.bundle_fingerprint)?;
        let offset = bounded_offset(input.offset)?;
        let limit = input
            .limit
            .unwrap_or(DEFAULT_HEALTH_LIMIT)
            .clamp(1, MAX_HEALTH_LIMIT);
        let (bundle, report) = self.health_snapshot(Some(&input.bundle_fingerprint))?;
        let finding = report
            .findings
            .iter()
            .find(|finding| finding.id == input.finding_id)
            .ok_or_else(|| "Health finding not found in this bundle revision.".to_string())?;
        let affected_concept_count = finding.affected_concept_ids.len();
        let concepts_by_id = bundle
            .concepts
            .iter()
            .map(|concept| (concept.id.as_str(), concept))
            .collect::<BTreeMap<_, _>>();
        let concepts = finding
            .affected_concept_ids
            .iter()
            .skip(offset)
            .take(limit)
            .filter_map(|id| concepts_by_id.get(id.as_str()).copied())
            .map(|concept| InventoryItem {
                id: bounded_output(&concept.id, MAX_OUTPUT_ID_CHARS),
                title: bounded_output(&concept.title, MAX_OUTPUT_FIELD_CHARS),
                concept_type: bounded_output(&concept.concept_type, MAX_OUTPUT_FIELD_CHARS),
                description: bounded_output(&concept.description, MAX_OUTPUT_PROSE_CHARS),
                tags: concept
                    .tags
                    .iter()
                    .map(|tag| bounded_output(tag, MAX_OUTPUT_FIELD_CHARS))
                    .collect(),
                outgoing_links: concept.links.len(),
                incoming_links: concept.cited_by.len(),
            })
            .collect::<Vec<_>>();
        let next_offset =
            (offset + concepts.len() < affected_concept_count).then_some(offset + concepts.len());
        Ok(Json(HealthAffectedOutput {
            bundle_fingerprint: report.bundle_fingerprint,
            finding_id: input.finding_id,
            affected_concept_count,
            concepts,
            next_offset,
        }))
    }

    #[tool(
        description = "Return a read-only deterministic repair recipe when a health rule has one. Guided findings never invent a mechanical repair. Requires the matching bundle fingerprint."
    )]
    fn okf_health_repair(
        &self,
        Parameters(input): Parameters<HealthFindingInput>,
    ) -> Result<Json<HealthRepairOutput>, String> {
        validate_health_finding_input(&input)?;
        let report = self.health_report(Some(&input.bundle_fingerprint))?;
        let finding = report
            .findings
            .iter()
            .find(|finding| finding.id == input.finding_id)
            .ok_or_else(|| "Health finding not found in this bundle revision.".to_string())?;
        let repair = health::suggested_repair(finding).map(|repair| HealthRepairDetail {
            action: repair.action,
            target: bounded_output(&repair.target, MAX_OUTPUT_ID_CHARS),
            description: bounded_output(&repair.description, MAX_OUTPUT_PROSE_CHARS),
        });
        Ok(Json(HealthRepairOutput {
            bundle_fingerprint: report.bundle_fingerprint,
            finding_id: input.finding_id,
            repairability: health_repairability_name(finding.repairability).to_string(),
            repair,
        }))
    }
}

fn validate_health_finding_input(input: &HealthFindingInput) -> Result<(), String> {
    validate_health_ids(&input.finding_id, &input.bundle_fingerprint)
}

fn validate_health_ids(finding_id: &str, bundle_fingerprint: &str) -> Result<(), String> {
    if finding_id.is_empty()
        || finding_id.chars().count() > MAX_HEALTH_ID_CHARS
        || bundle_fingerprint.is_empty()
        || bundle_fingerprint.chars().count() > MAX_HEALTH_ID_CHARS
    {
        return Err(
            "findingId and bundleFingerprint must be bounded non-empty health IDs.".to_string(),
        );
    }
    Ok(())
}

fn health_matches(
    finding: &HealthFinding,
    category: Option<HealthCategory>,
    basis: Option<HealthBasis>,
    severity: Option<HealthSeverity>,
) -> bool {
    category.is_none_or(|value| finding.category == value)
        && basis.is_none_or(|value| finding.basis == value)
        && severity.is_none_or(|value| finding.severity == value)
}

fn parse_health_category(value: &str) -> Result<HealthCategory, String> {
    match value {
        "conformance" => Ok(HealthCategory::Conformance),
        "graph-connectivity" => Ok(HealthCategory::GraphConnectivity),
        "navigation" => Ok(HealthCategory::Navigation),
        "provenance" => Ok(HealthCategory::Provenance),
        "freshness" => Ok(HealthCategory::Freshness),
        "duplication" => Ok(HealthCategory::Duplication),
        "coverage-hint" => Ok(HealthCategory::CoverageHint),
        "writing" => Ok(HealthCategory::Writing),
        _ => Err("category must be conformance, graph-connectivity, navigation, provenance, freshness, duplication, coverage-hint, or writing".to_string()),
    }
}

fn parse_health_basis(value: &str) -> Result<HealthBasis, String> {
    match value {
        "fact" => Ok(HealthBasis::Fact),
        "heuristic" => Ok(HealthBasis::Heuristic),
        _ => Err("basis must be fact or heuristic".to_string()),
    }
}

fn parse_health_severity(value: &str) -> Result<HealthSeverity, String> {
    match value {
        "error" => Ok(HealthSeverity::Error),
        "warning" => Ok(HealthSeverity::Warning),
        "advisory" => Ok(HealthSeverity::Advisory),
        _ => Err("severity must be error, warning, or advisory".to_string()),
    }
}

fn health_category_name(value: HealthCategory) -> &'static str {
    match value {
        HealthCategory::Conformance => "conformance",
        HealthCategory::GraphConnectivity => "graph-connectivity",
        HealthCategory::Navigation => "navigation",
        HealthCategory::Provenance => "provenance",
        HealthCategory::Freshness => "freshness",
        HealthCategory::Duplication => "duplication",
        HealthCategory::CoverageHint => "coverage-hint",
        HealthCategory::Writing => "writing",
    }
}

fn health_basis_name(value: HealthBasis) -> &'static str {
    match value {
        HealthBasis::Fact => "fact",
        HealthBasis::Heuristic => "heuristic",
    }
}

fn health_severity_name(value: HealthSeverity) -> &'static str {
    match value {
        HealthSeverity::Error => "error",
        HealthSeverity::Warning => "warning",
        HealthSeverity::Advisory => "advisory",
    }
}

fn health_repairability_name(value: HealthRepairability) -> &'static str {
    match value {
        HealthRepairability::Deterministic => "deterministic",
        HealthRepairability::Guided => "guided",
        HealthRepairability::NotRepairable => "not-repairable",
    }
}

fn capability_risk_class_name(value: CapabilityRiskClass) -> &'static str {
    match value {
        CapabilityRiskClass::Read => "read",
        CapabilityRiskClass::Analyze => "analyze",
        CapabilityRiskClass::Fetch => "fetch",
        CapabilityRiskClass::Stage => "stage",
    }
}

fn health_finding_preview(finding: &HealthFinding) -> HealthFindingPreview {
    HealthFindingPreview {
        id: finding.id.clone(),
        rule_id: finding.rule_id.clone(),
        rule_version: finding.rule_version.clone(),
        category: health_category_name(finding.category).to_string(),
        severity: health_severity_name(finding.severity).to_string(),
        basis: health_basis_name(finding.basis).to_string(),
        summary: bounded_output(&finding.summary, MAX_OUTPUT_PROSE_CHARS),
        repairability: health_repairability_name(finding.repairability).to_string(),
        affected_concept_count: finding.affected_concept_ids.len(),
        suppression_fingerprint: finding.suppression_fingerprint.clone(),
    }
}

fn health_finding_detail(finding: &HealthFinding) -> HealthFindingDetail {
    HealthFindingDetail {
        id: finding.id.clone(),
        rule_id: finding.rule_id.clone(),
        rule_version: finding.rule_version.clone(),
        category: health_category_name(finding.category).to_string(),
        severity: health_severity_name(finding.severity).to_string(),
        basis: health_basis_name(finding.basis).to_string(),
        summary: bounded_output(&finding.summary, MAX_OUTPUT_PROSE_CHARS),
        why: bounded_output(&finding.why, MAX_OUTPUT_PROSE_CHARS),
        evidence: finding
            .evidence
            .iter()
            .map(|item| HealthEvidenceOutput {
                kind: bounded_output(&item.kind, MAX_OUTPUT_FIELD_CHARS),
                label: bounded_output(&item.label, MAX_OUTPUT_FIELD_CHARS),
                value: bounded_output(&item.value, MAX_OUTPUT_PROSE_CHARS),
            })
            .collect(),
        affected_concept_ids: finding
            .affected_concept_ids
            .iter()
            .take(MAX_HEALTH_LIMIT)
            .map(|id| bounded_output(id, MAX_OUTPUT_ID_CHARS))
            .collect(),
        affected_concept_count: finding.affected_concept_ids.len(),
        affected_concept_ids_truncated: finding.affected_concept_ids.len() > MAX_HEALTH_LIMIT,
        repairability: health_repairability_name(finding.repairability).to_string(),
        suppression_fingerprint: finding.suppression_fingerprint.clone(),
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

pub(crate) fn native_tool_definitions() -> Vec<LocalToolDefinition> {
    vec![
        LocalToolDefinition {
            name: "okf_inventory",
            description: "Inspect the active OKF bundle before reading concepts. Returns bounded metadata, validation counts, type and tag counts, and paged concept summaries.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "prefix": {"type": "string", "maxLength": MAX_FILTER_CHARS},
                    "type": {"type": "string", "maxLength": MAX_FILTER_CHARS},
                    "tag": {"type": "string", "maxLength": MAX_FILTER_CHARS},
                    "offset": {"type": "integer", "minimum": 0, "maximum": MAX_OFFSET},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_INVENTORY_LIMIT}
                },
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: "okf_read",
            description: "Read one parsed concept in the active OKF bundle by concept_id. Returns bounded metadata and a line-paged Markdown body without arbitrary file access.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "concept_id": {"type": "string", "minLength": 1, "maxLength": MAX_CONCEPT_ID_CHARS},
                    "line": {"type": "integer", "minimum": 1, "maximum": MAX_OFFSET},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_READ_LIMIT}
                },
                "required": ["concept_id"],
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: "okf_search",
            description: "Search the active OKF bundle without reading every concept. Returns bounded metadata and matching Markdown snippets in relevance order.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 1, "maxLength": MAX_QUERY_CHARS},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_SEARCH_LIMIT}
                },
                "required": ["query"],
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: "okf_sources",
            description: "List resource URIs and external citations authored in the active OKF bundle. Reports referring concept IDs without fetching any source.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "concept_id": {"type": "string", "minLength": 1, "maxLength": MAX_CONCEPT_ID_CHARS},
                    "offset": {"type": "integer", "minimum": 0, "maximum": MAX_OFFSET},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_SOURCE_LIMIT}
                },
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: "okf_traverse",
            description: "Traverse resolved links and backlinks from one concept in the active OKF bundle with bounded cycle-safe breadth-first search.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "concept_id": {"type": "string", "minLength": 1, "maxLength": MAX_CONCEPT_ID_CHARS},
                    "direction": {"type": "string", "enum": ["outgoing", "incoming", "both"]},
                    "depth": {"type": "integer", "minimum": 1, "maximum": MAX_TRAVERSAL_DEPTH},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_TRAVERSAL_LIMIT}
                },
                "required": ["concept_id"],
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: "okf_validate",
            description: "Inspect conformance errors and warnings computed for the active OKF bundle. Returns severity totals and paged issue details.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "level": {"type": "string", "enum": ["all", "error", "warning"]},
                    "offset": {"type": "integer", "minimum": 0, "maximum": MAX_OFFSET},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_VALIDATION_LIMIT}
                },
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: "okf_health_summary",
            description: "Summarize deterministic knowledge-health findings. Keeps conformance facts distinct from advisory heuristics and returns a revision fingerprint for follow-up tools.",
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": ["conformance", "graph-connectivity", "navigation", "provenance", "freshness", "duplication", "coverage-hint"]},
                    "basis": {"type": "string", "enum": ["fact", "heuristic"]},
                    "severity": {"type": "string", "enum": ["error", "warning", "advisory"]},
                    "offset": {"type": "integer", "minimum": 0, "maximum": MAX_OFFSET},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_HEALTH_LIMIT}
                },
                "additionalProperties": false
            }),
        },
        LocalToolDefinition {
            name: "okf_health_finding",
            description: "Inspect one health finding's rule, version, evidence, rationale, basis, affected IDs, and repairability at an exact bundle revision.",
            parameters: health_finding_parameters(),
        },
        LocalToolDefinition {
            name: "okf_health_affected",
            description: "List bounded concept metadata affected by one health finding at an exact bundle revision.",
            parameters: health_affected_parameters(),
        },
        LocalToolDefinition {
            name: "okf_health_repair",
            description: "Return a read-only deterministic repair recipe when the selected health rule has one; guided findings return no invented repair.",
            parameters: health_finding_parameters(),
        },
    ]
}

fn health_finding_parameters() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "findingId": {"type": "string", "minLength": 1, "maxLength": MAX_HEALTH_ID_CHARS},
            "bundleFingerprint": {"type": "string", "minLength": 1, "maxLength": MAX_HEALTH_ID_CHARS}
        },
        "required": ["findingId", "bundleFingerprint"],
        "additionalProperties": false
    })
}

fn health_affected_parameters() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "findingId": {"type": "string", "minLength": 1, "maxLength": MAX_HEALTH_ID_CHARS},
            "bundleFingerprint": {"type": "string", "minLength": 1, "maxLength": MAX_HEALTH_ID_CHARS},
            "offset": {"type": "integer", "minimum": 0, "maximum": MAX_OFFSET},
            "limit": {"type": "integer", "minimum": 1, "maximum": MAX_HEALTH_LIMIT}
        },
        "required": ["findingId", "bundleFingerprint"],
        "additionalProperties": false
    })
}

pub(crate) fn execute_native_tool(
    bundle_root: &Path,
    call: &LocalToolCall,
) -> Result<String, String> {
    let canonical_root = bundle_root
        .canonicalize()
        .map_err(|_| "The active OKF bundle is unavailable.".to_string())?;
    if canonical_root != bundle_root || !canonical_root.is_dir() {
        return Err("The active OKF bundle is unavailable.".to_string());
    }
    let server = OkfMcpServer::new_live(canonical_root);
    let output = match call.name.as_str() {
        "okf_inventory" => {
            let Json(output) = server.okf_inventory(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_read" => {
            let Json(output) = server.okf_read(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_search" => {
            let Json(output) = server.okf_search(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_sources" => {
            let Json(output) = server.okf_sources(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_traverse" => {
            let Json(output) = server.okf_traverse(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_validate" => {
            let Json(output) = server.okf_validate(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_health_summary" => {
            let Json(output) = server.okf_health_summary(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_health_finding" => {
            let Json(output) = server.okf_health_finding(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_health_affected" => {
            let Json(output) = server.okf_health_affected(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        "okf_health_repair" => {
            let Json(output) = server.okf_health_repair(Parameters(native_input(call)?))?;
            serde_json::to_value(output)
        }
        _ => return Err("The model requested a tool that Studio did not offer.".to_string()),
    }
    .map_err(|_| "Studio could not encode the OKF tool result.".to_string())?;
    let output = serde_json::to_string(&output)
        .map_err(|_| "Studio could not encode the OKF tool result.".to_string())?;
    if output.len() > MAX_NATIVE_OUTPUT_BYTES {
        return Err(
            "The OKF tool result is too large. Narrow the filter, page, or line range.".to_string(),
        );
    }
    Ok(output)
}

pub(crate) fn native_tool_display(call: &LocalToolCall) -> (&'static str, &'static str) {
    match call.name.as_str() {
        "okf_inventory" => ("Inspect OKF bundle", "search"),
        "okf_read" => ("Read OKF concept", "read"),
        "okf_search" => ("Search OKF bundle", "search"),
        "okf_sources" => ("List OKF sources", "search"),
        "okf_traverse" => ("Traverse OKF graph", "search"),
        "okf_validate" => ("Inspect OKF validation", "read"),
        "okf_health_summary" => ("Summarize knowledge health", "search"),
        "okf_health_finding" => ("Inspect health finding", "read"),
        "okf_health_affected" => ("List affected concepts", "search"),
        "okf_health_repair" => ("Inspect deterministic repair", "read"),
        _ => ("Use OKF tool", "other"),
    }
}

fn native_input<T: for<'de> Deserialize<'de>>(call: &LocalToolCall) -> Result<T, String> {
    serde_json::from_value(call.arguments.clone())
        .map_err(|_| format!("The model returned invalid arguments for {}.", call.name))
}

#[tool_handler]
impl ServerHandler for OkfMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("okf-studio", env!("CARGO_PKG_VERSION")))
            .with_protocol_version(ProtocolVersion::V_2024_11_05)
            .with_instructions(
                "Read-only tools to select and load versioned OKF methods, then inspect, read, search, trace sources, traverse, validate, and analyze deterministic knowledge health for the active Open Knowledge Format bundle. Generic chat should inspect the capability catalog and load the narrowest relevant method before OKF work.",
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
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("OKF Studio MCP runtime failed: {error}"))?;
    runtime.block_on(async move {
        let service = OkfMcpServer::new_live(bundle_root)
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
    use std::fs;

    #[test]
    fn tools_inspect_read_search_sources_traverse_and_validate_the_docs_bundle() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../docs")
            .canonicalize()
            .expect("canonical docs root");
        let server = OkfMcpServer::new(okf_core::read_bundle(&root));
        let Json(catalog) = server
            .okf_capability_catalog(Parameters(CapabilityCatalogInput {}))
            .expect("capability catalog");
        assert_eq!(catalog.manifest_sha256.len(), 64);
        assert!(catalog
            .capabilities
            .iter()
            .any(|capability| capability.id == "okf-revise"
                && capability.resource_ids == ["instructions"]));
        let Json(resource) = server
            .okf_capability_resource(Parameters(CapabilityResourceInput {
                capability_id: "okf-revise".to_string(),
                resource_id: "instructions".to_string(),
            }))
            .expect("revise capability resource");
        assert_eq!(resource.capability_version, "0.1.0");
        assert!(resource.contents.contains("writing-revision"));

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

        let Json(health) = server
            .okf_health_summary(Parameters(HealthSummaryInput {
                category: None,
                basis: Some("heuristic".to_string()),
                severity: None,
                offset: None,
                limit: Some(5),
            }))
            .unwrap();
        assert!(health
            .bundle_fingerprint
            .starts_with("okf-health-revision-"));
        assert!(health.matching_count >= health.findings.len());
        assert!(health
            .findings
            .iter()
            .all(|finding| finding.basis == "heuristic"));
        let selected = health.findings.first().expect("docs health finding");
        let Json(detail) = server
            .okf_health_finding(Parameters(HealthFindingInput {
                finding_id: selected.id.clone(),
                bundle_fingerprint: health.bundle_fingerprint.clone(),
            }))
            .unwrap();
        assert_eq!(detail.finding.rule_id, selected.rule_id);
        assert!(!detail.finding.why.is_empty());
        let Json(affected) = server
            .okf_health_affected(Parameters(HealthAffectedInput {
                finding_id: selected.id.clone(),
                bundle_fingerprint: health.bundle_fingerprint.clone(),
                offset: None,
                limit: Some(10),
            }))
            .unwrap();
        assert_eq!(affected.finding_id, selected.id);
        assert!(affected.concepts.len() <= 10);
        assert!(server
            .okf_health_finding(Parameters(HealthFindingInput {
                finding_id: selected.id.clone(),
                bundle_fingerprint: "okf-health-revision-stale".to_string(),
            }))
            .is_err());
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
        assert!(server
            .okf_health_summary(Parameters(HealthSummaryInput {
                category: Some("quality".to_string()),
                basis: None,
                severity: None,
                offset: None,
                limit: None,
            }))
            .is_err());
        assert!(server
            .okf_capability_resource(Parameters(CapabilityResourceInput {
                capability_id: "okf-missing".to_string(),
                resource_id: "instructions".to_string(),
            }))
            .is_err());
    }

    #[test]
    fn health_repairs_are_revision_bound_and_live_reload_invalidates_stale_findings() {
        let root =
            std::env::temp_dir().join(format!("okf-health-mcp-{}", uuid::Uuid::new_v4().simple()));
        fs::create_dir_all(root.join("notes")).expect("create fixture");
        fs::write(
            root.join("index.md"),
            "---\nokf_version: \"0.1\"\n---\n# Health fixture\n* [Notes](notes/)\n",
        )
        .expect("write root index");
        let concept_path = root.join("notes/item.md");
        fs::write(
            &concept_path,
            "---\ntype: Note\ntitle: Item\ndescription: A bounded item.\ntimestamp: 2026-07-18T00:00:00Z\nresource: https://example.com/item\n---\n# Item\n",
        )
        .expect("write concept");
        let canonical = root.canonicalize().expect("canonical fixture");
        let server = OkfMcpServer::new_live(canonical);
        let Json(summary) = server
            .okf_health_summary(Parameters(HealthSummaryInput {
                category: Some("navigation".to_string()),
                basis: Some("fact".to_string()),
                severity: None,
                offset: None,
                limit: Some(10),
            }))
            .expect("health summary");
        let finding = summary
            .findings
            .iter()
            .find(|finding| finding.rule_id == "okf.navigation.synthesized-index")
            .expect("synthesized index finding");
        let input = HealthFindingInput {
            finding_id: finding.id.clone(),
            bundle_fingerprint: summary.bundle_fingerprint.clone(),
        };
        let Json(repair) = server
            .okf_health_repair(Parameters(HealthFindingInput {
                finding_id: input.finding_id.clone(),
                bundle_fingerprint: input.bundle_fingerprint.clone(),
            }))
            .expect("deterministic repair");
        assert_eq!(repair.repairability, "deterministic");
        assert_eq!(repair.repair.expect("repair recipe").action, "create-index");

        fs::write(
            &concept_path,
            "---\ntype: Note\ntitle: Item\ndescription: Changed.\ntimestamp: 2026-07-18T00:00:00Z\nresource: https://example.com/item\n---\n# Item\n",
        )
        .expect("change bundle");
        let error = match server.okf_health_finding(Parameters(input)) {
            Ok(_) => panic!("stale finding must fail"),
            Err(error) => error,
        };
        assert!(error.contains("bundle changed"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn health_detail_and_affected_concepts_stay_bounded() {
        let root = std::env::temp_dir().join(format!(
            "okf-health-bounds-{}",
            uuid::Uuid::new_v4().simple()
        ));
        fs::create_dir_all(root.join("items")).expect("create fixture");
        let mut index = "---\nokf_version: \"0.1\"\n---\n# Health bounds\n".to_string();
        for number in 0..205 {
            let id = format!("item-{number:03}");
            index.push_str(&format!("* [Item](items/{id}.md)\n"));
            fs::write(
                root.join("items").join(format!("{id}.md")),
                "---\ntype: Note\ntitle: Repeated title\ndescription: Bounded.\ntimestamp: 2026-07-18T00:00:00Z\nresource: https://example.com/item\n---\n# Repeated title\n",
            )
            .expect("write concept");
        }
        fs::write(root.join("index.md"), index).expect("write index");
        let server = OkfMcpServer::new_live(root.canonicalize().expect("canonical fixture"));
        let Json(summary) = server
            .okf_health_summary(Parameters(HealthSummaryInput {
                category: Some("duplication".to_string()),
                basis: Some("heuristic".to_string()),
                severity: None,
                offset: None,
                limit: Some(10),
            }))
            .expect("health summary");
        let finding = summary
            .findings
            .iter()
            .find(|finding| finding.rule_id == "okf.duplication.same-title")
            .expect("same-title finding");
        let Json(detail) = server
            .okf_health_finding(Parameters(HealthFindingInput {
                finding_id: finding.id.clone(),
                bundle_fingerprint: summary.bundle_fingerprint.clone(),
            }))
            .expect("health detail");
        assert_eq!(detail.finding.affected_concept_count, 205);
        assert_eq!(detail.finding.affected_concept_ids.len(), MAX_HEALTH_LIMIT);
        assert!(detail.finding.affected_concept_ids_truncated);

        let Json(affected) = server
            .okf_health_affected(Parameters(HealthAffectedInput {
                finding_id: finding.id.clone(),
                bundle_fingerprint: summary.bundle_fingerprint,
                offset: Some(190),
                limit: Some(25),
            }))
            .expect("affected concept page");
        assert_eq!(affected.affected_concept_count, 205);
        assert_eq!(affected.concepts.len(), 15);
        assert_eq!(affected.next_offset, None);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn native_tools_share_the_mcp_implementations_and_reject_extra_arguments() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../docs")
            .canonicalize()
            .expect("canonical docs root");
        let names = native_tool_definitions()
            .iter()
            .map(|tool| tool.name)
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            [
                "okf_inventory",
                "okf_read",
                "okf_search",
                "okf_sources",
                "okf_traverse",
                "okf_validate",
                "okf_health_summary",
                "okf_health_finding",
                "okf_health_affected",
                "okf_health_repair"
            ]
        );
        let call = LocalToolCall {
            id: "local-tool-0-0".to_string(),
            name: "okf_search".to_string(),
            arguments: serde_json::json!({"query": "agent panel", "limit": 3}),
        };
        let output = execute_native_tool(&root, &call).expect("native search");
        let output: serde_json::Value = serde_json::from_str(&output).expect("JSON output");
        assert!(output["matches"].as_array().is_some_and(|matches| matches
            .iter()
            .any(|item| item["id"] == "features/agent-panel")));
        assert_eq!(native_tool_display(&call), ("Search OKF bundle", "search"));

        let mut invalid = call;
        invalid.arguments = serde_json::json!({"query": "agent", "path": "../secret"});
        assert!(execute_native_tool(&root, &invalid).is_err());

        let noncanonical_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../docs");
        assert_eq!(
            execute_native_tool(&noncanonical_root, &invalid)
                .expect_err("session root must stay canonical"),
            "The active OKF bundle is unavailable."
        );
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
                "okf_capability_catalog",
                "okf_capability_resource",
                "okf_health_affected",
                "okf_health_finding",
                "okf_health_repair",
                "okf_health_summary",
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
                CallToolRequestParams::new("okf_capability_resource").with_arguments(
                    serde_json::json!({
                        "capabilityId": "okf-revise",
                        "resourceId": "instructions"
                    })
                    .as_object()
                    .expect("object")
                    .clone(),
                ),
            )
            .await
            .expect("call capability resource tool");
        let structured = result
            .structured_content
            .expect("structured capability resource output");
        assert_eq!(structured["capabilityId"], "okf-revise");
        assert!(structured["contents"]
            .as_str()
            .is_some_and(|contents| contents.contains("writing-revision")));
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
