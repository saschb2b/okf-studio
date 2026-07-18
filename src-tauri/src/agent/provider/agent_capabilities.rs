use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::OnceLock;

const MANIFEST: &str = include_str!("../../../../.agents/skills/okf/capabilities.json");
const OKF_SKILL: &str = include_str!("../../../../.agents/skills/okf/SKILL.md");
const OKF_SPEC: &str = include_str!("../../../../.agents/skills/okf/spec.md");
const OKF_COMMANDS: &str = include_str!("../../../../.agents/skills/okf/commands.md");
const OKF_TEMPLATES: &str = include_str!("../../../../.agents/skills/okf/templates.md");
const CAPABILITY_CHANGELOG: &str =
    include_str!("../../../../.agents/skills/okf/capabilities/CHANGELOG.md");
const OKF_INSPECT: &str = include_str!("../../../../.agents/skills/okf/capabilities/inspect.md");
const OKF_CREATE: &str = include_str!("../../../../.agents/skills/okf/capabilities/create.md");
const OKF_ENRICH: &str = include_str!("../../../../.agents/skills/okf/capabilities/enrich.md");
const OKF_AUDIT: &str = include_str!("../../../../.agents/skills/okf/capabilities/audit.md");
const OKF_REPAIR: &str = include_str!("../../../../.agents/skills/okf/capabilities/repair.md");
const OKF_RESEARCH: &str = include_str!("../../../../.agents/skills/okf/capabilities/research.md");
const OKF_CHANGE_IMPACT: &str =
    include_str!("../../../../.agents/skills/okf/capabilities/change-impact.md");
