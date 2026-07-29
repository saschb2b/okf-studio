//! Turning what a fan-out returned into one reviewable result.
//!
//! The hard part of assembly is not merging, it is refusing to merge. A fan-out
//! runs while the bundle underneath it can change, some runs fail, and some
//! never report. An assembly that quietly folded all of that together would
//! read exactly like a complete one, and the difference would be invisible at
//! the moment it matters: when someone decides whether to act on it.
//!
//! So this reports rather than reconciles. Every run that did not make it into
//! the assembly is named, with the reason, and coverage is stated against the
//! plan rather than against the runs that happened to answer. A partial result
//! that says it is partial is useful; one that does not is worse than nothing.
//!
//! # Staleness
//!
//! A run computed against one bundle state cannot be mixed with a run computed
//! against another. The fingerprint comparison is the same rule that already
//! makes a structured artifact stale, applied at the point results meet.
//!
//! See docs/architecture/agent-orchestration.md.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

/// How one run ended.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "status"
)]
pub(crate) enum RunResult {
    /// The run produced a validated artifact.
    Completed {
        artifact_kind: String,
        /// Work items the artifact carried. Coverage is about slices, not
        /// items, but an assembly that names zero items from a completed run is
        /// worth seeing.
        item_count: usize,
    },
    /// The run failed. The message is the run's, not an invented summary.
    Failed { message: String },
    /// The run stopped because it reached its ceiling. Distinct from a failure:
    /// what it produced before stopping may still be worth keeping, and the
    /// user's next move is different.
    StoppedAtBudget { spent_description: String },
    /// The turn finished, and no artifact came back that could be validated.
    ///
    /// Its own outcome rather than a failure, because the turn did not fail:
    /// the model may have answered in prose, or validation may be unavailable
    /// on this path. Either way the assembly has nothing to include, and saying
    /// which of those happened is more useful than calling it broken.
    CompletedWithoutArtifact { reason: String },
}

/// One run's report back to the fan-out.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunOutcome {
    pub run_id: String,
    pub slice_key: String,
    /// The fingerprint this run's slice was computed against.
    pub slice_fingerprint: String,
    pub result: RunResult,
}

/// Why a run is not part of the assembly.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub(crate) enum AssemblyExclusion {
    /// The bundle changed under this run. Its work is not wrong, it is about a
    /// different bundle, and merging generations is how an assembly becomes
    /// quietly incoherent.
    StaleRun {
        run_id: String,
        slice_key: String,
        slice_fingerprint: String,
    },
    FailedRun {
        run_id: String,
        slice_key: String,
        message: String,
    },
    StoppedAtBudget {
        run_id: String,
        slice_key: String,
        spent_description: String,
    },
    NoArtifact {
        run_id: String,
        slice_key: String,
        reason: String,
    },
    /// The plan asked for this slice and nothing reported on it. The exclusion
    /// nobody would notice on their own, which is why coverage is computed
    /// against the plan rather than against the runs that answered.
    SliceNeverReported { slice_key: String },
}

/// What a fan-out produced, and what it did not.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Assembly {
    /// The fingerprint every included run agreed on.
    pub fingerprint: String,
    /// Runs that completed against the current bundle, in slice order.
    pub included: Vec<RunOutcome>,
    pub exclusions: Vec<AssemblyExclusion>,
    /// Slices the plan asked for.
    pub planned_slices: usize,
    /// Slices an included run covered.
    pub covered_slices: usize,
    /// Work items across the included runs.
    pub item_count: usize,
    /// Whether every planned slice is represented by a completed run and
    /// nothing was excluded.
    ///
    /// Computed here and carried, rather than left for each surface to derive.
    /// The subtle half is the exclusions term: full coverage with an excluded
    /// extra run is still not a clean result, and a surface deriving this from
    /// the counts alone would say it was.
    pub complete: bool,
}

