---
type: Research
title: External Bundle References Experiment
description: Source, trust boundary, identity rule, and adoption gate for references to separately owned bundles.
tags: [research, interoperability, federation, external, experiment]
timestamp: 2026-07-23T23:30:00Z
---

# Source record

- Demand signal: [GoogleCloudPlatform/knowledge-catalog issue #175, “Registry for external OKF references”](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/175)
- Retrieved: 2026-07-23
- Local evidence: the `google-okf` declaration in the built-in bundle root

# Hypothesis and value

A bundle should be able to name knowledge owned elsewhere without making a reader contact that owner during ordinary open. A local alias can separate display and identity from network resolution.

# Result

Studio inventories a credential-free HTTPS URL, optional expected revision, and optional contained local cache. It performs no request during analysis. A user must open the existing URL review dialog before supported GitHub or archive retrieval. Cached content remains read-only and reports missing or digest-mismatch states.

External identity is `external:<alias>:<concept-id>`. A foreign concept can therefore never impersonate an unprefixed local concept.

# Adoption gate

Do not make cross-bundle links navigable from Markdown until cache lifecycle, revoked grants, unavailable sources, digest changes, and namespaced backlinks have adversarial fixtures. No fetch may occur on bundle open.

