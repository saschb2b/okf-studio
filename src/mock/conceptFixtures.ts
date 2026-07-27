// Shared concept fixtures.
//
// `Concept` carries the OKF v0.2 field families, and they are required rather
// than optional because the core always serializes them — an empty `sources` is
// `[]` and an absent `generated` is `null`. That is right for the contract and
// tedious for a fixture, so one builder holds the neutral shape and every caller
// names only what its test is about.

import type { Concept } from "@/shared/types.ts";

/**
 * The v0.2 families as a concept that declares none of them: no provenance, no
 * confirmation, stable, never stale. This is what a v0.1 document parses to, so
 * it is a real shape rather than a filler.
 */
export const NO_PROVENANCE = {
  sources: [],
  usageWindow: null,
  generated: null,
  verified: [],
  status: "stable",
  staleAfter: null,
  computation: null,
} as const satisfies Pick<
  Concept,
  "sources" | "usageWindow" | "generated" | "verified" | "status" | "staleAfter" | "computation"
>;

export function mockConcept(overrides: Partial<Concept> = {}): Concept {
  return {
    id: "tables/orders",
    type: "Table",
    title: "Orders",
    description: "One row per order.",
    tags: [],
    timestamp: null,
    resource: null,
    ...NO_PROVENANCE,
    extra: {},
    body: "",
    links: [],
    externalLinks: [],
    brokenLinks: [],
    citedBy: [],
    degree: 0,
    ...overrides,
  };
}
