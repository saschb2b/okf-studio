use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::Manager;

#[path = "../../../capability_digest.rs"]
mod capability_digest;
use capability_digest::sha256_resource;

const MANIFEST: &str = include_str!("../../../../.agents/skills/okf/capabilities.json");
const PACK_MANIFEST: &str = include_str!("../../../../.agents/skills/okf/pack.json");
const ARTIFACT_SCHEMA: &str =
    include_str!("../../../../.agents/skills/okf/schemas/okf-artifact-v1.schema.json");
const WRITING_REVISION_SCHEMA: &str =
    include_str!("../../../../.agents/skills/okf/schemas/writing-revision-v1.schema.json");
const OKF_SKILL: &str = include_str!("../../../../.agents/skills/okf/SKILL.md");
const OKF_SPEC: &str = include_str!("../../../../.agents/skills/okf/spec.md");
const OKF_COMMANDS: &str = include_str!("../../../../.agents/skills/okf/commands.md");
const OKF_TEMPLATES: &str = include_str!("../../../../.agents/skills/okf/templates.md");
const CAPABILITY_CHANGELOG: &str =
    include_str!("../../../../.agents/skills/okf/capabilities/CHANGELOG.md");
const OKF_WRITING: &str = include_str!("../../../../.agents/skills/okf/writing.md");
const OKF_INSPECT: &str = include_str!("../../../../.agents/skills/okf/capabilities/inspect.md");
const OKF_RETRIEVE: &str = include_str!("../../../../.agents/skills/okf/capabilities/retrieve.md");
const OKF_CREATE: &str = include_str!("../../../../.agents/skills/okf/capabilities/create.md");
const OKF_ENRICH: &str = include_str!("../../../../.agents/skills/okf/capabilities/enrich.md");
const OKF_AUDIT: &str = include_str!("../../../../.agents/skills/okf/capabilities/audit.md");
const OKF_REPAIR: &str = include_str!("../../../../.agents/skills/okf/capabilities/repair.md");
const OKF_RESEARCH: &str = include_str!("../../../../.agents/skills/okf/capabilities/research.md");
const OKF_CHANGE_IMPACT: &str =
    include_str!("../../../../.agents/skills/okf/capabilities/change-impact.md");
