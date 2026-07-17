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

Reproduce the reference producer pattern — an inventory, then three passes over it (metadata, web, entity). Use this when pointing the skill at a real dataset, an OpenAPI spec, a wiki space, a website, or a tree of docstrings.

1. **Walk the source exhaustively, before writing anything.** Enumerate *every* unit the source contains, not the ones that happen to be linked from its front door: every table and view in a dataset, every path in an OpenAPI spec, every page in a wiki. For a website, the landing page is an entry point, never the scope — discover the full surface from `sitemap.xml` and `robots.txt`, then from every section and listing page (a blog index, a projects index, an archive, a catalog), following pagination to the end. Write the enumeration down as an explicit inventory (a checklist of unit → intended concept path; see [templates.md](./templates.md)) and treat it as the work-list the passes must burn down. A source with fifty pages yields an inventory of fifty rows; ending with three is the signature of stopping at the front door. The inventory is not frozen at discovery time: the entity pass (step 4) appends a second section for the names that surface while writing, and both sections must be burned down before the gate.
2. **Metadata pass.** For each unit in the inventory, write one concept from the source's own metadata alone: a `type`, the frontmatter you can derive mechanically (name, `description`, `resource`), and a `# Schema`.
3. **Web pass.** Treat the inventory's URLs (and any seed URLs) as authoritative documentation. Fetch each, follow outbound links that look authoritative for the concepts you have, and for each page either (a) enrich one or more existing concepts, (b) mint a standalone `references/<slug>.md` concept (`type: Reference`) for the page, or (c) skip *and record the skip*. Record sources under `# Citations`. Completeness is the goal and the bounds are guardrails, not stopping points: cap the page count and restrict to an allowed set of hosts so the crawl cannot wander, and when a cap or host limit leaves inventory rows uncovered, list what remains in `log.md` rather than calling the source done. Silent truncation is the failure this command exists to prevent.
4. **Entity pass: every name gets a home.** Coverage follows the source's own units, so it inherits the source's depth — and sources routinely *name* things they never *explain*. A CV lists thirty technologies and seven employers in a table; a docs site drops terms like "MCP" or "agent skill" and moves on. Sweep every concept body for those load-bearing names — technologies, organizations, products, people, standards, domain terms — and record each in a second inventory section (see [templates.md](./templates.md)). Then give each its own concept in a domain folder (`technologies/`, `companies/`, `glossary/`). The source's silence about an entity is the reason this pass exists, never a reason to skip it: fill the gap from the rest of the source, from the entity's own authoritative home (its official site or spec — that URL is the concept's `resource`), and from your own knowledge, with `# Citations` naming what each contributed (mark producer knowledge as such, dated, so a reader can tell verified from recalled). Explain the entity *in the source's context*, not as an encyclopedia entry: what it is in a paragraph or two, then its role here, linked both ways — the career concept's "Wertarbyte GmbH" cell links to `/companies/wertarbyte.md`, and the company concept links back to the roles, projects, and articles that involve it. Rewrite the mentions as you go: a bare name in a table or list becomes a link — and verify at write time that every path you link resolves to a real concept file (list the directory; do not trust memory of what the bundle contains). Deliberate forward references to concepts you are about to write are fine; a misremembered path is how a pass that wires "both ways" ships broken links the gate only catches later. Two boundaries keep the pass finite. *Granularity:* a term whose whole story is one sentence lives in a definition list inside a glossary concept; anything with its own facts, history, or relationships gets its own file. *Recursion:* the entity set is the closure over names the *source* uses — names that only appear inside minted entity concepts stay plain prose unless the concept is unintelligible without them (then one more ring, recorded in `log.md`).
5. **Wire the graph.** Add cross-links between concepts you now know are related (foreign keys, derivations, dependencies), labeling each relationship in prose.
6. **Generate indexes and a log**, then validate — and run the creation gate under `export` before calling the bundle done.

Touches: many concept files, a `references/` subtree, `index.md` at each level, `log.md`. This is the heaviest command; do it in slices and validate between slices.

## `link`: assert a relationship

Connect two concepts and say what the connection means.

1. Prefer a bundle-absolute target beginning with `/`, for example `/tables/customers.md`. It survives moving the source file within its directory. Relative targets like `customers.md` are valid too.
2. Put the relationship in the prose around the link, not in the link. `Joined with [customers](/tables/customers.md) on \`customer_id\`` says what the edge means; the link alone does not.
3. A broken link is tolerated, not an error, so linking ahead of a concept you have not written yet is fine. Note it in `log.md` if you want to come back.
4. Link to *concepts*, not to an `index.md`. The index is generated navigation (`index`), not a graph node, so a consumer that builds the concept graph treats a link into an `index.md` as broken. Point at the concrete concept you mean.

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
node okf-validate.mjs path/to/bundle            # tolerant: errors only on the hard rule
node okf-validate.mjs path/to/bundle --strict   # producer gate: also fail on connectivity
```

By default it exits non-zero only on the hard requirement, so it mirrors the permissive consumer. `--strict` turns the connectivity warnings into failures — use it as the producer gate. The reviewer's checklist behind it:

- **Errors (must fix).** Every non-reserved `.md` opens with a frontmatter block, and every block has a non-empty `type`.
- **Structure (should hold).** `index.md` has no frontmatter except a root `okf_version`. `log.md` date headings are `YYYY-MM-DD`. Reserved names are not used for concepts.
- **Connectivity (the producer gate, `--strict`).** No **orphans** (a concept with no concept-to-concept link in or out) and no **broken concept links** (a link whose target is not a concept — a missing file, or a reserved `index.md`/`log.md`). Consumers tolerate both, so they only warn by default; a *producer* resolves them, because an agent that traverses the graph cannot reach an orphan or cross a broken link. This is graph connectivity, not the counts from `export`'s coverage gate — a bundle can cover every source unit and still be a disconnected pile.
- **Warnings (judgment).** A non-ISO log date is reported but does not fail the bundle. Fix the ones that are real mistakes; leave the forward-references you meant.

## `export`: produce a bundle from a source

The producer role: turn an existing source into a bundle. The source can be structured (a data catalog, a metadata export, a schema registry) or prose (an internal docs site, a wiki, a webpage, or a set of external URLs).

**Structured sources.**

1. Map each entity to a concept path and a `type`.
2. Translate the entity's metadata into frontmatter (`resource` is the link back into the source system) and a `# Schema` body.
3. Run `enrich` to add what the raw export lacks.
4. Emit the tree, indexes, and a `log.md`, then validate.

**External URLs and webpages.** Yes, `/okf export <url>` is a supported path, and it is exactly what the reference agent's web pass does. OKF fits it well: `resource` holds the page URL, `# Citations` records provenance, and the body is just markdown.

1. **Map the whole surface first, then fetch.** `export <url>` means the *source behind that URL*, not only the single page at it. When the URL is one page (a lone article), one page becomes one concept. When it is a site or section root (a homepage, a docs root, a blog, a portfolio), it is the entry point to many concepts: enumerate the full surface the way `enrich`'s first step does — `sitemap.xml`, `robots.txt`, and every section and listing page — into an explicit inventory before writing anything, then drive the fetch from that inventory. A multi-section site (a portfolio or CV, a blog with an article list, a projects index, a catalog that lists many entries) captured as a handful of concepts from the homepage's featured links is a *failed* export, not a small one — it silently drops most of the knowledge the user asked to preserve.
2. Place it the canonical way. Mirrored external material lives at `references/<slug>.md` with `type: Reference` (other descriptive types like `Web Page` or `API Reference` are fine). Set `resource` to the canonical URL and `timestamp` to when you fetched it. If the page is documentation for a concept you already have, enrich that concept instead of, or in addition to, minting a new `references/` doc.
3. **Extract the substance; do not summarize-and-link.** The bundle must stand on its own — an agent reads it *instead of* the live site, so the knowledge has to be *in* the concept. Fetch the unit's own page (a section listing gave you the inventory, not the content) and pull the actual material across: the enumerated points, the steps, the definitions, the tables, the numbers, the code, the argument. A body that is a one-sentence summary plus a link back to the source is a **stub** — the knowledge still lives on the web, and the concept is a bookmark. The `resource` URL and `# Citations` are provenance for re-checking a moving target, never a substitute for the content. (Copyright still applies: re-express the substance in your own structure rather than copying a third party's full prose verbatim — but "four patterns exist, see the link" is not extraction; name and explain the four patterns.)
4. Transform while you extract. Re-express as structural markdown, not raw HTML-to-markdown noise, and upgrade form: a paragraph describing a flow becomes a ` ```mermaid ` fence, a formula written out in words becomes TeX, a terms section becomes a definition list, an enumerated set becomes a list or table.
5. Decompose what you extracted. Run `enrich`'s entity pass: every load-bearing name the concepts now use — each listed skill, employer, product, standard, or undefined domain term — gets its own linked concept, enriched past the source when the source never explains it.
6. Cite the source URL under `# Citations`, and link related pages to each other so the result is a graph, not a pile.
7. Generate indexes and a `log.md`, then validate.

