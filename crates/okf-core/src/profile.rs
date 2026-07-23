//! Local-only advisory profile resolution and diagnostics.
//!
//! Profiles extend authoring guidance without changing OKF conformance. A
//! bundle declares exact versions in root frontmatter and points to JSON
//! descriptors inside the bundle. Resolution never scans the network, executes
//! descriptor content, or mutates the bundle.

use crate::{Bundle, Concept};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path};

const MAX_PROFILES: usize = 16;
const MAX_DESCRIPTOR_BYTES: u64 = 256 * 1024;
const MAX_FIELDS: usize = 128;
const MAX_RELATIONSHIPS: usize = 128;
const MAX_CHECKS: usize = 256;
const MAX_STRING_CHARS: usize = 512;
const MAX_TYPED_RELATIONSHIPS: usize = 4096;
const MAX_TYPED_RELATIONSHIPS_PER_CONCEPT: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileReport {
    pub schema_version: u8,
    pub profiles: Vec<ProfileResolution>,
    pub diagnostics: Vec<ProfileDiagnostic>,
    pub edges: Vec<ProfileRelationshipEdge>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileResolution {
    pub namespace: String,
    pub version: Option<String>,
    pub descriptor_path: Option<String>,
    pub status: ProfileStatus,
    pub message: String,
    pub descriptor: Option<ProfileDescriptor>,
    /// Declaration values Studio does not interpret. They remain visible and
    /// round-trip through the bundle's root extension map.
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProfileStatus {
    Active,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDescriptor {
    pub schema_version: u8,
    pub namespace: String,
    pub version: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub fields: Vec<ProfileField>,
    #[serde(default)]
    pub relationships: Vec<ProfileRelationship>,
    #[serde(default)]
    pub checks: Vec<ProfileCheck>,
    /// Unknown descriptor keys are retained for inspection but have no
    /// behavior. Only the closed typed fields above influence diagnostics.
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileField {
    pub id: String,
    pub scope: ProfileScope,
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
    pub value_type: ProfileValueType,
    pub expectation: ProfileExpectation,
    #[serde(default)]
    pub concept_types: Vec<String>,
    #[serde(default)]
    pub examples: Vec<Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileScope {
    Bundle,
    Concept,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileValueType {
    String,
    Number,
    Boolean,
    Array,
    Object,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileExpectation {
    Recommended,
    Required,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRelationship {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub inverse: Option<String>,
    #[serde(default)]
    pub description: String,
}

/// One `relationships.<namespace>.<type>` annotation over an ordinary
/// Markdown link.
///
/// An annotation never creates a core OKF edge. `portable_link` records
/// whether the same source-target connection exists in the concept body.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileRelationshipEdge {
    pub source_id: String,
    pub target_id: String,
    pub namespace: String,
    #[serde(rename = "type")]
    pub relationship_type: String,
    pub label: String,
    pub inverse: Option<String>,
    pub recognized: bool,
    pub target_exists: bool,
    pub portable_link: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ProfileCheck {
    #[serde(rename = "field-present")]
    FieldPresent {
        id: String,
        scope: ProfileScope,
        field: String,
        level: ProfileDiagnosticLevel,
        message: String,
        #[serde(default)]
        concept_types: Vec<String>,
    },
    #[serde(rename = "field-one-of")]
    FieldOneOf {
        id: String,
        scope: ProfileScope,
        field: String,
        values: Vec<Value>,
        level: ProfileDiagnosticLevel,
        message: String,
        #[serde(default)]
        concept_types: Vec<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileDiagnosticLevel {
    Information,
    Recommendation,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDiagnostic {
    pub namespace: String,
    pub rule_id: String,
    pub level: ProfileDiagnosticLevel,
    pub scope: ProfileScope,
    pub file: String,
    pub concept_id: Option<String>,
    pub field: String,
    pub message: String,
}

/// Resolve and evaluate every profile declared in `bundle.extra["profiles"]`.
///
/// The returned diagnostics are deliberately separate from `Bundle::issues`;
/// they cannot make a bundle fail core OKF validation.
pub fn analyze(root: &Path, bundle: &Bundle) -> ProfileReport {
    let Some(declarations) = bundle.extra.get("profiles") else {
        let (edges, diagnostics, truncated) = evaluate_relationships(&[], bundle);
        return ProfileReport {
            schema_version: 1,
            profiles: Vec::new(),
            diagnostics,
            edges,
            truncated,
        };
    };
    let Some(declarations) = declarations.as_object() else {
        let profiles = vec![unavailable(
            "profiles",
            None,
            None,
            "The root profiles value must be a namespaced map.",
            BTreeMap::new(),
        )];
        let (edges, diagnostics, truncated) = evaluate_relationships(&profiles, bundle);
        return ProfileReport {
            schema_version: 1,
            profiles,
            diagnostics,
            edges,
            truncated,
        };
    };

    let mut profiles = Vec::new();
    let mut diagnostics = Vec::new();
    let mut truncated = false;
    for (index, (namespace, value)) in declarations.iter().enumerate() {
        if index >= MAX_PROFILES {
            truncated = true;
            break;
        }
        let resolution = resolve_one(root, namespace, value);
        if let Some(descriptor) = &resolution.descriptor {
            diagnostics.extend(evaluate(namespace, descriptor, bundle));
        }
        profiles.push(resolution);
    }

    let (edges, relationship_diagnostics, relationships_truncated) =
        evaluate_relationships(&profiles, bundle);
    diagnostics.extend(relationship_diagnostics);
    ProfileReport {
        schema_version: 1,
        profiles,
        diagnostics,
        edges,
        truncated: truncated || relationships_truncated,
    }
}

/// Re-run the active descriptors from an existing report against another
/// parsed bundle tree. Resolution identity and unavailable states are retained;
/// only deterministic diagnostics are recomputed.
pub fn reevaluate(report: &ProfileReport, bundle: &Bundle) -> ProfileReport {
    let mut diagnostics = Vec::new();
    for profile in &report.profiles {
        if let Some(descriptor) = &profile.descriptor {
            diagnostics.extend(evaluate(&profile.namespace, descriptor, bundle));
        }
    }
    let (edges, relationship_diagnostics, relationships_truncated) =
        evaluate_relationships(&report.profiles, bundle);
    diagnostics.extend(relationship_diagnostics);
    ProfileReport {
        schema_version: report.schema_version,
        profiles: report.profiles.clone(),
        diagnostics,
        edges,
        truncated: report.truncated || relationships_truncated,
    }
}

fn evaluate_relationships(
    profiles: &[ProfileResolution],
    bundle: &Bundle,
) -> (Vec<ProfileRelationshipEdge>, Vec<ProfileDiagnostic>, bool) {
    let vocabulary: BTreeMap<(&str, &str), &ProfileRelationship> = profiles
        .iter()
        .filter_map(|profile| {
            profile
                .descriptor
                .as_ref()
                .map(|descriptor| (profile.namespace.as_str(), descriptor))
        })
        .flat_map(|(namespace, descriptor)| {
            descriptor
                .relationships
                .iter()
                .map(move |relationship| ((namespace, relationship.id.as_str()), relationship))
        })
        .collect();
    let active_namespaces: BTreeSet<&str> = profiles
        .iter()
        .filter(|profile| profile.status == ProfileStatus::Active)
        .map(|profile| profile.namespace.as_str())
        .collect();
    let concept_ids: BTreeSet<&str> = bundle
        .concepts
        .iter()
        .map(|concept| concept.id.as_str())
        .collect();
    let mut edges = Vec::new();
    let mut diagnostics = Vec::new();
    let mut seen = BTreeSet::new();
    let mut truncated = false;

    for concept in &bundle.concepts {
        let Some(raw) = concept.extra.get("relationships") else {
            continue;
        };
        let Some(namespaces) = raw.as_object() else {
            diagnostics.push(relationship_diagnostic(
                concept,
                "relationships",
                "relationship-record",
                ProfileDiagnosticLevel::Warning,
                "Typed relationships must map profile namespaces to relationship types and targets.",
            ));
            continue;
        };
        let mut concept_edge_count = 0;
        'namespace: for (namespace, relationships) in namespaces {
            let field = format!("relationships.{namespace}");
            if !valid_namespace(namespace) {
                diagnostics.push(relationship_diagnostic(
                    concept,
                    &field,
                    "relationship-record",
                    ProfileDiagnosticLevel::Warning,
                    "This typed relationship has an invalid profile namespace.",
                ));
                continue;
            }
            let Some(relationships) = relationships.as_object() else {
                diagnostics.push(relationship_diagnostic(
                    concept,
                    &field,
                    "relationship-record",
                    ProfileDiagnosticLevel::Warning,
                    "A relationship profile entry must map types to concept targets.",
                ));
                continue;
            };
            for (relationship_type, targets) in relationships {
                let field = format!("relationships.{namespace}.{relationship_type}");
                if !valid_id(relationship_type) {
                    diagnostics.push(relationship_diagnostic(
                        concept,
                        &field,
                        "relationship-record",
                        ProfileDiagnosticLevel::Warning,
                        "This relationship type is not a bounded portable identifier.",
                    ));
                    continue;
                }
                let targets: Vec<&str> = match targets {
                    Value::String(target) => vec![target],
                    Value::Array(targets) => {
                        let Some(targets) = targets
                            .iter()
                            .map(Value::as_str)
                            .collect::<Option<Vec<_>>>()
                        else {
                            diagnostics.push(relationship_diagnostic(
                                concept,
                                &field,
                                "relationship-record",
                                ProfileDiagnosticLevel::Warning,
                                "Relationship targets must be concept ID strings.",
                            ));
                            continue;
                        };
                        targets
                    }
                    _ => {
                        diagnostics.push(relationship_diagnostic(
                            concept,
                            &field,
                            "relationship-record",
                            ProfileDiagnosticLevel::Warning,
                            "Relationship targets must be one concept ID or an array of IDs.",
                        ));
                        continue;
                    }
                };
                for target in targets {
                    if concept_edge_count >= MAX_TYPED_RELATIONSHIPS_PER_CONCEPT
                        || edges.len() >= MAX_TYPED_RELATIONSHIPS
                    {
                        truncated = true;
                        break 'namespace;
                    }
                    concept_edge_count += 1;
                    if !valid_concept_id(target) {
                        diagnostics.push(relationship_diagnostic(
                            concept,
                            &field,
                            "relationship-record",
                            ProfileDiagnosticLevel::Warning,
                            "This typed relationship has an invalid concept target.",
                        ));
                        continue;
                    }
                    let identity = (
                        concept.id.clone(),
                        namespace.clone(),
                        relationship_type.clone(),
                        target.to_string(),
                    );
                    if !seen.insert(identity) {
                        diagnostics.push(relationship_diagnostic(
                            concept,
                            &field,
                            "relationship-duplicate",
                            ProfileDiagnosticLevel::Information,
                            "This typed relationship duplicates an earlier annotation.",
                        ));
                        continue;
                    }

                    let definition =
                        vocabulary.get(&(namespace.as_str(), relationship_type.as_str()));
                    let recognized = definition.is_some();
                    let target_exists = concept_ids.contains(target);
                    let portable_link = concept.links.iter().any(|link| link == target);
                    edges.push(ProfileRelationshipEdge {
                        source_id: concept.id.clone(),
                        target_id: target.to_string(),
                        namespace: namespace.clone(),
                        relationship_type: relationship_type.clone(),
                        label: definition
                            .map(|relationship| relationship.label.clone())
                            .unwrap_or_else(|| relationship_type.clone()),
                        inverse: definition.and_then(|relationship| relationship.inverse.clone()),
                        recognized,
                        target_exists,
                        portable_link,
                    });

                    if !active_namespaces.contains(namespace.as_str()) {
                        diagnostics.push(relationship_diagnostic(
                            concept,
                            &field,
                            "relationship-profile-unavailable",
                            ProfileDiagnosticLevel::Information,
                            "The relationship profile is not active; Studio preserved the annotation.",
                        ));
                    } else if !recognized {
                        diagnostics.push(relationship_diagnostic(
                            concept,
                            &field,
                            "relationship-type-unknown",
                            ProfileDiagnosticLevel::Information,
                            "The active profile does not define this relationship type.",
                        ));
                    }
                    if !target_exists {
                        diagnostics.push(relationship_diagnostic(
                            concept,
                            &field,
                            "relationship-target-missing",
                            ProfileDiagnosticLevel::Warning,
                            "The typed relationship target is not a concept in this bundle.",
                        ));
                    } else if !portable_link {
                        diagnostics.push(relationship_diagnostic(
                            concept,
                            &field,
                            "relationship-link-missing",
                            ProfileDiagnosticLevel::Warning,
                            "Add an ordinary Markdown link to keep this relationship portable.",
                        ));
                    }
                }
            }
        }
    }

    (edges, diagnostics, truncated)
}

fn relationship_diagnostic(
    concept: &Concept,
    field: &str,
    rule_id: &str,
    level: ProfileDiagnosticLevel,
    message: &str,
) -> ProfileDiagnostic {
    ProfileDiagnostic {
        namespace: "relationships".to_string(),
        rule_id: rule_id.to_string(),
        level,
        scope: ProfileScope::Concept,
        file: format!("{}.md", concept.id),
        concept_id: Some(concept.id.clone()),
        field: field.to_string(),
        message: message.to_string(),
    }
}

fn valid_concept_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && !value.contains('\\')
        && !value.ends_with(".md")
        && !value.chars().any(char::is_control)
        && value
            .split('/')
            .all(|segment| !segment.is_empty() && segment != "." && segment != "..")
        && Path::new(value)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn resolve_one(root: &Path, namespace: &str, value: &Value) -> ProfileResolution {
    let Some(declaration) = value.as_object() else {
        return unavailable(
            namespace,
            None,
            None,
            "The profile declaration must contain version and descriptor fields.",
            BTreeMap::new(),
        );
    };
    let version = string_value(declaration, "version");
    let descriptor_path = string_value(declaration, "descriptor");
    let extra = declaration
        .iter()
        .filter(|(key, _)| *key != "version" && *key != "descriptor")
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();

    if !valid_namespace(namespace) {
        return unavailable(
            namespace,
            version,
            descriptor_path,
            "The profile namespace must use dot-separated lowercase identifiers.",
            extra,
        );
    }
    let Some(version_value) = version.as_deref() else {
        return unavailable(
            namespace,
            version,
            descriptor_path,
            "The profile declaration must pin an exact semantic version.",
            extra,
        );
    };
    if !valid_version(version_value) {
        return unavailable(
            namespace,
            version,
            descriptor_path,
            "The profile version must be an exact semantic version such as 1.2.0.",
            extra,
        );
    }
    let Some(path_value) = descriptor_path.as_deref() else {
        return unavailable(
            namespace,
            version,
            descriptor_path,
            "The profile declaration must name a bundle-relative JSON descriptor.",
            extra,
        );
    };

    let descriptor = match read_descriptor(root, path_value) {
        Ok(descriptor) => descriptor,
        Err(message) => {
            return unavailable(namespace, version, descriptor_path, &message, extra);
        }
    };
    if descriptor.schema_version != 1 {
        return unavailable(
            namespace,
            version,
            descriptor_path,
            "Studio does not support this profile descriptor schema version.",
            extra,
        );
    }
    if descriptor.namespace != namespace || descriptor.version != version_value {
        return unavailable(
            namespace,
            version,
            descriptor_path,
            "The descriptor namespace and version must match the root declaration.",
            extra,
        );
    }
    if let Err(message) = validate_descriptor(&descriptor) {
        return unavailable(namespace, version, descriptor_path, &message, extra);
    }

    ProfileResolution {
        namespace: namespace.to_string(),
        version,
        descriptor_path,
        status: ProfileStatus::Active,
        message: "Resolved from a version-pinned descriptor inside this bundle.".to_string(),
        descriptor: Some(descriptor),
        extra,
    }
}

fn unavailable(
    namespace: &str,
    version: Option<String>,
    descriptor_path: Option<String>,
    message: &str,
    extra: BTreeMap<String, Value>,
) -> ProfileResolution {
    ProfileResolution {
        namespace: namespace.to_string(),
        version,
        descriptor_path,
        status: ProfileStatus::Unavailable,
        message: message.to_string(),
        descriptor: None,
        extra,
    }
}

fn string_value(map: &Map<String, Value>, key: &str) -> Option<String> {
    map.get(key)?.as_str().map(str::to_owned)
}

fn valid_namespace(value: &str) -> bool {
    value.len() <= 128
        && value.split('.').count() >= 2
        && value.split('.').all(|segment| {
            !segment.is_empty()
                && segment.len() <= 63
                && segment.chars().enumerate().all(|(index, character)| {
                    character.is_ascii_lowercase()
                        || character.is_ascii_digit() && index > 0
                        || character == '-' && index > 0
                })
                && !segment.ends_with('-')
        })
}

fn valid_version(value: &str) -> bool {
    value.len() <= 64 && semver::Version::parse(value).is_ok()
}

fn read_descriptor(root: &Path, relative: &str) -> Result<ProfileDescriptor, String> {
    if relative.len() > 512
        || relative.contains('\\')
        || Path::new(relative)
            .extension()
            .and_then(|value| value.to_str())
            != Some("json")
        || Path::new(relative)
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("The descriptor must be a portable bundle-relative .json path.".to_string());
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|_| "The bundle root is unavailable.".to_string())?;
    let candidate = root.join(relative);
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "The local profile descriptor is unavailable.".to_string())?;
    if !canonical.starts_with(&canonical_root) {
        return Err("The profile descriptor resolves outside the bundle.".to_string());
    }
    let metadata = fs::metadata(&canonical)
        .map_err(|_| "The local profile descriptor is unavailable.".to_string())?;
    if !metadata.is_file() {
        return Err("The profile descriptor is not a regular file.".to_string());
    }
    if metadata.len() > MAX_DESCRIPTOR_BYTES {
        return Err("The profile descriptor exceeds the 256 KiB limit.".to_string());
    }
    let bytes = fs::read(&canonical)
        .map_err(|_| "The local profile descriptor could not be read.".to_string())?;
    serde_json::from_slice(&bytes)
        .map_err(|_| "The local profile descriptor is not valid profile JSON.".to_string())
}

fn validate_descriptor(descriptor: &ProfileDescriptor) -> Result<(), String> {
    if descriptor.fields.len() > MAX_FIELDS
        || descriptor.relationships.len() > MAX_RELATIONSHIPS
        || descriptor.checks.len() > MAX_CHECKS
    {
        return Err("The profile descriptor exceeds Studio's item limits.".to_string());
    }
    if descriptor.title.trim().is_empty()
        || !bounded_string(&descriptor.title)
        || !bounded_string(&descriptor.description)
    {
        return Err(
            "The profile descriptor contains an oversized title or description.".to_string(),
        );
    }

    let mut ids = BTreeSet::new();
    for field in &descriptor.fields {
        if !valid_id(&field.id)
            || !valid_field_path(&field.key)
            || !bounded_string(&field.label)
            || !bounded_string(&field.description)
            || !ids.insert(format!("field:{}", field.id))
        {
            return Err(
                "The profile descriptor contains an invalid or duplicate field.".to_string(),
            );
        }
    }
    for relationship in &descriptor.relationships {
        if !valid_id(&relationship.id)
            || !bounded_string(&relationship.label)
            || !bounded_string(&relationship.description)
            || relationship
                .inverse
                .as_deref()
                .is_some_and(|value| !valid_id(value))
            || !ids.insert(format!("relationship:{}", relationship.id))
        {
            return Err(
                "The profile descriptor contains an invalid or duplicate relationship.".to_string(),
            );
        }
    }
    for check in &descriptor.checks {
        let (id, field, message, values) = match check {
            ProfileCheck::FieldPresent {
                id, field, message, ..
            } => (id, field, message, None),
            ProfileCheck::FieldOneOf {
                id,
                field,
                message,
                values,
                ..
            } => (id, field, message, Some(values)),
        };
        if !valid_id(id)
            || !valid_field_path(field)
            || !bounded_string(message)
            || values.is_some_and(|items| items.is_empty() || items.len() > 64)
            || !ids.insert(format!("check:{id}"))
        {
            return Err(
                "The profile descriptor contains an invalid or duplicate check.".to_string(),
            );
        }
    }
    Ok(())
}

fn bounded_string(value: &str) -> bool {
    value.chars().count() <= MAX_STRING_CHARS
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.chars().enumerate().all(|(index, character)| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit() && index > 0
                || matches!(character, '-' | '_' | '.') && index > 0
        })
}

fn valid_field_path(value: &str) -> bool {
    value.len() <= 256
        && value.split('.').all(|segment| {
            !segment.is_empty()
                && segment.chars().enumerate().all(|(index, character)| {
                    character.is_ascii_alphabetic()
                        || character.is_ascii_digit() && index > 0
                        || matches!(character, '-' | '_') && index > 0
                })
        })
}

fn evaluate(
    namespace: &str,
    descriptor: &ProfileDescriptor,
    bundle: &Bundle,
) -> Vec<ProfileDiagnostic> {
    let mut diagnostics = Vec::new();
    for check in &descriptor.checks {
        match check {
            ProfileCheck::FieldPresent {
                id,
                scope,
                field,
                level,
                message,
                concept_types,
            } => evaluate_check(
                &mut diagnostics,
                namespace,
                id,
                *scope,
                field,
                *level,
                message,
                concept_types,
                bundle,
                |value| value.is_some_and(non_empty),
            ),
            ProfileCheck::FieldOneOf {
                id,
                scope,
                field,
                values,
                level,
                message,
                concept_types,
            } => evaluate_check(
                &mut diagnostics,
                namespace,
                id,
                *scope,
                field,
                *level,
                message,
                concept_types,
                bundle,
                |value| value.is_some_and(|candidate| values.contains(candidate)),
            ),
        }
    }
    diagnostics
}

#[allow(clippy::too_many_arguments)]
fn evaluate_check(
    diagnostics: &mut Vec<ProfileDiagnostic>,
    namespace: &str,
    id: &str,
    scope: ProfileScope,
    field: &str,
    level: ProfileDiagnosticLevel,
    message: &str,
    concept_types: &[String],
    bundle: &Bundle,
    passes: impl Fn(Option<&Value>) -> bool,
) {
    match scope {
        ProfileScope::Bundle => {
            let value = value_at(&bundle.extra, field).cloned();
            if !passes(value.as_ref()) {
                diagnostics.push(ProfileDiagnostic {
                    namespace: namespace.to_string(),
                    rule_id: id.to_string(),
                    level,
                    scope,
                    file: "index.md".to_string(),
                    concept_id: None,
                    field: field.to_string(),
                    message: message.to_string(),
                });
            }
        }
        ProfileScope::Concept => {
            for concept in &bundle.concepts {
                if !concept_types.is_empty()
                    && !concept_types
                        .iter()
                        .any(|value| value == &concept.concept_type)
                {
                    continue;
                }
                let value = concept_value(concept, field);
                if !passes(value.as_ref()) {
                    diagnostics.push(ProfileDiagnostic {
                        namespace: namespace.to_string(),
                        rule_id: id.to_string(),
                        level,
                        scope,
                        file: format!("{}.md", concept.id),
                        concept_id: Some(concept.id.clone()),
                        field: field.to_string(),
                        message: message.to_string(),
                    });
                }
            }
        }
    }
}

fn concept_value(concept: &Concept, field: &str) -> Option<Value> {
    if field.contains('.') {
        return value_at(&concept.extra, field).cloned();
    }
    match field {
        "type" => Some(Value::String(concept.concept_type.clone())),
        "title" => Some(Value::String(concept.title.clone())),
        "description" => Some(Value::String(concept.description.clone())),
        "tags" => Some(Value::Array(
            concept.tags.iter().cloned().map(Value::String).collect(),
        )),
        "timestamp" => concept.timestamp.clone().map(Value::String),
        "resource" => concept.resource.clone().map(Value::String),
        _ => concept.extra.get(field).cloned(),
    }
}

fn value_at<'a>(root: &'a BTreeMap<String, Value>, path: &str) -> Option<&'a Value> {
    let mut segments = path.split('.');
    let mut value = root.get(segments.next()?)?;
    for segment in segments {
        value = value.as_object()?.get(segment)?;
    }
    Some(value)
}

fn non_empty(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(values) => !values.is_empty(),
        Value::Object(values) => !values.is_empty(),
        Value::Bool(_) | Value::Number(_) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::read_bundle;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempBundle {
        path: std::path::PathBuf,
    }

    impl TempBundle {
        fn new(index: &str, descriptor: Option<&str>) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("okf-profile-{nonce}"));
            fs::create_dir_all(path.join("profiles")).expect("fixture directory should be created");
            fs::write(path.join("index.md"), index).expect("fixture index should be written");
            fs::write(
                path.join("guide.md"),
                "---\ntype: Guide\ntitle: Guide\nowner: Docs\nlifecycle: draft\n---\n# Guide\n",
            )
            .expect("fixture concept should be written");
            if let Some(descriptor) = descriptor {
                fs::write(path.join("profiles/team.json"), descriptor)
                    .expect("fixture descriptor should be written");
            }
            Self { path }
        }
    }

    impl Drop for TempBundle {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn declaration(descriptor: &str) -> String {
        format!(
            "---\nokf_version: \"0.1\"\nprofiles:\n  com.example.knowledge:\n    version: \"1.2.0\"\n    descriptor: {descriptor}\n    producer_note: preserved\n---\n# Bundle\n"
        )
    }

    fn descriptor() -> &'static str {
        r#"{
  "schemaVersion": 1,
  "namespace": "com.example.knowledge",
  "version": "1.2.0",
  "title": "Team knowledge",
  "fields": [{
    "id": "owner",
    "scope": "concept",
    "key": "owner",
    "label": "Owner",
    "valueType": "string",
    "expectation": "recommended",
    "examples": ["Docs"]
  }],
  "relationships": [{
    "id": "supports",
    "label": "Supports",
    "inverse": "supported-by"
  }],
  "checks": [
    {
      "kind": "field-present",
      "id": "description-present",
      "scope": "concept",
      "field": "description",
      "level": "recommendation",
      "message": "Add a short description."
    },
    {
      "kind": "field-one-of",
      "id": "lifecycle-known",
      "scope": "concept",
      "field": "lifecycle",
      "values": ["active", "retired"],
      "level": "warning",
      "message": "Use a recognized lifecycle value."
    }
  ],
  "producerExtension": {"retained": true}
}"#
    }

    #[test]
    fn resolves_local_descriptor_and_keeps_advice_separate_from_conformance() {
        let fixture = TempBundle::new(&declaration("profiles/team.json"), Some(descriptor()));
        let bundle = read_bundle(&fixture.path);
        let core_issue_count = bundle.issues.len();
        let report = analyze(&fixture.path, &bundle);

        assert_eq!(report.profiles.len(), 1);
        assert_eq!(report.profiles[0].status, ProfileStatus::Active);
        assert_eq!(
            report.profiles[0].extra.get("producer_note"),
            Some(&Value::String("preserved".to_string()))
        );
        assert_eq!(
            report.profiles[0]
                .descriptor
                .as_ref()
                .and_then(|value| value.extra.get("producerExtension")),
            Some(&serde_json::json!({"retained": true}))
        );
        assert_eq!(report.diagnostics.len(), 2);
        assert_eq!(bundle.issues.len(), core_issue_count);
    }

    #[test]
    fn resolves_namespaced_relationship_annotations_over_portable_links() {
        let fixture = TempBundle::new(&declaration("profiles/team.json"), Some(descriptor()));
        fs::write(
            fixture.path.join("guide.md"),
            r#"---
type: Guide
title: Guide
relationships:
  com.example.knowledge:
    supports: [target, unlinked, missing, target]
    unknown-kind: target
    malformed:
      nested: value
  com.unknown.relationships:
    owns: target
---

# Guide

[Target](target.md)
"#,
        )
        .expect("relationship fixture");
        fs::write(
            fixture.path.join("target.md"),
            "---\ntype: Reference\n---\n\n# Target\n",
        )
        .expect("portable target");
        fs::write(
            fixture.path.join("unlinked.md"),
            "---\ntype: Reference\n---\n\n# Unlinked\n",
        )
        .expect("unlinked target");

        let bundle = read_bundle(&fixture.path);
        let core_issue_count = bundle.issues.len();
        let report = analyze(&fixture.path, &bundle);

        assert_eq!(report.edges.len(), 5);
        let recognized = &report.edges[0];
        assert_eq!(recognized.label, "Supports");
        assert_eq!(recognized.inverse.as_deref(), Some("supported-by"));
        assert!(recognized.recognized);
        assert!(recognized.target_exists);
        assert!(recognized.portable_link);
        assert!(report.edges.iter().any(|edge| {
            edge.relationship_type == "unknown-kind" && !edge.recognized
        }));
        assert!(report.edges.iter().any(|edge| {
            edge.target_id == "unlinked" && edge.target_exists && !edge.portable_link
        }));
        assert!(report.edges.iter().any(|edge| {
            edge.target_id == "missing" && !edge.target_exists && !edge.portable_link
        }));
        for rule in [
            "relationship-type-unknown",
            "relationship-profile-unavailable",
            "relationship-link-missing",
            "relationship-target-missing",
            "relationship-duplicate",
            "relationship-record",
        ] {
            assert!(
                report
                    .diagnostics
                    .iter()
                    .any(|diagnostic| diagnostic.rule_id == rule),
                "missing {rule}"
            );
        }
        assert_eq!(bundle.issues.len(), core_issue_count);
    }

    #[test]
    fn keeps_relationships_visible_when_their_profile_is_not_declared() {
        let fixture = TempBundle::new("---\nokf_version: \"0.1\"\n---\n# Bundle\n", None);
        fs::write(
            fixture.path.join("guide.md"),
            "---\ntype: Guide\nrelationships:\n  com.example.missing:\n    supports: guide\n---\n\n# Guide\n\n[Self](guide.md)\n",
        )
        .expect("unknown profile relationship");

        let report = analyze(&fixture.path, &read_bundle(&fixture.path));

        assert_eq!(report.edges.len(), 1);
        assert!(!report.edges[0].recognized);
        assert!(report.edges[0].portable_link);
        assert!(report
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.rule_id == "relationship-profile-unavailable"));
    }

    #[test]
    fn reports_missing_malformed_and_unpinned_profiles_as_unavailable() {
        for (index, message) in [
            declaration("profiles/missing.json"),
            declaration("../outside.json"),
            declaration("https://example.com/profile.json"),
            declaration("profiles/team.js"),
        ]
        .iter()
        .enumerate()
        {
            let fixture = TempBundle::new(message, None);
            let report = analyze(&fixture.path, &read_bundle(&fixture.path));
            assert_eq!(
                report.profiles[0].status,
                ProfileStatus::Unavailable,
                "case {index}"
            );
            assert!(report.diagnostics.is_empty());
        }

        let fixture = TempBundle::new(
            &declaration("profiles/team.json").replace("1.2.0", "^1.2.0"),
            Some(descriptor()),
        );
        let report = analyze(&fixture.path, &read_bundle(&fixture.path));
        assert_eq!(report.profiles[0].status, ProfileStatus::Unavailable);
        assert!(report.profiles[0]
            .message
            .contains("exact semantic version"));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_descriptor_symlinks_that_escape_the_bundle() {
        use std::os::unix::fs::symlink;

        let fixture = TempBundle::new(&declaration("profiles/team.json"), None);
        let outside = std::env::temp_dir().join("okf-profile-outside.json");
        fs::write(&outside, descriptor()).expect("outside fixture should be written");
        symlink(&outside, fixture.path.join("profiles/team.json"))
            .expect("fixture symlink should be created");

        let report = analyze(&fixture.path, &read_bundle(&fixture.path));
        assert_eq!(report.profiles[0].status, ProfileStatus::Unavailable);
        assert!(report.profiles[0].message.contains("outside the bundle"));
        let _ = fs::remove_file(outside);
    }

    #[test]
    fn descriptor_identity_must_match_the_declaration() {
        let mismatched = descriptor().replace("\"version\": \"1.2.0\"", "\"version\": \"2.0.0\"");
        let fixture = TempBundle::new(&declaration("profiles/team.json"), Some(&mismatched));
        let report = analyze(&fixture.path, &read_bundle(&fixture.path));

        assert_eq!(report.profiles[0].status, ProfileStatus::Unavailable);
        assert!(report.profiles[0].message.contains("must match"));
    }

    #[test]
    fn reevaluates_resolved_rules_against_an_isolated_bundle() {
        let fixture = TempBundle::new(&declaration("profiles/team.json"), Some(descriptor()));
        let source = read_bundle(&fixture.path);
        let report = analyze(&fixture.path, &source);
        let mut changed = source.clone();
        changed.concepts[0]
            .extra
            .insert("lifecycle".to_string(), Value::String("active".to_string()));
        changed.concepts[0].description = "Orientation".to_string();

        let reevaluated = reevaluate(&report, &changed);
        assert!(reevaluated.diagnostics.is_empty());
        assert_eq!(reevaluated.profiles[0].status, ProfileStatus::Active);
    }
}
