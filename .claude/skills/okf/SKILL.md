---
name: okf
description: Author, validate, and maintain knowledge for AI agents as conformant Open Knowledge Format (OKF) bundles, Google's vendor-neutral spec (v0.1) of markdown files with YAML frontmatter for portable agent context. Provides commands init, add, enrich, link, index, log, validate, export, and consume over a bundle. Use when the user types /okf or asks to start an OKF bundle, document a BigQuery table, dataset, view, metric, runbook, playbook, API, or join path so an agent can read it, make internal knowledge agent-readable or portable, export a data catalog, metadata, or webpages and external URLs to OKF, or follow the OKF spec. Also apply implicitly whenever you write, transform, or export knowledge an agent will later read (table and metric docs, runbooks, deprecation notices, schemas, docstrings), so it ships as a conformant bundle with a type field per concept instead of ad-hoc prose, and whenever you edit an existing OKF bundle, keeping it conformant by refreshing timestamps, log.md, index.md, and cross-links.
tags: [ai-agents, knowledge, documentation]
date: 2026-06-18
---

# Open Knowledge Format (OKF)

OKF is Google's open, vendor-neutral spec (v0.1) for the context an AI agent needs, represented as a *bundle*. A bundle is a directory of markdown files, each a *concept* (a table, dataset, metric, runbook, playbook, API, join path), kept in version control next to the code it describes. Just markdown, just files, just YAML frontmatter. The format is the contract, so any producer can write a bundle and any consumer (an agent, a viewer, a search index) can read it with no SDK and no lock-in.

Use this skill two ways. Run a **command** on demand, or apply it **implicitly** whenever you shape knowledge an agent will read. The deep normative spec lives in [spec.md](./spec.md); per-command steps in [commands.md](./commands.md); copy-paste starting points in [templates.md](./templates.md).

## The one rule

A bundle is conformant when **every concept document carries YAML frontmatter with a non-empty `type` field.** That is the only hard requirement. Everything else is recommended structure whose absence a consumer must tolerate. Hold this line and a bundle anyone produced stays readable by anyone's agent. The full conformance criteria and the consumer's tolerance contract are in [spec.md](./spec.md).

## Commands

Invoke as `/okf <command> [target]`. Each is detailed in [commands.md](./commands.md).

| Command | What it does |
| --- | --- |
| `init` | Create a bundle. Make the directory, a root `index.md` declaring `okf_version`, and the first concept folders. |
| `add` | Write one concept document. Pick a descriptive `type`, fill the recommended frontmatter, body it with `# Schema`, `# Examples`, `# Citations`. |
| `enrich` | Turn a source (a BigQuery dataset, an OpenAPI spec, a wiki, docstrings) into concepts, then a second pass that crawls authoritative docs to add schemas, join paths, and citations. |
| `link` | Connect concepts with bundle-absolute markdown links and name the relationship in the surrounding prose. |
| `index` | Generate or refresh `index.md` listings so an agent can navigate by progressive disclosure. |
| `log` | Append a dated `log.md` entry (Creation, Update, Deprecation), newest first. |
| `validate` | Run the conformance check. `node okf-validate.mjs <bundle>`, or the manual checklist in [commands.md](./commands.md). |
| `export` | Convert an existing source into a conformant bundle: a catalog, a metadata dump, a schema export, a docs site, or a webpage or external URL (`/okf export <url>`). The producer role. |
| `consume` | Read a bundle to answer a question. Start at `index.md`, follow links, tolerate anything missing. |

## Implicit mode

Apply OKF without being asked whenever knowledge is being shaped for an agent to read later:

- You are documenting a data asset (table, view, dataset, metric, dimension) or a process (runbook, playbook, incident guide) an agent will consult. Write it as a concept with a `type`, not loose prose.
- You are exporting or transforming metadata, a catalog, schemas, or docstrings for agent consumption. Emit a bundle, not a JSON blob or a wiki dump.
- You write a deprecation notice, a join path, or a business-meaning definition an agent needs. That is a concept. Give it a file and a `type`.
- You are editing an existing OKF bundle. Keep it conformant as you go: refresh the concept's `timestamp`, append a `log.md` entry, regenerate the affected `index.md`, and add a link whenever you create a relationship. This is the "knowledge is touched and transformed" case, and it is where bundles silently rot if you skip the bookkeeping.

