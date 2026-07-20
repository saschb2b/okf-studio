//! Stable Rust-owned identities and bounded read-only federation for granted bundles.
//!
//! Frontend paths and model-supplied paths never select a federated bundle.
//! A detected bundle receives an opaque UUID that survives rescans and restart.
//! Every query revalidates its parent folder grant and exact revision before
//! returning content.

use crate::bundle_grant::{BundleGrantKind, BundleGrantState};
use okf_core::{health, query, Bundle, BundleRoot};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const LIBRARY_FILE: &str = "bundle-library.json";
const LIBRARY_SCHEMA_VERSION: u32 = 1;
const MAX_LIBRARY_ENTRIES: usize = 512;
const MAX_LIBRARY_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SELECTIONS: usize = 8;
const MAX_QUERY_LIMIT: usize = 100;
const MAX_QUERY_CHARS: usize = 256;
const MAX_RELATIONSHIP_GROUP: usize = 16;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct KnownBundle {
    bundle_id: String,
    root: String,
    scope_root: String,
    title: String,
    kind: BundleGrantKind,
    concept_count: usize,
    types: Vec<String>,
    tags: Vec<String>,
    revision_fingerprint: Option<String>,
    last_seen_epoch_ms: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedLibrary {
    schema_version: u32,
    bundles: Vec<KnownBundle>,
}

pub struct BundleLibraryState {
    file: PathBuf,
    bundles: Mutex<Vec<KnownBundle>>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LibraryGrantState {
    Available,
    Missing,
    Revoked,
    Changed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleLibraryEntry {
    pub bundle_id: String,
    pub title: String,
    pub kind: BundleGrantKind,
    pub concept_count: usize,
    pub types: Vec<String>,
    pub tags: Vec<String>,
    pub revision_fingerprint: Option<String>,
    pub grant_state: LibraryGrantState,
    pub last_seen_epoch_ms: u64,
    pub active: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FederatedBundleSelection {
    pub bundle_id: String,
    pub revision_fingerprint: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedBundleStatus {
    pub bundle_id: String,
    pub title: String,
    pub grant_state: LibraryGrantState,
    pub revision_fingerprint: Option<String>,
    pub expected_fingerprint: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedConceptResult {
    pub bundle_id: String,
    pub bundle_title: String,
    pub concept_id: String,
    pub revision_fingerprint: String,
    pub grant_state: LibraryGrantState,
    pub title: String,
    #[serde(rename = "type")]
    pub concept_type: String,
    pub description: String,
    pub tags: Vec<String>,
    pub snippet: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedConceptPage {
    pub bundles: Vec<FederatedBundleStatus>,
    pub results: Vec<FederatedConceptResult>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedSourceResult {
    pub bundle_id: String,
    pub bundle_title: String,
    pub concept_id: String,
    pub revision_fingerprint: String,
    pub grant_state: LibraryGrantState,
    pub uri: String,
    pub kinds: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedSourcePage {
    pub bundles: Vec<FederatedBundleStatus>,
    pub results: Vec<FederatedSourceResult>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedConceptRef {
    pub bundle_id: String,
    pub bundle_title: String,
    pub concept_id: String,
    pub revision_fingerprint: String,
    pub grant_state: LibraryGrantState,
    pub title: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedRelationshipCandidate {
    pub kind: String,
    pub basis: String,
    pub evidence: String,
    pub requires_review: bool,
    pub left: FederatedConceptRef,
    pub right: FederatedConceptRef,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedRelationshipPage {
    pub bundles: Vec<FederatedBundleStatus>,
    pub results: Vec<FederatedRelationshipCandidate>,
    pub truncated: bool,
}

struct ResolvedBundle {
    known: KnownBundle,
    bundle: Bundle,
    fingerprint: String,
}

impl BundleLibraryState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let file = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Studio could not locate its bundle library: {error}"))?
            .join(LIBRARY_FILE);
        Ok(Self::load_from(file))
    }

    fn load_from(file: PathBuf) -> Self {
        let bundles = read_library(&file).unwrap_or_else(|error| {
            eprintln!("[bundle-library] {error}; starting with an empty library");
            Vec::new()
        });
        Self {
            file,
            bundles: Mutex::new(bundles),
        }
    }

    pub fn register_detected(
        &self,
        scope_root: &Path,
        kind: BundleGrantKind,
        detected: &[BundleRoot],
    ) -> Result<(), String> {
        let scope = dunce::canonicalize(scope_root)
            .map_err(|_| "The granted bundle folder is no longer available.".to_string())?;
        let scope_string = path_string(&scope)?;
        let now = epoch_millis();
        let mut bundles = self
            .bundles
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        for root in detected {
            let canonical = dunce::canonicalize(&root.root)
                .map_err(|_| "A detected bundle root is no longer available.".to_string())?;
            if !canonical.starts_with(&scope) {
                return Err("A detected bundle root escaped its granted folder.".to_string());
            }
            let root_string = path_string(&canonical)?;
            let concept_count = usize::try_from(root.concept_count).map_err(|_| {
                "A detected bundle concept count exceeds this platform's limit.".to_string()
            })?;
            if let Some(existing) = bundles.iter_mut().find(|entry| entry.root == root_string) {
                existing.scope_root.clone_from(&scope_string);
                existing.title.clone_from(&root.name);
                existing.kind = kind;
                existing.concept_count = concept_count;
                existing.types.clone_from(&root.types);
                existing.last_seen_epoch_ms = now;
                continue;
            }
            if bundles.len() >= MAX_LIBRARY_ENTRIES {
                return Err(format!(
                    "Studio supports at most {MAX_LIBRARY_ENTRIES} remembered bundles."
                ));
            }
            bundles.push(KnownBundle {
                bundle_id: uuid::Uuid::new_v4().to_string(),
                root: root_string,
                scope_root: scope_string.clone(),
                title: root.name.clone(),
                kind,
                concept_count,
                types: root.types.clone(),
                tags: Vec::new(),
                revision_fingerprint: None,
                last_seen_epoch_ms: now,
            });
        }
        write_library(&self.file, &bundles)
    }

    pub fn update_snapshot(&self, root: &Path, bundle: &Bundle) -> Result<(), String> {
        let root = path_string(root)?;
        let mut bundles = self
            .bundles
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let Some(existing) = bundles.iter_mut().find(|entry| entry.root == root) else {
            return Ok(());
        };
        existing.title.clone_from(&bundle.name);
        existing.concept_count = bundle.concepts.len();
        existing.types = sorted_unique(
            bundle
                .concepts
                .iter()
                .map(|concept| concept.concept_type.as_str()),
        );
        existing.tags = sorted_unique(
            bundle
                .concepts
                .iter()
                .flat_map(|concept| concept.tags.iter().map(String::as_str)),
        );
        existing.revision_fingerprint = Some(health::bundle_fingerprint(bundle));
        existing.last_seen_epoch_ms = epoch_millis();
        write_library(&self.file, &bundles)
    }

    pub fn entries(
        &self,
        grants: &BundleGrantState,
        active_root: Option<&Path>,
    ) -> Vec<BundleLibraryEntry> {
        let active_root = active_root.and_then(|root| path_string(root).ok());
        let mut entries = self
            .bundles
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .iter()
            .map(|known| BundleLibraryEntry {
                bundle_id: known.bundle_id.clone(),
                title: known.title.clone(),
                kind: known.kind,
                concept_count: known.concept_count,
                types: known.types.clone(),
                tags: known.tags.clone(),
                revision_fingerprint: known.revision_fingerprint.clone(),
                grant_state: access_state(grants, known)
                    .map_or_else(|state| state, |_| LibraryGrantState::Available),
                last_seen_epoch_ms: known.last_seen_epoch_ms,
                active: active_root.as_deref() == Some(known.root.as_str()),
            })
            .collect::<Vec<_>>();
        entries.sort_by(|left, right| {
            grant_order(left.grant_state)
                .cmp(&grant_order(right.grant_state))
                .then_with(|| right.last_seen_epoch_ms.cmp(&left.last_seen_epoch_ms))
                .then_with(|| left.title.cmp(&right.title))
                .then_with(|| left.bundle_id.cmp(&right.bundle_id))
        });
        entries
    }

    pub fn preview(
        &self,
        grants: &BundleGrantState,
        bundle_ids: Vec<String>,
    ) -> Result<Vec<FederatedBundleStatus>, String> {
        validate_bundle_ids(&bundle_ids)?;
        let mut statuses = Vec::with_capacity(bundle_ids.len());
        for bundle_id in bundle_ids {
            let (status, resolved) = self.resolve(grants, &bundle_id, None);
            if let Some(bundle) = resolved {
                self.update_snapshot(Path::new(&bundle.known.root), &bundle.bundle)?;
            }
            statuses.push(status);
        }
        Ok(statuses)
    }

    pub fn inventory(
        &self,
        grants: &BundleGrantState,
        selections: Vec<FederatedBundleSelection>,
        prefix: Option<String>,
        concept_type: Option<String>,
        tag: Option<String>,
        limit: usize,
    ) -> Result<FederatedConceptPage, String> {
        validate_limit(limit)?;
        let prefix = normalized_query(prefix, "prefix")?;
        let concept_type = normalized_query(concept_type, "type")?;
        let tag = normalized_query(tag, "tag")?;
        let (bundles, resolved) = self.resolve_query(grants, selections)?;
        let mut results_by_bundle = Vec::new();
        for bundle in &resolved {
            let mut bundle_results = Vec::new();
            for concept in &bundle.bundle.concepts {
                if prefix
                    .as_ref()
                    .is_some_and(|value| !concept.id.to_lowercase().starts_with(value))
                    || concept_type
                        .as_ref()
                        .is_some_and(|value| concept.concept_type.to_lowercase() != *value)
                    || tag.as_ref().is_some_and(|value| {
                        !concept
                            .tags
                            .iter()
                            .any(|item| item.to_lowercase() == *value)
                    })
                {
                    continue;
                }
                bundle_results.push(concept_result(bundle, concept, String::new()));
                if bundle_results.len() > limit {
                    break;
                }
            }
            if !bundle_results.is_empty() {
                results_by_bundle.push(bundle_results);
            }
        }
        let mut results = Vec::new();
        let mut index = 0;
        while results.len() <= limit {
            let mut found = false;
            for bundle_results in &results_by_bundle {
                if let Some(result) = bundle_results.get(index) {
                    results.push(result.clone());
                    found = true;
                    if results.len() > limit {
                        break;
                    }
                }
            }
            if !found || results.len() > limit {
                break;
            }
            index += 1;
        }
        let truncated = results.len() > limit;
        results.truncate(limit);
        Ok(FederatedConceptPage {
            bundles,
            results,
            truncated,
        })
    }

    pub fn search(
        &self,
        grants: &BundleGrantState,
        selections: Vec<FederatedBundleSelection>,
        query_text: String,
        limit: usize,
    ) -> Result<FederatedConceptPage, String> {
        validate_limit(limit)?;
        let query_text = required_query(query_text, "query")?;
        let (bundles, resolved) = self.resolve_query(grants, selections)?;
        let mut ranked = Vec::new();
        for bundle in &resolved {
            for (rank, found) in query::search(&bundle.bundle, &query_text, limit + 1)
                .into_iter()
                .enumerate()
            {
                let Some(concept) = bundle
                    .bundle
                    .concepts
                    .iter()
                    .find(|concept| concept.id == found.id)
                else {
                    continue;
                };
                ranked.push((rank, concept_result(bundle, concept, found.snippet)));
            }
        }
        ranked.sort_by(|(left_rank, left), (right_rank, right)| {
            left_rank
                .cmp(right_rank)
                .then_with(|| left.title.cmp(&right.title))
                .then_with(|| left.bundle_id.cmp(&right.bundle_id))
                .then_with(|| left.concept_id.cmp(&right.concept_id))
        });
        let truncated = ranked.len() > limit;
        let results = ranked
            .into_iter()
            .take(limit)
            .map(|(_, result)| result)
            .collect();
        Ok(FederatedConceptPage {
            bundles,
            results,
            truncated,
        })
    }

    pub fn sources(
        &self,
        grants: &BundleGrantState,
        selections: Vec<FederatedBundleSelection>,
        query_text: Option<String>,
        limit: usize,
    ) -> Result<FederatedSourcePage, String> {
        validate_limit(limit)?;
        let query_text = normalized_query(query_text, "query")?;
        let (bundles, resolved) = self.resolve_query(grants, selections)?;
        let mut rows = BTreeMap::<(String, String, String), FederatedSourceResult>::new();
        for bundle in &resolved {
            for concept in &bundle.bundle.concepts {
                let mut by_uri = BTreeMap::<String, BTreeSet<String>>::new();
                if let Some(uri) = concept.resource.as_ref().filter(|uri| !uri.is_empty()) {
                    by_uri
                        .entry(uri.clone())
                        .or_default()
                        .insert("resource".to_string());
                }
                for uri in concept.external_links.iter().filter(|uri| !uri.is_empty()) {
                    by_uri
                        .entry(uri.clone())
                        .or_default()
                        .insert("citation".to_string());
                }
                for (uri, kinds) in by_uri {
                    if query_text
                        .as_ref()
                        .is_some_and(|query| !uri.to_lowercase().contains(query))
                    {
                        continue;
                    }
                    let result = FederatedSourceResult {
                        bundle_id: bundle.known.bundle_id.clone(),
                        bundle_title: bundle.bundle.name.clone(),
                        concept_id: concept.id.clone(),
                        revision_fingerprint: bundle.fingerprint.clone(),
                        grant_state: LibraryGrantState::Available,
                        uri: uri.clone(),
                        kinds: kinds.into_iter().collect(),
                    };
                    rows.insert(
                        (uri, bundle.known.bundle_id.clone(), concept.id.clone()),
                        result,
                    );
                }
            }
        }
        let truncated = rows.len() > limit;
        let results = rows.into_values().take(limit).collect();
        Ok(FederatedSourcePage {
            bundles,
            results,
            truncated,
        })
    }

    pub fn relationships(
        &self,
        grants: &BundleGrantState,
        selections: Vec<FederatedBundleSelection>,
        limit: usize,
    ) -> Result<FederatedRelationshipPage, String> {
        validate_limit(limit)?;
        let (bundles, resolved) = self.resolve_query(grants, selections)?;
        let mut by_title = BTreeMap::<String, Vec<FederatedConceptRef>>::new();
        let mut by_source = BTreeMap::<String, Vec<FederatedConceptRef>>::new();
        for bundle in &resolved {
            for concept in &bundle.bundle.concepts {
                let reference = concept_ref(bundle, concept);
                push_group(
                    &mut by_title,
                    normalized_title(&concept.title),
                    reference.clone(),
                );
                let sources = concept
                    .resource
                    .iter()
                    .chain(concept.external_links.iter())
                    .filter(|uri| !uri.is_empty());
                for source in sources {
                    push_group(&mut by_source, source.to_lowercase(), reference.clone());
                }
            }
        }
        let mut candidates = Vec::new();
        append_candidates(
            &mut candidates,
            by_title,
            "possible-duplicate",
            "matching-title",
            limit,
        );
        if candidates.len() <= limit {
            append_candidates(
                &mut candidates,
                by_source,
                "relationship-candidate",
                "shared-source",
                limit,
            );
        }
        candidates.sort_by(|left, right| {
            left.kind
                .cmp(&right.kind)
                .then_with(|| left.evidence.cmp(&right.evidence))
                .then_with(|| left.left.bundle_id.cmp(&right.left.bundle_id))
                .then_with(|| left.left.concept_id.cmp(&right.left.concept_id))
                .then_with(|| left.right.bundle_id.cmp(&right.right.bundle_id))
                .then_with(|| left.right.concept_id.cmp(&right.right.concept_id))
        });
        candidates.dedup_by(|left, right| {
            left.kind == right.kind
                && left.left.bundle_id == right.left.bundle_id
                && left.left.concept_id == right.left.concept_id
                && left.right.bundle_id == right.right.bundle_id
                && left.right.concept_id == right.right.concept_id
        });
        let truncated = candidates.len() > limit;
        candidates.truncate(limit);
        Ok(FederatedRelationshipPage {
            bundles,
            results: candidates,
            truncated,
        })
    }

    fn resolve_query(
        &self,
        grants: &BundleGrantState,
        selections: Vec<FederatedBundleSelection>,
    ) -> Result<(Vec<FederatedBundleStatus>, Vec<ResolvedBundle>), String> {
        validate_selections(&selections)?;
        let mut statuses = Vec::with_capacity(selections.len());
        let mut resolved = Vec::new();
        for selection in selections {
            let (status, bundle) = self.resolve(
                grants,
                &selection.bundle_id,
                Some(&selection.revision_fingerprint),
            );
            statuses.push(status);
            if let Some(bundle) = bundle {
                resolved.push(bundle);
            }
        }
        Ok((statuses, resolved))
    }

    fn resolve(
        &self,
        grants: &BundleGrantState,
        bundle_id: &str,
        expected_fingerprint: Option<&str>,
    ) -> (FederatedBundleStatus, Option<ResolvedBundle>) {
        let known = self
            .bundles
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .iter()
            .find(|entry| entry.bundle_id == bundle_id)
            .cloned();
        let Some(known) = known else {
            return (
                FederatedBundleStatus {
                    bundle_id: bundle_id.to_string(),
                    title: "Unknown bundle".to_string(),
                    grant_state: LibraryGrantState::Revoked,
                    revision_fingerprint: None,
                    expected_fingerprint: expected_fingerprint.map(str::to_string),
                },
                None,
            );
        };
        let root = match access_state(grants, &known) {
            Ok(root) => root,
            Err(grant_state) => {
                return (
                    FederatedBundleStatus {
                        bundle_id: known.bundle_id,
                        title: known.title,
                        grant_state,
                        revision_fingerprint: known.revision_fingerprint,
                        expected_fingerprint: expected_fingerprint.map(str::to_string),
                    },
                    None,
                );
            }
        };
        let bundle = okf_core::read_bundle(&root);
        let fingerprint = health::bundle_fingerprint(&bundle);
        if expected_fingerprint.is_some_and(|expected| expected != fingerprint) {
            return (
                FederatedBundleStatus {
                    bundle_id: known.bundle_id,
                    title: bundle.name,
                    grant_state: LibraryGrantState::Changed,
                    revision_fingerprint: Some(fingerprint),
                    expected_fingerprint: expected_fingerprint.map(str::to_string),
                },
                None,
            );
        }
        let status = FederatedBundleStatus {
            bundle_id: known.bundle_id.clone(),
            title: bundle.name.clone(),
            grant_state: LibraryGrantState::Available,
            revision_fingerprint: Some(fingerprint.clone()),
            expected_fingerprint: expected_fingerprint.map(str::to_string),
        };
        (
            status,
            Some(ResolvedBundle {
                known,
                bundle,
                fingerprint,
            }),
        )
    }
}

fn access_state(
    grants: &BundleGrantState,
    known: &KnownBundle,
) -> Result<PathBuf, LibraryGrantState> {
    let scope = Path::new(&known.scope_root);
    if !grants.remembers_folder(scope) {
        return Err(LibraryGrantState::Revoked);
    }
    let scope = grants
        .authorize_folder(scope)
        .map_err(|_| LibraryGrantState::Missing)?;
    let root = dunce::canonicalize(&known.root).map_err(|_| LibraryGrantState::Missing)?;
    if !root.is_dir() {
        return Err(LibraryGrantState::Missing);
    }
    if !root.starts_with(scope) {
        return Err(LibraryGrantState::Revoked);
    }
    grants
        .authorize_bundle(&root)
        .map_err(|_| LibraryGrantState::Revoked)
}

fn concept_result(
    bundle: &ResolvedBundle,
    concept: &okf_core::Concept,
    snippet: String,
) -> FederatedConceptResult {
    FederatedConceptResult {
        bundle_id: bundle.known.bundle_id.clone(),
        bundle_title: bundle.bundle.name.clone(),
        concept_id: concept.id.clone(),
        revision_fingerprint: bundle.fingerprint.clone(),
        grant_state: LibraryGrantState::Available,
        title: concept.title.clone(),
        concept_type: concept.concept_type.clone(),
        description: concept.description.clone(),
        tags: concept.tags.clone(),
        snippet,
    }
}

fn concept_ref(bundle: &ResolvedBundle, concept: &okf_core::Concept) -> FederatedConceptRef {
    FederatedConceptRef {
        bundle_id: bundle.known.bundle_id.clone(),
        bundle_title: bundle.bundle.name.clone(),
        concept_id: concept.id.clone(),
        revision_fingerprint: bundle.fingerprint.clone(),
        grant_state: LibraryGrantState::Available,
        title: concept.title.clone(),
    }
}

fn push_group(
    map: &mut BTreeMap<String, Vec<FederatedConceptRef>>,
    key: String,
    value: FederatedConceptRef,
) {
    if key.is_empty() {
        return;
    }
    let group = map.entry(key).or_default();
    if group.len() < MAX_RELATIONSHIP_GROUP {
        group.push(value);
    }
}

fn append_candidates(
    output: &mut Vec<FederatedRelationshipCandidate>,
    groups: BTreeMap<String, Vec<FederatedConceptRef>>,
    kind: &str,
    basis: &str,
    limit: usize,
) {
    for (evidence, mut group) in groups {
        group.sort_by(|left, right| {
            left.bundle_id
                .cmp(&right.bundle_id)
                .then_with(|| left.concept_id.cmp(&right.concept_id))
        });
        for left_index in 0..group.len() {
            for right_index in (left_index + 1)..group.len() {
                let left = &group[left_index];
                let right = &group[right_index];
                if left.bundle_id == right.bundle_id {
                    continue;
                }
                output.push(FederatedRelationshipCandidate {
                    kind: kind.to_string(),
                    basis: basis.to_string(),
                    evidence: evidence.clone(),
                    requires_review: true,
                    left: left.clone(),
                    right: right.clone(),
                });
                if output.len() > limit {
                    return;
                }
            }
        }
    }
}

fn validate_bundle_ids(bundle_ids: &[String]) -> Result<(), String> {
    if bundle_ids.is_empty() || bundle_ids.len() > MAX_SELECTIONS {
        return Err(format!("Choose between 1 and {MAX_SELECTIONS} bundles."));
    }
    let mut seen = HashSet::new();
    for bundle_id in bundle_ids {
        if uuid::Uuid::parse_str(bundle_id).is_err() || !seen.insert(bundle_id) {
            return Err("The bundle selection contains an invalid or duplicate ID.".to_string());
        }
    }
    Ok(())
}

fn validate_selections(selections: &[FederatedBundleSelection]) -> Result<(), String> {
    validate_bundle_ids(
        &selections
            .iter()
            .map(|selection| selection.bundle_id.clone())
            .collect::<Vec<_>>(),
    )?;
    if selections.iter().any(|selection| {
        selection.revision_fingerprint.len() > 64
            || !selection
                .revision_fingerprint
                .starts_with("okf-health-revision-")
    }) {
        return Err("A federated selection has an invalid revision fingerprint.".to_string());
    }
    Ok(())
}

fn validate_limit(limit: usize) -> Result<(), String> {
    if limit == 0 || limit > MAX_QUERY_LIMIT {
        return Err(format!(
            "Federated query limit must be between 1 and {MAX_QUERY_LIMIT}."
        ));
    }
    Ok(())
}

fn normalized_query(value: Option<String>, label: &str) -> Result<Option<String>, String> {
    value
        .map(|value| required_query(value, label).map(|value| value.to_lowercase()))
        .transpose()
}

fn required_query(value: String, label: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > MAX_QUERY_CHARS
        || value.chars().any(char::is_control)
    {
        return Err(format!(
            "Federated {label} must contain 1 to {MAX_QUERY_CHARS} visible characters."
        ));
    }
    Ok(value.to_string())
}

fn normalized_title(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn sorted_unique<'a>(values: impl Iterator<Item = &'a str>) -> Vec<String> {
    values
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn grant_order(state: LibraryGrantState) -> u8 {
    match state {
        LibraryGrantState::Available => 0,
        LibraryGrantState::Changed => 1,
        LibraryGrantState::Missing => 2,
        LibraryGrantState::Revoked => 3,
    }
}

fn path_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "A bundle library path is not valid UTF-8.".to_string())
}

fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            duration.as_millis().min(u128::from(u64::MAX)) as u64
        })
}

fn read_library(file: &Path) -> Result<Vec<KnownBundle>, String> {
    if !file.exists() {
        return Ok(Vec::new());
    }
    if fs::metadata(file)
        .map_err(|error| format!("could not inspect the library file: {error}"))?
        .len()
        > MAX_LIBRARY_FILE_BYTES
    {
        return Err("the bundle library file exceeds the 2 MB limit".to_string());
    }
    let persisted: PersistedLibrary = serde_json::from_slice(
        &fs::read(file).map_err(|error| format!("could not read the library file: {error}"))?,
    )
    .map_err(|error| format!("could not parse the library file: {error}"))?;
    if persisted.schema_version != LIBRARY_SCHEMA_VERSION
        || persisted.bundles.len() > MAX_LIBRARY_ENTRIES
    {
        return Err("the bundle library has an unsupported schema or too many entries".to_string());
    }
    let mut ids = HashSet::new();
    let mut roots = HashSet::new();
    for bundle in &persisted.bundles {
        if uuid::Uuid::parse_str(&bundle.bundle_id).is_err()
            || !ids.insert(bundle.bundle_id.as_str())
            || !roots.insert(bundle.root.as_str())
            || !Path::new(&bundle.root).is_absolute()
            || !Path::new(&bundle.scope_root).is_absolute()
            || bundle.title.is_empty()
            || bundle.title.chars().count() > 512
            || bundle.types.len() > 512
            || bundle.tags.len() > 4096
        {
            return Err("the bundle library contains an invalid entry".to_string());
        }
    }
    Ok(persisted.bundles)
}

fn write_library(file: &Path, bundles: &[KnownBundle]) -> Result<(), String> {
    let parent = file
        .parent()
        .ok_or_else(|| "Studio's bundle library has no parent directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| {
        format!("Studio could not create its bundle library directory: {error}")
    })?;
    let bytes = serde_json::to_vec_pretty(&PersistedLibrary {
        schema_version: LIBRARY_SCHEMA_VERSION,
        bundles: bundles.to_vec(),
    })
    .map_err(|error| format!("Studio could not encode its bundle library: {error}"))?;
    if bytes.len() as u64 > MAX_LIBRARY_FILE_BYTES {
        return Err("Studio's bundle library exceeds its 2 MB limit.".to_string());
    }
    fs::write(file, bytes)
        .map_err(|error| format!("Studio could not save its bundle library: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{BundleLibraryState, FederatedBundleSelection, LibraryGrantState};
    use crate::bundle_grant::{BundleGrantKind, BundleGrantState};
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::{Path, PathBuf};

    struct Fixture {
        base: PathBuf,
        grants: BundleGrantState,
        library_file: PathBuf,
        library: BundleLibraryState,
        left: PathBuf,
        right: PathBuf,
    }

    impl Fixture {
        fn new(name: &str) -> Self {
            let base = std::env::temp_dir().join(format!(
                "okf-studio-library-{name}-{}",
                uuid::Uuid::new_v4()
            ));
            let state = base.join("state");
            let left = base.join("left");
            let right = base.join("right");
            write_bundle(&left, "Left knowledge", "Shared concept", "left evidence");
            write_bundle(
                &right,
                "Right knowledge",
                "Shared concept",
                "right evidence",
            );
            let grants = BundleGrantState::load_from(state.join("grants.json"));
            let library_file = state.join("library.json");
            let library = BundleLibraryState::load_from(library_file.clone());
            for root in [&left, &right] {
                grants
                    .grant(root, BundleGrantKind::LocalFolder)
                    .expect("grant bundle");
                let detected = okf_core::scan_bundles_with_depth(root, 0);
                assert_eq!(detected.len(), 1);
                grants
                    .register_bundle_roots(root, [root.clone()])
                    .expect("register bundle root");
                library
                    .register_detected(root, BundleGrantKind::LocalFolder, &detected)
                    .expect("register library identity");
            }
            Self {
                base,
                grants,
                library_file,
                library,
                left,
                right,
            }
        }

        fn selections(&self) -> Vec<FederatedBundleSelection> {
            self.library
                .preview(
                    &self.grants,
                    self.library
                        .entries(&self.grants, None)
                        .into_iter()
                        .map(|entry| entry.bundle_id)
                        .collect(),
                )
                .expect("preview bundles")
                .into_iter()
                .map(|status| FederatedBundleSelection {
                    bundle_id: status.bundle_id,
                    revision_fingerprint: status
                        .revision_fingerprint
                        .expect("available fingerprint"),
                })
                .collect()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }

    #[test]
    fn keeps_bundle_identity_across_rescan_and_restart() {
        let fixture = Fixture::new("identity");
        let before = fixture
            .library
            .entries(&fixture.grants, None)
            .into_iter()
            .map(|entry| (entry.title, entry.bundle_id))
            .collect::<BTreeMap<_, _>>();

        for root in [&fixture.left, &fixture.right] {
            let detected = okf_core::scan_bundles_with_depth(root, 0);
            fixture
                .library
                .register_detected(root, BundleGrantKind::LocalFolder, &detected)
                .expect("rescan bundle");
        }
        let restored = BundleLibraryState::load_from(fixture.library_file.clone());
        let after = restored
            .entries(&fixture.grants, None)
            .into_iter()
            .map(|entry| (entry.title, entry.bundle_id))
            .collect::<BTreeMap<_, _>>();

        assert_eq!(before, after);
        assert_ne!(before["Left knowledge"], before["Right knowledge"]);
    }

    #[test]
    fn federates_same_concept_ids_without_collision_and_requires_review_for_candidates() {
        let fixture = Fixture::new("federation");
        let selections = fixture.selections();
        let search = fixture
            .library
            .search(
                &fixture.grants,
                selections.clone(),
                "Shared".to_string(),
                10,
            )
            .expect("federated search");

        assert_eq!(search.results.len(), 2);
        assert!(search
            .results
            .iter()
            .all(|result| result.concept_id == "shared"));
        assert_ne!(search.results[0].bundle_id, search.results[1].bundle_id);
        assert!(search.results.iter().all(|result| {
            result.grant_state == LibraryGrantState::Available
                && result
                    .revision_fingerprint
                    .starts_with("okf-health-revision-")
        }));

        let inventory = fixture
            .library
            .inventory(&fixture.grants, selections.clone(), None, None, None, 2)
            .expect("federated inventory");
        assert_eq!(inventory.results.len(), 2);
        assert_ne!(
            inventory.results[0].bundle_id,
            inventory.results[1].bundle_id
        );

        let relationships = fixture
            .library
            .relationships(&fixture.grants, selections, 10)
            .expect("relationship candidates");
        assert!(relationships.results.iter().any(|candidate| {
            candidate.kind == "possible-duplicate"
                && candidate.basis == "matching-title"
                && candidate.requires_review
        }));
        assert!(relationships.results.iter().any(|candidate| {
            candidate.kind == "relationship-candidate"
                && candidate.basis == "shared-source"
                && candidate.requires_review
        }));
    }

    #[test]
    fn changed_and_revoked_bundles_return_partial_status_without_results() {
        let fixture = Fixture::new("partial");
        let selections = fixture.selections();
        let left_id = fixture
            .library
            .entries(&fixture.grants, None)
            .into_iter()
            .find(|entry| entry.title == "Left knowledge")
            .expect("left bundle")
            .bundle_id;
        fs::write(
            fixture.left.join("shared.md"),
            concept_markdown("Shared concept", "changed evidence"),
        )
        .expect("change left bundle");
        let right_scope = fixture
            .grants
            .grant(&fixture.right, BundleGrantKind::LocalFolder)
            .expect("right grant path");
        assert!(fixture.grants.revoke(&right_scope).expect("revoke right"));

        let result = fixture
            .library
            .inventory(&fixture.grants, selections, None, None, None, 10)
            .expect("partial inventory");

        assert!(result.results.is_empty());
        assert_eq!(
            result
                .bundles
                .iter()
                .find(|status| status.bundle_id == left_id)
                .expect("changed status")
                .grant_state,
            LibraryGrantState::Changed
        );
        assert!(result
            .bundles
            .iter()
            .any(|status| status.grant_state == LibraryGrantState::Revoked));
    }

    #[test]
    fn rejects_unbounded_or_duplicate_selection_inputs() {
        let fixture = Fixture::new("bounds");
        let entry = fixture.library.entries(&fixture.grants, None).remove(0);
        assert!(fixture
            .library
            .preview(
                &fixture.grants,
                vec![entry.bundle_id.clone(), entry.bundle_id]
            )
            .expect_err("reject duplicate")
            .contains("invalid or duplicate"));
        assert!(fixture
            .library
            .search(&fixture.grants, Vec::new(), "query".to_string(), 10)
            .expect_err("reject empty selection")
            .contains("Choose between"));
    }

    #[test]
    fn refuses_a_remembered_root_that_is_no_longer_detected_as_a_bundle() {
        let fixture = Fixture::new("stale-root");
        let left_id = fixture
            .library
            .entries(&fixture.grants, None)
            .into_iter()
            .find(|entry| entry.title == "Left knowledge")
            .expect("left bundle")
            .bundle_id;
        let selection = fixture
            .selections()
            .into_iter()
            .find(|selection| selection.bundle_id == left_id)
            .expect("left selection");
        fixture
            .grants
            .register_bundle_roots(&fixture.left, std::iter::empty::<PathBuf>())
            .expect("remove detected roots");

        let result = fixture
            .library
            .inventory(&fixture.grants, vec![selection], None, None, None, 10)
            .expect("stale root inventory");

        assert!(result.results.is_empty());
        assert_eq!(result.bundles[0].grant_state, LibraryGrantState::Revoked);
    }

    fn write_bundle(root: &Path, name: &str, title: &str, body: &str) {
        fs::create_dir_all(root).expect("create bundle");
        fs::write(
            root.join("index.md"),
            format!("# {name}\n\n- [Shared concept](shared.md)\n"),
        )
        .expect("write index");
        fs::write(root.join("shared.md"), concept_markdown(title, body)).expect("write concept");
    }

    fn concept_markdown(title: &str, body: &str) -> String {
        format!(
            "---\ntype: Concept\ntitle: {title}\nresource: https://example.com/shared\n---\n\n# Notes\n\n{body}\n"
        )
    }
}
