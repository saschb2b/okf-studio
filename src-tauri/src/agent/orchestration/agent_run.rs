//! The contract a delegated run has to satisfy before a model is contacted.
//!
//! A run is one bounded job: a slice of the bundle, one capability, a budget, an
//! artifact contract, and provenance. All five are resolved here, up front,
//! because every one of them is cheap to check now and expensive to discover
//! afterwards. A run that turns out to be unbudgeted after it has spent money,
//! or write-capable after it has staged a file, is not a run that can be
//! refused any more.
//!
//! # What a run may not do
//!
//! Two refusals carry the design rather than merely guarding it.
//!
//! **A run cannot write.** The multi-agent literature converges on one
//! condition for parallel agents not being fragile: writes stay single-threaded
//! and the extra agents contribute intelligence rather than actions. Studio
//! already satisfies it, because the staged tree is the only write path and
//! Apply is a human control. Delegation must not be the thing that quietly
//! breaks it, so a run may not select a stage-class capability or a staging
//! tool, and the refusal is a resolution failure rather than a runtime error.
//!
//! **A run cannot delegate.** Depth is one. This is an orchestrator-worker
//! system, not a swarm, and a fan-out whose runs can fan out again has no
//! bounded cost.
//!
//! See docs/architecture/agent-orchestration.md.

use crate::agent_capabilities::{CapabilityDefinition, CapabilityRiskClass};
use serde::{Deserialize, Serialize};

/// Tools that change the staged tree. A run that asks for one is refused.
///
/// Named here rather than inferred from the risk class, because the two answer
/// different questions: the class is what a capability is *for*, and this is
/// what a tool can *do*. A read-class capability that quietly required a
/// staging tool would pass a class check and still write.
const WRITE_TOOLS: [&str; 1] = ["studio_stage_propose"];

/// What a run is allowed to spend.
///
/// Both fields are optional individually and at least one is required, because
/// providers report different things: ACP carries a cumulative cost, some
/// providers report only context consumption, and a few report neither. A run
/// under a ceiling nobody can measure is not budgeted, so that case is refused
/// rather than allowed to look bounded.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunBudget {
    pub max_cost: Option<f64>,
    pub max_context_tokens: Option<u64>,
}

impl RunBudget {
    fn is_measurable(&self) -> bool {
        matches!(self.max_cost, Some(cost) if cost > 0.0)
            || matches!(self.max_context_tokens, Some(tokens) if tokens > 0)
    }
}

/// A request to run one slice.
#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunRequest {
    /// The slice's key within its plan.
    pub slice_key: String,
    /// The concepts this run may reason about. Empty is refused: a run with
    /// nothing to read is a plan bug, and running it would spend a turn to
    /// produce an empty artifact.
    pub concept_ids: Vec<String>,
    /// The bundle fingerprint the slice was computed against.
    pub slice_fingerprint: String,
    pub capability_id: String,
    pub artifact_kind: String,
    pub budget: RunBudget,
    /// How many runs deep this already is. Anything but zero is refused.
    #[serde(default)]
    pub depth: u8,
}

/// Why a run will not start. Every variant names what to change.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "reason"
)]
pub(crate) enum RunRefusal {
    /// The slice was computed against a different bundle than the one in front
    /// of us. Same rule that already makes an artifact stale.
    SliceIsStale {
        slice_fingerprint: String,
        bundle_fingerprint: String,
    },
    EmptySlice {
        slice_key: String,
    },
    UnknownCapability {
        capability_id: String,
    },
    /// A run may not write, so it may not hold a capability that exists to.
    CapabilityWrites {
        capability_id: String,
    },
    /// A capability whose declared tools include one that changes the stage.
    CapabilityRequiresWriteTool {
        capability_id: String,
        tool: String,
    },
    /// The capability does not produce what the run was asked to return.
    ArtifactKindNotOffered {
        capability_id: String,
        artifact_kind: String,
    },
    Unbudgeted,
    /// Depth is one. A run cannot start another run.
    NestedDelegation {
        depth: u8,
    },
}

/// Where a run's result came from, kept with the result.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunProvenance {
    pub capability_id: String,
    pub capability_version: String,
    /// The digest of the capability resource the run was given. Delivery
    /// evidence, not a compliance claim: it records what Studio sent, never
    /// that the model followed it.
    pub capability_digest: String,
    pub slice_key: String,
    pub slice_fingerprint: String,
}

/// A run that passed every check and may be started.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DelegatedRun {
    pub run_id: String,
    pub concept_ids: Vec<String>,
    pub artifact_kind: String,
    pub budget: RunBudget,
    /// Exactly the tools this run may call: the capability's own set, which has
    /// already been proven to contain no write tool.
    pub tools: Vec<String>,
    pub provenance: RunProvenance,
}