const OKF_MIGRATE: &str = include_str!("../../../../.agents/skills/okf/capabilities/migrate.md");
const OKF_AUTHOR: &str = include_str!("../../../../.agents/skills/okf/capabilities/author.md");
const OKF_REVISE: &str = include_str!("../../../../.agents/skills/okf/capabilities/revise.md");
const MAX_CAPABILITIES: usize = 32;
const MAX_RESOURCES_PER_CAPABILITY: usize = 16;
const MAX_RESOURCE_BYTES: usize = 256 * 1024;
const MAX_TOTAL_RESOURCE_BYTES: usize = 768 * 1024;
const DEFAULT_CAPABILITY_ID: &str = "okf-core";
const PACK_STATE_SCHEMA_VERSION: u32 = 1;
const PACK_STATE_FILE: &str = "capability-pack-state.json";
const PACK_STATE_BACKUP_FILE: &str = "capability-pack-state.previous.json";
const ALLOWED_TOOL_IDS: [&str; 19] = [
    "okf_capability_catalog",
    "okf_capability_resource",
    "okf_inventory",
    "okf_read",
    "okf_search",
    "okf_retrieve",
    "okf_sources",
    "okf_traverse",
    "okf_validate",
    "okf_health_summary",
    "okf_health_finding",
    "okf_health_affected",
    "okf_health_repair",
    "studio_source_inventory",
    "studio_source_read",
    "studio_stage_inventory",
    "studio_stage_read",
    "studio_stage_propose",
    "studio_stage_validate",
];
const ALLOWED_ARTIFACT_KINDS: [&str; 8] = [
    "bundle-plan",
    "change-impact-map",
    "health-report",
    "migration-plan",
    "research-brief",
    "source-inventory",
    "writing-revision",
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
    pub pack: CapabilityPackInfo,
    pub capabilities: Vec<CapabilityDefinition>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CapabilityPackManifest {
    schema_version: u32,
    id: String,
    version: String,
    name: String,
    description: String,
    publisher: String,
    provenance: CapabilityPackProvenance,
    compatibility: CapabilityPackCompatibility,
    conflicts: Vec<String>,
    capability_manifest: PackResourceDefinition,
    templates: Vec<PackResourceDefinition>,
    artifact_schemas: Vec<PackResourceDefinition>,
    required_studio_tools: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CapabilityPackProvenance {
    BuiltIn,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CapabilityPackCompatibility {
    minimum_studio_version: String,
    capability_schema_version: u32,
    artifact_schema_version: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackResourceDefinition {
    id: Option<String>,
    path: String,
    media_type: String,
    sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CapabilityPackInfo {
    pub id: String,
    pub version: String,
    pub name: String,
    pub description: String,
    pub publisher: String,
    pub provenance: CapabilityPackProvenance,
    pub manifest_sha256: String,
    pub compatibility: CapabilityPackCompatibility,
    pub conflicts: Vec<String>,
    pub required_studio_tools: Vec<String>,
    pub template_ids: Vec<String>,
    pub artifact_schema_ids: Vec<String>,
    pub active: bool,
    pub rollback_label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CapabilityPackState {
    schema_version: u32,
    active: bool,
    pack_id: String,
    pack_version: String,
    manifest_sha256: String,
    rollback_label: String,
    previous_manifest_sha256: Option<String>,
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
static LEGACY_CATALOG: OnceLock<CapabilityCatalog> = OnceLock::new();
static PACK: OnceLock<CapabilityPackManifest> = OnceLock::new();
static PACK_ACTIVE: AtomicBool = AtomicBool::new(true);

pub(crate) fn catalog() -> &'static CapabilityCatalog {
    if !PACK_ACTIVE.load(Ordering::Acquire) {
        return legacy_catalog();
    }
    CATALOG.get_or_init(|| {
        parse_catalog(MANIFEST).unwrap_or_else(|error| {
            panic!("the build-verified OKF capability manifest is invalid at runtime: {error}")
        })
    })
}

fn full_catalog() -> &'static CapabilityCatalog {
    CATALOG.get_or_init(|| {
        parse_catalog(MANIFEST).unwrap_or_else(|error| {
            panic!("the build-verified OKF capability manifest is invalid at runtime: {error}")
        })
    })
}

fn legacy_catalog() -> &'static CapabilityCatalog {
    LEGACY_CATALOG.get_or_init(|| {
        let mut legacy = full_catalog().clone();
        legacy
            .capabilities
            .retain(|capability| capability.id == DEFAULT_CAPABILITY_ID);
        legacy
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
        pack: pack_info(),
        capabilities: catalog.capabilities.clone(),
    }
}

pub(crate) fn load_pack_state(app: &tauri::AppHandle) -> Result<(), String> {
    let path = pack_state_path(app)?;
    let state = load_or_migrate_pack_state(&path)?;
    PACK_ACTIVE.store(state.active, Ordering::Release);
    Ok(())
}

pub(crate) fn set_pack_active(
    app: &tauri::AppHandle,
    active: bool,
) -> Result<CapabilityCatalogInfo, String> {
    let path = pack_state_path(app)?;
    let mut state = load_or_migrate_pack_state(&path)?;
    state.active = active;
    persist_pack_state(&path, &state)?;
    PACK_ACTIVE.store(active, Ordering::Release);
    Ok(catalog_info())
}

fn pack_info() -> CapabilityPackInfo {
    let pack = pack();
    CapabilityPackInfo {
        id: pack.id.clone(),
        version: pack.version.clone(),
        name: pack.name.clone(),
        description: pack.description.clone(),
        publisher: pack.publisher.clone(),
        provenance: pack.provenance,
        manifest_sha256: env!("OKF_CAPABILITY_PACK_SHA256").to_string(),
        compatibility: pack.compatibility.clone(),
        conflicts: pack.conflicts.clone(),
        required_studio_tools: pack.required_studio_tools.clone(),
        template_ids: pack
            .templates
            .iter()
            .filter_map(|resource| resource.id.clone())
            .collect(),
        artifact_schema_ids: pack
            .artifact_schemas
            .iter()
            .filter_map(|resource| resource.id.clone())
            .collect(),
        active: PACK_ACTIVE.load(Ordering::Acquire),
        rollback_label: format!("Legacy {}", default_capability().version),
    }
}

fn pack() -> &'static CapabilityPackManifest {
    PACK.get_or_init(|| {
        validate_pack(PACK_MANIFEST, full_catalog()).unwrap_or_else(|error| {
            panic!("the build-verified OKF capability pack is invalid at runtime: {error}")
        })
    })
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

fn validate_pack(
    input: &str,
    capability_catalog: &CapabilityCatalog,
) -> Result<CapabilityPackManifest, String> {
    let pack: CapabilityPackManifest =
        serde_json::from_str(input).map_err(|error| format!("invalid pack JSON: {error}"))?;
    if pack.schema_version != 1 {
        return Err("unsupported capability pack schema version".to_string());
    }
    validate_identifier(&pack.id, "pack ID")?;
    validate_version(&pack.version)?;
    validate_version(&pack.compatibility.minimum_studio_version)?;
    if version_tuple(&pack.compatibility.minimum_studio_version)?
        > version_tuple(env!("CARGO_PKG_VERSION"))?
    {
        return Err("capability pack requires a newer Studio version".to_string());
    }
    if pack.compatibility.capability_schema_version != capability_catalog.schema_version
        || pack.compatibility.artifact_schema_version != 1
    {
        return Err("capability pack schema compatibility does not match Studio".to_string());
    }
    for (label, value) in [
        ("pack name", pack.name.as_str()),
        ("pack description", pack.description.as_str()),
        ("pack publisher", pack.publisher.as_str()),
    ] {
        if value.trim().is_empty() || value.chars().count() > 512 {
            return Err(format!("invalid {label}"));
        }
    }

    let mut conflicts = HashSet::new();
    if pack.conflicts.len() > 16 {
        return Err("capability pack conflict list is too large".to_string());
    }
    for conflict in &pack.conflicts {
        validate_identifier(conflict, "conflicting pack ID")?;
        if conflict == &pack.id || !conflicts.insert(conflict) {
            return Err("capability pack conflicts must be unique and external".to_string());
        }
    }

    validate_pack_resource(
        &pack.capability_manifest,
        "capabilities.json",
        "application/json",
        MANIFEST,
    )?;
    if pack.templates.is_empty() || pack.artifact_schemas.is_empty() {
        return Err("capability pack requires templates and artifact schemas".to_string());
    }
    let mut resource_ids = HashSet::new();
    for resource in pack.templates.iter().chain(&pack.artifact_schemas) {
        let id = resource
            .id
            .as_deref()
            .ok_or_else(|| "pack resources require IDs".to_string())?;
        validate_identifier(id, "pack resource ID")?;
        if !resource_ids.insert(id) {
            return Err(format!("duplicate pack resource ID: {id}"));
        }
        let contents = pack_resource_contents(&resource.path)
            .ok_or_else(|| format!("unknown declarative pack resource: {}", resource.path))?;
        if !matches!(
            resource.media_type.as_str(),
            "text/markdown" | "application/schema+json"
        ) {
            return Err(format!(
                "pack resource {} has an unsupported media type",
                resource.path
            ));
        }
        validate_digest(
            &resource.sha256,
            contents.as_bytes(),
            &resource.media_type,
            &resource.path,
        )?;
    }

    validate_unique_declared_values(
        &pack.required_studio_tools,
        &ALLOWED_TOOL_IDS,
        "pack Studio tool",
    )?;
    let pack_tools = pack.required_studio_tools.iter().collect::<HashSet<_>>();
    if capability_catalog
        .capabilities
        .iter()
        .flat_map(|capability| &capability.required_tools)
        .any(|tool| !pack_tools.contains(tool))
    {
        return Err("capability pack omits a tool required by one of its skills".to_string());
    }
    Ok(pack)
}

fn validate_pack_resource(
    resource: &PackResourceDefinition,
    expected_path: &str,
    expected_media_type: &str,
    contents: &str,
) -> Result<(), String> {
    if resource.id.is_some()
        || resource.path != expected_path
        || resource.media_type != expected_media_type
    {
        return Err(
            "capability manifest reference is not the closed built-in resource".to_string(),
        );
    }
    validate_digest(
        &resource.sha256,
        contents.as_bytes(),
        expected_media_type,
        expected_path,
    )
}

fn validate_digest(
    expected: &str,
    bytes: &[u8],
    media_type: &str,
    label: &str,
) -> Result<(), String> {
    if expected.len() != 64
        || !expected
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        || sha256_resource(bytes, media_type) != expected
    {
        return Err(format!("capability pack resource digest changed: {label}"));
    }
    Ok(())
}

fn pack_resource_contents(path: &str) -> Option<&'static str> {
    match path {
        "templates.md" => Some(OKF_TEMPLATES),
        "schemas/okf-artifact-v1.schema.json" => Some(ARTIFACT_SCHEMA),
        "schemas/writing-revision-v1.schema.json" => Some(WRITING_REVISION_SCHEMA),
        _ => None,
    }
}

fn version_tuple(version: &str) -> Result<(u32, u32, u32), String> {
    validate_version(version)?;
    let mut parts = version.split('.');
    let parse = |value: Option<&str>| {
        value
            .and_then(|part| part.parse::<u32>().ok())
            .ok_or_else(|| format!("invalid capability version: {version}"))
    };
    Ok((
        parse(parts.next())?,
        parse(parts.next())?,
        parse(parts.next())?,
    ))
}

fn pack_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|root| root.join("agents").join(PACK_STATE_FILE))
        .map_err(|_| "Studio could not resolve capability pack storage.".to_string())
}

fn default_pack_state(previous_manifest_sha256: Option<String>) -> CapabilityPackState {
    let pack = pack();
    CapabilityPackState {
        schema_version: PACK_STATE_SCHEMA_VERSION,
        active: true,
        pack_id: pack.id.clone(),
        pack_version: pack.version.clone(),
        manifest_sha256: env!("OKF_CAPABILITY_PACK_SHA256").to_string(),
        rollback_label: format!("Legacy {}", full_catalog().capabilities[0].version),
        previous_manifest_sha256,
    }
}

fn load_or_migrate_pack_state(path: &Path) -> Result<CapabilityPackState, String> {
    recover_pack_state(path)?;
    let current_digest = env!("OKF_CAPABILITY_PACK_SHA256").to_string();
    let mut state = if path.exists() {
        let body = std::fs::read(path)
            .map_err(|_| "Studio could not read capability pack state.".to_string())?;
        if body.len() > 64 * 1024 {
            quarantine_pack_state(path)?;
            default_pack_state(None)
        } else {
            match serde_json::from_slice::<CapabilityPackState>(&body) {
                Ok(candidate)
                    if candidate.schema_version == PACK_STATE_SCHEMA_VERSION
                        && !candidate.pack_id.is_empty()
                        && !candidate.pack_version.is_empty()
                        && candidate.manifest_sha256.len() == 64 =>
                {
                    candidate
                }
                _ => {
                    quarantine_pack_state(path)?;
                    default_pack_state(None)
                }
            }
        }
    } else {
        default_pack_state(None)
    };

    if state.pack_id != pack().id
        || state.pack_version != pack().version
        || state.manifest_sha256 != current_digest
    {
        let active = state.active;
        state = default_pack_state(Some(state.manifest_sha256));
        state.active = active;
    }
    persist_pack_state(path, &state)?;
    Ok(state)
}

fn persist_pack_state(path: &Path, state: &CapabilityPackState) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Capability pack storage path is invalid.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|_| "Studio could not prepare capability pack storage.".to_string())?;
    let temporary = parent.join(format!(".{PACK_STATE_FILE}.{}.tmp", uuid::Uuid::new_v4()));
    let body = serde_json::to_vec_pretty(state)
        .map_err(|_| "Studio could not encode capability pack state.".to_string())?;
    let mut output = std::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|_| "Studio could not create capability pack state.".to_string())?;
    output
        .write_all(&body)
        .and_then(|_| output.sync_all())
        .map_err(|_| "Studio could not save capability pack state.".to_string())?;
    drop(output);

    let backup = parent.join(PACK_STATE_BACKUP_FILE);
    if backup.exists() {
        std::fs::remove_file(&backup).map_err(|_| {
            "Studio could not clear stale capability pack recovery state.".to_string()
        })?;
    }
    if path.exists() {
        std::fs::rename(path, &backup).map_err(|_| {
            "Studio could not prepare capability pack state replacement.".to_string()
        })?;
    }
    if std::fs::rename(&temporary, path).is_err() {
        let _ = std::fs::remove_file(&temporary);
        if backup.exists() {
            let _ = std::fs::rename(&backup, path);
        }
        return Err("Studio could not publish capability pack state.".to_string());
    }
    if backup.exists() {
        std::fs::remove_file(backup).map_err(|_| {
            "Studio could not finish capability pack state replacement.".to_string()
        })?;
    }
    Ok(())
}

