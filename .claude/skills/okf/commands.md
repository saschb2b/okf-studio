# OKF commands

Each command is a verb over a bundle. They share one invariant: when a command finishes, `node okf-validate.mjs <bundle>` still passes. The normative rules each step relies on are in [spec.md](./spec.md); ready-to-edit templates are in [templates.md](./templates.md).

## `init`: start a bundle

Create the skeleton an agent can navigate from the first file.

1. Choose the bundle root, ideally a directory in version control next to the code or data it describes (for example `knowledge/sales/`).
2. Write a bundle-root `index.md` whose frontmatter declares `okf_version: "0.1"`. This is the only `index.md` allowed to have frontmatter.
3. Create the first concept folders by domain (`tables/`, `datasets/`, `metrics/`), not by file type.
4. Add a `log.md` with a single `Creation` entry dated today.

Touches: `index.md`, `log.md`, the directory tree. Validate before moving on.

## `add`: write one concept

Add a single concept document. Resist documenting ten assets at once; one good concept beats ten stubs.

1. Pick the path. The path is the identity, so `tables/orders.md` is the orders table. Never name a concept file `index.md` or `log.md`.
2. Pick a descriptive `type` (`BigQuery Table`, `Metric`, `Runbook`). Self-explanatory beats clever; there is no registry.
3. Fill the recommended frontmatter you can stand behind: `title`, a one-sentence `description`, the canonical `resource` URI, `tags`, and a `timestamp` of now. Add domain-specific keys freely.
4. Body it with structural markdown. Use `# Schema` for a column or field table, `# Examples` for a query or request, `# Citations` for sources. Give each fact its sharpest form (the table in [SKILL.md](./SKILL.md)): a ` ```mermaid ` fence for joins, lineage, and flows; TeX for a formula; a definition list for term meanings; a task list for a stateful checklist; a footnote for a caveat.
5. Link out to the concepts this one relates to (see `link`), and add it to the directory's `index.md` (see `index`).
6. Append a `log.md` `Creation` entry.

Touches: the new concept file, its directory `index.md`, `log.md`.

## `enrich`: turn a source into concepts

Reproduce the reference producer pattern, which runs in two passes. Use this when pointing the skill at a real dataset, an OpenAPI spec, a wiki space, or a tree of docstrings.

1. **Walk the source.** Enumerate its units (every table and view in a dataset, every path in an OpenAPI spec, every page in a wiki). One unit becomes one concept.
2. **Metadata pass.** For each unit, write one concept from the source's own metadata alone: a `type`, the frontmatter you can derive mechanically (name, `description`, `resource`), and a `# Schema`.
3. **Web pass (optional).** Treat a list of seed URLs as authoritative documentation. Fetch each, follow only outbound links that look authoritative for the concepts you have, and for each page either (a) enrich one or more existing concepts, (b) mint a standalone `references/<slug>.md` concept (`type: Reference`) for the page, or (c) skip. Record sources under `# Citations`. Bound the crawl: cap the number of pages and restrict to an allowed set of hosts so it cannot overrun.
4. **Wire the graph.** Add cross-links between concepts you now know are related (foreign keys, derivations, dependencies), labeling each relationship in prose.
5. **Generate indexes and a log**, then validate.

Touches: many concept files, a `references/` subtree, `index.md` at each level, `log.md`. This is the heaviest command; do it in slices and validate between slices.

## `link`: assert a relationship

Connect two concepts and say what the connection means.

1. Prefer a bundle-absolute target beginning with `/`, for example `/tables/customers.md`. It survives moving the source file within its directory. Relative targets like `customers.md` are valid too.
2. Put the relationship in the prose around the link, not in the link. `Joined with [customers](/tables/customers.md) on \`customer_id\`` says what the edge means; the link alone does not.
3. A broken link is tolerated, not an error, so linking ahead of a concept you have not written yet is fine. Note it in `log.md` if you want to come back.

Touches: the source concept's body.

## `index`: refresh progressive disclosure

Keep each directory's `index.md` current so an agent can choose where to descend without reading everything.