**Caveats to record in the bundle itself.** A webpage is a moving target, so the concept is a dated snapshot; the `timestamp` and the cited URL are how a consumer re-checks it later. Bound a multi-URL crawl with a page cap and an allowed-hosts list, the way the reference agent does, so it cannot wander the open web. Respect the source's terms and copyright: prefer summarizing and citing over copying a third party's full text, and keep provenance explicit so a reader can tell what is original and what is borrowed.

**The creation gate — pass it before you call an export done.** Conformance is not completeness: `node okf-validate.mjs` checks only the one hard rule and will happily pass a three-file stub of a fifty-page site. Run this coverage-and-depth review yourself before declaring the bundle finished, and if any line fails, the export is not done — widen the crawl from the inventory and fill the gaps:

- **Coverage.** Every row of the discovery inventory is either a concept or a recorded skip with a reason. The concept count is in the same order of magnitude as the discovered-unit count; a large multi-section source that yielded a dozen files did not cover the source. Every top-level section is represented — for a site that means its profile or CV, every project, every article, and every entry of each listing or catalog, not only the items featured on the front page.
- **Depth (self-contained).** Each concept carries the source's actual substance, re-expressed as structural markdown — the enumerated points, steps, schema, definitions, data, and code — so an agent can answer a real question about the unit from the concept alone, offline. A body that only summarizes and links back to the live URL is a stub: the knowledge is still on the web, not in the bundle. Test each concept — could an agent act on it without opening `resource`? If the honest answer is "no, follow the link," extract more. A folder of stubs is a bookmark list, not a bundle.
- **Decomposition (every name has a home).** No concept leaves the names it relies on bundled and unexplained. Pick any entity a body names — a technology in a skills table, an employer in a CV row, a product, a standard, a domain term the source never defines — and the bundle answers "what is this, and what is its role here?" one link away, in that entity's own concept. A list of thirty bare technology names with no links is the signature failure: coverage reproduced the source's *breadth*, but the bundle stopped exactly where the source stopped instead of supplying the depth the source itself lacks. The entity section of the inventory is burned down (each row a concept or a recorded skip), and the mentions themselves are rewritten as links.
- **Graph, with no dead ends.** Concepts that relate are cross-linked with the relationship named in prose, so the result is a graph and not a pile. An agent traverses the bundle by following those links, so two failure modes strand context: an **orphan** (a concept with no concept link in or out — nothing reaches it, it reaches nothing) and a **broken concept link** (a link whose target is not a concept: a missing file, or a reserved `index.md`/`log.md`). Link every concept to at least one related concept, and link to *concepts*, not to an `index.md` — the index is generated navigation, not a graph node. Run `node okf-validate.mjs <bundle> --strict`, which fails on both, before calling the export done.
- **Provenance.** Every mirrored page has its `resource` URL, a fetch `timestamp`, and a `# Citations` entry.
- **Navigation.** Each directory's `index.md` lists its concepts, and the root `index.md` reaches every section.
- **Boundary recorded.** If bounds — page cap, host allowlist, `robots.txt` exclusions, paywalled or JS-only pages — left parts of the source uncovered, name them in `log.md` so the gap is visible instead of implied-complete.

The output of either path is a plain directory you can commit, tar, or drop into a larger repo.

## `consume`: read a bundle to answer a question

The consumer role. Be forgiving by design (the spec requires it).

1. Start at the bundle-root `index.md` and descend by progressive disclosure, opening only the branches the question needs.
2. Follow links to assemble the relationship graph (a metric to its source tables, a table to its joins).
3. Tolerate everything optional: missing fields, unknown `type` values, unknown keys, broken links, missing indexes. Never refuse a bundle over them.
4. If you also modify the bundle while answering (correcting a fact, adding a citation), you have become a producer too: refresh the `timestamp`, append to `log.md`, update the `index.md`, and validate.
