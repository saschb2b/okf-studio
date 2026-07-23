---
type: Research
title: Semantic-Web Exchange Experiment
description: Source subset, round-trip evidence, loss accounting, and adoption gate for JSON-LD relationship exchange.
tags: [research, interoperability, json-ld, rdf, relationships, experiment]
timestamp: 2026-07-23T23:30:00Z
---

# Source record

- Technical reference: [W3C JSON-LD 1.1 Recommendation](https://www.w3.org/TR/json-ld11/)
- Producer demand signal: none established in the Google OKF issue set reviewed for this roadmap
- Retrieved: 2026-07-23

# Hypothesis and value

RDF and JSON-LD users may want to exchange selected relationship semantics without requiring Markdown authors to learn a second graph language. Studio can project its existing advisory relationship profile into a small JSON-LD subset instead of introducing an alternate OKF syntax.

# Result

Export includes only profile-typed edges backed by a portable Markdown link with an existing target. It records source ID, target ID, namespace, type, bundle revision, and every omitted construct. Import accepts only the same four-field relationship subset into a read-only preview and reports malformed or unsupported graph items by path.

The Rust round-trip fixture preserves the declared subset exactly. Import writes nothing, performs no reasoning, and does not interpret arbitrary RDF or OWL.

# Adoption gate

Keep the adapter experimental until real producers supply representative graphs and the subset round-trips them with an acceptable, reviewed loss report. Adding a relationship to Markdown requires a future staged authoring transaction.

