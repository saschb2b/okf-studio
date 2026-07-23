use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

pub(crate) const ADAPTER_SCHEMA_VERSION: u32 = 1;
const ADAPTER_VERSION: u32 = 1;
const MAX_STRUCTURED_ITEMS: usize = 20_000;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceDiscovery {
    File,
    Folder,
    Url,
    Image,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SourceDiagnosticLevel {
    Warning,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiagnostic {
    pub level: SourceDiagnosticLevel,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAdapterReceipt {
    pub schema_version: u32,
    pub adapter_id: String,
    pub adapter_version: u32,
    pub observed_at: String,
    pub discovery: SourceDiscovery,
    pub origin: String,
    pub media_type: String,
    pub source_fingerprint: String,
    pub evidence_fingerprint: String,
    pub refresh_fingerprint: String,
    pub trust: String,
    pub diagnostics: Vec<SourceDiagnostic>,
}

#[derive(Debug)]
pub struct AdaptedText {
    pub content: String,
    pub source_digest: String,
    pub receipt: SourceAdapterReceipt,
}

pub fn adapt_text(
    title: &str,
    origin: &str,
    media_type: &str,
    bytes: &[u8],
    discovery: SourceDiscovery,
    max_content_chars: usize,
) -> Result<AdaptedText, String> {
    let source_digest = digest(bytes);
    let (adapter_id, content, diagnostics) = match media_type {
        "text/plain" => (
            "text",
            utf8_text(bytes, title, max_content_chars)?,
            Vec::new(),
        ),
        "text/markdown" => (
            "markdown",
            utf8_text(bytes, title, max_content_chars)?,
            Vec::new(),
        ),
        "text/html" => (
            "html",
            utf8_text(bytes, title, max_content_chars)?,
            Vec::new(),
        ),
        "text/csv" => {
            let normalized = crate::agent_csv::normalize(bytes, title, max_content_chars)?;
            debug_assert_eq!(normalized.source_digest, source_digest);
            ("csv", normalized.content, Vec::new())
        }
        "application/json" => adapt_json(bytes, title, max_content_chars)?,
        "application/yaml" => adapt_yaml(bytes, title, max_content_chars)?,
        _ => return Err(format!("{title} uses an unsupported source media type.")),
    };
    let evidence_digest = digest(content.as_bytes());
    Ok(AdaptedText {
        content,
        source_digest: source_digest.clone(),
        receipt: receipt(
            adapter_id,
            discovery,
            origin,
            media_type,
            &source_digest,
            &evidence_digest,
            diagnostics,
        ),
    })
}

pub fn binary_receipt(
    adapter_id: &str,
    discovery: SourceDiscovery,
    origin: &str,
    media_type: &str,
    source_digest: &str,
    evidence_digest: &str,
    diagnostics: Vec<SourceDiagnostic>,
) -> SourceAdapterReceipt {
    receipt(
        adapter_id,
        discovery,
        origin,
        media_type,
        source_digest,
        evidence_digest,
        diagnostics,
    )
}

pub fn warning(code: &str, message: impl Into<String>) -> SourceDiagnostic {
    SourceDiagnostic {
        level: SourceDiagnosticLevel::Warning,
        code: code.to_string(),
        message: message.into(),
    }
}

fn adapt_json(
    bytes: &[u8],
    title: &str,
    max_content_chars: usize,
) -> Result<(&'static str, String, Vec<SourceDiagnostic>), String> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| format!("{title} contains invalid JSON: {error}"))?;
    if is_openapi(&value) {
        let (content, diagnostics) = normalize_openapi(&value, title, max_content_chars)?;
        return Ok(("openapi", content, diagnostics));
    }
    if is_dbt_manifest(&value) {
        let (content, diagnostics) = normalize_dbt(&value, title, max_content_chars)?;
        return Ok(("dbt-manifest", content, diagnostics));
    }
    if is_bigquery_export(&value) {
        let (content, diagnostics) = normalize_bigquery(&value, title, max_content_chars)?;
        return Ok(("bigquery-metadata", content, diagnostics));
    }
    let normalized = crate::agent_json::normalize(bytes, title, max_content_chars)?;
    debug_assert_eq!(normalized.source_digest, digest(bytes));
    Ok(("json", normalized.content, Vec::new()))
}

fn adapt_yaml(
    bytes: &[u8],
    title: &str,
    max_content_chars: usize,
) -> Result<(&'static str, String, Vec<SourceDiagnostic>), String> {
    let yaml: serde_yaml_ng::Value = serde_yaml_ng::from_slice(bytes)
        .map_err(|error| format!("{title} contains invalid YAML: {error}"))?;
    let value = serde_json::to_value(yaml)
        .map_err(|error| format!("Could not normalize YAML from {title}: {error}"))?;
    if !is_openapi(&value) {
        return Err(format!(
            "{title} is YAML but is not an OpenAPI document. Generic YAML intake is not enabled."
        ));
    }
    let (content, diagnostics) = normalize_openapi(&value, title, max_content_chars)?;
    Ok(("openapi", content, diagnostics))
}

fn is_openapi(value: &Value) -> bool {
    value.as_object().is_some_and(|root| {
        root.get("openapi").and_then(Value::as_str).is_some()
            || root.get("swagger").and_then(Value::as_str).is_some()
    })
}

fn normalize_openapi(
    value: &Value,
    title: &str,
    max_content_chars: usize,
) -> Result<(String, Vec<SourceDiagnostic>), String> {
    let root = object(value, title, "OpenAPI document")?;
    let version = root
        .get("openapi")
        .or_else(|| root.get("swagger"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let info = root.get("info").and_then(Value::as_object);
    let api_title = info
        .and_then(|value| value.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("Untitled API");
    let api_version = info
        .and_then(|value| value.get("version"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let paths = root
        .get("paths")
        .and_then(Value::as_object)
        .ok_or_else(|| format!("{title} has no OpenAPI paths object."))?;
    if paths.len() > MAX_STRUCTURED_ITEMS {
        return Err(format!(
            "{title} exceeds the {MAX_STRUCTURED_ITEMS} path OpenAPI limit."
        ));
    }
    let mut rows = Vec::new();
    let mut missing_operation_ids = 0_usize;
    let methods = [
        "delete", "get", "head", "options", "patch", "post", "put", "trace",
    ];
    for (path, path_item) in sorted_object(paths) {
        let Some(path_item) = path_item.as_object() else {
            continue;
        };
        for method in methods {
            let Some(operation) = path_item.get(method).and_then(Value::as_object) else {
                continue;
            };
            let operation_id = operation
                .get("operationId")
                .and_then(Value::as_str)
                .unwrap_or_else(|| {
                    missing_operation_ids += 1;
                    "(missing)"
                });
            let summary = operation
                .get("summary")
                .and_then(Value::as_str)
                .unwrap_or("");
            rows.push(format!(
                "| {} | {} | {} | {} |",
                cell(&method.to_uppercase()),
                cell(path),
                cell(operation_id),
                cell(summary)
            ));
            if rows.len() > MAX_STRUCTURED_ITEMS {
                return Err(format!(
                    "{title} exceeds the {MAX_STRUCTURED_ITEMS} operation OpenAPI limit."
                ));
            }
        }
    }
    let mut diagnostics = Vec::new();
    if missing_operation_ids > 0 {
        diagnostics.push(warning(
            "openapi-missing-operation-id",
            format!(
                "{missing_operation_ids} operations have no operationId. Add stable operationId values before generating concept identities."
            ),
        ));
    }
    if rows.is_empty() {
        diagnostics.push(warning(
            "openapi-no-operations",
            "The document declares paths but no supported HTTP operations. Export a complete OpenAPI paths object.",
        ));
    }
    let content = [
        "## OpenAPI inventory".to_string(),
        format!("- Title: {}", inline(api_title)),
        format!("- API version: {}", inline(api_version)),
        format!("- Specification: {}", inline(version)),
        format!("- Operations: {}", rows.len()),
        "\n| Method | Path | Operation ID | Summary |".to_string(),
        "| --- | --- | --- | --- |".to_string(),
        rows.join("\n"),
    ]
    .join("\n");
    bounded(content, title, max_content_chars, "OpenAPI").map(|content| (content, diagnostics))
}

fn is_dbt_manifest(value: &Value) -> bool {
    value.as_object().is_some_and(|root| {
        root.get("metadata")
            .and_then(Value::as_object)
            .and_then(|metadata| metadata.get("dbt_schema_version"))
            .and_then(Value::as_str)
            .is_some()
            && root.get("nodes").and_then(Value::as_object).is_some()
    })
}

fn normalize_dbt(
    value: &Value,
    title: &str,
    max_content_chars: usize,
) -> Result<(String, Vec<SourceDiagnostic>), String> {
    let root = object(value, title, "dbt manifest")?;
    let metadata = root.get("metadata").and_then(Value::as_object);
    let schema_version = metadata
        .and_then(|item| item.get("dbt_schema_version"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let project = metadata
        .and_then(|item| item.get("project_name"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let nodes = root
        .get("nodes")
        .and_then(Value::as_object)
        .ok_or_else(|| format!("{title} has no dbt nodes object."))?;
    let sources = root.get("sources").and_then(Value::as_object);
    let total = nodes.len().saturating_add(sources.map_or(0, Map::len));
    if total > MAX_STRUCTURED_ITEMS {
        return Err(format!(
            "{title} exceeds the {MAX_STRUCTURED_ITEMS} object dbt limit."
        ));
    }
    let mut rows = Vec::new();
    for (unique_id, node) in sorted_object(nodes)
        .into_iter()
        .chain(sources.into_iter().flat_map(sorted_object))
    {
        let object = node.as_object();
        let resource_type = field(object, "resource_type");
        let name = field(object, "name");
        let relation = [
            field(object, "database"),
            field(object, "schema"),
            field(object, "alias"),
        ]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(".");
        let dependencies = object
            .and_then(|item| item.get("depends_on"))
            .and_then(Value::as_object)
            .and_then(|item| item.get("nodes"))
            .and_then(Value::as_array)
            .map_or(0, Vec::len);
        rows.push(format!(
            "| {} | {} | {} | {} | {} |",
            cell(unique_id),
            cell(resource_type),
            cell(name),
            cell(&relation),
            dependencies
        ));
    }
    let mut diagnostics = Vec::new();
    if rows.is_empty() {
        diagnostics.push(warning(
            "dbt-empty-manifest",
            "The manifest contains no nodes or sources. Export a populated dbt manifest.json.",
        ));
    }
    let content = [
        "## dbt manifest inventory".to_string(),
        format!("- Project: {}", inline(project)),
        format!("- Schema: {}", inline(schema_version)),
        format!("- Objects: {}", rows.len()),
        "\n| Unique ID | Resource type | Name | Relation | Dependencies |".to_string(),
        "| --- | --- | --- | --- | ---: |".to_string(),
        rows.join("\n"),
    ]
    .join("\n");
    bounded(content, title, max_content_chars, "dbt").map(|content| (content, diagnostics))
}

fn is_bigquery_export(value: &Value) -> bool {
    match value {
        Value::Object(root) => {
            root.get("datasets").and_then(Value::as_array).is_some()
                || root.get("tables").and_then(Value::as_array).is_some()
                || root
                    .get("tableReference")
                    .and_then(Value::as_object)
                    .is_some()
        }
        Value::Array(items) => items.iter().any(|item| {
            item.get("tableReference")
                .and_then(Value::as_object)
                .is_some()
                || item
                    .get("datasetReference")
                    .and_then(Value::as_object)
                    .is_some()
        }),
        _ => false,
    }
}

fn normalize_bigquery(
    value: &Value,
    title: &str,
    max_content_chars: usize,
) -> Result<(String, Vec<SourceDiagnostic>), String> {
    let items = bigquery_items(value);
    if items.len() > MAX_STRUCTURED_ITEMS {
        return Err(format!(
            "{title} exceeds the {MAX_STRUCTURED_ITEMS} object BigQuery limit."
        ));
    }
    let mut rows = Vec::new();
    let mut missing_schema = 0_usize;
    for item in items {
        let table = item
            .get("tableReference")
            .and_then(Value::as_object)
            .or_else(|| item.get("datasetReference").and_then(Value::as_object))
            .or_else(|| item.as_object());
        let dataset = field(table, "datasetId");
        let table_id = field(table, "tableId");
        let object_type =
            item.get("type")
                .and_then(Value::as_str)
                .unwrap_or(if table_id.is_empty() {
                    "dataset"
                } else {
                    "table"
                });
        let field_count = item
            .get("schema")
            .and_then(Value::as_object)
            .and_then(|schema| schema.get("fields"))
            .and_then(Value::as_array)
            .map(Vec::len);
        if !table_id.is_empty() && field_count.is_none() {
            missing_schema += 1;
        }
        rows.push(format!(
            "| {} | {} | {} | {} |",
            cell(dataset),
            cell(table_id),
            cell(object_type),
            field_count.map_or_else(|| "unknown".to_string(), |count| count.to_string())
        ));
    }
    let mut diagnostics = Vec::new();
    if rows.is_empty() {
        diagnostics.push(warning(
            "bigquery-empty-export",
            "The export contains no datasets or tables. Export a populated metadata inventory.",
        ));
    }
    if missing_schema > 0 {
        diagnostics.push(warning(
            "bigquery-missing-schema",
            format!(
                "{missing_schema} table records have no field schema. Re-export table metadata with schema fields."
            ),
        ));
    }
    let content = [
        "## BigQuery metadata inventory".to_string(),
        format!("- Objects: {}", rows.len()),
        "\n| Dataset | Table | Type | Fields |".to_string(),
        "| --- | --- | --- | ---: |".to_string(),
        rows.join("\n"),
    ]
    .join("\n");
    bounded(content, title, max_content_chars, "BigQuery").map(|content| (content, diagnostics))
}

fn bigquery_items(value: &Value) -> Vec<&Value> {
    match value {
        Value::Array(items) => items.iter().collect(),
        Value::Object(root) => root
            .get("tables")
            .or_else(|| root.get("datasets"))
            .and_then(Value::as_array)
            .map_or_else(|| vec![value], |items| items.iter().collect()),
        _ => Vec::new(),
    }
}

fn receipt(
    adapter_id: &str,
    discovery: SourceDiscovery,
    origin: &str,
    media_type: &str,
    source_digest: &str,
    evidence_digest: &str,
    diagnostics: Vec<SourceDiagnostic>,
) -> SourceAdapterReceipt {
    let refresh_digest = digest(
        format!("{ADAPTER_SCHEMA_VERSION}\0{adapter_id}\0{ADAPTER_VERSION}\0{source_digest}")
            .as_bytes(),
    );
    SourceAdapterReceipt {
        schema_version: ADAPTER_SCHEMA_VERSION,
        adapter_id: adapter_id.to_string(),
        adapter_version: ADAPTER_VERSION,
        observed_at: OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string()),
        discovery,
        origin: origin.to_string(),
        media_type: media_type.to_string(),
        source_fingerprint: format!("sha256-{source_digest}"),
        evidence_fingerprint: format!("sha256-{evidence_digest}"),
        refresh_fingerprint: format!("source-refresh-v1-{refresh_digest}"),
        trust: "untrusted".to_string(),
        diagnostics,
    }
}

fn utf8_text(bytes: &[u8], title: &str, max_content_chars: usize) -> Result<String, String> {
    let content = String::from_utf8(bytes.to_vec())
        .map_err(|_| format!("{title} is not valid UTF-8 text."))?;
    bounded(content, title, max_content_chars, "source")
}

fn bounded(
    content: String,
    title: &str,
    max_content_chars: usize,
    label: &str,
) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err(format!("{title} is empty."));
    }
    if content.chars().count() > max_content_chars {
        return Err(format!(
            "Normalized {label} from {title} exceeds the {max_content_chars} character source limit."
        ));
    }
    Ok(content)
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn object<'a>(
    value: &'a Value,
    title: &str,
    label: &str,
) -> Result<&'a Map<String, Value>, String> {
    value
        .as_object()
        .ok_or_else(|| format!("{title} does not contain a valid {label}."))
}

fn sorted_object(object: &Map<String, Value>) -> Vec<(&str, &Value)> {
    let mut entries = object
        .iter()
        .map(|(key, value)| (key.as_str(), value))
        .collect::<Vec<_>>();
    entries.sort_by_key(|(key, _)| *key);
    entries
}

fn field<'a>(object: Option<&'a Map<String, Value>>, key: &str) -> &'a str {
    object
        .and_then(|item| item.get(key))
        .and_then(Value::as_str)
        .unwrap_or("")
}

fn inline(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn cell(value: &str) -> String {
    inline(value).replace('\\', "\\\\").replace('|', "\\|")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equivalent_json_and_yaml_openapi_have_stable_evidence_provenance() {
        let json = br#"{"openapi":"3.1.0","info":{"title":"Pet API","version":"1"},"paths":{"/pets":{"get":{"operationId":"listPets","summary":"List pets"}}}}"#;
        let yaml = b"openapi: 3.1.0\ninfo:\n  title: Pet API\n  version: '1'\npaths:\n  /pets:\n    get:\n      operationId: listPets\n      summary: List pets\n";
        let from_json = adapt_text(
            "openapi.json",
            "openapi.json",
            "application/json",
            json,
            SourceDiscovery::File,
            64 * 1024,
        )
        .expect("JSON OpenAPI");
        let from_yaml = adapt_text(
            "openapi.yaml",
            "openapi.yaml",
            "application/yaml",
            yaml,
            SourceDiscovery::File,
            64 * 1024,
        )
        .expect("YAML OpenAPI");

        assert_eq!(from_json.content, from_yaml.content);
        assert_eq!(from_json.receipt.adapter_id, "openapi");
        assert_eq!(from_yaml.receipt.adapter_id, "openapi");
        assert_eq!(
            from_json.receipt.evidence_fingerprint,
            from_yaml.receipt.evidence_fingerprint
        );
        assert_ne!(
            from_json.receipt.source_fingerprint,
            from_yaml.receipt.source_fingerprint
        );
        assert_ne!(
            from_json.receipt.refresh_fingerprint,
            from_yaml.receipt.refresh_fingerprint
        );
    }

    #[test]
    fn dbt_and_bigquery_adapters_preserve_partial_diagnostics() {
        let dbt = br#"{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v12.json","project_name":"warehouse"},"nodes":{},"sources":{}}"#;
        let bigquery = br#"{"tables":[{"tableReference":{"datasetId":"sales","tableId":"orders"},"type":"TABLE"}]}"#;
        let bigquery_dataset = br#"{"datasets":[{"datasetReference":{"datasetId":"operations"}}]}"#;
        let dbt = adapt_text(
            "manifest.json",
            "manifest.json",
            "application/json",
            dbt,
            SourceDiscovery::File,
            64 * 1024,
        )
        .expect("dbt manifest");
        let bigquery = adapt_text(
            "bigquery.json",
            "bigquery.json",
            "application/json",
            bigquery,
            SourceDiscovery::File,
            64 * 1024,
        )
        .expect("BigQuery export");
        let bigquery_dataset = adapt_text(
            "datasets.json",
            "datasets.json",
            "application/json",
            bigquery_dataset,
            SourceDiscovery::File,
            64 * 1024,
        )
        .expect("BigQuery dataset export");

        assert_eq!(dbt.receipt.adapter_id, "dbt-manifest");
        assert_eq!(dbt.receipt.diagnostics[0].code, "dbt-empty-manifest");
        assert_eq!(bigquery.receipt.adapter_id, "bigquery-metadata");
        assert_eq!(
            bigquery.receipt.diagnostics[0].code,
            "bigquery-missing-schema"
        );
        assert!(bigquery_dataset.content.contains("operations"));

        let empty = adapt_text(
            "empty-bigquery.json",
            "empty-bigquery.json",
            "application/json",
            br#"{"datasets":[]}"#,
            SourceDiscovery::File,
            64 * 1024,
        )
        .expect("empty BigQuery export remains partial evidence");
        assert_eq!(empty.receipt.diagnostics[0].code, "bigquery-empty-export");
    }

    #[test]
    fn malformed_structured_sources_fail_with_recovery() {
        let error = adapt_text(
            "openapi.yaml",
            "openapi.yaml",
            "application/yaml",
            b"openapi: [",
            SourceDiscovery::File,
            1024,
        )
        .expect_err("reject malformed YAML");
        assert!(error.contains("invalid YAML"), "{error}");

        let error = adapt_text(
            "notes.yaml",
            "notes.yaml",
            "application/yaml",
            b"title: Notes\n",
            SourceDiscovery::File,
            1024,
        )
        .expect_err("reject generic YAML");
        assert!(error.contains("not an OpenAPI document"), "{error}");
    }
}
