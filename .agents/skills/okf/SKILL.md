---
name: okf
description: Create, inspect, retrieve, author, revise, enrich, audit, repair, research, analyze change impact, migrate, validate, and maintain knowledge for AI agents as conformant Open Knowledge Format (OKF) bundles. Use for /okf commands; work on an existing OKF bundle; documentation of tables, datasets, views, metrics, runbooks, playbooks, APIs, schemas, or join paths; exports from catalogs, metadata, websites, URLs, or source code; and any knowledge an agent will read later. Apply implicitly when editing an OKF bundle so conformance, provenance and sources, generated and verified trust signals, freshness, log.md, indexes, and cross-links remain current. Tracks OKF v0.2, including attested computations and migration from v0.1.
---

# Open Knowledge Format (OKF)

OKF is Google's open, vendor-neutral spec (v0.2) for the context an AI agent needs, represented as a *bundle*. A bundle is a directory of markdown files, each a *concept* (a table, dataset, metric, runbook, playbook, API, join path), kept in version control next to the code it describes. Just markdown, just files, just YAML frontmatter. The format is the contract, so any producer can write a bundle and any consumer (an agent, a viewer, a search index) can read it with no SDK and no lock-in.

Use this skill two ways. Run a **command** on demand, or apply it **implicitly** whenever you shape knowledge an agent will read. The deep normative spec lives in [spec.md](./spec.md); per-command steps in [commands.md](./commands.md); copy-paste starting points in [templates.md](./templates.md).

## Choose the OKF method

For every OKF request, select the narrowest method that fits the user's intended outcome. In OKF Studio generic chat, call `okf_capability_catalog` to inspect the active versioned catalog and `okf_capability_resource` to load the selected method. Outside Studio, read the matching capability file directly. State the selected capability in the first progress update. Do not claim to have used a method until its resource was loaded.

| User intent | Method to load |
| --- | --- |
| Answer a bounded bundle question or trace known links | [`okf-inspect`](./capabilities/inspect.md) |
| Select evidence, inspect the route, or diagnose a retrieval miss | [`okf-retrieve`](./capabilities/retrieve.md) |
| Plan a new bundle whose destination or concept map is unresolved | [`okf-create`](./capabilities/create.md) |
| Add facts, citations, or relationships to existing knowledge | [`okf-enrich`](./capabilities/enrich.md) |
| Review conformance or knowledge health without changing files | [`okf-audit`](./capabilities/audit.md) |
| Fix a reproducible validation or health defect | [`okf-repair`](./capabilities/repair.md) |
| Reconcile bundle claims with bounded external evidence | [`okf-research`](./capabilities/research.md) |
| Find direct and downstream effects before a change | [`okf-change-impact`](./capabilities/change-impact.md) |
| Plan a versioned schema, convention, layout, or identity change | [`okf-migrate`](./capabilities/migrate.md) |
| Turn accepted evidence and known destinations into new concepts | [`okf-author`](./capabilities/author.md), then [`writing`](./writing.md) |
| Improve existing prose without changing meaning | [`okf-revise`](./capabilities/revise.md), then [`writing`](./writing.md) |

All methods stay discoverable, but their detailed instructions are loaded on demand. Loading every method at once wastes context and combines incompatible boundaries. For example, inspect is read-only, revise forbids knowledge changes, enrich permits sourced additions, and repair requires a reproducible defect. If one request spans several phases, run the methods in order and preserve each method's stop conditions and artifact contract.

### Execution surfaces

Treat the capability files as portable methods, not as a requirement to run inside OKF Studio.

- **In OKF Studio**, use the named `okf_*` and `studio_stage_*` tools. Emit the structured artifact required by the selected method when a work surface is useful.
- **Outside Studio**, translate inventory, read, search, and traversal to the host's filesystem and search tools; run the bundled validator for conformance and connectivity; use the host's ordinary diff and review flow for authorized edits. Do not invent Studio tool results, receipt IDs, health finding IDs, or bundle fingerprints.
- **Structured artifacts are Studio-only by default.** Outside Studio, return the same evidence and decisions as concise prose, markdown, or an ordinary diff unless the caller explicitly asks for the artifact JSON.
- **Authorization belongs to the host workflow.** Studio keeps writes in reviewed staging. Elsewhere, follow the user's requested edit scope and the host's normal approval rules; a method's Studio staging language does not revoke an explicit request to edit files.