1. For each directory, list its concepts as a bulleted set of links with a short description each, grouped under headings.
2. An `index.md` carries no frontmatter, except the bundle-root one, which keeps its `okf_version`.
3. Regenerate the affected `index.md` whenever you add, rename, remove, or re-describe a concept in that directory. A stale index is the most common drift.

Touches: one or more `index.md` files.

## `log`: record a change

Append a dated entry so consumers and humans can see what moved.

1. Use a `## YYYY-MM-DD` heading (ISO 8601, required), newest first.
2. Lead the entry with a bold word by convention: `**Creation**`, `**Update**`, `**Deprecation**`.
3. Log meaningful changes (a new concept, a schema change, a deprecation), not every typo.

Touches: `log.md`.

## `validate`: check conformance

Run the script, then read the warnings with judgment.

```sh
node okf-validate.mjs path/to/bundle
```

It exits non-zero only on the hard requirement. The reviewer's checklist behind it:

- **Errors (must fix).** Every non-reserved `.md` opens with a frontmatter block, and every block has a non-empty `type`.
- **Structure (should hold).** `index.md` has no frontmatter except a root `okf_version`. `log.md` date headings are `YYYY-MM-DD`. Reserved names are not used for concepts.
- **Warnings (judgment).** A broken cross-link or a non-ISO log date is reported but does not fail the bundle, because consumers tolerate both. Fix the ones that are real mistakes; leave the forward-references you meant.

## `export`: produce a bundle from a source

The producer role: turn an existing source into a bundle. The source can be structured (a data catalog, a metadata export, a schema registry) or prose (an internal docs site, a wiki, a webpage, or a set of external URLs).

**Structured sources.**

1. Map each entity to a concept path and a `type`.
2. Translate the entity's metadata into frontmatter (`resource` is the link back into the source system) and a `# Schema` body.
3. Run `enrich` to add what the raw export lacks.
4. Emit the tree, indexes, and a `log.md`, then validate.

**External URLs and webpages.** Yes, `/okf export <url>` is a supported path, and it is exactly what the reference agent's web pass does. OKF fits it well: `resource` holds the page URL, `# Citations` records provenance, and the body is just markdown.

1. Fetch the page with your agent's web-fetch tool (for a set of URLs, drive it from `enrich`'s web pass). One page becomes one concept; a large doc or doc site becomes several linked concepts, the way a wiki space does.
2. Place it the canonical way. Mirrored external material lives at `references/<slug>.md` with `type: Reference` (other descriptive types like `Web Page` or `API Reference` are fine). Set `resource` to the canonical URL and `timestamp` to when you fetched it. If the page is documentation for a concept you already have, enrich that concept instead of, or in addition to, minting a new `references/` doc.
3. Transform, do not paste. Re-express the page as structural markdown (headings, lists, tables, code), not raw HTML-to-markdown noise. A bundle is curated knowledge, not a scrape. Transforming includes upgrading form: a paragraph describing a flow becomes a ` ```mermaid ` fence, a formula written out in words becomes TeX, a terms section becomes a definition list.
4. Cite the source URL under `# Citations`, and link related pages to each other so the result is a graph, not a pile.
5. Generate indexes and a `log.md`, then validate.

**Caveats to record in the bundle itself.** A webpage is a moving target, so the concept is a dated snapshot; the `timestamp` and the cited URL are how a consumer re-checks it later. Bound a multi-URL crawl with a page cap and an allowed-hosts list, the way the reference agent does, so it cannot wander the open web. Respect the source's terms and copyright: prefer summarizing and citing over copying a third party's full text, and keep provenance explicit so a reader can tell what is original and what is borrowed.

The output of either path is a plain directory you can commit, tar, or drop into a larger repo.

## `consume`: read a bundle to answer a question

The consumer role. Be forgiving by design (the spec requires it).

1. Start at the bundle-root `index.md` and descend by progressive disclosure, opening only the branches the question needs.
2. Follow links to assemble the relationship graph (a metric to its source tables, a table to its joins).
3. Tolerate everything optional: missing fields, unknown `type` values, unknown keys, broken links, missing indexes. Never refuse a bundle over them.
4. If you also modify the bundle while answering (correcting a fact, adding a citation), you have become a producer too: refresh the `timestamp`, append to `log.md`, update the `index.md`, and validate.