**Guard.** OKF is for knowledge an agent reads, not human-only prose. A README, a blog post, or a design doc for people is not a bundle. When it is unclear whether an artifact is agent-facing, ask before converting it.

## Concept document at a glance

A concept is frontmatter plus a markdown body. Its identity is its path with the `.md` removed, so `tables/orders.md` is the concept `tables/orders`.

- **Frontmatter.** `type` is required. Recommended, in priority order: `title`, `description` (one sentence), `resource` (canonical URI for the underlying asset), `tags` (a YAML list), `timestamp` (ISO 8601). Producers may add any other keys, and consumers preserve unknown keys rather than rejecting them.
- **Body.** Favor structural markdown (headings, lists, tables, fenced code) over freeform prose. Conventional headings, used when they apply, are `# Schema`, `# Examples`, `# Citations`. For each fact, pick the sharpest form the extended set offers (next section).
- **Reserved filenames**, never a concept. `index.md` is a directory listing and carries no frontmatter, except the bundle-root `index.md`, which may declare `okf_version`. `log.md` is a dated change history.
- **Links.** Prefer bundle-absolute links like `/tables/customers.md` (stable when files move). Relative links such as `tables/customers.md` are also valid. A link asserts a relationship whose meaning lives in the surrounding prose, not in the link.
- **External material.** A webpage or doc you pull in becomes an ordinary concept under `references/<slug>.md` with `type: Reference` and its URL in `resource`. That is how a bundle absorbs outside sources (see `/okf export`).

## Pick the sharpest markdown form

"Favor structural markdown" extends past headings and tables. For a fact with inherent structure, the extended-markdown form is both more machine-readable than prose (an agent parses an edge list or a formula, not a paragraph about one) and renders richly where bundles are actually read (GitHub, OKF viewers). Where a consumer renders none of it, the source still reads as plain markdown, so there is no portability cost.

| The fact | Write it as | Not as |
| --- | --- | --- |
| Topology: joins, lineage, pipeline flow, states | A ` ```mermaid ` fence (`erDiagram`, `flowchart`, `sequenceDiagram`); the edges are the data | A prose paragraph describing arrows |
| A formal definition: metric formula, threshold, window | TeX, `$…$` inline or `$$…$$` display | Pseudo-math in prose ("count divided by the window") |
| Term meanings: a glossary, enum values, status codes | A definition list (`Term` then `: definition`) | Bullets shaped like "X - means Y" |
| A checklist with state: rollout or migration progress | A task list (`- [x]` / `- [ ]`) | Prose like "steps 1 to 3 are done" |
| A caveat or provenance note too small for `# Citations` | A footnote (`[^1]`) | A parenthetical that derails the sentence |
| Field-by-field facts: schemas, parameters | A markdown table (already the convention) | Key-value prose |

Keep prose for meaning and reasoning; reach for these forms when the fact has shape. The worked examples in [templates.md](./templates.md) show each in place.

## Validate

Run the bundled checker against a bundle directory:

```sh
node okf-validate.mjs path/to/bundle
```

It errors (exit 1) on the hard requirement (a concept missing frontmatter or a non-empty `type`) and warns on soft guidance (a non-ISO `log.md` date, a broken cross-link) without failing the bundle, because consumers tolerate those. The reviewer's checklist behind the script is in [commands.md](./commands.md).

## Files in this skill

- [spec.md](./spec.md). The full OKF v0.1 normative reference (conformance, fields, linking, versioning, non-goals, design principles).
- [commands.md](./commands.md). Each command end to end, with the files it touches and the validate checklist.
- [templates.md](./templates.md). Concept, root `index.md`, sub `index.md`, and `log.md` templates, plus worked BigQuery table, metric, runbook, and external-reference examples.
- [okf-validate.mjs](./okf-validate.mjs). The zero-dependency conformance checker.

## Source

The Open Knowledge Format is published by Google Cloud. Spec: [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md). Announcement: [How the Open Knowledge Format can improve data sharing](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/). The same repo ships a reference producer (an enrichment agent), a single-file HTML visualizer as a reference consumer, and three browsable sample bundles (GA4, Stack Overflow, Bitcoin); [spec.md](./spec.md) points to each. OKF v0.1 is an early, intentionally minimal standard designed for backward-compatible growth, so re-check the spec for fields added after this snapshot.