const OKF_MIGRATE: &str = include_str!("../../../../.agents/skills/okf/capabilities/migrate.md");
const MAX_CAPABILITIES: usize = 32;
const MAX_RESOURCES_PER_CAPABILITY: usize = 16;
const MAX_RESOURCE_BYTES: usize = 256 * 1024;
const MAX_TOTAL_RESOURCE_BYTES: usize = 768 * 1024;
const DEFAULT_CAPABILITY_ID: &str = "okf-core";
const ALLOWED_TOOL_IDS: [&str; 12] = [
    "okf_inventory",
    "okf_read",
    "okf_search",
    "okf_sources",
    "okf_traverse",
    "okf_validate",
    "studio_source_inventory",
    "studio_source_read",
    "studio_stage_inventory",
    "studio_stage_read",
    "studio_stage_propose",
    "studio_stage_validate",
];
const ALLOWED_ARTIFACT_KINDS: [&str; 7] = [
    "bundle-plan",
    "change-impact-map",
    "health-report",
    "migration-plan",
    "research-brief",
    "source-inventory",
    "staged-revision",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CapabilityCatalog {
    pub schema_version: u32,
    pub resource_schema_version: u32,
    pub capabilities: Vec<CapabilityDefinition>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CapabilityCatalogInfo {
    pub manifest_sha256: String,
    pub schema_version: u32,
    pub resource_schema_version: u32,
    pub capabilities: Vec<CapabilityDefinition>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CapabilityDefinition {
    pub id: String,
    pub version: String,
    pub description: String,
    pub risk_class: CapabilityRiskClass,
    pub required_tools: Vec<String>,
    pub artifact_kinds: Vec<String>,
    pub resources: Vec<CapabilityResourceDefinition>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CapabilityRiskClass {
    Read,
    Analyze,
    Fetch,
    Stage,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CapabilityResourceDefinition {
    pub id: String,
    pub label: String,
    pub path: String,
    pub media_type: String,
    pub sha256: String,
}

#[derive(Clone, Debug)]
pub(crate) struct CapabilityResource {
    pub capability_id: String,
    pub capability_version: String,
    pub resource_id: String,
    pub label: String,
    pub uri: String,
    pub media_type: String,
    pub sha256: String,
    pub contents: &'static str,
}

static CATALOG: OnceLock<CapabilityCatalog> = OnceLock::new();

pub(crate) fn catalog() -> &'static CapabilityCatalog {
    CATALOG.get_or_init(|| {
        parse_catalog(MANIFEST).unwrap_or_else(|error| {
            panic!("the build-verified OKF capability manifest is invalid at runtime: {error}")
        })
    })
}

pub(crate) fn manifest_sha256() -> &'static str {
    env!("OKF_CAPABILITY_MANIFEST_SHA256")
}

pub(crate) fn catalog_info() -> CapabilityCatalogInfo {
    let catalog = catalog();
    CapabilityCatalogInfo {
        manifest_sha256: manifest_sha256().to_string(),
        schema_version: catalog.schema_version,
        resource_schema_version: catalog.resource_schema_version,
        capabilities: catalog.capabilities.clone(),
    }
}

pub(crate) fn default_capability() -> &'static CapabilityDefinition {
    catalog()
        .capabilities
        .iter()
        .find(|capability| capability.id == DEFAULT_CAPABILITY_ID)
        .expect("build verification should preserve the default capability")
}

pub(crate) fn default_resources() -> Vec<CapabilityResource> {
    let capability = default_capability();
    capability
        .resources
        .iter()
        .map(|resource| materialize_resource(capability, resource))
        .collect()
}

pub(crate) fn resource(
    capability_id: &str,
    resource_id: &str,
) -> Result<CapabilityResource, String> {
    let capability = catalog()
        .capabilities
        .iter()
        .find(|capability| capability.id == capability_id)
        .ok_or_else(|| format!("Unknown OKF capability: {capability_id}."))?;
    let resource = capability
        .resources
        .iter()
        .find(|resource| resource.id == resource_id)
        .ok_or_else(|| {
            format!("Capability {capability_id} does not advertise resource {resource_id}.")
        })?;
    Ok(materialize_resource(capability, resource))
}

fn materialize_resource(
    capability: &CapabilityDefinition,
    resource: &CapabilityResourceDefinition,
) -> CapabilityResource {
    CapabilityResource {
        capability_id: capability.id.clone(),
        capability_version: capability.version.clone(),
        resource_id: resource.id.clone(),
        label: resource.label.clone(),
        uri: format!(
            "okf-studio://capability/{}/v{}/{}",
            capability.id, capability.version, resource.id
        ),
        media_type: resource.media_type.clone(),
        sha256: resource.sha256.clone(),
        contents: embedded_contents(&resource.path)
            .expect("build verification should reject unknown resource paths"),
    }
}

fn parse_catalog(input: &str) -> Result<CapabilityCatalog, String> {
    let catalog: CapabilityCatalog =
        serde_json::from_str(input).map_err(|error| format!("invalid JSON: {error}"))?;
    if catalog.schema_version != 1 {
        return Err("unsupported capability schema version".to_string());
    }
    if catalog.resource_schema_version != 1 {
        return Err("unsupported resource schema version".to_string());
    }
    if catalog.capabilities.is_empty() || catalog.capabilities.len() > MAX_CAPABILITIES {
        return Err("capability count is outside the supported bound".to_string());
    }

    let mut capability_ids = HashSet::new();
    let mut total_resource_bytes = 0_usize;
    for capability in &catalog.capabilities {
        validate_identifier(&capability.id, "capability ID")?;
        if !capability_ids.insert(capability.id.clone()) {
            return Err(format!("duplicate capability ID: {}", capability.id));
        }
        validate_version(&capability.version)?;
        if capability.description.trim().is_empty() {
            return Err(format!("{} has an empty description", capability.id));
        }
        validate_unique_declared_values(
            &capability.required_tools,
            &ALLOWED_TOOL_IDS,
            &format!("{} required tool", capability.id),
        )?;
        validate_unique_declared_values(
            &capability.artifact_kinds,
            &ALLOWED_ARTIFACT_KINDS,
            &format!("{} artifact kind", capability.id),
        )?;
        if capability.resources.is_empty()
            || capability.resources.len() > MAX_RESOURCES_PER_CAPABILITY
        {
            return Err(format!("{} resource count is invalid", capability.id));
        }

        let mut resource_ids = HashSet::new();
        for resource in &capability.resources {
            validate_identifier(&resource.id, "resource ID")?;
            if !resource_ids.insert(&resource.id) {
                return Err(format!(
                    "duplicate resource ID {} in {}",
                    resource.id, capability.id
                ));
            }
            if resource.label.trim().is_empty() {
                return Err(format!("resource {} has an empty label", resource.id));
            }
            if resource.media_type != "text/markdown" {
                return Err(format!(
                    "resource {} uses unsupported media type {}",
                    resource.id, resource.media_type
                ));
            }
            let contents = embedded_contents(&resource.path)
                .ok_or_else(|| format!("unknown embedded resource path: {}", resource.path))?;
            if contents.len() > MAX_RESOURCE_BYTES {
                return Err(format!("resource {} exceeds its size bound", resource.id));
            }
            total_resource_bytes = total_resource_bytes
                .checked_add(contents.len())
                .ok_or_else(|| "resource size total overflowed".to_string())?;
            if sha256(contents.as_bytes()) != resource.sha256 {
                return Err(format!("resource digest changed: {}", resource.path));
            }
        }
    }
    if total_resource_bytes > MAX_TOTAL_RESOURCE_BYTES {
        return Err("capability resources exceed the total size bound".to_string());
    }
    if !capability_ids.contains(DEFAULT_CAPABILITY_ID) {
        return Err("the default okf-core capability is missing".to_string());
    }
    Ok(catalog)
}

fn validate_unique_declared_values(
    values: &[String],
    allowed: &[&str],
    label: &str,
) -> Result<(), String> {
    if values.is_empty() {
        return Err(format!("{label} set is empty"));
    }
    let mut unique = HashSet::new();
    for value in values {
        if !allowed.contains(&value.as_str()) {
            return Err(format!("undeclared {label}: {value}"));
        }
        if !unique.insert(value) {
            return Err(format!("duplicate {label}: {value}"));
        }
    }
    Ok(())
}

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 64
        || value.starts_with('-')
        || value.ends_with('-')
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(format!("invalid {label}: {value}"));
    }
    Ok(())
}

