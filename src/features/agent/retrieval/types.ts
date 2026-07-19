export type QueryClass =
  | "exact"
  | "lexical"
  | "semantic"
  | "relationship"
  | "global"
  | "temporal"
  | "structured"
  | "full-context"
  | "mixed";

export type RetrievalRoute =
  | "exact-lexical"
  | "lexical-graph"
  | "coverage"
  | "temporal-conflict"
  | "structured"
  | "full-context"
  | "hybrid-fallback";

export interface RetrievalFilters {
  conceptType?: string;
  tag?: string;
  currentAsOf?: string;
  changedSince?: string;
  sourceClass?: string;
  owner?: string;
}

export interface RetrievalRequest {
  query: string;
  route?: RetrievalRoute;
  filters?: RetrievalFilters;
  limit?: number;
  contextBudgetTokens?: number;
  denseProviderId?: string;
  rerankerProviderId?: string;
  cacheProviderId?: string;
  providerWindowTokens?: number;
  allowRemoteText?: boolean;
}

export interface ScoreComponents {
  exact: number;
  lexical: number;
  graph: number;
  coverage: number;
  authority: number;
  total: number;
}

export interface RetrievalOmission {
  sectionId: string;
  conceptId: string;
  reason:
    | "filter-mismatch"
    | "duplicate-evidence"
    | "context-budget"
    | "lower-rank"
    | "missing-grant"
    | "stale-manifest"
    | "provider-unavailable"
    | "unsupported-authority";
  detail: string;
}

export interface EvidenceItem {
  sectionId: string;
  conceptId: string;
  conceptTitle: string;
  headingPath: string[];
  sourceRange: { startLine: number; endLine: number };
  text: string;
  citations: string[];
  relationshipPath: string[];
  tokenEstimate: number;
}

export interface EvidenceCaveat {
  kind: "stale" | "conflict" | "inferred-relationship" | "broken-link" | "authority-unknown";
  conceptIds: string[];
  message: string;
}

export interface EvidencePacket {
  schemaVersion: number;
  manifestFingerprint: string;
  query: string;
  items: EvidenceItem[];
  caveats: EvidenceCaveat[];
  estimatedTokens: number;
  bytes: number;
  requiresAbstention: boolean;
}

export interface ProviderReceipt {
  capability: string;
  providerId: string | null;
  state: "local" | "configured" | "unavailable" | "degraded" | "cancelled";
  remoteTextShared: boolean;
  detail: string;
}

export interface ReceiptCandidate {
  sectionId: string;
  conceptId: string;
  included: boolean;
  score: ScoreComponents;
  matchedTerms: string[];
  relationshipPath: string[];
  exclusion: RetrievalOmission | null;
}

export interface RetrievalReceipt {
  schemaVersion: number;
  receiptId: string;
  query: string;
  queryClass: QueryClass;
  route: RetrievalRoute;
  routeReason: string;
  bundleId: string;
  bundleFingerprint: string;
  filters: RetrievalFilters;
  candidates: ReceiptCandidate[];
  omissions: RetrievalOmission[];
  contextBudgetTokens: number;
  contextTokensUsed: number;
  providers: ProviderReceipt[];
  elapsedMicros: number;
  cache: {
    eligible: boolean;
    cacheId: string | null;
    state: string;
    providerId: string | null;
    scopeFingerprint: string;
  };
}

export type DiagnosticClass =
  | "ready"
  | "empty-results"
  | "low-recall"
  | "noisy-candidates"
  | "filter-mismatch"
  | "stale-manifest"
  | "missing-metadata"
  | "conflicting-evidence"
  | "budget-omission"
  | "provider-failure"
  | "generation-non-use";

export interface RetrievalDiagnostic {
  class: DiagnosticClass;
  summary: string;
  affectedConceptIds: string[];
  suggestedAction: string;
}

export interface RepairProposal {
  proposalId: string;
  kind:
    | "add-description"
    | "add-link"
    | "repair-link"
    | "add-citation"
    | "split-concept"
    | "add-index-entry"
    | "clarify-title";
  conceptId: string;
  rationale: string;
  evidenceSectionIds: string[];
  expectedQuery: string;
  heldOutQueries: string[];
  expectedImprovement: string;
  requiresReview: true;
}

export interface RetrievalResult {
  manifest: {
    bundleId: string;
    bundleName: string;
    bundleFingerprint: string;
    conceptCount: number;
    unitCount: number;
  };
  evidence: EvidencePacket;
  receipt: RetrievalReceipt;
  diagnostic: RetrievalDiagnostic;
  repairs: RepairProposal[];
}

export interface ReceiptDiff {
  routeChanged: boolean;
  addedSections: string[];
  removedSections: string[];
  changedExclusions: string[];
  tokenDelta: number;
}

export const RETRIEVAL_ROUTES: readonly { id: RetrievalRoute; label: string; description: string }[] = [
  { id: "exact-lexical", label: "Exact wording", description: "Best for names, IDs, headings, and phrases that should appear in the bundle." },
  { id: "lexical-graph", label: "Related concepts", description: "Adds bounded authored links and backlinks." },
  { id: "coverage", label: "Across the bundle", description: "Looks across concepts and types for overview questions." },
  { id: "temporal-conflict", label: "Current and conflicting claims", description: "Keeps competing time or authority claims visible." },
  { id: "structured", label: "Tables and fields", description: "Prioritizes tables, fields, and exact numeric cells." },
  { id: "full-context", label: "Full bundle", description: "Uses the canonical snapshot only when it fits." },
  { id: "hybrid-fallback", label: "Broader local search", description: "Combines local text and relationship signals to widen the search." },
];
