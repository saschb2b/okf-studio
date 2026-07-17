---
type: Card
card_version: 0.1
title: fable-mode
target_version: 0.0.0
description: Adopt the structural operating discipline of Anthropic's Fable model in whatever agent harness is running, so the host model (GPT 5.6, Gemini, or any coding agent) orients, parallelizes, delegates...
timestamp: "2026-07-16T11:30:40Z"
target_digest: "sha256:36e16632f63f8640a8cde8929e399a6aab3956b7225fb7ea2c81c3c450d862b8"
bom:
  files: 17
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
    - "https://github.com/asgeirtj/system_prompts_leaks/blob/main/OpenAI/gpt-5.6-sol-extra-high.md"
risk_tier: executable-L1
content_provenance:
  applicable: false
attestations: []
expires: 2027-07-16
supersedes: null
---

# fable-mode

Trust card for `fable-mode` (skill). Evidence is graded by the consumer, not asserted here. Run `card.py verify` against the live bundle to evaluate it.

<!--card-data {"type":"Card","card_version":"0.1","title":"fable-mode","target_version":"0.0.0","description":"Adopt the structural operating discipline of Anthropic's Fable model in whatever agent harness is running, so the host model (GPT 5.6, Gemini, or any coding agent) orients, parallelizes, delegates...","timestamp":"2026-07-16T11:30:40Z","target_digest":"sha256:36e16632f63f8640a8cde8929e399a6aab3956b7225fb7ea2c81c3c450d862b8","bom":{"files":17,"algorithm":"sha256-manifest"},"identity":"did:web:saschb2b.com","signing":{"scheme":"sigstore-keyless","bundle":"CARD.md.sigstore"},"transparency":{"log":"rekor","stapled":true},"capability":{"model":"executable","manifest_declared":"permissions.yaml","source":"declared","network":"see-manifest","shell":null,"filesystem_writes":null,"network_evidence":[],"shell_evidence":[],"declared_external_sources":["https://github.com/asgeirtj/system_prompts_leaks/blob/main/OpenAI/gpt-5.6-sol-extra-high.md"]},"risk_tier":"executable-L1","content_provenance":{"applicable":false},"attestations":[],"expires":"2027-07-16","supersedes":null,"_body":"# fable-mode\n\nTrust card for `fable-mode` (skill). Evidence is graded by the consumer, not asserted here. Run `card.py verify` against the live bundle to evaluate it."} -->
