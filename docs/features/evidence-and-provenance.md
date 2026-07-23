---
type: Feature
title: Evidence and Provenance
description: Keep source identity with a concept, connect claims to evidence, and check public sources only after an explicit user action.
tags: [feature, provenance, evidence, citations, freshness, security]
timestamp: 2026-07-23T18:30:00Z
---

# What it does

The optional `io.okf.evidence` profile gives a concept two related maps:

- `provenance` records where selected material came from and how Studio observed it;
- `evidence` gives a stable source ID to a claim marker such as `[^report]`, with an optional locator and source-check observation.

The [Concept Reader](concept-reader.md) resolves a structured claim marker into an ordinary sanitized Markdown footnote. The footnote returns to the claim and, when the source has a public HTTPS URI, links to that source. The Evidence module in the reader rail shows the durable identity, locator, adapter, digest, authored observation, and any advisory problem. The same source records and claim lines travel in [Retrieval Intelligence](retrieval-intelligence.md) evidence packets.

This is an advisory profile. Missing provenance or evidence does not make a concept invalid, and producer-defined fields remain preserved.

# Durable provenance

Every versioned [source adapter](source-adapters.md) receipt records the observation time, adapter and version, discovery mode, media type, original-byte fingerprint, normalized-evidence fingerprint, and a bounded visible origin. When a source enters an OKF task context, Studio projects that receipt into a durable concept-ready record:

```yaml
provenance:
  report:
    title: Public report
    uri: https://example.com/report
    observed_at: 2026-07-23T12:00:00Z
    source_digest: sha256-…
    evidence_digest: sha256-…
    adapter:
      id: html
      version: 1
    discovery: url
    media_type: text/html
    locator: Results page
```

An accepted context manifest carries this projection with the source body. An agent can therefore include the exact profile record in a staged concept instead of reconstructing identity from a title. Reopening the bundle derives the same human-readable source from frontmatter alone.

A selected file never contributes an absolute local path. A file keeps its filename; folder intake keeps a safe relative locator; an absolute or parent-traversing origin is reduced to its final filename. Public source URIs must be credential-free HTTPS. Cache paths and request credentials are not profile fields.

# Claim evidence

The evidence map uses a safe source ID as its key:

```yaml
evidence:
  report:
    provenance_id: report
    locator: Results, paragraph 4
    last_checked_at: 2026-07-23T12:30:00Z
    last_status: available
    last_fingerprint: sha256-…
```

The body can then write:

```markdown
The measured result increased by 12 percent.[^report]
```

Structured markers deliberately omit a Markdown footnote definition. Studio creates the rendered footnote from the evidence map. A normal authored footnote that already has a `[^report]:` definition stays ordinary Markdown and is not reinterpreted as structured evidence.

Studio accepts at most 128 evidence sources and 1,024 structured claim markers per concept for dedicated interpretation. IDs are ASCII letters, numbers, dots, underscores, or hyphens and are at most 128 characters. Displayed values are bounded and rendered as text. Unknown or excess producer data remains available in the preserved metadata instead of becoming executable markup. Knowledge Health expands at most 64 per-source evidence findings for one concept and then reports how many additional findings it omitted.

# Explicit source checks

A credential-free HTTPS evidence source shows **Check source**. Pressing it runs the existing Rust-owned public-source fetch:

1. require HTTPS and reject credentials;
2. disable environment proxies;
3. resolve and reject private, loopback, link-local, and special-use addresses at every hop;
4. follow at most three checked redirects;
5. enforce connect, read, response-size, and supported-media bounds; and
6. compare the returned source fingerprint with the authored fingerprint.

The result is **Available**, **Changed**, or **Unavailable**, with an observation time and returned fingerprint when present. **Changed** means the fetched representation differs. **Unavailable** means this check did not retrieve it. Neither result proves that the concept is true or false.

Opening a bundle, entering the reader, expanding Evidence, or running ordinary health analysis performs no network request. The browser-development fixture uses a local deterministic response. A maintainer who wants to retain a new check observation starts a profile-aware revision and reviews the frontmatter change through staged validation and Apply.

# Evidence health

[Knowledge Health](knowledge-health.md) joins the authored contract into deterministic advice:

- a claim marker without an evidence entry names the concept path and body line;
- an invalid source entry names the source ID;
- an evidence entry with no claim marker is a heuristic review hint;
- a source authored as `changed` or `unavailable` records its last status, time, and fingerprint;
- lifecycle, contradiction, replacement, and retrieval conflict findings remain visible beside source findings.

The finding explains what was observed and what cannot be inferred. A failed URL is not a factual-invalidity finding. Evidence repairability remains `guided`, so an agent may propose a source, locator, citation, or refreshed observation, but Studio never invents or applies one mechanically.

# Source signals

The implementation responds to the provenance and evidence needs discussed in Google knowledge-catalog issues [#52](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/52), [#94](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/94), [#95](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/95), [#204](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/204), and [#211](https://github.com/GoogleCloudPlatform/knowledge-catalog/issues/211), retrieved 2026-07-23. These issues are product signals, not new OKF conformance rules.

# Related concepts

- [Source Adapters and Provenance](source-adapters.md) owns intake and receipt validation.
- [IPC and Security](../architecture/ipc-and-security.md) owns the explicit public-source network boundary.
- [Reliability and Lifecycle](reliability-and-lifecycle.md) supplies advisory maintenance and contradiction signals.
- [Advisory Profiles](advisory-profiles.md) keeps this contract local, version-pinned, and separate from OKF validation.
