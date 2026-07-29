//! What a job has spent, and when it has to stop.
//!
//! The rule this module exists to keep: Studio reports what a provider told it,
//! and says "unavailable" when the provider told it nothing. It never estimates
//! a number into a shape that looks measured.
//!
//! That sounds like a small honesty point and it is a load-bearing one. A
//! ceiling enforced against an estimate is not a ceiling, and a cost line the
//! user believes is a bill they did not agree to. ACP carries a cumulative cost
//! and a context figure, some providers report only one of them, and some
//! report neither. All three cases are representable here; none of them is
//! filled in.
//!
//! # Cumulative, not incremental
//!
//! ACP's usage update reports totals for the session, not deltas. Adding them up
//! would multiply the spend by the number of updates, which on a chatty provider
//! is a ceiling that trips almost immediately. The ledger takes the maximum
//! seen instead, so a provider that re-reports the same total, or reports out of
//! order, cannot inflate it.
//!
//! See docs/architecture/agent-orchestration.md.

use crate::agent_run::RunBudget;
use serde::{Deserialize, Serialize};

/// One usage report from a provider.
#[derive(Clone, Copy, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UsageReport {
    /// Cumulative cost for the session, in the provider's currency.
    pub cost: Option<f64>,
    /// Cumulative context consumption for the session.
    pub context_tokens: Option<u64>,
}

/// What is known about spend so far.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Spend {
    pub cost: Option<f64>,
    pub context_tokens: Option<u64>,
    /// True when no provider has reported anything measurable yet.
    ///
    /// Carried explicitly rather than inferred from two `None`s, because the
    /// surface has to say "unavailable" rather than render a blank that reads
    /// as zero.
    pub unavailable: bool,
}

/// Whether a run or job may continue.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "state"
)]
pub(crate) enum BudgetState {
    /// Inside every ceiling that can be checked.
    Within,
    /// Nothing measurable has been reported, so no ceiling can be checked.
    ///
    /// Deliberately not `Within`. The two mean different things to a reader:
    /// one is "we checked", the other is "we cannot".
    Unmeasured,
    /// A ceiling was reached. Names which one, because the user's next move
    /// differs.
    Exceeded { ceiling: BudgetCeiling },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum BudgetCeiling {
    Cost,
    ContextTokens,
}

/// What a caller gets back when it asks about a budget.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BudgetEvaluation {
    pub spend: Spend,
    pub state: BudgetState,
}

/// Accumulates usage for one run or one job.
#[derive(Clone, Debug, Default)]
pub(crate) struct BudgetLedger {
    spend: Spend,
}

impl BudgetLedger {
    pub fn new() -> Self {
        Self {
            spend: Spend {
                cost: None,
                context_tokens: None,
                unavailable: true,
            },
        }
    }

    /// Fold in one usage report.
    ///
    /// Takes the maximum rather than the sum: these are cumulative totals, and
    /// summing them multiplies the spend by the number of updates.
    pub fn record(&mut self, report: UsageReport) {
        if let Some(cost) = report.cost.filter(|cost| cost.is_finite() && *cost >= 0.0) {
            self.spend.cost = Some(match self.spend.cost {
                Some(previous) if previous > cost => previous,
                _ => cost,
            });
            self.spend.unavailable = false;
        }
        if let Some(tokens) = report.context_tokens {
            self.spend.context_tokens = Some(self.spend.context_tokens.unwrap_or(0).max(tokens));
            self.spend.unavailable = false;
        }
    }

    /// Fold in another ledger, for a job accumulating its runs.
    pub fn absorb(&mut self, other: &BudgetLedger) {
        // Across runs these are separate sessions, so cost adds. Context is a
        // per-session window rather than a pool, so the job carries the largest
        // any one run reached; summing it would describe a context nobody used.
        if let Some(cost) = other.spend.cost {
            self.spend.cost = Some(self.spend.cost.unwrap_or(0.0) + cost);
            self.spend.unavailable = false;
        }
        if let Some(tokens) = other.spend.context_tokens {
            self.spend.context_tokens = Some(self.spend.context_tokens.unwrap_or(0).max(tokens));
            self.spend.unavailable = false;
        }
    }

    pub fn spend(&self) -> &Spend {
        &self.spend
    }