/// Resolve a request into a run, or refuse it.
///
/// `run_id` is supplied rather than generated so a caller that has to replay or
/// resume a fan-out can rebuild the same run, and so tests are deterministic.
pub(crate) fn resolve_run(
    request: &RunRequest,
    capabilities: &[CapabilityDefinition],
    bundle_fingerprint: &str,
    run_id: &str,
) -> Result<DelegatedRun, RunRefusal> {
    if request.depth != 0 {
        return Err(RunRefusal::NestedDelegation {
            depth: request.depth,
        });
    }
    if request.slice_fingerprint != bundle_fingerprint {
        return Err(RunRefusal::SliceIsStale {
            slice_fingerprint: request.slice_fingerprint.clone(),
            bundle_fingerprint: bundle_fingerprint.to_string(),
        });
    }
    if request.concept_ids.is_empty() {
        return Err(RunRefusal::EmptySlice {
            slice_key: request.slice_key.clone(),
        });
    }
    if !request.budget.is_measurable() {
        return Err(RunRefusal::Unbudgeted);
    }

    let capability = capabilities
        .iter()
        .find(|candidate| candidate.id == request.capability_id)
        .ok_or_else(|| RunRefusal::UnknownCapability {
            capability_id: request.capability_id.clone(),
        })?;

    if matches!(capability.risk_class, CapabilityRiskClass::Stage) {
        return Err(RunRefusal::CapabilityWrites {
            capability_id: capability.id.clone(),
        });
    }
    if let Some(tool) = capability
        .required_tools
        .iter()
        .find(|tool| WRITE_TOOLS.contains(&tool.as_str()))
    {
        return Err(RunRefusal::CapabilityRequiresWriteTool {
            capability_id: capability.id.clone(),
            tool: tool.clone(),
        });
    }
    if !capability
        .artifact_kinds
        .iter()
        .any(|kind| kind == &request.artifact_kind)
    {
        return Err(RunRefusal::ArtifactKindNotOffered {
            capability_id: capability.id.clone(),
            artifact_kind: request.artifact_kind.clone(),
        });
    }

    let mut concept_ids = request.concept_ids.clone();
    concept_ids.sort();
    concept_ids.dedup();

    Ok(DelegatedRun {
        run_id: run_id.to_string(),
        concept_ids,
        artifact_kind: request.artifact_kind.clone(),
        budget: request.budget,
        tools: capability.required_tools.clone(),
        provenance: RunProvenance {
            capability_id: capability.id.clone(),
            capability_version: capability.version.clone(),
            capability_digest: capability
                .resources
                .first()
                .map(|resource| resource.sha256.clone())
                .unwrap_or_default(),
            slice_key: request.slice_key.clone(),
            slice_fingerprint: request.slice_fingerprint.clone(),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_capabilities::CapabilityResourceDefinition;

    const FINGERPRINT: &str = "okf-health-revision-abc123";

    fn capability(
        id: &str,
        risk_class: CapabilityRiskClass,
        tools: &[&str],
        artifact_kinds: &[&str],
    ) -> CapabilityDefinition {
        CapabilityDefinition {
            id: id.to_string(),
            version: "1.2.0".to_string(),
            description: "fixture".to_string(),
            risk_class,
            required_tools: tools.iter().map(|tool| tool.to_string()).collect(),
            artifact_kinds: artifact_kinds.iter().map(|kind| kind.to_string()).collect(),
            resources: vec![CapabilityResourceDefinition {
                id: "method".to_string(),
                label: "Method".to_string(),
                path: "method.md".to_string(),
                media_type: "text/markdown".to_string(),
                sha256: "d1gest".to_string(),
            }],
        }
    }

    fn catalog() -> Vec<CapabilityDefinition> {
        vec![
            capability(
                "okf-audit",
                CapabilityRiskClass::Analyze,
                &["okf_inspect", "okf_health_summary"],
                &["health-report"],
            ),
            capability(
                "okf-author",
                CapabilityRiskClass::Stage,
                &["studio_stage_propose"],
                &["staged-revision"],
            ),
            // A read-class capability that still asks for a staging tool. The
            // combination the class check alone would wave through.
            capability(
                "okf-sneaky",
                CapabilityRiskClass::Read,
                &["okf_inspect", "studio_stage_propose"],
                &["health-report"],
            ),
        ]
    }

    fn request() -> RunRequest {
        RunRequest {
            slice_key: "tables".to_string(),
            concept_ids: vec!["tables/orders".to_string(), "tables/customers".to_string()],
            slice_fingerprint: FINGERPRINT.to_string(),
            capability_id: "okf-audit".to_string(),
            artifact_kind: "health-report".to_string(),
            budget: RunBudget {
                max_cost: Some(0.25),
                max_context_tokens: None,
            },
            depth: 0,
        }
    }

    fn resolve(request: &RunRequest) -> Result<DelegatedRun, RunRefusal> {
        resolve_run(request, &catalog(), FINGERPRINT, "run-1")
    }

    #[test]
    fn a_complete_request_resolves_with_its_provenance() {
        let run = resolve(&request()).expect("run");
        assert_eq!(run.run_id, "run-1");
        // Sorted and deduplicated, so two runs over the same slice are
        // comparable and a repeated id cannot inflate the work.
        assert_eq!(run.concept_ids, vec!["tables/customers", "tables/orders"]);
        assert_eq!(run.tools, vec!["okf_inspect", "okf_health_summary"]);
        assert_eq!(run.provenance.capability_version, "1.2.0");
        assert_eq!(run.provenance.capability_digest, "d1gest");
        assert_eq!(run.provenance.slice_fingerprint, FINGERPRINT);
    }

    #[test]
    fn a_run_may_not_hold_a_capability_that_writes() {
        let mut request = request();
        request.capability_id = "okf-author".to_string();
        request.artifact_kind = "staged-revision".to_string();
        assert_eq!(
            resolve(&request),
            Err(RunRefusal::CapabilityWrites {
                capability_id: "okf-author".to_string()
            })
        );
    }

    #[test]
    fn a_write_tool_is_refused_even_under_a_read_class_capability() {
        // The class says what a capability is for; the tool list says what it
        // can do. Checking only the class lets this one through.
        let mut request = request();
        request.capability_id = "okf-sneaky".to_string();
        assert_eq!(
            resolve(&request),
            Err(RunRefusal::CapabilityRequiresWriteTool {
                capability_id: "okf-sneaky".to_string(),
                tool: "studio_stage_propose".to_string(),
            })
        );
    }

    #[test]
    fn a_run_cannot_start_another_run() {
        let mut request = request();
        request.depth = 1;
        assert_eq!(
            resolve(&request),
            Err(RunRefusal::NestedDelegation { depth: 1 })
        );
    }

    #[test]
    fn a_stale_slice_is_refused_before_anything_is_spent() {
        let mut request = request();
        request.slice_fingerprint = "okf-health-revision-old".to_string();
        assert_eq!(
            resolve(&request),
            Err(RunRefusal::SliceIsStale {
                slice_fingerprint: "okf-health-revision-old".to_string(),
                bundle_fingerprint: FINGERPRINT.to_string(),
            })
        );
    }

    #[test]
    fn an_empty_slice_is_refused_rather_than_run() {
        let mut request = request();
        request.concept_ids.clear();
        assert_eq!(
            resolve(&request),
            Err(RunRefusal::EmptySlice {
                slice_key: "tables".to_string()
            })
        );
    }

    #[test]
    fn an_unknown_capability_is_refused() {
        let mut request = request();
        request.capability_id = "okf-invented".to_string();
        assert!(matches!(
            resolve(&request),
            Err(RunRefusal::UnknownCapability { .. })
        ));
    }

    #[test]
    fn a_capability_that_does_not_produce_the_artifact_is_refused() {
        let mut request = request();
        request.artifact_kind = "migration-plan".to_string();
        assert_eq!(
            resolve(&request),
            Err(RunRefusal::ArtifactKindNotOffered {
                capability_id: "okf-audit".to_string(),
                artifact_kind: "migration-plan".to_string(),
            })
        );
    }

    #[test]
    fn a_budget_nobody_can_measure_is_not_a_budget() {
        for budget in [
            RunBudget {
                max_cost: None,
                max_context_tokens: None,
            },
            RunBudget {
                max_cost: Some(0.0),
                max_context_tokens: None,
            },
            RunBudget {
                max_cost: None,
                max_context_tokens: Some(0),
            },
        ] {
            let mut request = request();
            request.budget = budget;
            assert_eq!(resolve(&request), Err(RunRefusal::Unbudgeted), "{budget:?}");
        }
    }

    #[test]
    fn either_measurable_ceiling_is_enough() {
        // Providers report different things, so requiring both would refuse
        // runs on providers that are perfectly boundable.
        let mut request = request();
        request.budget = RunBudget {
            max_cost: None,
            max_context_tokens: Some(120_000),
        };
        assert!(resolve(&request).is_ok());
    }

    #[test]
    fn depth_is_checked_before_anything_else() {
        // A nested request that is also stale and unbudgeted should still say
        // "nested", because that is the one the caller has to fix first.
        let request = RunRequest {
            depth: 2,
            slice_fingerprint: "stale".to_string(),
            budget: RunBudget {
                max_cost: None,
                max_context_tokens: None,
            },
            ..request()
        };
        assert_eq!(
            resolve(&request),
            Err(RunRefusal::NestedDelegation { depth: 2 })
        );
    }
}