fn validate_version(version: &str) -> Result<(), String> {
    let components = version.split('.').collect::<Vec<_>>();
    if components.len() != 3
        || components.iter().any(|component| {
            component.is_empty() || !component.bytes().all(|byte| byte.is_ascii_digit())
        })
    {
        return Err(format!("invalid capability version: {version}"));
    }
    Ok(())
}

fn embedded_contents(path: &str) -> Option<&'static str> {
    match path {
        "SKILL.md" => Some(OKF_SKILL),
        "spec.md" => Some(OKF_SPEC),
        "commands.md" => Some(OKF_COMMANDS),
        "templates.md" => Some(OKF_TEMPLATES),
        "capabilities/CHANGELOG.md" => Some(CAPABILITY_CHANGELOG),
        "capabilities/inspect.md" => Some(OKF_INSPECT),
        "capabilities/create.md" => Some(OKF_CREATE),
        "capabilities/enrich.md" => Some(OKF_ENRICH),
        "capabilities/audit.md" => Some(OKF_AUDIT),
        "capabilities/repair.md" => Some(OKF_REPAIR),
        "capabilities/research.md" => Some(OKF_RESEARCH),
        "capabilities/change-impact.md" => Some(OKF_CHANGE_IMPACT),
        "capabilities/migrate.md" => Some(OKF_MIGRATE),
        _ => None,
    }
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_value() -> serde_json::Value {
        serde_json::from_str(MANIFEST).expect("checked-in manifest should be JSON")
    }

    #[test]
    fn loads_the_build_verified_default_capability() {
        let catalog = catalog();
        assert_eq!(catalog.schema_version, 1);
        assert_eq!(catalog.resource_schema_version, 1);
        assert_eq!(catalog.capabilities.len(), 9);

        let capability = default_capability();
        assert_eq!(capability.id, "okf-core");
        assert_eq!(capability.version, "0.1.0");
        assert_eq!(capability.resources.len(), 5);
        assert_eq!(manifest_sha256().len(), 64);
        for capability_id in [
            "okf-inspect",
            "okf-create",
            "okf-enrich",
            "okf-audit",
            "okf-repair",
            "okf-research",
            "okf-change-impact",
            "okf-migrate",
        ] {
            let capability = catalog
                .capabilities
                .iter()
                .find(|candidate| candidate.id == capability_id)
                .expect("curated capability should be present");
            assert_eq!(capability.version, "0.1.0");
            assert_eq!(capability.resources.len(), 1);
            assert!(resource(capability_id, "instructions")
                .expect("curated instructions should materialize")
                .contents
                .contains("## Stop conditions"));
        }
    }

    #[test]
    fn materializes_only_declared_resources_with_versioned_identity() {
        let commands = resource("okf-core", "commands").expect("commands should be declared");
        assert_eq!(commands.capability_id, "okf-core");
        assert_eq!(commands.capability_version, "0.1.0");
        assert_eq!(commands.resource_id, "commands");
        assert_eq!(commands.media_type, "text/markdown");
        assert_eq!(commands.sha256.len(), 64);
        assert_eq!(
            commands.uri,
            "okf-studio://capability/okf-core/v0.1.0/commands"
        );
        assert!(commands.contents.contains("## `init`"));
        assert!(resource("okf-core", "secrets").is_err());
        assert!(resource("unknown", "commands").is_err());
    }

    #[test]
    fn exposes_metadata_without_resource_bodies_for_settings() {
        let info = serde_json::to_value(catalog_info()).expect("serialize catalog metadata");
        assert_eq!(info["capabilities"].as_array().map(Vec::len), Some(9));
        assert_eq!(info["manifestSha256"].as_str().map(str::len), Some(64));
        assert_eq!(
            info["capabilities"][1]["resources"][0]["path"],
            "capabilities/inspect.md"
        );
        assert!(info.to_string().find("## Trigger").is_none());
    }

    #[test]
    fn rejects_duplicate_ids_unknown_paths_tools_and_versions() {
        let mut duplicate = manifest_value();
        let copied = duplicate["capabilities"][0].clone();
        duplicate["capabilities"]
            .as_array_mut()
            .expect("capabilities should be an array")
            .push(copied);
        assert!(parse_catalog(&duplicate.to_string())
            .expect_err("duplicate IDs should fail")
            .contains("duplicate capability ID"));

        let mut unknown_path = manifest_value();
        unknown_path["capabilities"][0]["resources"][0]["path"] = serde_json::json!("outside.md");
        assert!(parse_catalog(&unknown_path.to_string())
            .expect_err("unknown paths should fail")
            .contains("unknown embedded resource path"));

        let mut unknown_tool = manifest_value();
        unknown_tool["capabilities"][0]["requiredTools"][0] =
            serde_json::json!("arbitrary_filesystem");
        assert!(parse_catalog(&unknown_tool.to_string())
            .expect_err("unknown tools should fail")
            .contains("undeclared okf-core required tool"));

        let mut invalid_version = manifest_value();
        invalid_version["capabilities"][0]["version"] = serde_json::json!("latest");
        assert!(parse_catalog(&invalid_version.to_string())
            .expect_err("invalid versions should fail")
            .contains("invalid capability version"));
    }
}