## The one rule

A bundle is conformant when **every concept document carries YAML frontmatter with a non-empty `type` field.** That is the only hard requirement, and v0.2 says so explicitly. Everything else is recommended structure whose absence a consumer must tolerate. Hold this line and a bundle anyone produced stays readable by anyone's agent. The full conformance criteria and the consumer's tolerance contract are in [spec.md](./spec.md).

**What v0.2 adds on top of that.** v0.1 answered "what does the agent need to know?" v0.2 adds "should it believe this, and is it still true?" Four optional families, none of which can make a bundle non-conformant: `sources` (what the knowledge derives from, with credibility signals), `generated` and `verified` (who wrote it, who has confirmed it, which is what the trust tier is computed from), `status` and `stale_after` (lifecycle), and the `Attested Computation` type (a sanctioned computation an agent may run but never author). Two things broke from v0.1: `timestamp` became `generated: { by, at }`, and the `# Citations` body section became `sources` frontmatter. A v0.1 bundle stays consumable under documented fallbacks, so migrating is worthwhile rather than urgent; the `migrate` command has the procedure.

## Commands

Invoke as `/okf <command> [target]`. Each is detailed in [commands.md](./commands.md).

| Command | What it does |
| --- | --- |
| `init` | Create a bundle. Make the directory, a root `index.md` declaring `okf_version`, and the first concept folders. |
| `add` | Write one concept document. Pick a descriptive `type`, fill the recommended frontmatter, record `sources` and `generated`, body it with `# Schema` and `# Examples`. |
| `attest` | Define a sanctioned computation as an `Attested Computation` concept, so an agent can run it and have the result checked, but cannot rewrite it. |
| `migrate` | Move a bundle from v0.1 to v0.2. Two mechanical renames, then the judgment calls about actors and what not to claim as verified. |
| `enrich` | Turn a source (a BigQuery dataset, an OpenAPI spec, a wiki, a website, docstrings) into concepts by first enumerating its full surface into an inventory, then a pass that crawls authoritative docs to add schemas, join paths, and citations, then an entity pass that gives every load-bearing name the source mentions but never explains its own linked concept. |
| `link` | Connect concepts with bundle-absolute markdown links and name the relationship in the surrounding prose. |
| `index` | Generate or refresh `index.md` listings so an agent can navigate by progressive disclosure. |
| `log` | Append a dated `log.md` entry (Creation, Update, Deprecation), newest first. |
| `validate` | Run the conformance check. `node okf-validate.mjs <bundle>`, or the manual checklist in [commands.md](./commands.md). |
| `health` | Inspect conformance, connectivity, navigation, provenance, freshness, duplication, and coverage signals without writing. |
| `retrieve` | Select coherent evidence for a question and retain route, omission, provider, fingerprint, and abstention decisions. |
| `export` | Convert an existing source into a conformant bundle: a catalog, a metadata dump, a schema export, a docs site, or a website or external URL (`/okf export <url>`). Map the whole surface, cover every section, give every named entity its own concept, then pass the creation gate — not a snapshot of the front page. The producer role. |
| `consume` | Read a bundle to answer a question. Start at `index.md`, follow links, tolerate anything missing. |

## Implicit mode

Apply OKF without being asked whenever knowledge is being shaped for an agent to read later:

