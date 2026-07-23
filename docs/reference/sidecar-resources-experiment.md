---
type: Research
title: Sidecar Resources Experiment
description: Source, safe-open policy, digest evidence, and adoption gate for files that accompany a concept.
tags: [research, interoperability, resources, sidecars, media, experiment]
timestamp: 2026-07-23T23:30:00Z
---

# Source record

- Demand signal: [GoogleCloudPlatform/knowledge-catalog issue #111, “Define a media type for OKF bundles”](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/111)
- Retrieved: 2026-07-23
- Local evidence: `assets/interop-sample.json`, declared by [Interoperability Lab](../features/interoperability-lab.md)

# Hypothesis and value

Data, notebooks, diagrams, and other supporting files should travel with a concept without becoming executable bundle content. An explicit path, media type, digest, and size make that boundary inspectable.

# Result

Rust canonicalizes each path inside the granted bundle, refuses symlink escapes, caps inspection and export at 64 MiB, computes SHA-256, and compares an optional authored digest. A closed safe-preview media set may use existing inert readers. Everything else remains download-only.

The named export action opens a native save dialog outside the bundle. Studio never executes a sidecar or renders unknown media as trusted HTML. Missing, invalid, escaping, oversize, and digest-mismatched declarations stay visible and cannot export.

# Adoption gate

Keep the map experimental until representative notebook, dataset, diagram, and unknown-media fixtures pass packaging, move, projection, digest-change, and safe-open tests across supported operating systems.

