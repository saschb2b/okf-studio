//! Deterministic decomposition of a bundle into bounded work sets.
//!
//! The asymmetry this exists to spend. A coding agent has to discover a
//! repository by searching it, but `okf-core` has already parsed this bundle:
//! ids, types, tags, links, and folders are known before any model is asked
//! anything. A delegated run that is handed its concepts does not spend a
//! single token rediscovering structure Studio can compute.
//!
//! That matters more than it sounds. In the published evaluation of a
//! multi-agent research system, token usage alone explained about 80% of the
//! variance in performance. Removing tokens from a task without removing
//! information from it is therefore not a cost optimisation sitting next to the
//! quality work; it is most of the quality work.
//!
//! # What a slice is
//!
//! One bounded set of concepts a single run may reason about, addressed by the
//! bundle fingerprint it was computed against. Slices are derived from
//! structure the author already created (a folder, a type, a tag, a link
//! neighbourhood) rather than from a model's guess at how to divide the work.
//! Dividing by context boundary is what the multi-agent literature agrees on;
//! dividing by phase, where one run plans and the next implements, loses
//! context at every handoff.
//!
//! # Determinism
//!
//! The same bundle and the same request produce byte-identical plans. Slices
//! and the ids inside them are sorted, and every cap reports what it excluded
//! instead of silently truncating. A plan carries the fingerprint it was
//! computed against, so a bundle that changes underneath an in-flight fan-out
//! makes its results stale by the rule that already governs artifacts rather
//! than by a fresh one.
//!
//! See docs/architecture/agent-orchestration.md.

use crate::health::bundle_fingerprint;
use crate::model::{Bundle, Concept};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// How the bundle is divided.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SliceBy {
    /// One slice per directory that holds concepts, keyed by the directory.
    /// The bundle root's own concepts form a slice keyed by the empty string.
    Folder,
    /// One slice per declared `type`. The unit of most audits: the questions
    /// worth asking of a Runbook are not the ones worth asking of a Metric.
    Type,
    /// One slice per tag. A concept with several tags appears in several
    /// slices, because a tag is a cross-cutting view rather than a partition.
    Tag,
    /// One slice per concept, carrying that concept and everything it links to
    /// or is cited by. For work where a concept's neighbourhood is the context:
    /// contradiction hunting, relationship repair.
    LinkNeighbourhood,
}

/// Limits on a plan. Every one of them reports what it excluded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SliceLimits {
    /// How many slices the plan may contain, which is the fan-out width.
    pub max_slices: usize,
    /// How many concepts one slice may carry.
    pub max_concepts_per_slice: usize,
}

impl Default for SliceLimits {
    /// Defaults chosen against the published guidance rather than by feel.
    ///
    /// Fan-out width there scales with the task, from a single agent for
    /// fact-finding to more than ten for complex research, so a ceiling of 12
    /// leaves room for the widest documented case while keeping a runaway
    /// decomposition from becoming a bill. The per-slice cap keeps one run
    /// inside a context window without compaction.
    fn default() -> Self {
        Self {
            max_slices: 12,
            max_concepts_per_slice: 40,
        }
    }
}

/// A request to decompose a bundle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SliceRequest {
    pub by: SliceBy,
    #[serde(default)]
    pub limits: SliceLimits,
}

/// One bounded work set.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slice {
    /// Stable within a plan: the folder, type, tag, or centre concept id.
    pub key: String,
    /// What to call this slice in a preview.
    pub title: String,
    /// Sorted, so a plan is comparable byte for byte.
    pub concept_ids: Vec<String>,
    /// Concepts that belong to this slice but did not fit its cap.
    pub excluded_concept_ids: Vec<String>,
}

/// Why something is not in the plan. A cap that truncates silently reads, from
/// the outside, exactly like a bundle that had less in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SliceExclusion {
    /// The plan hit `max_slices`. Names the slices that were dropped whole.
    SlicesOverWidth {
        dropped_keys: Vec<String>,
        limit: usize,
    },
    /// A slice hit `max_concepts_per_slice`.
    ConceptsOverSliceCap {
        slice_key: String,
        dropped: usize,
        limit: usize,
    },
    /// The concept carries nothing to slice by: no type, no tags, as the case
    /// may be. Reported rather than dropped, because a bundle full of these is
    /// a finding about the bundle.
    Unslicable {
        concept_ids: Vec<String>,
        reason: String,
    },
}

