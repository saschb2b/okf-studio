# OKF v0.2 normative reference

A faithful, structured distillation of the Open Knowledge Format v0.2 specification. Normative keywords (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, REQUIRED) carry their RFC 2119 force. Section numbers match the upstream spec so a cross-check lands in the right place. When this snapshot and the [upstream spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) disagree, the upstream spec wins.

OKF represents knowledge as a **bundle** (a self-contained, hierarchical collection of markdown files, and the unit of distribution). Each non-reserved file is a **concept** (one unit of knowledge, which may describe a tangible asset like a table or an API, an abstract idea like a metric or a business process, or anything in between). A concept's identity is its **Concept ID**, its file path within the bundle with the `.md` suffix removed, so `tables/users.md` has Concept ID `tables/users`. There is no central schema registry and no required tooling. If you can read a file you can read OKF, and if you can clone a repo you can ship it.

The format aims to be **readable** by humans without tooling, **parseable** by agents without bespoke SDKs, **diffable** in version control, and **portable** across tools, organizations, and time.

**What v0.2 adds.** v0.1 answered "what does an agent need to know?" v0.2 adds "should the agent believe it, and is it still true?" Provenance, trust, freshness, and verifiable computation become first-class frontmatter rather than prose. Two changes are breaking; everything else is additive. See [section 13](#13-changes-from-v01).

## 1. Motivation

An agent-maintained knowledge corpus fails in ways a human wiki does not. It grows faster than anyone reviews it, its claims carry no visible authority, and a stale definition looks exactly like a current one. v0.2 targets those three failures directly: `sources` says where a claim came from and how credible that origin is, `generated` and `verified` say who wrote it and who has confirmed it, `status` and `stale_after` say whether it is still meant to be used, and the [Attested Computation](#10-attested-computations) type says that a number an agent reports was actually produced by a sanctioned query rather than invented.

## 2. Terminology

`Bundle`
: A self-contained directory of markdown files. The unit of distribution.

`Concept`
: One non-reserved `.md` file. One unit of knowledge.

`Concept ID`
: A concept's path within the bundle, without the `.md` suffix.

`Reserved filename`
: `index.md` and `log.md`. Never concept documents.

`Actor`
: An identity string naming who or what did something. See [section 7](#7-actor-convention).

`Producer`
: Anything that writes a bundle. `Consumer`, anything that reads one.

## 3. Bundle structure

```
bundle/
  index.md                 (optional) directory listing, declares okf_version at the root
  log.md                   (optional) chronological change history
  <concept>.md             a concept document
  <subdir>/
    index.md
    <concept>.md
    <subdir>/...
```

Hierarchy is for human and agent navigation. The real relationship graph is expressed by links (section 6), which cross the hierarchy freely.

**Reserved filenames.** `index.md` and `log.md` have defined meaning at any level of the hierarchy and **MUST NOT** be used for concept documents.

## 4. Concept documents

A concept document is a YAML frontmatter block (fenced by `---`) followed by a free-form markdown body.

### Core frontmatter fields

| Field | Status | Type | Meaning |
| --- | --- | --- | --- |
| `type` | REQUIRED | string | The kind of concept. The only always-required key; a concept carrying just `type` is fully conformant. Consumers use it for routing, filtering, and presentation. Values are not registered centrally. Producers **SHOULD** pick descriptive, self-explanatory values, and consumers **MUST** tolerate unknown ones. |
| `title` | recommended | string | Human-readable display name. If omitted, consumers **MAY** derive one from the filename. |
| `description` | recommended | string | A single sentence summarizing the concept. Used by index generators, search snippets, and previews. |
| `resource` | recommended | URI | A URI identifying the underlying asset. Absent for concepts describing abstract ideas rather than physical assets. |
| `tags` | recommended | list of strings | Short strings for cross-cutting categorization. |

The provenance, trust, and lifecycle families (`sources`, `generated`, `verified`, `status`, `stale_after`) are specified in section 5. The attested-computation families (`runtime`, `parameters`, `computation`, `executor`, `attester`) are in section 10.

**Extensions.** Producers **MAY** include any additional keys. Consumers **SHOULD** preserve unknown keys when round-tripping and **SHOULD NOT** reject documents with unrecognized fields. There is no schema to register against, so a producer adds the fields its domain needs and consumers carry them through.

**Tags are first-class, but have no special file.** OKF defines no format for aggregating documents by tag. A consumer that wants a tag-browsing view synthesizes it at consumption time by scanning frontmatter.

### Body conventions

The body is ordinary markdown. Producers **SHOULD** favor structural markdown (headings, lists, tables, fenced code blocks) over freeform prose, because structure is what a consumer can parse and present.

These headings carry **conventional** meaning and **SHOULD** be used when they apply:

| Heading | Purpose |
| --- | --- |
| `# Schema` | A structured description of the asset's columns or fields, typically a table. |
| `# Examples` | Concrete usage examples, typically fenced code. |
| `# Computation` | The sanctioned computation, for [Attested Computation](#10-attested-computations) concepts. |

These are conventions, not a template. A concept may have only a body, or other headings entirely.

**`# Citations` is gone.** Provenance moved to the `sources` frontmatter family (section 5.1). This is one of the two breaking changes in v0.2.

## 5. Provenance, trust, and lifecycle

Three families, all optional. A concept with none of them is still conformant and consumable; consumers **MUST NOT** reject it (section 11).

### 5.1 `sources`, where the knowledge came from

`sources` records the material a concept derives from, with optional per-source credibility signals.

```yaml
sources:
  - id: ga4-schema
    resource: https://developers.google.com/analytics/bigquery/export-schema
    title: GA4 BigQuery Export schema
    author: team:ga4-docs
    usage_count: 5000
    last_modified: 2026-05-30
usage_window: { from: 2026-06-01, to: 2026-06-30 }
```

Per entry:

- `resource`. **REQUIRED** within an entry. Either a concrete artifact a consumer can follow (an absolute URL, a bundle-relative path, or a path into a `references/` subdirectory) or a population or scope descriptor it cannot, for example `all queries in BigQuery project X`.
- `id`. Optional. A stable key used to attribute individual claims. **SHOULD** be present when the body cites the source.
- `title`. Optional. A human-readable label.

Credibility signals, all optional:

- `author`. Who or what produced the source, in the actor convention (section 7). An authority signal.
- `usage_count`. How often `resource` was exercised (dashboard views, query executions, page reads) over `usage_window`. An adoption and liveness signal.
- `last_modified`. When the source itself last changed (`YYYY-MM-DD`). A recency signal, distinct from `generated.at`, which records when the *concept* was written.
- `usage_window`. Written once as a sibling of `sources`, it frames every `usage_count` with a `{ from, to }` date range.

**Attributing one claim.** Use a markdown footnote whose label matches a source `id`:

```markdown
The `events_` table is sharded daily as `events_YYYYMMDD`.[^ga4-schema]

[^ga4-schema]: GA4 BigQuery Export schema
```

The label is a join key into `sources`. Consumers resolve attribution by matching the label to an entry's `id`, not by parsing the footnote text, so attributions survive an agent reordering the list.

### 5.2 `generated` and `verified`, who wrote it and who confirmed it

```yaml
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
verified:
  - { by: human:ahormati, at: 2026-06-25T09:00:00Z }
  - { by: process:finance-nightly, at: 2026-06-26T02:00:00Z }
```

- `generated.by`. **REQUIRED** within `generated`. An actor (section 7).
- `generated.at`. An ISO 8601 datetime marking the content's last meaningful change. This is what v0.1's `timestamp` becomes.
- `verified`. A list of verification events, each `{ by, at }`. Multiple entries capture independent checks, for example a human sign-off plus a nightly process. A single verifier **MAY** be written as one `{ by, at }` mapping without the list dash, and consumers **MUST** treat a bare mapping as a one-element list.

Authorship and confirmation are separate on purpose. An agent generated it; a human or a process later confirmed it. Collapsing the two loses the only signal that distinguishes reviewed knowledge from generated knowledge.

### 5.3 Trust tiers

Consumers derive a tier from `verified`, lowest to highest:

| `verified` | Tier |
| --- | --- |
| absent | **unverified** |
| present, non-`human:` actors only | **machine-confirmed** |
| present, includes a `human:<id>` actor | **human-reviewed** |

Consumers **SHOULD** derive trust tiers and staleness only from the fields specified here.

### 5.4 Lifecycle, `status` and `stale_after`

```yaml
status: stable          # draft | stable | deprecated
stale_after: 2026-09-23 # absolute date; stale on or after this day
```

- `status`. `draft` (not yet reviewed, possibly incomplete), `stable` (ready for consumption), `deprecated` (kept for links and history, no longer current). Absent means `stable`.
- `stale_after`. An absolute date (`YYYY-MM-DD`). A concept is stale when `today >= stale_after`. An absolute date rather than a relative TTL keeps staleness a plain date comparison that does not depend on when the concept was read.

## 6. Cross-linking and paths

Concepts **MAY** link to other concepts using standard markdown links. Two forms:

- **Bundle-absolute**, beginning with `/`, interpreted relative to the bundle root, for example `/tables/customers.md`. The **recommended** form, because it is stable when documents move.
- **Relative**, an ordinary relative path resolved from the linking file's directory.

Path-valued frontmatter fields (`sources[].resource`, `computation`, `executor.resource`, `attester.resource`) accept an absolute URL, a bundle-relative path beginning with `/`, or a relative path.

**Link semantics.** A link from concept A to concept B asserts a *relationship*. Which kind (a foreign key, a derivation, a supersedes, a depends-on) is conveyed by the surrounding prose, not by the link. The link is the edge, the prose is the label.

**Broken links.** A link whose target does not exist in the bundle is not malformed. Consumers **MUST** tolerate broken links.

## 7. Actor convention

Fields recording an identity (`generated.by`, `verified[].by`, `sources[].author`) use one convention:

| Form | For | Example |
| --- | --- | --- |
| `<producer>/<version>` | agents and tools | `reference_agent/gemini-2.5-pro` |
| `human:<id>` | a person | `human:ahormati` |
| `process:<id>` | an automated process | `process:finance-nightly` |

Consumers that classify trust key off the `human:` prefix, so producers **MUST** use it for hand-authored or human-confirmed content. The corollary matters more: do not write `human:` for content an agent generated, because that silently inflates the bundle's trust tier.

## 8. Index files

An `index.md` **MAY** appear in any directory, including the bundle root. It provides progressive disclosure: a short, curated listing so an agent can decide where to descend without reading every file.

An `index.md` carries **no frontmatter**, with one exception: the bundle-root `index.md` **MAY** carry a frontmatter block, and that is the only place `index.md` frontmatter is permitted. It exists to declare `okf_version` (section 12).

The body is one or more sections, each grouping concepts under a heading, as a bulleted list of links with short descriptions. Entries **SHOULD** carry the description from the linked concept's frontmatter and **MAY** link to subdirectories with a trailing slash:

```markdown
# Tables
* [Orders](orders.md) - One row per completed customer order.
* [Customers](customers.md) - One row per customer account.

# Subdirectories
* [Datasets](datasets/) - Source datasets feeding these tables.
```

Producers **MAY** generate `index.md` automatically. Consumers **MAY** synthesize one when it is absent.

## 9. Log files

A `log.md` **MAY** appear at any level to record that scope's history. It is a flat list of date-grouped entries, newest first, optionally preceded by a single `#` title.

Date headings **MUST** use the ISO 8601 `YYYY-MM-DD` form. Entries beneath a date are prose. The leading bold word (`**Creation**`, `**Update**`, `**Deprecation**`) is a convention, not a requirement.

```markdown
# Directory Update Log

## 2026-05-28
* **Update**: Added the `loyalty_tier` column to the orders schema.

## 2026-05-22
* **Creation**: Documented the orders table and its join to customers.
```

## 10. Attested computations

New in v0.2. A sanctioned computation is a standalone concept of `type: Attested Computation`. It lets a consumer verify that a reported number was produced by the blessed query rather than by an agent writing plausible SQL.

One computation, many consumers: the same computation can back a metric, a dashboard concept, and a report, so it is referenced once and reused.

```yaml
---
type: Attested Computation
title: Revenue for fiscal year
description: Recognized revenue for a fiscal year, per Finance's definition.
status: stable
runtime: bigquery
parameters:
  - { name: year, type: integer, required: true }
computation: references/computations/lib/revenue.sql
executor:
  resource: references/skills/run-on-bq.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: references/attesters/revenue.py
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
verified: { by: human:ahormati, at: 2026-06-25T09:00:00Z }
stale_after: 2026-09-23
sources:
  - id: rev-policy
    resource: https://wiki.acme/finance/revenue-recognition
    title: Revenue recognition policy
---
```

### 10.1 Contract fields

- `runtime`. **REQUIRED**. The single field saying how to run the computation, and therefore how the executor and attester interpret it and what `parameters` mean. Example values: `bigquery`, `postgres`, `dbt`, `python`, `Looker`.
- `parameters`. A list of typed, named holes, each `{ name, type, required }`. Binding semantics follow the runtime.
- `computation`. Optional path to a file holding the computation, used instead of an inline body fence.
- `executor`. `resource` names run instructions or code. `receipt` declares the fields a run must return, the evidence the attester inspects, for example a BigQuery `job_id`, the executed SQL, and the result.
- `attester`. The deterministic check. `resource` names code (**no LLM**) that takes a receipt and returns a verdict.

### 10.2 Supplying the computation

Two forms. **Inline**, a single fenced code block in the body under `# Computation`, best for a short computation reviewed alongside its contract. **File-based**, set `computation` to a path and omit the body fence, for a long or generated computation already shared with non-OKF tools.

The hard constraint: an agent **MAY** only supply *values* for the declared `parameters`. It **MUST NOT** author or edit the computation.

### 10.3 The two checks

The attester confirms:

- **Provenance.** The computation that ran equals `computation` bound with the claimed parameters, not agent-authored SQL. Compared on canonicalized form.
- **Fidelity.** The displayed value matches the receipt's authoritative source, re-read by job id rather than taken from the agent's text.

### 10.4 Verification is not attestation

They answer different questions and both are needed.

| | `verified` (5.2) | Attestation (10) |
| --- | --- | --- |
| Confirms | The *definition* matches policy | A single *run* produced the values correctly |
| Cadence | Doc-level, slow | Per-call, at runtime |
| Stored | In the bundle | Not in the bundle |

A concept with a stale definition can still attest cleanly, and a freshly-verified definition still requires attestation on every run.

### 10.5 The consumer workflow

1. **Discover** via `type: Attested Computation`.
2. **Load** the contract from frontmatter and the computation from the body or the file.
3. **Parameterize**, the agent supplying only declared parameter values.
4. **Execute** via the executor, which returns a shaped receipt.
5. **Attest** by running the attester over the receipt.
6. **Gate**, refusing a failing attestation and warning when stale.

Consumers **SHOULD** surface, not silently drop, a failing attestation.

## 11. Conformance

A bundle is conformant with OKF v0.2 when all three hold:

1. Every non-reserved `.md` file in the tree contains a parseable YAML frontmatter block.
2. Every such frontmatter block contains a non-empty `type` field.
3. Every reserved filename (`index.md`, `log.md`), where present, follows the structure in sections 8 and 9.

Everything else is soft guidance. Consumers **MUST NOT** reject a bundle because of:

- Missing optional frontmatter fields.
- Unknown `type` values.
- Unknown additional frontmatter keys.
- Broken cross-links.
- Missing `index.md` files.

Consumers additionally **MUST** treat a bare `verified` mapping as a one-element list, **MUST NOT** reject a concept for missing any optional family, and **SHOULD** derive trust tiers and staleness only from the fields specified here while surfacing rather than dropping a failing attestation.

A consumer that does not understand the declared version **SHOULD** attempt best-effort consumption rather than refusing the bundle. Producers aim to be precise; consumers aim to be forgiving.

## 12. Versioning

This document specifies OKF version **0.2**. Revisions use `<major>.<minor>`:

- A **minor** bump introduces backward-compatible additions, such as new optional fields or conventional headings.
- A **major** bump may break, such as renaming a required field or changing reserved filenames.

A bundle **MAY** declare its target version with `okf_version: "0.2"` in a bundle-root `index.md` frontmatter block, the only place `index.md` frontmatter is permitted.

**Deferred to a future revision:** the full runtime protocol (receipt and verdict wire formats), the attester ABI with its portability and sandboxing story, attestation caching, and semantic-layer templates for tools like Looker and dbt. Do not invent these; treat them as open.

## 13. Changes from v0.1

**Two breaking changes.**

| v0.1 | v0.2 | Consumer fallback |
| --- | --- | --- |
| `timestamp: <ISO 8601>` | `generated: { by, at }` | Consumers **MAY** fall back to a legacy `timestamp` when `generated` is absent |
| `# Citations` body section | `sources` frontmatter (5.1) | Consumers **SHOULD** read `sources` and **MAY** still parse a legacy `# Citations` list on v0.1 documents |

**Everything else is additive**, all optional: the `sources` credibility signals, `verified` and trust tiers, `status` and `stale_after`, the actor convention, and the `Attested Computation` type with its `runtime`, `parameters`, `computation`, `executor`, and `attester` families. v0.2 also states explicitly that `type` is the only always-required key.

**A v0.1 bundle is consumable by a v0.2 consumer** under those fallbacks, so migration is not urgent. Migrating is still worth doing, because the fields a v0.1 bundle lacks are exactly the ones that let a consumer decide whether to believe it.

To migrate, see the `migrate` command in [commands.md](./commands.md).

## Non-goals

OKF deliberately does not:

- Define a fixed taxonomy of concept types. `type` is open by design.
- Prescribe storage, serving, or query infrastructure. A bundle is just files.
- Subsume domain-specific schemas. OKF *references* schemas like Avro, Protobuf, and OpenAPI (via `resource` and links) and can describe them in the body; it does not replace them.
- Specify the runtime protocol behind attested computations (section 12).

## Distribution

A bundle is just a directory, so it ships however files ship: a git repository (the recommended home, since it versions the knowledge alongside the code it describes), a tarball or zip archive, or a subdirectory inside a larger repository.

## Design principles

- **Minimally opinionated.** OKF requires exactly one thing, a `type` per concept. What types exist, what other fields appear, and how the body is organized are left to the producer. The spec defines the interoperability surface, not the content model.
- **Producer and consumer independence.** The party that writes knowledge is cleanly separated from the party that consumes it. The format is the contract, and the tooling at each end is independently swappable.
- **Format, not platform.** OKF is never tied to a specific cloud, database, model provider, or agent framework, and never requires a proprietary account or SDK to read, write, or serve. Its value comes from adoption, not ownership.
- **Trust is data, not tone.** v0.2's addition. Whether to believe a concept is answered by fields a consumer can compute over, not by how confident the prose sounds.

Because a concept is plain markdown plus YAML frontmatter, bundles compose with existing knowledge tools (Obsidian, Notion, MkDocs, Hugo, Jekyll) that already speak that pairing.

## Relationship to other formats

OKF is intentionally close to several established patterns: LLM "wiki" repositories that use markdown plus frontmatter as an agent-readable knowledge base, personal knowledge tools like Obsidian and Notion that use hierarchical markdown with cross-links, and "metadata as code" approaches that store catalog metadata alongside source rather than in a separate registry. OKF differs mainly in being *specified*: it pins down the small set of rules needed for interoperability without dictating tooling. v0.2's provenance and attestation layers move it closer to supply-chain attestation formats in intent, while staying plain markdown.

## Reference implementations

Google ships a producer and a consumer as proofs of concept, plus four browsable sample bundles, in [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf):

- **Producer**, an enrichment agent (Google ADK plus Gemini) that walks a BigQuery dataset in a metadata pass, then an optional web pass that crawls seed URLs and mints `references/<slug>` concepts.
- **Consumer**, a single self-contained HTML visualizer that renders any bundle as a force-directed graph with type-colored nodes, cross-link edges, backlinks, search, and type filters.
- **Sample bundles** under `bundles/`. GA4 e-commerce, Stack Overflow, and Bitcoin were regenerated in v0.2 form; `acme_retail` is new and exercises every v0.2 feature, including sources with credibility signals, a deprecated legacy metric, and BigQuery-backed attested computations with an SQL-equality attester.
