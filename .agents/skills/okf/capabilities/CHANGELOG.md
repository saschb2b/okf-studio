# Built-in OKF capability changelog

Capability changes are benchmarked and reviewed like tool changes. Versions are independent; changing one capability does not imply that every capability changed.

## 2026-07-18

- Added the Rust-validated `okf-artifact` envelope, exact bundle-fingerprint binding, revision lineage, typed sources and citations, required fields, and reviewed-export rule. All task capabilities now emit their declared structured work through this contract; capabilities that build the envelope first call `okf_health_summary`.
- Added deterministic health summary, finding-detail, affected-concept, and repair-recipe tools. `okf-audit@0.2.0` and `okf-repair@0.2.0` now use revision-bound health findings, while `okf-core@0.2.0` documents the shared health command and stale-finding rule.
- Added `okf-inspect@0.1.0`, `okf-create@0.1.0`, `okf-enrich@0.1.0`, `okf-audit@0.1.0`, `okf-repair@0.1.0`, `okf-research@0.1.0`, `okf-change-impact@0.1.0`, and `okf-migrate@0.1.0`.
- Kept the shared specification, command reference, templates, and invariant safety boundary in `okf-core@0.1.0`.
- Bound each task capability to one frozen benchmark contract under `benchmarks/okf-agent`.
