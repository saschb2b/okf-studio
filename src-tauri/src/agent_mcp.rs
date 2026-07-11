use okf_core::query::{self, TraversalDirection};
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
                id: item.id,
                title: item.title,
                concept_type: item.concept_type,
                description: item.description,
                snippet: item.snippet,
            })
            .collect();
        Ok(Json(SearchOutput { matches }))
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
                    id: item.id,
                    title: item.title,
                    concept_type: item.concept_type,
                    depth: item.depth,
                })
                .collect(),
            edges: result
                .edges
                .into_iter()
                .map(|edge| TraversalEdge {
                    source: edge.source,
                    target: edge.target,
                })
                .collect(),
            truncated: result.truncated,
        }))
    }
}

#[tool_handler]
impl ServerHandler for OkfMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("okf-studio", env!("CARGO_PKG_VERSION")))
            .with_protocol_version(ProtocolVersion::V_2024_11_05)
            .with_instructions(
                "Read-only tools for searching and traversing the active Open Knowledge Format bundle.",
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
    fn tools_search_and_traverse_the_docs_bundle() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../docs");
        let server = OkfMcpServer::new(okf_core::read_bundle(&root));
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
            .okf_traverse(Parameters(TraverseInput {
                concept_id: "missing".to_string(),
                direction: Some("sideways".to_string()),
                depth: None,
                limit: None,
            }))
            .is_err());
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
            ["okf_search", "okf_traverse"]
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
