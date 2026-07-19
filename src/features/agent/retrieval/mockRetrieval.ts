import type { Bundle } from "@/shared/types.ts";
import type {
  ReceiptDiff,
  RetrievalRequest,
  RetrievalResult,
  RetrievalRoute,
} from "./types.ts";

export function mockRetrieval(bundle: Bundle, request: RetrievalRequest): RetrievalResult {
  const query = request.query.trim();
  const terms = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1);
  const route = request.route ?? mockRoute(query);
  const ranked = bundle.concepts
    .map((concept) => {
      const text = [concept.id, concept.title, concept.type, concept.description, concept.body]
        .join(" ")
        .toLowerCase();
      const exact = concept.id.toLowerCase() === query.toLowerCase()
        ? 10_000
        : concept.title.toLowerCase() === query.toLowerCase()
          ? 9_000
          : 0;
      const matchedTerms = terms.filter((term) => text.includes(term));
      const lexical = matchedTerms.length * 100;
      return { concept, exact, lexical, matchedTerms, total: exact + lexical };
    })
    .filter((candidate) => candidate.total > 0 || route === "full-context")
    .sort((left, right) => right.total - left.total || left.concept.id.localeCompare(right.concept.id));
  const budget = request.contextBudgetTokens ?? 4096;
  let used = 0;
  const omissions: RetrievalResult["receipt"]["omissions"] = [];
  const evidence: RetrievalResult["evidence"]["items"] = [];
  const candidates = ranked.map((candidate) => {
    const tokens = Math.max(1, Math.ceil(candidate.concept.body.length / 4));
    const included = used + tokens <= budget;
    if (included) {
      used += tokens;
      evidence.push({
        sectionId: `mock-${candidate.concept.id}`,
        conceptId: candidate.concept.id,
        conceptTitle: candidate.concept.title,
        headingPath: [],
        sourceRange: { startLine: 1, endLine: candidate.concept.body.split("\n").length },
        text: candidate.concept.body,
        citations: candidate.concept.externalLinks,
        relationshipPath: [],
        tokenEstimate: tokens,
      });
    } else {
      omissions.push({
        sectionId: `mock-${candidate.concept.id}`,
        conceptId: candidate.concept.id,
        reason: "context-budget",
        detail: "The coherent unit did not fit the remaining context budget.",
      });
    }
    return {
      sectionId: `mock-${candidate.concept.id}`,
      conceptId: candidate.concept.id,
      included,
      score: {
        exact: candidate.exact,
        lexical: candidate.lexical,
        graph: 0,
        coverage: 0,
        authority: 0,
        total: candidate.total,
      },
      matchedTerms: candidate.matchedTerms,
      relationshipPath: [],
      exclusion: included ? null : omissions.at(-1) ?? null,
    };
  });
  const diagnosticClass = evidence.length === 0
    ? "empty-results"
    : omissions.length > 0
      ? "budget-omission"
      : "ready";
  const fingerprint = `mock-${bundle.concepts.length}-${bundle.issues.length}`;
  return {
    manifest: {
      bundleId: "mock-bundle",
      bundleName: bundle.name,
      bundleFingerprint: fingerprint,
      conceptCount: bundle.concepts.length,
      unitCount: bundle.concepts.length,
    },
    evidence: {
      schemaVersion: 1,
      manifestFingerprint: fingerprint,
      query,
      items: evidence,
      caveats: [],
      estimatedTokens: used,
      bytes: evidence.reduce((total, item) => total + item.text.length, 0),
      requiresAbstention: evidence.length === 0,
    },
    receipt: {
      schemaVersion: 1,
      receiptId: `mock-receipt-${query}-${route}`,
      query,
      queryClass: route === "exact-lexical" ? "lexical" : "mixed",
      route,
      routeReason: request.route ? "The user selected this route for the query." : "Studio selected a deterministic local route.",
      bundleId: "mock-bundle",
      bundleFingerprint: fingerprint,
      filters: request.filters ?? {},
      candidates,
      omissions,
      contextBudgetTokens: budget,
      contextTokensUsed: used,
      providers: [{
        capability: "local-retrieval",
        providerId: "okf-core-mock",
        state: "local",
        remoteTextShared: false,
        detail: "Retrieval stayed on this device.",
      }],
      elapsedMicros: 1200,
      cache: {
        eligible: false,
        cacheId: null,
        state: "provider-unavailable",
        providerId: null,
        scopeFingerprint: fingerprint,
      },
    },
    diagnostic: {
      class: diagnosticClass,
      summary: diagnosticClass === "ready"
        ? "The local route produced bounded evidence."
        : diagnosticClass === "budget-omission"
          ? "Relevant evidence was omitted because it did not fit the context budget."
          : "No evidence matched this query in the granted bundle.",
      affectedConceptIds: [...new Set([...evidence.map((item) => item.conceptId), ...omissions.map((item) => item.conceptId)])],
      suggestedAction: diagnosticClass === "empty-results"
        ? "Check the query or use a broader available route."
        : "Inspect the receipt when you need candidate or budget detail.",
    },
    repairs: [],
  };
}

export function mockReceiptDiff(
  left: RetrievalResult["receipt"],
  right: RetrievalResult["receipt"],
): ReceiptDiff {
  const leftIds = new Set(left.candidates.filter((item) => item.included).map((item) => item.sectionId));
  const rightIds = new Set(right.candidates.filter((item) => item.included).map((item) => item.sectionId));
  return {
    routeChanged: left.route !== right.route,
    addedSections: [...rightIds].filter((id) => !leftIds.has(id)),
    removedSections: [...leftIds].filter((id) => !rightIds.has(id)),
    changedExclusions: [],
    tokenDelta: right.contextTokensUsed - left.contextTokensUsed,
  };
}

function mockRoute(query: string): RetrievalRoute {
  const normalized = query.toLowerCase();
  if (/related|depends|path|impact|connected|affect|relies on|used by/.test(normalized)) return "lexical-graph";
  if (/across|overview|summary|all concepts|what (?:is|does) this (?:repo|repository|project|bundle)/.test(normalized)) return "coverage";
  if (/current|as of|changed since|what (?:has )?changed|recent changes/.test(normalized)) return "temporal-conflict";
  if (/table|row|column|field|schema|how many|number of/.test(normalized)) return "structured";
  if (/entire bundle|full context/.test(normalized)) return "full-context";
  if (/similar|conceptually|discover/.test(normalized)) return "hybrid-fallback";
  return "exact-lexical";
}
