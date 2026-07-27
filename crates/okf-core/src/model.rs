//! The data model shared across the IPC boundary, serialized to camelCase JSON
//! for the React + TypeScript frontend. Mirrors `docs/architecture/data-model.md`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A detected bundle root, as listed by the Bundle Browser before a full parse.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleRoot {
    /// Absolute path of the bundle root.
    pub root: String,
    /// Display name (root index.md H1, else directory name).
    pub name: String,
    /// Path relative to the chosen folder (for display).
    pub rel_path: String,
    pub okf_version: Option<String>,
    pub confidence: Confidence,
    pub concept_count: u32,
    /// Distinct `type` values present, sorted.
    pub types: Vec<String>,
}

/// A fully parsed bundle: concepts, navigation, log, and validation results.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub root: String,
    pub name: String,
    pub okf_version: Option<String>,
    /// The ODSF profile version a design-system bundle's root `index.md` declares
    /// (`odsf_version`), if any. A property of the data, surfaced read-only.
    pub odsf_version: Option<String>,
    /// Producer-defined root `index.md` frontmatter after promoted bundle
    /// keys are removed. Nested values are preserved without interpretation.
    #[serde(default)]
    pub extra: BTreeMap<String, serde_json::Value>,
    pub concepts: Vec<Concept>,
    pub indexes: Vec<IndexNode>,
    pub log: Vec<LogEntry>,
    pub issues: Vec<Issue>,
    pub confidence: Confidence,
}

// --- OKF v0.2 provenance, trust and lifecycle (spec sections 5 and 7) --------
//
// v0.1 answered "what does an agent need to know?". v0.2 adds "should the agent
// believe it, and is it still true?", by making provenance, confirmation and
// freshness frontmatter rather than prose. These types carry that, and the two
// breaking changes both keep a v0.1 fallback: `timestamp` still reads as
// `generated.at` when `generated` is absent, and a legacy `# Citations` body
// section still reads as sources when `sources` is absent.

/// Where a claim came from, and how credible that origin is (spec 5.1).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    /// REQUIRED within an entry. A followable artifact, or a scope descriptor
    /// like "all queries in BigQuery project X" that a consumer cannot follow.
    pub resource: String,
    /// The join key a body footnote label matches, when the body cites this.
    pub id: Option<String>,
    pub title: Option<String>,
    /// Authority: who or what produced the source, in the actor convention.
    pub author: Option<String>,
    /// Adoption and liveness, over the concept's `usage_window`.
    pub usage_count: Option<u64>,
    /// Recency of the *source*, distinct from when the concept was written.
    pub last_modified: Option<String>,
}

/// The `{ from, to }` range framing every `usage_count`, written once as a
/// sibling of `sources`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub from: Option<String>,
    pub to: Option<String>,
}

/// An identity in the actor convention (spec 7): `<producer>/<version>` for
/// agents and tools, `human:<id>` for a person, `process:<id>` for automation.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attribution {
    /// REQUIRED within `generated`; the actor.
    pub by: String,
    /// ISO 8601 datetime.
    pub at: Option<String>,
}

impl Attribution {
    /// Whether this actor is a person. Trust classification keys off the
    /// `human:` prefix, which is exactly why producers must not write it for
    /// content an agent generated.
    pub fn is_human(&self) -> bool {
        self.by.starts_with("human:")
    }
}

/// Lifecycle (spec 5.4). Absent means `Stable`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConceptStatus {
    /// Not yet reviewed, possibly incomplete.
    Draft,
    #[default]
    Stable,
    /// Shipped and usable, but the API may still move.
    ///
    /// Not OKF's. ODSF v0.1 defined `status` as stable/experimental/deprecated,
    /// OKF v0.2 then claimed the key with draft/stable/deprecated, and ODSF v0.2
    /// resolves it by making OKF's set normative while keeping `experimental` as
    /// a profile extension — design systems genuinely ship components that are
    /// neither drafts nor stable. Studio reads ODSF tokens, so it is a
    /// design-aware consumer and recognizes it rather than treating it as junk.
    Experimental,
    /// Kept for links and history, no longer current.
    Deprecated,
}