    /// Whether the budget still allows work to continue.
    pub fn state(&self, budget: &RunBudget) -> BudgetState {
        let mut checked_any = false;

        if let (Some(limit), Some(spent)) = (budget.max_cost, self.spend.cost) {
            checked_any = true;
            if spent >= limit {
                return BudgetState::Exceeded {
                    ceiling: BudgetCeiling::Cost,
                };
            }
        }
        if let (Some(limit), Some(spent)) = (budget.max_context_tokens, self.spend.context_tokens) {
            checked_any = true;
            if spent >= limit {
                return BudgetState::Exceeded {
                    ceiling: BudgetCeiling::ContextTokens,
                };
            }
        }

        if checked_any {
            BudgetState::Within
        } else {
            BudgetState::Unmeasured
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn budget(cost: Option<f64>, tokens: Option<u64>) -> RunBudget {
        RunBudget {
            max_cost: cost,
            max_context_tokens: tokens,
        }
    }

    #[test]
    fn a_fresh_ledger_is_unavailable_rather_than_zero() {
        // A blank that renders as 0.00 is a claim nobody made.
        let ledger = BudgetLedger::new();
        assert!(ledger.spend().unavailable);
        assert_eq!(ledger.spend().cost, None);
    }

    #[test]
    fn cumulative_reports_are_not_summed() {
        // ACP reports session totals. Summing them multiplies the spend by the
        // number of updates, which on a chatty provider trips a ceiling almost
        // immediately.
        let mut ledger = BudgetLedger::new();
        for total in [0.05, 0.10, 0.15] {
            ledger.record(UsageReport {
                cost: Some(total),
                context_tokens: None,
            });
        }
        assert_eq!(ledger.spend().cost, Some(0.15));
    }

    #[test]
    fn a_report_that_goes_backwards_cannot_lower_the_spend() {
        let mut ledger = BudgetLedger::new();
        ledger.record(UsageReport {
            cost: Some(0.40),
            context_tokens: Some(9_000),
        });
        ledger.record(UsageReport {
            cost: Some(0.10),
            context_tokens: Some(10),
        });
        assert_eq!(ledger.spend().cost, Some(0.40));
        assert_eq!(ledger.spend().context_tokens, Some(9_000));
    }

    #[test]
    fn a_nonsense_cost_is_ignored_rather_than_recorded() {
        let mut ledger = BudgetLedger::new();
        for cost in [f64::NAN, f64::INFINITY, -1.0] {
            ledger.record(UsageReport {
                cost: Some(cost),
                context_tokens: None,
            });
        }
        assert!(
            ledger.spend().unavailable,
            "a nonsense value made spend look known"
        );
    }

    #[test]
    fn a_provider_reporting_nothing_leaves_the_budget_unmeasured() {
        // Not Within. "We checked and it is fine" and "we cannot check" are
        // different sentences, and only one of them should reassure anyone.
        let ledger = BudgetLedger::new();
        assert_eq!(
            ledger.state(&budget(Some(1.0), Some(100_000))),
            BudgetState::Unmeasured
        );
    }

    #[test]
    fn a_ceiling_with_no_matching_report_does_not_count_as_checked() {
        // Cost ceiling, token-only provider: nothing comparable, so unmeasured.
        let mut ledger = BudgetLedger::new();
        ledger.record(UsageReport {
            cost: None,
            context_tokens: Some(500),
        });
        assert_eq!(
            ledger.state(&budget(Some(1.0), None)),
            BudgetState::Unmeasured
        );
    }

    #[test]
    fn either_ceiling_can_be_the_one_that_trips_and_it_says_which() {
        let mut ledger = BudgetLedger::new();
        ledger.record(UsageReport {
            cost: Some(0.5),
            context_tokens: Some(120_000),
        });
        assert_eq!(
            ledger.state(&budget(Some(0.25), None)),
            BudgetState::Exceeded {
                ceiling: BudgetCeiling::Cost
            }
        );
        assert_eq!(
            ledger.state(&budget(None, Some(100_000))),
            BudgetState::Exceeded {
                ceiling: BudgetCeiling::ContextTokens
            }
        );
        assert_eq!(
            ledger.state(&budget(Some(1.0), Some(200_000))),
            BudgetState::Within
        );
    }

    #[test]
    fn reaching_the_ceiling_exactly_stops() {
        // A budget of 0.25 that permits spending 0.25 and continuing has not
        // bounded anything.
        let mut ledger = BudgetLedger::new();
        ledger.record(UsageReport {
            cost: Some(0.25),
            context_tokens: None,
        });
        assert!(matches!(
            ledger.state(&budget(Some(0.25), None)),
            BudgetState::Exceeded { .. }
        ));
    }

    #[test]
    fn a_job_adds_cost_across_runs_and_keeps_the_largest_context() {
        // Cost is spent per session and adds up. Context is a window each
        // session has to itself, so summing it would describe a context nobody
        // ever used.
        let mut first = BudgetLedger::new();
        first.record(UsageReport {
            cost: Some(0.20),
            context_tokens: Some(80_000),
        });
        let mut second = BudgetLedger::new();
        second.record(UsageReport {
            cost: Some(0.30),
            context_tokens: Some(50_000),
        });

        let mut job = BudgetLedger::new();
        job.absorb(&first);
        job.absorb(&second);
        assert_eq!(job.spend().cost, Some(0.50));
        assert_eq!(job.spend().context_tokens, Some(80_000));
        assert!(!job.spend().unavailable);
    }

    #[test]
    fn absorbing_an_unmeasured_run_does_not_make_the_job_look_measured() {
        let mut job = BudgetLedger::new();
        job.absorb(&BudgetLedger::new());
        assert!(job.spend().unavailable);
    }
}
