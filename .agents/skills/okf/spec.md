# OKF v0.1 normative reference

A faithful, structured distillation of the Open Knowledge Format v0.1 specification. Normative keywords (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, REQUIRED) carry their RFC 2119 force. When this snapshot and the [upstream spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) disagree, the upstream spec wins.

OKF represents knowledge as a **bundle** (a self-contained, hierarchical collection of markdown files, and the unit of distribution). Each non-reserved file is a **concept** (one unit of knowledge, which may describe a tangible asset like a table or an API, an abstract idea like a metric or a business process, or anything in between). A concept's identity is its **Concept ID**, its file path within the bundle with the `.md` suffix removed, so `tables/users.md` has Concept ID `tables/users`. There is no central schema registry and no required tooling. If you can read a file you can read OKF, and if you can clone a repo you can ship it.

The format aims to be **readable** by humans without tooling, **parseable** by agents without bespoke SDKs, **diffable** in version control, and **portable** across tools, organizations, and time.

## 1. Conformance

A bundle is conformant when all three hold:

1. Every non-reserved `.md` file contains a parseable YAML frontmatter block.
2. Every such frontmatter block contains a non-empty `type` field.
3. Reserved filenames (`index.md`, `log.md`), where present, follow their defined structure (sections 6 and 7).

Everything else in this document is soft guidance. The consumer contract is deliberately permissive: a consumer **MUST NOT** reject a bundle because of any of the following.

- Missing optional frontmatter fields.
- Unknown `type` values.
- Unknown additional frontmatter keys.
- Broken cross-links.
- Missing `index.md` files.

A consumer that does not understand the declared OKF version **SHOULD** attempt best-effort consumption rather than refusing the bundle. Producers aim to be precise; consumers aim to be forgiving.

## 2. Bundle structure

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

Hierarchy is for human and agent navigation. The real relationship graph is expressed by links (section 5), which can cross the hierarchy freely.

**Reserved filenames.** `index.md` and `log.md` have defined meaning at any level of the hierarchy and **MUST NOT** be used for concept documents.

## 3. Concept documents

A concept document is a YAML frontmatter block (fenced by `---`) followed by a free-form markdown body.

### Frontmatter fields

| Field | Status | Type | Meaning |
| --- | --- | --- | --- |
| `type` | REQUIRED | string | The kind of concept. Consumers use it for routing, filtering, and presentation. Values are not registered centrally. Producers **SHOULD** pick descriptive, self-explanatory values. Consumers **MUST** tolerate unknown types, typically by treating them as generic concepts. |
| `title` | recommended | string | Human-readable display name. If omitted, consumers **MAY** derive a title from the filename. |
| `description` | recommended | string | A single sentence summarizing the concept. Used by `index.md` generators, search snippets, and previews. |
| `resource` | recommended | URI | A URI that uniquely identifies the underlying asset (for example a BigQuery console link). Absent for concepts that describe abstract ideas rather than physical assets. |
| `tags` | recommended | list of strings | Short strings for cross-cutting categorization. |
| `timestamp` | recommended | ISO 8601 | Datetime of the last meaningful change. |

**Extensions.** Producers **MAY** include any additional keys. Consumers **SHOULD** preserve unknown keys when round-tripping and **SHOULD NOT** reject documents with unrecognized fields. This is the extension mechanism: there is no schema to register against, so a producer adds the fields its domain needs and consumers carry them through.

`type` is descriptive, not enumerated. The spec's own example values are `BigQuery Table`, `BigQuery Dataset`, `API Endpoint`, `Metric`, `Playbook`, and `Reference`. All are valid because they are self-explanatory, not because a registry blesses them.

**Tags are first-class, but have no special file.** OKF defines no separate file format for aggregating documents by tag. A consumer that wants a tag-browsing view synthesizes it at consumption time by scanning frontmatter.

## 4. Body conventions

The body is ordinary markdown. Producers **SHOULD** favor structural markdown (headings, lists, tables, fenced code blocks) over freeform prose, because structure is what a consumer can parse and present.

The following section headings have **conventional** meaning and **SHOULD** be used when they apply:

- `# Schema`. A structured description of the asset's columns or fields, typically a table.
- `# Examples`. Concrete usage examples, typically fenced code (a query, a request, a snippet).
- `# Citations`. External sources backing claims in the body (section 8).

These headings are conventions, not a required template. A concept may have only a body, or other headings entirely.

## 5. Cross-linking

Concepts **MAY** link to other concepts using standard markdown links. Two forms are supported.

- **Bundle-absolute**, beginning with `/`, interpreted relative to the bundle root, for example `/tables/customers.md`. This is the **recommended** form, because it is stable when documents are moved within their subdirectory.
- **Relative**, an ordinary relative path resolved from the linking file's directory, for example `customers.md`.

**Link semantics.** A link from concept A to concept B asserts a *relationship*. The specific kind of relationship (a foreign key, a derivation, a supersedes, a depends-on) is conveyed by the surrounding prose, not by the link itself. The link is the edge, the prose is the label.

**Broken links.** A link whose target does not exist in the bundle is not malformed. Consumers **MUST** tolerate broken links.

## 6. index.md

An `index.md` file **MAY** appear in any directory, including the bundle root. It provides progressive disclosure: a short, curated listing of that directory's contents so an agent can decide where to descend without reading every file.