/// A decomposition, bound to the bundle it was computed from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlicePlan {
    pub by: SliceBy,
    /// The fingerprint the plan was computed against. A plan whose fingerprint
    /// no longer matches the bundle is stale, and its results do not merge.
    pub fingerprint: String,
    pub slices: Vec<Slice>,
    pub exclusions: Vec<SliceExclusion>,
}

impl SlicePlan {
    /// Concepts covered, counting a concept once even when tags put it in
    /// several slices.
    pub fn covered_concepts(&self) -> BTreeSet<&str> {
        self.slices
            .iter()
            .flat_map(|slice| slice.concept_ids.iter().map(String::as_str))
            .collect()
    }

    /// The fan-out width this plan asks for.
    pub fn width(&self) -> usize {
        self.slices.len()
    }
}

/// The directory a concept id lives in, `""` for the bundle root.
fn folder_of(id: &str) -> &str {
    match id.rfind('/') {
        Some(cut) => &id[..cut],
        None => "",
    }
}

/// One group under construction: its display title and its members.
///
/// A `BTreeSet` of ids rather than a `Vec` so a concept reached twice, which
/// a link neighbourhood does routinely, lands once and stays sorted.
struct Group {
    title: String,
    concept_ids: BTreeSet<String>,
}

/// What grouping produced: the buckets, ordered by key, and the concepts that
/// carried nothing to group by.
struct Grouping {
    groups: BTreeMap<String, Group>,
    unslicable: Vec<String>,
}

/// Group concepts into buckets, collecting anything unslicable rather than
/// dropping it.
fn group(concepts: &[Concept], by: SliceBy) -> Grouping {
    let mut groups: BTreeMap<String, Group> = BTreeMap::new();
    let mut unslicable = Vec::new();

    for concept in concepts {
        match by {
            SliceBy::Folder => {
                let folder = folder_of(&concept.id).to_string();
                let title = if folder.is_empty() {
                    "Bundle root".to_string()
                } else {
                    folder.clone()
                };
                groups
                    .entry(folder)
                    .or_insert_with(|| Group {
                        title,
                        concept_ids: BTreeSet::new(),
                    })
                    .concept_ids
                    .insert(concept.id.clone());
            }
            SliceBy::Type => {
                if concept.concept_type.trim().is_empty() {
                    unslicable.push(concept.id.clone());
                    continue;
                }
                groups
                    .entry(concept.concept_type.clone())
                    .or_insert_with(|| Group {
                        title: concept.concept_type.clone(),
                        concept_ids: BTreeSet::new(),
                    })
                    .concept_ids
                    .insert(concept.id.clone());
            }
            SliceBy::Tag => {
                let tags: Vec<&String> = concept
                    .tags
                    .iter()
                    .filter(|tag| !tag.trim().is_empty())
                    .collect();
                if tags.is_empty() {
                    unslicable.push(concept.id.clone());
                    continue;
                }
                for tag in tags {
                    groups
                        .entry(tag.clone())
                        .or_insert_with(|| Group {
                            title: tag.clone(),
                            concept_ids: BTreeSet::new(),
                        })
                        .concept_ids
                        .insert(concept.id.clone());
                }
            }
            SliceBy::LinkNeighbourhood => {
                let mut neighbourhood = BTreeSet::new();
                neighbourhood.insert(concept.id.clone());
                for linked in concept.links.iter().chain(concept.cited_by.iter()) {
                    neighbourhood.insert(linked.clone());
                }
                groups.insert(
                    concept.id.clone(),
                    Group {
                        title: concept.title.clone(),
                        concept_ids: neighbourhood,
                    },
                );
            }
        }
    }
    Grouping { groups, unslicable }
}