/// Assemble the outcomes of a fan-out.
///
/// `planned_slice_keys` comes from the plan, not from the outcomes, so a slice
/// that never reported is a named exclusion rather than a silent absence.
pub(crate) fn assemble(
    outcomes: Vec<RunOutcome>,
    planned_slice_keys: &[String],
    bundle_fingerprint: &str,
) -> Assembly {
    let mut included = Vec::new();
    let mut exclusions = Vec::new();
    let mut reported: BTreeSet<String> = BTreeSet::new();

    // Slice order rather than completion order: two runs of the same fan-out
    // should assemble identically however the scheduler happened to interleave
    // them.
    let mut outcomes = outcomes;
    outcomes.sort_by(|left, right| {
        left.slice_key
            .cmp(&right.slice_key)
            .then_with(|| left.run_id.cmp(&right.run_id))
    });

    for outcome in outcomes {
        reported.insert(outcome.slice_key.clone());
        if outcome.slice_fingerprint != bundle_fingerprint {
            exclusions.push(AssemblyExclusion::StaleRun {
                run_id: outcome.run_id,
                slice_key: outcome.slice_key,
                slice_fingerprint: outcome.slice_fingerprint,
            });
            continue;
        }
        match &outcome.result {
            RunResult::Failed { message } => exclusions.push(AssemblyExclusion::FailedRun {
                run_id: outcome.run_id.clone(),
                slice_key: outcome.slice_key.clone(),
                message: message.clone(),
            }),
            RunResult::StoppedAtBudget { spent_description } => {
                exclusions.push(AssemblyExclusion::StoppedAtBudget {
                    run_id: outcome.run_id.clone(),
                    slice_key: outcome.slice_key.clone(),
                    spent_description: spent_description.clone(),
                })
            }
            RunResult::CompletedWithoutArtifact { reason } => {
                exclusions.push(AssemblyExclusion::NoArtifact {
                    run_id: outcome.run_id.clone(),
                    slice_key: outcome.slice_key.clone(),
                    reason: reason.clone(),
                })
            }
            RunResult::Completed { .. } => included.push(outcome),
        }
    }

    for key in planned_slice_keys {
        if !reported.contains(key) {
            exclusions.push(AssemblyExclusion::SliceNeverReported {
                slice_key: key.clone(),
            });
        }
    }

    let covered_slices = included
        .iter()
        .map(|outcome| outcome.slice_key.as_str())
        .collect::<BTreeSet<_>>()
        .len();
    let item_count = included
        .iter()
        .map(|outcome| match &outcome.result {
            RunResult::Completed { item_count, .. } => *item_count,
            _ => 0,
        })
        .sum();

    let complete = exclusions.is_empty() && covered_slices == planned_slice_keys.len();

    Assembly {
        fingerprint: bundle_fingerprint.to_string(),
        included,
        exclusions,
        planned_slices: planned_slice_keys.len(),
        covered_slices,
        item_count,
        complete,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FINGERPRINT: &str = "okf-health-revision-current";

    fn completed(run_id: &str, slice_key: &str, items: usize) -> RunOutcome {
        RunOutcome {
            run_id: run_id.to_string(),
            slice_key: slice_key.to_string(),
            slice_fingerprint: FINGERPRINT.to_string(),
            result: RunResult::Completed {
                artifact_kind: "health-report".to_string(),
                item_count: items,
            },
        }
    }

    fn planned(keys: &[&str]) -> Vec<String> {
        keys.iter().map(|key| key.to_string()).collect()
    }

    #[test]
    fn a_clean_fan_out_assembles_complete() {
        let assembly = assemble(
            vec![
                completed("run-1", "metrics", 3),
                completed("run-2", "tables", 4),
            ],
            &planned(&["metrics", "tables"]),
            FINGERPRINT,
        );
        assert!(assembly.complete);
        assert_eq!(assembly.covered_slices, 2);
        assert_eq!(assembly.item_count, 7);
        assert!(assembly.exclusions.is_empty());
    }

    #[test]
    fn a_run_against_an_older_bundle_is_excluded_not_merged() {
        // The whole point of the fingerprint: this run's work is not wrong, it
        // is about a different bundle, and mixing generations is how an
        // assembly becomes quietly incoherent.
        let mut stale = completed("run-2", "tables", 9);
        stale.slice_fingerprint = "okf-health-revision-older".to_string();
        let assembly = assemble(
            vec![completed("run-1", "metrics", 3), stale],
            &planned(&["metrics", "tables"]),
            FINGERPRINT,
        );
        assert!(!assembly.complete);
        assert_eq!(assembly.item_count, 3, "a stale run contributed its items");
        assert_eq!(
            assembly.exclusions,
            vec![AssemblyExclusion::StaleRun {
                run_id: "run-2".to_string(),
                slice_key: "tables".to_string(),
                slice_fingerprint: "okf-health-revision-older".to_string(),
            }]
        );
    }

    #[test]
    fn a_failure_names_the_run_and_keeps_the_rest() {
        let assembly = assemble(
            vec![
                completed("run-1", "metrics", 2),
                RunOutcome {
                    run_id: "run-2".to_string(),
                    slice_key: "tables".to_string(),
                    slice_fingerprint: FINGERPRINT.to_string(),
                    result: RunResult::Failed {
                        message: "the provider ended the turn".to_string(),
                    },
                },
            ],
            &planned(&["metrics", "tables"]),
            FINGERPRINT,
        );
        assert_eq!(assembly.included.len(), 1);
        assert_eq!(assembly.covered_slices, 1);
        assert!(matches!(
            assembly.exclusions.first(),
            Some(AssemblyExclusion::FailedRun { run_id, .. }) if run_id == "run-2"
        ));
    }

    #[test]
    fn stopping_at_a_budget_is_not_the_same_as_failing() {
        // Different exclusions because the user's next move differs: raise the
        // ceiling, or fix whatever broke.
        let assembly = assemble(
            vec![RunOutcome {
                run_id: "run-1".to_string(),
                slice_key: "metrics".to_string(),
                slice_fingerprint: FINGERPRINT.to_string(),
                result: RunResult::StoppedAtBudget {
                    spent_description: "0.25 USD".to_string(),
                },
            }],
            &planned(&["metrics"]),
            FINGERPRINT,
        );
        assert!(matches!(
            assembly.exclusions.first(),
            Some(AssemblyExclusion::StoppedAtBudget { .. })
        ));
    }

    #[test]
    fn a_turn_that_finished_without_an_artifact_is_its_own_outcome() {
        // Not a failure: the turn did not fail. The assembly has nothing to
        // include, and saying which of those happened beats calling it broken.
        let assembly = assemble(
            vec![RunOutcome {
                run_id: "run-1".to_string(),
                slice_key: "metrics".to_string(),
                slice_fingerprint: FINGERPRINT.to_string(),
                result: RunResult::CompletedWithoutArtifact {
                    reason: "the response carried no artifact fence".to_string(),
                },
            }],
            &planned(&["metrics"]),
            FINGERPRINT,
        );
        assert!(!assembly.complete);
        assert_eq!(assembly.included.len(), 0);
        assert!(matches!(
            assembly.exclusions.first(),
            Some(AssemblyExclusion::NoArtifact { .. })
        ));
    }

    #[test]
    fn a_slice_that_never_reported_is_named() {
        // The exclusion nobody notices on their own, which is why coverage is
        // computed against the plan and not against whoever answered.
        let assembly = assemble(
            vec![completed("run-1", "metrics", 1)],
            &planned(&["metrics", "tables", "guides"]),
            FINGERPRINT,
        );
        assert_eq!(assembly.planned_slices, 3);
        assert_eq!(assembly.covered_slices, 1);
        let missing: Vec<&str> = assembly
            .exclusions
            .iter()
            .filter_map(|exclusion| match exclusion {
                AssemblyExclusion::SliceNeverReported { slice_key } => Some(slice_key.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(missing, vec!["tables", "guides"]);
    }

    #[test]
    fn completion_order_does_not_change_the_assembly() {
        // A fan-out that assembles differently depending on scheduling cannot
        // be reviewed, because two runs of it disagree for no reason.
        let forward = assemble(
            vec![
                completed("run-1", "metrics", 1),
                completed("run-2", "tables", 2),
            ],
            &planned(&["metrics", "tables"]),
            FINGERPRINT,
        );
        let reverse = assemble(
            vec![
                completed("run-2", "tables", 2),
                completed("run-1", "metrics", 1),
            ],
            &planned(&["metrics", "tables"]),
            FINGERPRINT,
        );
        assert_eq!(forward, reverse);
    }

    #[test]
    fn an_empty_fan_out_reports_every_planned_slice_as_missing() {
        let assembly = assemble(Vec::new(), &planned(&["metrics", "tables"]), FINGERPRINT);
        assert!(!assembly.complete);
        assert_eq!(assembly.exclusions.len(), 2);
        assert_eq!(assembly.covered_slices, 0);
    }

    #[test]
    fn a_complete_assembly_requires_both_no_exclusions_and_full_coverage() {
        // Guards the subtle case: every planned slice covered, but an extra
        // run was excluded. That is still not a clean result.
        let mut stale = completed("run-3", "metrics", 1);
        stale.slice_fingerprint = "older".to_string();
        let assembly = assemble(
            vec![completed("run-1", "metrics", 1), stale],
            &planned(&["metrics"]),
            FINGERPRINT,
        );
        assert_eq!(assembly.covered_slices, assembly.planned_slices);
        assert!(!assembly.complete);
    }
}