impl ConceptStatus {
    /// Parsed tolerantly: an unrecognized value is not an error at the model
    /// layer, it reads as the default and the validator reports it.
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "draft" => Self::Draft,
            "experimental" => Self::Experimental,
            "deprecated" => Self::Deprecated,
            _ => Self::Stable,
        }
    }

    /// The spec's spelling, matching how this serializes. Round-trips through
    /// `parse`.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Stable => "stable",
            Self::Experimental => "experimental",
            Self::Deprecated => "deprecated",
        }
    }
}

/// How much a consumer should believe a concept, derived from `verified`
/// (spec 5.3). Lowest to highest.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrustTier {
    /// No `verified` entries.
    Unverified,
    /// Verified, but by non-`human:` actors only.
    MachineConfirmed,
    /// At least one `human:` verifier.
    HumanReviewed,
}

impl TrustTier {
    /// Matching how this serializes, for callers that carry the tier as text.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unverified => "unverified",
            Self::MachineConfirmed => "machine-confirmed",
            Self::HumanReviewed => "human-reviewed",
        }
    }
}

/// One typed, named hole in a computation (spec 10.1).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputationParameter {
    pub name: String,
    #[serde(rename = "type")]
    pub parameter_type: Option<String>,
    pub required: bool,
}

/// Run instructions, and the evidence shape a run must return (spec 10.1).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputationExecutor {
    pub resource: Option<String>,
    /// The fields a run must return for the attester to inspect, for example a
    /// BigQuery job id, the executed SQL, and the result.
    pub receipt: Vec<String>,
}

/// The deterministic check over a receipt. Code, never an LLM (spec 10.1).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputationAttester {
    pub resource: Option<String>,
}

/// The contract of a `type: Attested Computation` concept (spec 10).
///
/// It exists so a consumer can verify that a reported number came from the
/// blessed computation rather than from an agent writing plausible SQL. The
/// hard constraint lives with the consumer, not here: an agent may supply
/// values for `parameters` and must not author or edit the computation.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputationContract {
    /// REQUIRED. How to run it, and therefore how the executor and attester
    /// read it and what `parameters` mean: `bigquery`, `dbt`, `python`, …
    pub runtime: String,
    pub parameters: Vec<ComputationParameter>,
    /// Path to the computation, used instead of an inline body fence.
    pub computation: Option<String>,
    pub executor: Option<ComputationExecutor>,
    pub attester: Option<ComputationAttester>,
}

/// The concept type that carries a [`ComputationContract`].
pub const ATTESTED_COMPUTATION_TYPE: &str = "Attested Computation";

/// One unit of knowledge: a non-reserved `.md` file.
///
/// `Default` is derived so a fixture can name the fields it cares about and
/// spread the rest. The default is the shape a wholly non-conformant file
/// already parses to — empty type, no provenance — which the model tolerates by
/// design, so it describes something real rather than an impossible concept.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Concept {
    /// Path minus `.md`, relative to root, e.g. `tables/orders`.
    pub id: String,
    /// Required by OKF; empty only on a non-conformant concept.
    #[serde(rename = "type")]
    pub concept_type: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    /// v0.1's authored-at. Kept because v0.2 consumers MAY fall back to it when
    /// `generated` is absent; read it through [`Concept::authored_at`] rather
    /// than directly, so the fallback applies.
    pub timestamp: Option<String>,
    pub resource: Option<String>,
    /// Provenance (spec 5.1). Empty when the concept declares none.
    pub sources: Vec<Source>,
    /// Frames every `usage_count` in `sources`.
    pub usage_window: Option<UsageWindow>,
    /// Who wrote it (spec 5.2).
    pub generated: Option<Attribution>,
    /// Who has since confirmed it. A bare mapping counts as one entry.
    pub verified: Vec<Attribution>,
    /// Lifecycle (spec 5.4).
    pub status: ConceptStatus,
    /// Absolute date; stale on or after this day.
    pub stale_after: Option<String>,
    /// Present on a `type: Attested Computation` concept (spec 10).
    pub computation: Option<ComputationContract>,
    /// Any other frontmatter keys, preserved (the OKF extension contract).
    pub extra: BTreeMap<String, serde_json::Value>,
    /// Raw markdown body (rendered in the frontend).
    pub body: String,
    /// Resolved intra-bundle target Concept IDs.
    pub links: Vec<String>,
    /// http(s)/mailto targets.
    pub external_links: Vec<String>,
    /// Intra-bundle hrefs that resolve to no concept.
    pub broken_links: Vec<String>,
    /// Reverse of links (backlinks).
    pub cited_by: Vec<String>,
    /// links.len() + cited_by.len(), for node sizing.
    pub degree: u32,
}

