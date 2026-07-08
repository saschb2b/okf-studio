---
type: Card
card_version: 0.1
title: okf
target_version: 0.0.0
description: Author, validate, and maintain knowledge for AI agents as conformant Open Knowledge Format (OKF) bundles, Google's vendor-neutral spec (v0.1) of markdown files with YAML frontmatter for portable...
timestamp: "2026-07-07T20:49:52Z"
target_digest: "sha256:d0e6a40e1c60c2f78d682f62a62d5c503ed7f0a419970611fe48536c75579667"
bom:
  files: 6
  algorithm: sha256-manifest
identity: "did:web:saschb2b.com"
signing:
  scheme: sigstore-keyless
  bundle: CARD.md.sigstore
transparency:
  log: rekor
  stapled: true
capability:
  model: executable
  manifest_declared: permissions.yaml
  source: declared
  network: see-manifest
  shell: null
  filesystem_writes: null
  network_evidence: []
  shell_evidence: []
  declared_external_sources:
    - "https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/"
    - "https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders"
    - "https://example.com/docs/ga4-export"
    - "https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md"
    - "https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf"
    - "https://support.google.com/analytics/answer/7029846"
    - "https://wiki.acme.example/metrics/engagement"
    - "https://wiki.acme.example/sales/orders"
    - "https://wiki.acme.internal/data/quality"
risk_tier: executable-L1
content_provenance:
  applicable: false
attestations: []
expires: 2027-07-07
supersedes: null
---

# okf

Trust card for `okf` (skill). Evidence is graded by the consumer, not asserted here. Run `card.py verify` against the live bundle to evaluate it.

<!--card-data {"type":"Card","card_version":"0.1","title":"okf","target_version":"0.0.0","description":"Author, validate, and maintain knowledge for AI agents as conformant Open Knowledge Format (OKF) bundles, Google's vendor-neutral spec (v0.1) of markdown files with YAML frontmatter for portable...","timestamp":"2026-07-07T20:49:52Z","target_digest":"sha256:d0e6a40e1c60c2f78d682f62a62d5c503ed7f0a419970611fe48536c75579667","bom":{"files":6,"algorithm":"sha256-manifest"},"identity":"did:web:saschb2b.com","signing":{"scheme":"sigstore-keyless","bundle":"CARD.md.sigstore"},"transparency":{"log":"rekor","stapled":true},"capability":{"model":"executable","manifest_declared":"permissions.yaml","source":"declared","network":"see-manifest","shell":null,"filesystem_writes":null,"network_evidence":[],"shell_evidence":[],"declared_external_sources":["https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/","https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders","https://example.com/docs/ga4-export","https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md","https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf","https://support.google.com/analytics/answer/7029846","https://wiki.acme.example/metrics/engagement","https://wiki.acme.example/sales/orders","https://wiki.acme.internal/data/quality"]},"risk_tier":"executable-L1","content_provenance":{"applicable":false},"attestations":[],"expires":"2027-07-07","supersedes":null,"_body":"# okf\n\nTrust card for `okf` (skill). Evidence is graded by the consumer, not asserted here. Run `card.py verify` against the live bundle to evaluate it."} -->
