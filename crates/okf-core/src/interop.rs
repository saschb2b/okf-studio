//! Bounded interoperability experiments over preserved OKF extensions.
//!
//! None of these fields are OKF conformance. The report lets Studio test
//! producer conventions without fetching, executing, or silently adopting
//! them as core format behavior.

use crate::{health, profile, Bundle, Concept};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

const MAX_VARIANTS: usize = 2_048;
const MAX_EXTERNAL_BUNDLES: usize = 64;
const MAX_SIDECARS: usize = 2_048;
const MAX_SIDECAR_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SEMANTIC_BYTES: usize = 2 * 1024 * 1024;
const MAX_SEMANTIC_ITEMS: usize = 4_096;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InteropReport {
    pub schema_version: u8,
    pub multilingual: MultilingualExperiment,
    pub external_bundles: Vec<ExternalBundleReference>,
    pub semantic_web: SemanticWebSummary,
    pub sidecars: Vec<SidecarResource>,
    pub diagnostics: Vec<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultilingualExperiment {
    pub groups: Vec<LanguageVariantGroup>,
    pub conventions: Vec<LanguageConventionFinding>,
    pub adoption_ready: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageVariantGroup {
    pub identity: String,
    pub variants: Vec<LanguageVariant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageVariant {
    pub concept_id: String,
    pub title: String,
    pub language: String,
    pub convention: LanguageConvention,
    pub translation_of: Option<String>,
    pub target_exists: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LanguageConvention {
    Frontmatter,
    FilenameSuffix,
    TranslationReference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageConventionFinding {
    pub convention: LanguageConvention,
    pub observed: usize,
    pub strengths: Vec<String>,
    pub gaps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalBundleReference {
    pub alias: String,
    pub url: String,
    pub expected_digest: Option<String>,
    pub cache_path: Option<String>,
    pub status: ExternalBundleStatus,
    pub cached_digest: Option<String>,
    pub identity_prefix: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExternalBundleStatus {
    NotResolved,
    Cached,
    DigestMismatch,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticWebSummary {
    pub exportable_relationships: usize,
    pub unsupported_relationships: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarResource {
    pub concept_id: String,
    pub path: String,
    pub media_type: String,
    pub authored_digest: Option<String>,
    pub actual_digest: Option<String>,
    pub size: Option<u64>,
    pub status: SidecarStatus,
    pub open_policy: SidecarOpenPolicy,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SidecarStatus {
    Ready,
    Missing,
    DigestMismatch,
    InvalidDeclaration,
    TooLarge,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SidecarOpenPolicy {
    SafePreview,
    DownloadOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticImportPreview {
    pub schema_version: u8,
    pub relationships: Vec<SemanticRelationship>,
    pub losses: Vec<SemanticLoss>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticRelationship {
    pub source_id: String,
    pub target_id: String,
    pub namespace: String,
    #[serde(rename = "type")]
    pub relationship_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticLoss {
    pub path: String,
    pub message: String,
}

pub fn analyze(root: &Path, bundle: &Bundle) -> InteropReport {
    let (multilingual, variants_truncated) = multilingual_experiment(bundle);
    let (external_bundles, external_diagnostics, external_truncated) =
        external_references(root, bundle);
    let relationships = profile::analyze(root, bundle).edges;
    let semantic_web = SemanticWebSummary {
        exportable_relationships: relationships
            .iter()
            .filter(|edge| edge.portable_link && edge.target_exists)
            .count(),
        unsupported_relationships: relationships
            .iter()
            .filter(|edge| !edge.portable_link || !edge.target_exists)
            .count(),
        message: "JSON-LD exchange covers profile-typed relationships backed by portable Markdown links; every other construct is reported as loss.".to_string(),
    };
    let (sidecars, sidecar_diagnostics, sidecars_truncated) = sidecars(root, bundle);
    let mut diagnostics = external_diagnostics;
    diagnostics.extend(sidecar_diagnostics);
    InteropReport {
        schema_version: 1,
        multilingual,
        external_bundles,
        semantic_web,
        sidecars,
        diagnostics,
        truncated: variants_truncated || external_truncated || sidecars_truncated,
    }
}

pub fn semantic_web_export(root: &Path, bundle: &Bundle) -> Result<String, String> {
    let report = profile::analyze(root, bundle);
    let mut graph = Vec::new();
    let mut losses = Vec::new();
    let concepts = bundle
        .concepts
        .iter()
        .map(|concept| concept.id.as_str())
        .collect::<BTreeSet<_>>();
    for concept in bundle.concepts.iter().take(MAX_SEMANTIC_ITEMS) {
        graph.push(json!({
            "@id": format!("okf:concept/{}", concept.id),
            "@type": "okf:Concept",
            "okf:conceptId": concept.id,
            "name": concept.title,
        }));
    }
    if bundle.concepts.len() > MAX_SEMANTIC_ITEMS {
        losses.push(json!({
            "path": "concepts",
            "message": "The 4,096-item JSON-LD graph limit omitted concepts and relationships."
        }));
    }
    for (index, edge) in report.edges.iter().enumerate() {
        if graph.len() >= MAX_SEMANTIC_ITEMS {
            losses.push(json!({
                "path": format!("relationships[{index}]"),
                "message": "The 4,096-item JSON-LD graph limit omitted this relationship."
            }));
            break;
        }
        if !edge.portable_link || !edge.target_exists {
            losses.push(json!({
                "path": format!("relationships[{index}]"),
                "message": if !edge.portable_link {
                    "The typed annotation has no matching portable Markdown link."
                } else {
                    "The relationship target does not exist in this bundle."
                }
            }));
            continue;
        }
        if !concepts.contains(edge.source_id.as_str()) {
            continue;
        }
        graph.push(json!({
            "@id": format!("okf:relationship/{index}"),
            "@type": "okf:Relationship",
            "okf:source": { "@id": format!("okf:concept/{}", edge.source_id) },
            "okf:target": { "@id": format!("okf:concept/{}", edge.target_id) },
            "okf:sourceId": edge.source_id,
            "okf:targetId": edge.target_id,
            "okf:namespace": edge.namespace,
            "okf:relationshipType": edge.relationship_type,
        }));
    }
    let document = json!({
        "@context": {
            "okf": "https://openknowledgeformat.org/ns/experimental#",
            "name": "http://schema.org/name"
        },
        "@type": "okf:RelationshipExchange",
        "okf:schemaVersion": 1,
        "okf:bundleRevision": health::bundle_fingerprint(bundle),
        "@graph": graph,
        "okf:lossReport": losses,
    });
    serde_json::to_string_pretty(&document)
        .map_err(|_| "Studio could not encode the JSON-LD exchange.".to_string())
}

pub fn semantic_web_import(bytes: &[u8]) -> Result<SemanticImportPreview, String> {
    if bytes.is_empty() || bytes.len() > MAX_SEMANTIC_BYTES {
        return Err("Choose a JSON-LD file between 1 byte and 2 MiB.".to_string());
    }
    let document: Value = serde_json::from_slice(bytes)
        .map_err(|_| "The selected semantic-web file is not valid JSON.".to_string())?;
    let graph = document
        .get("@graph")
        .and_then(Value::as_array)
        .ok_or_else(|| "The JSON-LD document has no @graph array.".to_string())?;
    let mut relationships = Vec::new();
    let mut losses = Vec::new();
    let mut truncated = false;
    for (index, item) in graph.iter().enumerate() {
        if index == MAX_SEMANTIC_ITEMS {
            truncated = true;
            losses.push(SemanticLoss {
                path: "@graph".to_string(),
                message: "Items after the 4,096-item import limit were omitted.".to_string(),
            });
            break;
        }
        let Some(object) = item.as_object() else {
            losses.push(loss(index, "A non-object JSON-LD item was ignored."));
            continue;
        };
        if string(object, "@type") != Some("okf:Relationship") {
            continue;
        }
        let fields = [
            string(object, "okf:sourceId"),
            string(object, "okf:targetId"),
            string(object, "okf:namespace"),
            string(object, "okf:relationshipType"),
        ];
        let [Some(source_id), Some(target_id), Some(namespace), Some(relationship_type)] = fields
        else {
            losses.push(loss(
                index,
                "A relationship without the four OKF exchange fields was ignored.",
            ));
            continue;
        };
        if [source_id, target_id, namespace, relationship_type]
            .iter()
            .any(|value| !bounded_token(value))
        {
            losses.push(loss(
                index,
                "A relationship with an empty, control-bearing, or oversize field was ignored.",
            ));
            continue;
        }
        relationships.push(SemanticRelationship {
            source_id: source_id.to_string(),
            target_id: target_id.to_string(),
            namespace: namespace.to_string(),
            relationship_type: relationship_type.to_string(),
        });
    }
    relationships.sort_by(|left, right| {
        left.source_id
            .cmp(&right.source_id)
            .then_with(|| left.target_id.cmp(&right.target_id))
            .then_with(|| left.namespace.cmp(&right.namespace))
            .then_with(|| left.relationship_type.cmp(&right.relationship_type))
    });
    relationships.dedup();
    Ok(SemanticImportPreview {
        schema_version: 1,
        relationships,
        losses,
        truncated,
    })
}

pub fn declared_sidecar(
    root: &Path,
    bundle: &Bundle,
    concept_id: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    let report = analyze(root, bundle);
    let item = report
        .sidecars
        .iter()
        .find(|item| item.concept_id == concept_id && item.path == relative_path)
        .ok_or_else(|| "The sidecar is not declared by this concept.".to_string())?;
    if item.status != SidecarStatus::Ready {
        return Err("Only a present, digest-matching sidecar can be exported.".to_string());
    }
    contained_file(root, relative_path)
        .ok_or_else(|| "The sidecar no longer resolves inside the bundle.".to_string())
}

fn multilingual_experiment(bundle: &Bundle) -> (MultilingualExperiment, bool) {
    let ids = bundle
        .concepts
        .iter()
        .map(|concept| concept.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut groups = BTreeMap::<String, Vec<LanguageVariant>>::new();
    let mut counts = [0_usize; 3];
    let mut truncated = false;
    for concept in &bundle.concepts {
        if groups.values().map(Vec::len).sum::<usize>() == MAX_VARIANTS {
            truncated = true;
            break;
        }
        let authored_language = concept.extra.get("language").and_then(Value::as_str);
        let translation_of = concept
            .extra
            .get("translation_of")
            .and_then(Value::as_str)
            .map(str::to_string);
        let filename_language = language_suffix(&concept.id);
        let (language, convention) = if translation_of.is_some() {
            counts[2] += 1;
            (
                authored_language.unwrap_or("und").to_string(),
                LanguageConvention::TranslationReference,
            )
        } else if let Some(language) = authored_language {
            counts[0] += 1;
            (language.to_string(), LanguageConvention::Frontmatter)
        } else if let Some(language) = filename_language {
            counts[1] += 1;
            (language.to_string(), LanguageConvention::FilenameSuffix)
        } else {
            continue;
        };
        if !language_tag(&language) {
            continue;
        }
        let identity = translation_of
            .clone()
            .or_else(|| filename_language.map(|_| strip_language_suffix(&concept.id)))
            .unwrap_or_else(|| concept.id.clone());
        groups.entry(identity).or_default().push(LanguageVariant {
            concept_id: concept.id.clone(),
            title: concept.title.clone(),
            language,
            convention,
            target_exists: translation_of
                .as_deref()
                .is_none_or(|target| ids.contains(target)),
            translation_of,
        });
    }
    let groups = groups
        .into_iter()
        .map(|(identity, mut variants)| {
            variants.sort_by(|left, right| {
                left.language
                    .cmp(&right.language)
                    .then_with(|| left.concept_id.cmp(&right.concept_id))
            });
            LanguageVariantGroup { identity, variants }
        })
        .collect::<Vec<_>>();
    let conventions = [
        (
            LanguageConvention::Frontmatter,
            counts[0],
            vec!["Keeps filenames stable.".to_string()],
            vec![
                "A language field alone does not identify sibling variants.".to_string(),
                "Rename and projection cannot infer a variant set.".to_string(),
            ],
        ),
        (
            LanguageConvention::FilenameSuffix,
            counts[1],
            vec!["Variant identity is visible without parsing frontmatter.".to_string()],
            vec![
                "Renaming the base path can split a set.".to_string(),
                "Language tags are constrained by filename conventions.".to_string(),
            ],
        ),
        (
            LanguageConvention::TranslationReference,
            counts[2],
            vec![
                "Variants keep ordinary concept identities and an explicit base reference."
                    .to_string(),
            ],
            vec![
                "The reference is producer metadata, so safe move does not rewrite it yet."
                    .to_string(),
            ],
        ),
    ]
    .into_iter()
    .map(
        |(convention, observed, strengths, gaps)| LanguageConventionFinding {
            convention,
            observed,
            strengths,
            gaps,
        },
    )
    .collect::<Vec<_>>();
    let adoption_ready = false;
    (
        MultilingualExperiment {
            groups,
            conventions,
            adoption_ready,
            message: "Variants remain an experiment. Studio inventories all three observed conventions but does not choose a default until link, search, retrieval, move, and projection fixtures pass together.".to_string(),
        },
        truncated,
    )
}

fn external_references(
    root: &Path,
    bundle: &Bundle,
) -> (Vec<ExternalBundleReference>, Vec<String>, bool) {
    let Some(entries) = bundle.extra.get("external_bundles") else {
        return (Vec::new(), Vec::new(), false);
    };
    let Some(entries) = entries.as_object() else {
        return (
            Vec::new(),
            vec!["external_bundles must be a map keyed by a local alias.".to_string()],
            false,
        );
    };
    let mut references = Vec::new();
    let mut diagnostics = Vec::new();
    let mut truncated = false;
    for (alias, value) in entries {
        if references.len() == MAX_EXTERNAL_BUNDLES {
            truncated = true;
            break;
        }
        let Some(object) = value.as_object() else {
            diagnostics.push(format!("External bundle {alias} must be an object."));
            continue;
        };
        let Some(url) = string(object, "url").filter(|value| valid_https_url(value)) else {
            diagnostics.push(format!(
                "External bundle {alias} needs a credential-free HTTPS URL."
            ));
            continue;
        };
        let expected_digest = string(object, "digest").map(str::to_string);
        let cache_path = string(object, "cache").map(str::to_string);
        let (status, cached_digest, message) = match cache_path.as_deref() {
            None => (
                ExternalBundleStatus::NotResolved,
                None,
                "Not fetched. Resolution begins only from the named user action.".to_string(),
            ),
            Some(path) => match contained_directory(root, path) {
                None => (
                    ExternalBundleStatus::Unavailable,
                    None,
                    "The declared local cache is missing or leaves the bundle root.".to_string(),
                ),
                Some(path) => {
                    let cached = crate::read_bundle(&path);
                    let digest = health::bundle_fingerprint(&cached);
                    if expected_digest
                        .as_deref()
                        .is_some_and(|expected| expected != digest)
                    {
                        (
                            ExternalBundleStatus::DigestMismatch,
                            Some(digest),
                            "The cached bundle does not match the declared revision.".to_string(),
                        )
                    } else {
                        (
                            ExternalBundleStatus::Cached,
                            Some(digest),
                            "A local read-only cache matches the declared revision.".to_string(),
                        )
                    }
                }
            },
        };
        references.push(ExternalBundleReference {
            alias: alias.clone(),
            url: url.to_string(),
            expected_digest,
            cache_path,
            status,
            cached_digest,
            identity_prefix: format!("external:{alias}:"),
            message,
        });
    }
    references.sort_by(|left, right| left.alias.cmp(&right.alias));
    (references, diagnostics, truncated)
}

fn sidecars(root: &Path, bundle: &Bundle) -> (Vec<SidecarResource>, Vec<String>, bool) {
    let mut resources = Vec::new();
    let mut diagnostics = Vec::new();
    let mut truncated = false;
    for concept in &bundle.concepts {
        let Some(value) = concept.extra.get("sidecars") else {
            continue;
        };
        if let Some(items) = value.as_array() {
            for (index, item) in items.iter().enumerate() {
                if resources.len() == MAX_SIDECARS {
                    truncated = true;
                    break;
                }
                resources.push(sidecar(root, concept, index, None, item));
            }
        } else if let Some(items) = value.as_object() {
            for (index, (path, item)) in items.iter().enumerate() {
                if resources.len() == MAX_SIDECARS {
                    truncated = true;
                    break;
                }
                resources.push(sidecar(root, concept, index, Some(path), item));
            }
        } else {
            diagnostics.push(format!(
                "{}.md sidecars must be a path-keyed map or an array.",
                concept.id
            ));
        }
    }
    (resources, diagnostics, truncated)
}

fn sidecar(
    root: &Path,
    concept: &Concept,
    index: usize,
    declared_path: Option<&str>,
    value: &Value,
) -> SidecarResource {
    let invalid = |message: String| SidecarResource {
        concept_id: concept.id.clone(),
        path: format!("sidecars[{index}]"),
        media_type: "application/octet-stream".to_string(),
        authored_digest: None,
        actual_digest: None,
        size: None,
        status: SidecarStatus::InvalidDeclaration,
        open_policy: SidecarOpenPolicy::DownloadOnly,
        message,
    };
    let Some(object) = value.as_object() else {
        return invalid("The sidecar declaration must be an object.".to_string());
    };
    let Some(path) = declared_path
        .or_else(|| string(object, "path"))
        .filter(|value| portable_path(value))
    else {
        return invalid("The sidecar path must be a normal bundle-relative path.".to_string());
    };
    let media_type = string(object, "media_type")
        .filter(|value| media_type_token(value))
        .unwrap_or("application/octet-stream")
        .to_string();
    let authored_digest = string(object, "digest").map(str::to_string);
    let policy = if safe_preview_media(&media_type) {
        SidecarOpenPolicy::SafePreview
    } else {
        SidecarOpenPolicy::DownloadOnly
    };
    let Some(file) = contained_file(root, path) else {
        return SidecarResource {
            concept_id: concept.id.clone(),
            path: path.to_string(),
            media_type,
            authored_digest,
            actual_digest: None,
            size: None,
            status: SidecarStatus::Missing,
            open_policy: policy,
            message: "The declared file is missing or resolves outside the bundle.".to_string(),
        };
    };
    let size = file.metadata().ok().map(|metadata| metadata.len());
    if size.is_none_or(|value| value > MAX_SIDECAR_BYTES) {
        return SidecarResource {
            concept_id: concept.id.clone(),
            path: path.to_string(),
            media_type,
            authored_digest,
            actual_digest: None,
            size,
            status: SidecarStatus::TooLarge,
            open_policy: policy,
            message: "The sidecar exceeds the 64 MiB inspection and export limit.".to_string(),
        };
    }
    let actual_digest = fs::read(&file)
        .ok()
        .map(|bytes| format!("sha256:{:x}", Sha256::digest(bytes)));
    let mismatch = authored_digest
        .as_deref()
        .zip(actual_digest.as_deref())
        .is_some_and(|(authored, actual)| authored != actual);
    SidecarResource {
        concept_id: concept.id.clone(),
        path: path.to_string(),
        media_type,
        authored_digest,
        actual_digest,
        size,
        status: if mismatch {
            SidecarStatus::DigestMismatch
        } else {
            SidecarStatus::Ready
        },
        open_policy: policy,
        message: if mismatch {
            "The file digest does not match the declaration.".to_string()
        } else if safe_preview_media(string(object, "media_type").unwrap_or("")) {
            "The media type is eligible for Studio's existing inert preview paths.".to_string()
        } else {
            "The file remains exportable but Studio will not execute or render it.".to_string()
        },
    }
}

fn contained_file(root: &Path, relative: &str) -> Option<PathBuf> {
    contained(root, relative).filter(|path| path.is_file())
}

fn contained_directory(root: &Path, relative: &str) -> Option<PathBuf> {
    contained(root, relative).filter(|path| path.is_dir())
}

fn contained(root: &Path, relative: &str) -> Option<PathBuf> {
    if !portable_path(relative) {
        return None;
    }
    let root = dunce(root)?;
    let target = fs::canonicalize(root.join(relative)).ok()?;
    target.starts_with(&root).then_some(target)
}

fn dunce(path: &Path) -> Option<PathBuf> {
    fs::canonicalize(path).ok()
}

fn portable_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 1_024
        && !value.contains('\\')
        && Path::new(value)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn language_suffix(id: &str) -> Option<&str> {
    let suffix = id.rsplit_once('.')?.1;
    language_tag(suffix).then_some(suffix)
}

fn strip_language_suffix(id: &str) -> String {
    id.rsplit_once('.')
        .map_or_else(|| id.to_string(), |(base, _)| base.to_string())
}

fn language_tag(value: &str) -> bool {
    let parts = value.split('-').collect::<Vec<_>>();
    (2..=3).contains(&parts[0].len())
        && parts[0]
            .chars()
            .all(|character| character.is_ascii_alphabetic())
        && parts.iter().skip(1).all(|part| {
            (2..=8).contains(&part.len())
                && part
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
}

fn valid_https_url(value: &str) -> bool {
    value.starts_with("https://")
        && !value.contains('@')
        && value.len() <= 2_048
        && !value.chars().any(char::is_control)
}

fn safe_preview_media(value: &str) -> bool {
    matches!(
        value,
        "text/plain"
            | "text/csv"
            | "application/json"
            | "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp"
            | "image/avif"
            | "image/svg+xml"
    )
}

fn media_type_token(value: &str) -> bool {
    let Some((kind, subtype)) = value.split_once('/') else {
        return false;
    };
    !kind.is_empty()
        && !subtype.is_empty()
        && value.len() <= 128
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '/' | '-' | '+' | '.')
        })
}

fn string<'a>(object: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    object.get(key).and_then(Value::as_str)
}

fn bounded_token(value: &str) -> bool {
    !value.is_empty() && value.chars().count() <= 512 && !value.chars().any(char::is_control)
}

fn loss(index: usize, message: &str) -> SemanticLoss {
    SemanticLoss {
        path: format!("@graph[{index}]"),
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempRoot(PathBuf);

    impl TempRoot {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("okf-interop-{nonce}"));
            fs::create_dir_all(path.join("assets")).expect("fixture");
            Self(path)
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn inventories_variants_external_references_and_sidecars_without_fetching() {
        let root = TempRoot::new();
        fs::write(
            root.0.join("index.md"),
            "---\nokf_version: \"0.1\"\nexternal_bundles:\n  upstream:\n    url: https://github.com/example/knowledge\n---\n# Fixture\n",
        )
        .expect("index");
        fs::write(
            root.0.join("guide.md"),
            "---\ntype: Guide\nlanguage: en\nsidecars:\n  assets/data.bin:\n    media_type: application/x-custom\n---\n# Guide\n",
        )
        .expect("guide");
        fs::write(
            root.0.join("guide.de.md"),
            "---\ntype: Guide\nlanguage: de\ntranslation_of: guide\n---\n# Leitfaden\n",
        )
        .expect("variant");
        fs::write(root.0.join("assets/data.bin"), b"sidecar").expect("sidecar");
        let bundle = crate::read_bundle(&root.0);
        let report = analyze(&root.0, &bundle);

        assert_eq!(report.multilingual.groups.len(), 1);
        assert!(!report.multilingual.adoption_ready);
        assert_eq!(
            report.external_bundles[0].status,
            ExternalBundleStatus::NotResolved
        );
        assert_eq!(report.sidecars[0].status, SidecarStatus::Ready);
        assert!(matches!(
            report.sidecars[0].open_policy,
            SidecarOpenPolicy::DownloadOnly
        ));
    }

    #[test]
    fn semantic_web_round_trip_preserves_the_declared_subset_and_losses() {
        let root = TempRoot::new();
        fs::write(
            root.0.join("index.md"),
            "---\nokf_version: \"0.1\"\nprofiles:\n  com.example.links:\n    version: 1.0.0\n    descriptor: profile.json\n---\n# Fixture\n",
        )
        .expect("index");
        fs::write(
            root.0.join("profile.json"),
            r#"{"schemaVersion":1,"namespace":"com.example.links","version":"1.0.0","title":"Links","relationships":[{"id":"supports","label":"Supports"}]}"#,
        )
        .expect("profile");
        fs::write(
            root.0.join("one.md"),
            "---\ntype: Note\nrelationships:\n  com.example.links:\n    supports: [two]\n---\n# One\n\n[Two](two.md)\n",
        )
        .expect("one");
        fs::write(root.0.join("two.md"), "---\ntype: Note\n---\n# Two\n").expect("two");
        let bundle = crate::read_bundle(&root.0);
        let exported = semantic_web_export(&root.0, &bundle).expect("export");
        let imported = semantic_web_import(exported.as_bytes()).expect("import");

        assert_eq!(
            imported.relationships,
            vec![SemanticRelationship {
                source_id: "one".to_string(),
                target_id: "two".to_string(),
                namespace: "com.example.links".to_string(),
                relationship_type: "supports".to_string(),
            }]
        );
        assert!(imported.losses.is_empty());
    }

    #[test]
    fn semantic_web_export_caps_the_complete_graph() {
        let root = TempRoot::new();
        let mut bundle = crate::read_bundle(&root.0);
        bundle.concepts = (0..=MAX_SEMANTIC_ITEMS)
            .map(|index| crate::Concept {
                id: format!("concept-{index}"),
                concept_type: "Note".to_string(),
                title: format!("Concept {index}"),
                description: String::new(),
                tags: Vec::new(),
                timestamp: None,
                resource: None,
                extra: BTreeMap::new(),
                body: String::new(),
                links: Vec::new(),
                external_links: Vec::new(),
                broken_links: Vec::new(),
                cited_by: Vec::new(),
                degree: 0,
            })
            .collect();

        let exported = semantic_web_export(&root.0, &bundle).expect("export");
        let document: Value = serde_json::from_str(&exported).expect("JSON-LD");
        assert_eq!(
            document["@graph"].as_array().expect("graph").len(),
            MAX_SEMANTIC_ITEMS
        );
        assert_eq!(
            document["okf:lossReport"][0]["path"].as_str(),
            Some("concepts")
        );
    }

    #[test]
    fn studio_docs_dogfood_all_four_experiments() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs");
        let root = fs::canonicalize(root).expect("docs");
        let bundle = crate::read_bundle(&root);
        let report = analyze(&root, &bundle);

        assert!(report.multilingual.groups.iter().any(|group| {
            group.identity == "features/interoperability-lab" && group.variants.len() == 2
        }));
        assert!(report
            .external_bundles
            .iter()
            .any(|reference| reference.alias == "google-okf"));
        assert!(report.semantic_web.exportable_relationships > 0);
        assert!(report.sidecars.iter().any(|sidecar| {
            sidecar.path == "assets/interop-sample.json" && sidecar.status == SidecarStatus::Ready
        }));
    }
}
