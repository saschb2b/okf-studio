# Built-in OKF capability changelog

Capability changes are benchmarked and reviewed like tool changes. Versions are independent; changing one capability does not imply that every capability changed.

## 2026-07-27

- Updated `okf-core` to `0.6.0` and `okf-foundation` to `1.4.0` for OKF v0.2. The methods now carry provenance, trust and lifecycle as frontmatter rather than prose: `sources` with credibility signals replaces the `# Citations` body section, `generated` replaces `timestamp`, and `verified`, `status` and `stale_after` let a consumer decide whether to believe a concept and whether it is still current. Adds the `attest` method for the `Attested Computation` type, and the `migrate` method for moving a v0.1 bundle across. A v0.1 bundle stays consumable under the two documented fallbacks, so migration is not urgent.

## 2026-07-19

- Updated `okf-core` to `0.5.1`, `okf-retrieve` to `0.1.1`, and `okf-foundation` to `1.3.1`. Ordinary Studio answers now keep retrieval identities internal and leave the evidence inventory to the compact receipt and Inspect surface. Diagnostic artifacts retain the complete identities and receipt.

## 2026-07-18

- Updated `okf-core` to `0.5.0` and `okf-foundation` to `1.3.0`. Added `okf-retrieve@0.1.0`, the provider-neutral `okf_retrieve` tool, stable section evidence, retrieval receipts, routing and omission disclosure, and abstention guidance. Inspect, research, and change-impact methods now use coherent retrieval before reading whole concepts.
- Updated `okf-core` to `0.4.0` and `okf-foundation` to `1.2.0`. Generic chat now sees the complete active capability catalog and can load one narrow versioned method through the read-only OKF Studio MCP boundary. The root skill uses the same router when an external agent reads it from disk.
- Added `okf-author@0.1.0`, `okf-revise@0.1.0`, and the shared `writing` resource. Authoring now begins from a reader job and accepted evidence; style-only revision must reconcile every claim and route semantic changes to enrichment.
- Added `writing-revision` to the structured artifact contract and `okf-foundation@1.1.0`.
- Wrapped the curated suite in the declarative `okf-foundation@1.0.0` pack with built-in provenance, Studio compatibility, conflict declarations, the shared template resource, the `okf-artifact-v1` schema, and the complete closed Studio tool set. The v1 pack schema has no executable script, hook, binary, or MCP-command fields.
- Added the Rust-validated `okf-artifact` envelope, exact bundle-fingerprint binding, revision lineage, typed sources and citations, required fields, and reviewed-export rule. All task capabilities now emit their declared structured work through this contract; capabilities that build the envelope first call `okf_health_summary`.
- Added deterministic health summary, finding-detail, affected-concept, and repair-recipe tools. `okf-audit@0.2.0` and `okf-repair@0.2.0` now use revision-bound health findings, while `okf-core@0.2.0` documents the shared health command and stale-finding rule.
- Added `okf-inspect@0.1.0`, `okf-create@0.1.0`, `okf-enrich@0.1.0`, `okf-audit@0.1.0`, `okf-repair@0.1.0`, `okf-research@0.1.0`, `okf-change-impact@0.1.0`, and `okf-migrate@0.1.0`.
- Kept the shared specification, command reference, templates, and invariant safety boundary in `okf-core@0.1.0`.
- Bound each task capability to one frozen benchmark contract under `benchmarks/okf-agent`.
