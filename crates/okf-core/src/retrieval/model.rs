use serde::{Deserialize, Serialize};

pub const RETRIEVAL_SCHEMA_VERSION: u32 = 1;
pub const RETRIEVAL_PRODUCER: &str = "okf-core/retrieval-v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RetrievalUnitKind {
    Introduction,
    Section,
    Table,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRange {
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalHealth {
    pub broken_link_count: usize,
    pub missing_description: bool,
    pub missing_timestamp: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalEvidenceSource {
    pub source_id: String,
    pub title: String,
    pub uri: Option<String>,
    pub locator: Option<String>,
    pub observed_at: Option<String>,
    pub source_digest: Option<String>,
    pub evidence_digest: Option<String>,
    pub adapter_id: Option<String>,
    pub adapter_version: Option<u64>,
    pub media_type: Option<String>,
    pub last_checked_at: Option<String>,
    pub last_status: String,
    pub last_fingerprint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalClaimCitation {
    pub source_id: String,
    pub line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalUnit {
    pub section_id: String,
    pub content_hash: String,
    pub concept_id: String,
    pub concept_title: String,
    pub concept_type: String,
    pub heading_path: Vec<String>,
    pub structural_ordinal: usize,
    pub kind: RetrievalUnitKind,
    pub source_range: SourceRange,
    pub text: String,
    pub tags: Vec<String>,
    pub timestamp: Option<String>,
    pub effective_time: Option<String>,
    pub effective_until: Option<String>,
    pub review_after: Option<String>,
    pub lifecycle: Option<String>,
    pub confidence: Option<String>,
    pub source_class: Option<String>,
    pub owner: Option<String>,
    pub supersedes: Vec<String>,
    pub superseded_by: Vec<String>,
    pub contradicts: Vec<String>,
    pub resource: Option<String>,
    pub citations: Vec<String>,
    pub evidence_sources: Vec<RetrievalEvidenceSource>,
    pub claim_citations: Vec<RetrievalClaimCitation>,
    pub links: Vec<String>,
    pub backlinks: Vec<String>,
    pub token_estimate: usize,
    pub health: RetrievalHealth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalManifest {
    pub schema_version: u32,
    pub producer: String,
    pub bundle_id: String,
    pub bundle_name: String,
    pub bundle_fingerprint: String,
    pub concept_count: usize,
    pub unit_count: usize,
    pub units: Vec<RetrievalUnit>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QueryClass {
    Exact,
    Lexical,
    Semantic,
    Relationship,
    Global,
    Temporal,
    Structured,
    FullContext,
    Mixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RetrievalRoute {
    ExactLexical,
    LexicalGraph,
    Coverage,
    TemporalConflict,
    Structured,
    FullContext,
    HybridFallback,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalFilters {
    pub concept_type: Option<String>,
    pub tag: Option<String>,
    pub current_as_of: Option<String>,
    pub changed_since: Option<String>,
    pub source_class: Option<String>,
    pub owner: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderState {
    Local,
    Configured,
    Unavailable,
    Degraded,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderReceipt {
    pub capability: String,
    pub provider_id: Option<String>,
    pub state: ProviderState,
    pub remote_text_shared: bool,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreComponents {
    pub exact: f64,
    pub lexical: f64,
    pub graph: f64,
    pub coverage: f64,
    pub authority: f64,
    pub total: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalCandidate {
    pub unit: RetrievalUnit,
    pub score: ScoreComponents,
    pub matched_terms: Vec<String>,
    pub relationship_path: Vec<String>,
    pub inferred_relationship: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExclusionReason {
    FilterMismatch,
    DuplicateEvidence,
    ContextBudget,
    LowerRank,
    MissingGrant,
    StaleManifest,
    ProviderUnavailable,
    UnsupportedAuthority,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalOmission {
    pub section_id: String,
    pub concept_id: String,
    pub reason: ExclusionReason,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EvidenceCaveatKind {
    Stale,
    Conflict,
    Uncertain,
    Lifecycle,
    InferredRelationship,
    BrokenLink,
    AuthorityUnknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceCaveat {
    pub kind: EvidenceCaveatKind,
    pub concept_ids: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceItem {
    pub section_id: String,
    pub concept_id: String,
    pub concept_title: String,
    pub heading_path: Vec<String>,
    pub source_range: SourceRange,
    pub text: String,
    pub citations: Vec<String>,
    pub evidence_sources: Vec<RetrievalEvidenceSource>,
    pub claim_citations: Vec<RetrievalClaimCitation>,
    pub relationship_path: Vec<String>,
    pub token_estimate: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePacket {
    pub schema_version: u32,
    pub manifest_fingerprint: String,
    pub query: String,
    pub items: Vec<EvidenceItem>,
    pub caveats: Vec<EvidenceCaveat>,
    pub estimated_tokens: usize,
    pub bytes: usize,
    pub requires_abstention: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptCandidate {
    pub section_id: String,
    pub concept_id: String,
    pub included: bool,
    pub score: ScoreComponents,
    pub matched_terms: Vec<String>,
    pub relationship_path: Vec<String>,
    pub exclusion: Option<RetrievalOmission>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalReceipt {
    pub schema_version: u32,
    pub receipt_id: String,
    pub query: String,
    pub query_class: QueryClass,
    pub route: RetrievalRoute,
    pub route_reason: String,
    pub bundle_id: String,
    pub bundle_fingerprint: String,
    pub filters: RetrievalFilters,
    pub candidates: Vec<ReceiptCandidate>,
    pub omissions: Vec<RetrievalOmission>,
    pub context_budget_tokens: usize,
    pub context_tokens_used: usize,
    pub providers: Vec<ProviderReceipt>,
    pub elapsed_micros: u128,
    pub cache: CacheReceipt,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheReceipt {
    pub eligible: bool,
    pub cache_id: Option<String>,
    pub state: String,
    pub provider_id: Option<String>,
    pub scope_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalResult {
    pub manifest: RetrievalManifestSummary,
    pub evidence: EvidencePacket,
    pub receipt: RetrievalReceipt,
    pub diagnostic: RetrievalDiagnostic,
    pub repairs: Vec<RepairProposal>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalManifestSummary {
    pub bundle_id: String,
    pub bundle_name: String,
    pub bundle_fingerprint: String,
    pub concept_count: usize,
    pub unit_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiagnosticClass {
    Ready,
    EmptyResults,
    LowRecall,
    NoisyCandidates,
    FilterMismatch,
    StaleManifest,
    MissingMetadata,
    ConflictingEvidence,
    BudgetOmission,
    ProviderFailure,
    GenerationNonUse,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalDiagnostic {
    pub class: DiagnosticClass,
    pub summary: String,
    pub affected_concept_ids: Vec<String>,
    pub suggested_action: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RepairKind {
    AddDescription,
    AddLink,
    RepairLink,
    AddCitation,
    SplitConcept,
    AddIndexEntry,
    ClarifyTitle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairProposal {
    pub proposal_id: String,
    pub kind: RepairKind,
    pub concept_id: String,
    pub rationale: String,
    pub evidence_section_ids: Vec<String>,
    pub expected_query: String,
    pub held_out_queries: Vec<String>,
    pub expected_improvement: String,
    pub requires_review: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptDiff {
    pub route_changed: bool,
    pub added_sections: Vec<String>,
    pub removed_sections: Vec<String>,
    pub changed_exclusions: Vec<String>,
    pub token_delta: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalSnapshot {
    pub manifest_fingerprint: String,
    pub snapshot_id: String,
    pub text: String,
    pub estimated_tokens: usize,
    pub bytes: usize,
}