fn recover_pack_state(path: &Path) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Err("Capability pack storage path is invalid.".to_string());
    };
    let backup = parent.join(PACK_STATE_BACKUP_FILE);
    if !path.exists() && backup.exists() {
        std::fs::rename(backup, path)
            .map_err(|_| "Studio could not recover capability pack state.".to_string())?;
    }
    Ok(())
}

fn quarantine_pack_state(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Capability pack storage path is invalid.".to_string())?;
    let quarantine = parent.join(format!(
        "capability-pack-state.invalid-{}.json",
        uuid::Uuid::new_v4()
    ));
    std::fs::rename(path, quarantine)
        .map_err(|_| "Studio could not quarantine invalid capability pack state.".to_string())
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
            if sha256_resource(contents.as_bytes(), &resource.media_type) != resource.sha256 {
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
        "writing.md" => Some(OKF_WRITING),
        "capabilities/inspect.md" => Some(OKF_INSPECT),
        "capabilities/retrieve.md" => Some(OKF_RETRIEVE),
        "capabilities/create.md" => Some(OKF_CREATE),
        "capabilities/enrich.md" => Some(OKF_ENRICH),
        "capabilities/audit.md" => Some(OKF_AUDIT),
        "capabilities/repair.md" => Some(OKF_REPAIR),
        "capabilities/research.md" => Some(OKF_RESEARCH),
        "capabilities/change-impact.md" => Some(OKF_CHANGE_IMPACT),
        "capabilities/migrate.md" => Some(OKF_MIGRATE),
        "capabilities/author.md" => Some(OKF_AUTHOR),
        "capabilities/revise.md" => Some(OKF_REVISE),
        _ => None,
    }
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
        assert_eq!(catalog.capabilities.len(), 12);

        let capability = default_capability();
        assert_eq!(capability.id, "okf-core");
        assert_eq!(capability.version, "0.5.1");
        assert_eq!(capability.resources.len(), 6);
        assert_eq!(manifest_sha256().len(), 64);
        for (capability_id, expected_version) in [
            ("okf-inspect", "0.3.0"),
            ("okf-retrieve", "0.1.1"),
            ("okf-create", "0.3.0"),
            ("okf-enrich", "0.2.0"),
            ("okf-audit", "0.3.0"),
            ("okf-repair", "0.3.0"),
            ("okf-research", "0.3.0"),
            ("okf-change-impact", "0.3.0"),
            ("okf-migrate", "0.2.0"),
            ("okf-author", "0.1.0"),
            ("okf-revise", "0.1.0"),
        ] {
            let capability = catalog
                .capabilities
                .iter()
                .find(|candidate| candidate.id == capability_id)
                .expect("curated capability should be present");
            assert_eq!(capability.version, expected_version);
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
        assert_eq!(commands.capability_version, "0.5.1");
        assert_eq!(commands.resource_id, "commands");
        assert_eq!(commands.media_type, "text/markdown");
        assert_eq!(commands.sha256.len(), 64);
        assert_eq!(
            commands.uri,
            "okf-studio://capability/okf-core/v0.5.1/commands"
        );
        assert!(commands.contents.contains("## `init`"));
        assert!(resource("okf-core", "secrets").is_err());
        assert!(resource("unknown", "commands").is_err());
    }

    #[test]
    fn exposes_metadata_without_resource_bodies_for_settings() {
        let info = serde_json::to_value(catalog_info()).expect("serialize catalog metadata");
        assert_eq!(info["capabilities"].as_array().map(Vec::len), Some(12));
        assert_eq!(info["manifestSha256"].as_str().map(str::len), Some(64));
        assert_eq!(info["pack"]["id"], "okf-foundation");
        assert_eq!(info["pack"]["provenance"], "built-in");
        assert_eq!(
            info["pack"]["artifactSchemaIds"],
            serde_json::json!(["okf-artifact-v1", "writing-revision-v1"])
        );
        assert_eq!(
            info["capabilities"][1]["resources"][0]["path"],
            "capabilities/inspect.md"
        );
        assert!(!info.to_string().contains("## Trigger"));
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

    #[test]
    fn pack_rejects_executable_surfaces_conflicts_and_digest_drift() {
        let catalog = full_catalog();

        let mut executable: serde_json::Value =
            serde_json::from_str(PACK_MANIFEST).expect("pack manifest JSON");
        executable["scripts"] = serde_json::json!(["install.sh"]);
        assert!(validate_pack(&executable.to_string(), catalog)
            .expect_err("scripts must not enter the declarative pack schema")
            .contains("unknown field"));

        let mut conflict: serde_json::Value =
            serde_json::from_str(PACK_MANIFEST).expect("pack manifest JSON");
        conflict["conflicts"] = serde_json::json!(["okf-foundation"]);
        assert!(validate_pack(&conflict.to_string(), catalog)
            .expect_err("a pack cannot conflict with itself")
            .contains("conflicts must be unique and external"));

        let mut drift: serde_json::Value =
            serde_json::from_str(PACK_MANIFEST).expect("pack manifest JSON");
        drift["artifactSchemas"][0]["sha256"] = serde_json::json!("0".repeat(64));
        assert!(validate_pack(&drift.to_string(), catalog)
            .expect_err("resource drift must fail before activation")
            .contains("resource digest changed"));
    }

    #[test]
    fn migrates_updates_and_rolls_back_without_touching_other_agent_state() {
        let root = std::env::temp_dir().join(format!(
            "okf-capability-pack-state-test-{}",
            uuid::Uuid::new_v4()
        ));
        let agents = root.join("agents");
        std::fs::create_dir_all(&agents).expect("create agent state fixture");
        let sentinels = [
            "custom-agents.json",
            "local-models.json",
            "sessions.json",
            "checkpoint.json",
            "bundle-grants.json",
        ];
        for sentinel in sentinels {
            std::fs::write(agents.join(sentinel), b"preserve-me").expect("write sentinel");
        }

        let state_path = agents.join(PACK_STATE_FILE);
        let migrated = load_or_migrate_pack_state(&state_path).expect("migrate legacy state");
        assert!(migrated.active);
        assert_eq!(migrated.pack_id, "okf-foundation");

        let mut prior = migrated.clone();
        prior.manifest_sha256 = "0".repeat(64);
        prior.active = false;
        persist_pack_state(&state_path, &prior).expect("save prior receipt");
        let updated = load_or_migrate_pack_state(&state_path).expect("activate verified update");
        assert_eq!(updated.previous_manifest_sha256, Some("0".repeat(64)));
        assert!(
            !updated.active,
            "an update must preserve an explicit rollback"
        );

        let mut rolled_back = updated;
        rolled_back.active = true;
        persist_pack_state(&state_path, &rolled_back).expect("restore pack");
        assert!(
            load_or_migrate_pack_state(&state_path)
                .expect("load restored pack")
                .active
        );
        let backup = agents.join(PACK_STATE_BACKUP_FILE);
        std::fs::rename(&state_path, &backup).expect("simulate interrupted replacement");
        assert!(
            load_or_migrate_pack_state(&state_path)
                .expect("recover interrupted replacement")
                .active
        );
        for sentinel in sentinels {
            assert_eq!(
                std::fs::read(agents.join(sentinel)).expect("read sentinel"),
                b"preserve-me"
            );
        }
        std::fs::remove_dir_all(root).expect("remove state fixture");
    }
}