/// Decompose a bundle.
///
/// Width is what the bundle yields, capped: a decomposition that finds one
/// group runs one slice. Nothing here pads the plan out to a target width,
/// because a fixed width spends tokens on jobs that did not need them.
pub fn plan_slices(bundle: &Bundle, request: &SliceRequest) -> SlicePlan {
    let Grouping { groups, unslicable } = group(&bundle.concepts, request.by);
    let mut exclusions = Vec::new();

    if !unslicable.is_empty() {
        let reason = match request.by {
            SliceBy::Type => "the concept declares no type",
            SliceBy::Tag => "the concept declares no tags",
            // Folder and neighbourhood always yield a group.
            _ => "the concept could not be grouped",
        };
        let mut concept_ids = unslicable;
        concept_ids.sort();
        exclusions.push(SliceExclusion::Unslicable {
            concept_ids,
            reason: reason.to_string(),
        });
    }

    // BTreeMap already orders by key, so the width cut is deterministic and
    // the dropped keys can be named rather than merely counted.
    let mut keys: Vec<String> = groups.keys().cloned().collect();
    let dropped_keys: Vec<String> = if keys.len() > request.limits.max_slices {
        keys.split_off(request.limits.max_slices)
    } else {
        Vec::new()
    };
    if !dropped_keys.is_empty() {
        exclusions.push(SliceExclusion::SlicesOverWidth {
            dropped_keys,
            limit: request.limits.max_slices,
        });
    }

    let mut slices = Vec::with_capacity(keys.len());
    for key in keys {
        let bucket = groups.get(&key).expect("key came from this map");
        let mut concept_ids: Vec<String> = bucket.concept_ids.iter().cloned().collect();
        let excluded_concept_ids = if concept_ids.len() > request.limits.max_concepts_per_slice {
            let dropped = concept_ids.split_off(request.limits.max_concepts_per_slice);
            exclusions.push(SliceExclusion::ConceptsOverSliceCap {
                slice_key: key.clone(),
                dropped: dropped.len(),
                limit: request.limits.max_concepts_per_slice,
            });
            dropped
        } else {
            Vec::new()
        };
        slices.push(Slice {
            key,
            title: bucket.title.clone(),
            concept_ids,
            excluded_concept_ids,
        });
    }

    SlicePlan {
        by: request.by,
        fingerprint: bundle_fingerprint(bundle),
        slices,
        exclusions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn concept(id: &str, concept_type: &str, tags: &[&str]) -> Concept {
        Concept {
            id: id.to_string(),
            concept_type: concept_type.to_string(),
            title: id.to_string(),
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            ..Concept::default()
        }
    }

    fn bundle(concepts: Vec<Concept>) -> Bundle {
        Bundle {
            root: String::new(),
            name: "fixture".to_string(),
            okf_version: Some("0.2".to_string()),
            odsf_version: None,
            extra: std::collections::BTreeMap::new(),
            concepts,
            indexes: Vec::new(),
            log: Vec::new(),
            issues: Vec::new(),
            confidence: crate::model::Confidence::Confident,
        }
    }

    fn plan(bundle: &Bundle, by: SliceBy) -> SlicePlan {
        plan_slices(
            bundle,
            &SliceRequest {
                by,
                limits: SliceLimits::default(),
            },
        )
    }

    fn sample() -> Bundle {
        bundle(vec![
            concept("overview", "Product", &["core"]),
            concept("tables/orders", "Table", &["revenue", "core"]),
            concept("tables/customers", "Table", &["core"]),
            concept("metrics/revenue", "Metric", &["revenue"]),
        ])
    }

    #[test]
    fn folders_group_by_directory_with_the_root_as_its_own_slice() {
        let plan = plan(&sample(), SliceBy::Folder);
        let keys: Vec<&str> = plan.slices.iter().map(|slice| slice.key.as_str()).collect();
        assert_eq!(keys, vec!["", "metrics", "tables"]);
        assert_eq!(plan.slices[0].title, "Bundle root");
        assert_eq!(
            plan.slices[2].concept_ids,
            vec!["tables/customers", "tables/orders"]
        );
    }

    #[test]
    fn types_group_by_declared_type() {
        let plan = plan(&sample(), SliceBy::Type);
        let keys: Vec<&str> = plan.slices.iter().map(|slice| slice.key.as_str()).collect();
        assert_eq!(keys, vec!["Metric", "Product", "Table"]);
    }

    #[test]
    fn a_tag_puts_one_concept_in_several_slices() {
        // A tag is a cross-cutting view, not a partition, so coverage counts a
        // concept once while the slices legitimately overlap.
        let plan = plan(&sample(), SliceBy::Tag);
        let keys: Vec<&str> = plan.slices.iter().map(|slice| slice.key.as_str()).collect();
        assert_eq!(keys, vec!["core", "revenue"]);
        assert_eq!(plan.slices[0].concept_ids.len(), 3);
        assert_eq!(plan.slices[1].concept_ids.len(), 2);
        assert_eq!(plan.covered_concepts().len(), 4);
    }

    #[test]
    fn a_neighbourhood_carries_the_concept_and_what_touches_it() {
        let mut orders = concept("tables/orders", "Table", &[]);
        orders.links = vec!["metrics/revenue".to_string()];
        orders.cited_by = vec!["overview".to_string()];
        let bundle = bundle(vec![orders]);
        let plan = plan(&bundle, SliceBy::LinkNeighbourhood);
        assert_eq!(plan.width(), 1);
        assert_eq!(
            plan.slices[0].concept_ids,
            vec!["metrics/revenue", "overview", "tables/orders"]
        );
    }

    #[test]
    fn the_same_bundle_and_request_produce_an_identical_plan() {
        // The property the whole package rests on: a fan-out that cannot be
        // reproduced cannot be reviewed, and a stale result cannot be detected.
        let bundle = sample();
        let first = plan(&bundle, SliceBy::Type);
        let second = plan(&bundle, SliceBy::Type);
        assert_eq!(first, second);
        assert_eq!(
            serde_json::to_string(&first).expect("serialize"),
            serde_json::to_string(&second).expect("serialize")
        );
    }

    #[test]
    fn concept_order_in_the_bundle_does_not_change_the_plan() {
        let forward = sample();
        let mut reversed = sample();
        reversed.concepts.reverse();
        assert_eq!(
            plan(&forward, SliceBy::Folder),
            plan(&reversed, SliceBy::Folder)
        );
    }

    #[test]
    fn width_is_what_the_bundle_yields_rather_than_a_target() {
        let single = bundle(vec![concept("only", "Product", &[])]);
        assert_eq!(plan(&single, SliceBy::Type).width(), 1);
    }

    #[test]
    fn a_width_cap_names_the_slices_it_dropped() {
        let concepts = (0..20)
            .map(|index| concept(&format!("c{index}"), &format!("Type{index:02}"), &[]))
            .collect();
        let plan = plan_slices(
            &bundle(concepts),
            &SliceRequest {
                by: SliceBy::Type,
                limits: SliceLimits {
                    max_slices: 3,
                    max_concepts_per_slice: 40,
                },
            },
        );
        assert_eq!(plan.width(), 3);
        let Some(SliceExclusion::SlicesOverWidth {
            dropped_keys,
            limit,
        }) = plan
            .exclusions
            .iter()
            .find(|exclusion| matches!(exclusion, SliceExclusion::SlicesOverWidth { .. }))
        else {
            panic!("the width cap was not reported: {:?}", plan.exclusions);
        };
        assert_eq!(*limit, 3);
        assert_eq!(dropped_keys.len(), 17);
        assert_eq!(dropped_keys[0], "Type03");
    }

    #[test]
    fn a_per_slice_cap_reports_what_it_left_out() {
        let concepts = (0..10)
            .map(|index| concept(&format!("dir/c{index:02}"), "Table", &[]))
            .collect();
        let plan = plan_slices(
            &bundle(concepts),
            &SliceRequest {
                by: SliceBy::Folder,
                limits: SliceLimits {
                    max_slices: 12,
                    max_concepts_per_slice: 4,
                },
            },
        );
        assert_eq!(plan.slices[0].concept_ids.len(), 4);
        assert_eq!(plan.slices[0].excluded_concept_ids.len(), 6);
        assert!(plan.exclusions.iter().any(|exclusion| matches!(
            exclusion,
            SliceExclusion::ConceptsOverSliceCap {
                dropped: 6,
                limit: 4,
                ..
            }
        )));
    }

    #[test]
    fn a_concept_with_nothing_to_slice_by_is_reported_not_dropped() {
        // A bundle full of untyped concepts is a finding about the bundle, and
        // silently planning around them hides it.
        let bundle = bundle(vec![
            concept("untyped", "", &[]),
            concept("typed", "Table", &[]),
        ]);
        let plan = plan(&bundle, SliceBy::Type);
        assert_eq!(plan.width(), 1);
        let Some(SliceExclusion::Unslicable {
            concept_ids,
            reason,
        }) = plan.exclusions.first()
        else {
            panic!(
                "an unslicable concept was not reported: {:?}",
                plan.exclusions
            );
        };
        assert_eq!(concept_ids, &vec!["untyped".to_string()]);
        assert_eq!(reason, "the concept declares no type");
    }

    #[test]
    fn a_plan_carries_the_fingerprint_it_was_computed_against() {
        let bundle = sample();
        let before = plan(&bundle, SliceBy::Type);
        let mut changed = sample();
        changed.concepts.push(concept("new", "Table", &[]));
        let after = plan(&changed, SliceBy::Type);
        assert_ne!(
            before.fingerprint, after.fingerprint,
            "a changed bundle produced the same fingerprint, so staleness could not be detected"
        );
    }

    #[test]
    fn an_empty_bundle_plans_nothing_rather_than_failing() {
        let plan = plan(&bundle(Vec::new()), SliceBy::Folder);
        assert_eq!(plan.width(), 0);
        assert!(plan.exclusions.is_empty());
    }
}