An `index.md` carries **no frontmatter**, with one exception: the bundle-root `index.md` **MAY** carry a frontmatter block, and that is the only place an `index.md` frontmatter is permitted. It exists to declare `okf_version` (section 9).

The body is one or more sections with headings, each listing entries as a bulleted list of links with short descriptions. Entries **SHOULD** carry the description from the linked concept's frontmatter, and **MAY** link to subdirectories (with a trailing slash) as well as concepts:

```markdown
# Tables
* [Orders](orders.md) - One row per completed customer order.
* [Customers](customers.md) - One row per customer account.

# Subdirectories
* [Datasets](datasets/) - Source datasets feeding these tables.
```

Producers **MAY** generate `index.md` automatically. Consumers **MAY** synthesize one on the fly when it is absent.

## 7. log.md

A `log.md` file **MAY** appear at any level of the hierarchy to record the history of changes to that scope. It is a flat list of date-grouped entries, newest first, optionally preceded by a single `#` title such as `# Directory Update Log`.

Date headings **MUST** use the ISO 8601 `YYYY-MM-DD` form. Entries beneath a date are prose. The leading bold word (`**Creation**`, `**Update**`, `**Deprecation**`, `**Initialization**`, and so on) is a convention, not a requirement.

```markdown
# Directory Update Log

## 2026-05-28
* **Update**: Added the `loyalty_tier` column to the orders schema.

## 2026-05-22
* **Creation**: Documented the orders table and its join to customers.
```

## 8. Citations

When a concept's body makes claims sourced from external material, those sources **SHOULD** be listed under a `# Citations` heading at the bottom of the document, as a numbered list:

```markdown
# Citations
[1] [BigQuery export schema](https://example.com/docs/ga4-export)
[2] [Internal data quality runbook](https://wiki.acme.internal/data/quality)
```

Citation links **MAY** be absolute URLs, bundle-relative paths, or paths into a `references/` subdirectory that mirrors external material as first-class OKF concepts. This last option is how a webpage becomes part of a bundle: the reference enrichment agent, when it crawls an authoritative page, either enriches existing concepts or mints a standalone `references/<slug>.md` concept (type `Reference`) for that page, then cites it. A `references/` concept is an ordinary concept, so it carries the source URL in `resource` and a fetch `timestamp`, and consumers can link to it like any other.

## 9. Versioning

The OKF version is named `okf_version` and uses a `<major>.<minor>` string, for example `"0.1"`. Minor versions are backward-compatible additions; a major version signals a breaking change.

A bundle **MAY** declare the version it targets by placing `okf_version: "0.1"` in the bundle-root `index.md` frontmatter, the only place such frontmatter is permitted. A consumer that does not understand the declared version **SHOULD** still attempt best-effort consumption.

## 10. Non-goals

OKF deliberately does not:

- Define a fixed taxonomy of concept types. `type` is open by design.
- Prescribe storage, serving, or query infrastructure. A bundle is just files.
- Subsume domain-specific schemas. OKF *references* schemas like Avro, Protobuf, and OpenAPI (via `resource` and links) and can describe them in the body; it does not replace or standardize them.

## 11. Distribution

A bundle is just a directory, so it ships however files ship:

- A git repository (the recommended home, since it versions the knowledge alongside the code it describes).
- A tarball or zip archive.
- A subdirectory inside a larger repository.

## 12. Design principles

Three principles explain why the spec is this small.

- **Minimally opinionated.** OKF requires exactly one thing, a `type` per concept. What types exist, what other fields appear, and how the body is organized are left to the producer. The spec defines the interoperability surface, not the content model.
- **Producer and consumer independence.** The party that writes knowledge is cleanly separated from the party that consumes it. The format is the contract, and the tooling at each end is independently swappable. A bundle hand-authored by a human can be read by an agent; a bundle from a metadata export can be browsed in a viewer; a bundle synthesized by one model can be queried by another.
- **Format, not platform.** OKF is never tied to a specific cloud, database, model provider, or agent framework, and never requires a proprietary account or SDK to read, write, or serve. Its value comes from adoption, not ownership.

Because a concept is plain markdown plus YAML frontmatter, bundles also compose with existing knowledge tools (Obsidian, Notion, MkDocs, Hugo, Jekyll) that already speak that pairing, so they can be browsed, edited, or rendered without custom UI.

## 13. Relationship to other formats

OKF is intentionally close to several established patterns: LLM "wiki" repositories that use markdown plus frontmatter as an agent-readable knowledge base, personal knowledge tools like Obsidian and Notion that use hierarchical markdown with cross-links, and "metadata as code" approaches that store catalog metadata alongside source rather than in a separate registry. OKF differs mainly in being *specified*: it pins down the small set of rules needed for interoperability without dictating tooling.

## Reference implementations

Google ships a producer and a consumer as proofs of concept, plus three browsable sample bundles, in [GoogleCloudPlatform/knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf):

- **Producer**, an enrichment agent (Google ADK plus Gemini) that walks a BigQuery dataset in a metadata pass, then an optional web pass that crawls seed URLs and mints `references/<slug>` concepts.
- **Consumer**, a single self-contained HTML visualizer that renders any bundle as a force-directed graph with type-colored nodes, cross-link edges, a "Cited by" backlinks list, search, and type filters.
- **Sample bundles** under `bundles/` (GA4 e-commerce, Stack Overflow, Bitcoin), each paired with a `samples/` recipe that reproduces it.