- You are documenting a data asset (table, view, dataset, metric, dimension) or a process (runbook, playbook, incident guide) an agent will consult. Write it as a concept with a `type`, not loose prose.
- You are exporting or transforming metadata, a catalog, schemas, or docstrings for agent consumption. Emit a bundle, not a JSON blob or a wiki dump.
- You write a deprecation notice, a join path, or a business-meaning definition an agent needs. That is a concept. Give it a file and a `type`.
- You are editing an existing OKF bundle. Keep it conformant as you go: refresh the concept's `generated` (both `by` and `at`, since the actor may differ from whoever wrote it last), append a `log.md` entry, regenerate the affected `index.md`, and add a link whenever you create a relationship. If you materially change a concept that carried a `verified` event, that verification no longer covers what the concept now says; drop it rather than letting it vouch for text nobody checked. This is the "knowledge is touched and transformed" case, and it is where bundles silently rot if you skip the bookkeeping.

**Guard.** OKF is for knowledge an agent reads, not human-only prose. A README, a blog post, or a design doc for people is not a bundle. When it is unclear whether an artifact is agent-facing, ask before converting it.

## Concept document at a glance

A concept is frontmatter plus a markdown body. Its identity is its path with the `.md` removed, so `tables/orders.md` is the concept `tables/orders`.

- **Frontmatter.** `type` is required. Recommended, in priority order: `title`, `description` (one sentence), `resource` (canonical URI for the underlying asset), `tags` (a YAML list). Then the v0.2 families, all optional: `sources` (a list, each entry needing at least `resource`, plus `id` when the body cites it and the `author`, `usage_count`, `last_modified` credibility signals when known), `generated: { by, at }` (who wrote it and when, replacing v0.1's `timestamp`), `verified` (a list of real `{ by, at }` confirmations, or a single bare mapping), `status` (`draft|stable|deprecated`, absent means stable), and `stale_after` (an absolute `YYYY-MM-DD`). Producers may add any other keys, and consumers preserve unknown keys rather than rejecting them.
- **Actors.** Every identity field (`generated.by`, `verified[].by`, `sources[].author`) uses one convention: `<producer>/<version>` for an agent or tool, `human:<id>` for a person, `process:<id>` for automation. Consumers compute the trust tier off the `human:` prefix, so never write it for content an agent produced. That single rule is what keeps the trust layer meaningful.
- **Body.** Favor structural markdown (headings, lists, tables, fenced code) over freeform prose. Conventional headings, used when they apply, are `# Schema`, `# Examples`, and `# Computation`. Attribute one claim by footnoting it with a `sources` entry id (`...sharded daily.[^ga4-schema]`); the label is a join key, not prose. For each fact, pick the sharpest form the extended set offers (next section).
- **Reserved filenames**, never a concept. `index.md` is a directory listing and carries no frontmatter, except the bundle-root `index.md`, which may declare `okf_version`. `log.md` is a dated change history.
- **Links.** Prefer bundle-absolute links like `/tables/customers.md` (stable when files move). Relative links such as `tables/customers.md` are also valid. A link asserts a relationship whose meaning lives in the surrounding prose, not in the link.
- **External material.** A webpage or doc you pull in becomes an ordinary concept under `references/<slug>.md` with `type: Reference` and its URL in `resource`. Absorb its *content*, not just its URL: extract the substance into the body so the concept stands alone offline — `resource` is provenance for re-checking, not a replacement for the knowledge. A summary that defers to the live link is a stub (see `/okf export`).

## Pick the sharpest markdown form

"Favor structural markdown" extends past headings and tables. For a fact with inherent structure, the extended-markdown form is both more machine-readable than prose (an agent parses an edge list or a formula, not a paragraph about one) and renders richly where bundles are actually read (GitHub, OKF viewers). Where a consumer renders none of it, the source still reads as plain markdown, so there is no portability cost.

| The fact | Write it as | Not as |
| --- | --- | --- |
| Topology: joins, lineage, pipeline flow, states | A ` ```mermaid ` fence (`erDiagram`, `flowchart`, `sequenceDiagram`); the edges are the data | A prose paragraph describing arrows |
| A formal definition: metric formula, threshold, window | TeX, `$…$` inline or `$$…$$` display | Pseudo-math in prose ("count divided by the window") |
| Term meanings: a glossary, enum values, status codes | A definition list (`Term` then `: definition`) | Bullets shaped like "X - means Y" |
| A checklist with state: rollout or migration progress | A task list (`- [x]` / `- [ ]`) | Prose like "steps 1 to 3 are done" |
| Attribution of one claim to one source | A footnote whose label is a `sources` entry `id` (`[^ga4-schema]`) | A parenthetical URL, or a bare `[^1]` that keys to nothing |
| Field-by-field facts: schemas, parameters | A markdown table (already the convention) | Key-value prose |

Keep prose for meaning and reasoning; reach for these forms when the fact has shape. The worked examples in [templates.md](./templates.md) show each in place.

## Validate

Run the bundled checker against a bundle directory:

```sh
node okf-validate.mjs path/to/bundle
```

It errors (exit 1) on the hard requirement (a concept missing frontmatter or a non-empty `type`) and warns on soft guidance without failing the bundle, because consumers tolerate those. Nothing v0.2 added can be an error, since all of it is optional; it is checked as guidance and gated only under `--strict` on a bundle whose root index declares `"0.2"`. That gate covers leftover `timestamp` and `# Citations`, a `sources` entry with no `resource`, a `generated` with no `by`, an out-of-range `status`, and an `Attested Computation` with no `runtime` or no computation. A v0.1 bundle validates clean either way. Among the warnings it reports the bundle's **graph connectivity**. **Orphans** (a concept with no concept-to-concept link in or out) and **broken concept links** (a link whose target is not a concept, including a link into a reserved `index.md`). Pass `--strict` to turn those into failures: that is the producer gate, because an agent traversing the bundle cannot reach an orphan or cross a broken link, so either is missing context by construction. The reviewer's checklist behind the script is in [commands.md](./commands.md).

**Validation checks conformance, not coverage.** A thin stub of a fifty-page site passes it clean, because the one rule is about each file's `type`, not about whether the bundle captured the source. When you *produce* a bundle from a source (`export`, `enrich`), the default run is necessary but not sufficient — run `okf-validate --strict` and the creation gate in [commands.md](./commands.md): every discovered section covered, concepts with real depth, every load-bearing name decomposed into its own linked concept (a bundle stops where the *gate* says, not where the source's own explanations ran out), a connected graph with no orphans or broken links, and any crawl boundary recorded in `log.md`. Passing the default `okf-validate` is not the same as finishing the export.