impl Concept {
    /// When the content last meaningfully changed.
    ///
    /// `generated.at` is v0.2's field; a v0.1 concept only has `timestamp`. The
    /// spec permits the fallback, so every caller that wants "when was this
    /// written" reads it here rather than picking one field and being wrong on
    /// half the bundles.
    pub fn authored_at(&self) -> Option<&str> {
        self.generated
            .as_ref()
            .and_then(|generated| generated.at.as_deref())
            .or(self.timestamp.as_deref())
    }

    /// How much to believe this, from `verified` (spec 5.3).
    ///
    /// Deliberately derived rather than stored: a bundle cannot declare itself
    /// trusted, it can only record who confirmed it and let a consumer compute
    /// the tier.
    pub fn trust_tier(&self) -> TrustTier {
        if self.verified.is_empty() {
            TrustTier::Unverified
        } else if self.verified.iter().any(Attribution::is_human) {
            TrustTier::HumanReviewed
        } else {
            TrustTier::MachineConfirmed
        }
    }

    /// Whether `today` is on or after `stale_after`.
    ///
    /// `today` is passed in rather than read from the clock so staleness stays a
    /// pure date comparison, which is also what makes it testable. Both dates
    /// are ISO `YYYY-MM-DD`, so a lexicographic compare is the date compare.
    pub fn is_stale_on(&self, today: &str) -> bool {
        self.stale_after
            .as_deref()
            .is_some_and(|stale_after| today >= stale_after)
    }

    /// Whether this concept is still meant to be used: not deprecated, not past
    /// its staleness date.
    pub fn is_current_on(&self, today: &str) -> bool {
        self.status != ConceptStatus::Deprecated && !self.is_stale_on(today)
    }

    /// The source whose `id` a body footnote label refers to.
    ///
    /// Attribution resolves by matching the label to an entry's `id`, not by
    /// parsing the footnote text, so it survives an agent reordering the list.
    pub fn source_by_id(&self, id: &str) -> Option<&Source> {
        self.sources
            .iter()
            .find(|source| source.id.as_deref() == Some(id))
    }

    /// Whether this concept carries a computation contract.
    pub fn is_attested_computation(&self) -> bool {
        self.concept_type.trim() == ATTESTED_COMPUTATION_TYPE
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    Confident,
    Candidate,
}

/// Parsed (or synthesized) index.md, one per directory, mirroring the tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexNode {
    /// Directory path relative to root ("" = bundle root).
    pub dir: String,
    pub title: String,
    /// The directory's authored `index.md` prose — the body with its `# H1`
    /// title and the navigation link-bullets (which are the tree) stripped, so
    /// the folder-home view can render the orientation text without re-showing
    /// the lists. Empty for a synthesized index or a bare list with no prose.
    pub intro: String,
    /// True if no index.md existed and the core built one.
    pub synthesized: bool,
    pub sections: Vec<IndexSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexSection {
    pub heading: String,
    pub entries: Vec<IndexEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexEntry {
    pub title: String,
    /// Concept ID, or a subdirectory path for a directory entry.
    pub target: String,
    pub description: String,
    pub kind: EntryKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Concept,
    Directory,
}

/// One date-grouped block of a parsed log.md, in file order (newest first).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    /// The "## " heading verbatim, even if not ISO YYYY-MM-DD.
    pub date: String,
    /// The bullet lines under that date, as raw markdown.
    pub entries: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub concept_id: Option<String>,
    pub level: IssueLevel,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueLevel {
    Error,
    Warning,
}