## Files in this skill

- [spec.md](./spec.md). The full OKF v0.2 normative reference (conformance, fields, provenance and trust, actors, linking, attested computations, versioning, changes from v0.1, non-goals, design principles).
- [commands.md](./commands.md). Each command end to end, with the files it touches and the validate checklist.
- [templates.md](./templates.md). Concept, root `index.md`, sub `index.md`, and `log.md` templates, plus worked BigQuery table, metric, runbook, and external-reference examples.
- [writing.md](./writing.md). The shared reader-job, prose, structure, revision, and fact-preservation contract for authoring and revision.
- [capabilities/](./capabilities/). The narrow inspect, retrieve, create, enrich, audit, repair, research, change-impact, migrate, author, and revise methods selected by the router above.
- [okf-validate.mjs](./okf-validate.mjs). The zero-dependency conformance checker.

## Source

The Open Knowledge Format is published by Google Cloud. Spec: [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md). Announcement: [How the Open Knowledge Format can improve data sharing](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/). The same repo ships a reference producer (an enrichment agent), a single-file HTML visualizer as a reference consumer, and four browsable sample bundles; [spec.md](./spec.md) points to each. GA4, Stack Overflow, and Bitcoin were regenerated in v0.2 form, and `acme_retail` is new, exercising every v0.2 feature including credibility signals, a deprecated metric, and BigQuery-backed attested computations. OKF v0.2 is still an early standard designed for backward-compatible growth, and it explicitly defers the attestation runtime protocol, the attester ABI, attestation caching, and semantic-layer templates to a later revision, so re-check the spec rather than inventing those.
