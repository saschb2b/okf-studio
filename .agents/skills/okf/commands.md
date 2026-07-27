# OKF commands

Each command is a verb over a bundle. They share one invariant: when a command finishes, `node okf-validate.mjs <bundle>` still passes. The normative rules each step relies on are in [spec.md](./spec.md); ready-to-edit templates are in [templates.md](./templates.md).

## `init`: start a bundle

Create the skeleton an agent can navigate from the first file.

1. Choose the bundle root, ideally a directory in version control next to the code or data it describes (for example `knowledge/sales/`).
2. Write a bundle-root `index.md` whose frontmatter declares `okf_version: "0.2"`. This is the only `index.md` allowed to have frontmatter.
3. Create the first concept folders by domain (`tables/`, `datasets/`, `metrics/`), not by file type.
4. Add a `log.md` with a single `Creation` entry dated today.

Touches: `index.md`, `log.md`, the directory tree. Validate before moving on.

## `add`: write one concept

Add a single concept document. Resist documenting ten assets at once; one good concept beats ten stubs.

1. Pick the path. The path is the identity, so `tables/orders.md` is the orders table. Never name a concept file `index.md` or `log.md`.
2. Pick a descriptive `type` (`BigQuery Table`, `Metric`, `Runbook`). Self-explanatory beats clever; there is no registry.
3. Fill the recommended frontmatter you can stand behind: `title`, a one-sentence `description`, the canonical `resource` URI, and `tags`. Add domain-specific keys freely.
4. Record provenance and trust (spec sections 5 and 7). `generated: { by: <actor>, at: <now> }` names who wrote it, where the actor is `<producer>/<version>` for an agent, `human:<id>` for a person, `process:<id>` for automation. List what it derives from under `sources`, each entry carrying at least `resource`, plus an `id` when the body cites it. Set `status` when it is not `stable`, and `stale_after` when the content has a known shelf life. Add `verified` only for a confirmation that actually happened; writing `human:` for agent-written content silently inflates the bundle's trust tier.
5. Body it with structural markdown. Use `# Schema` for a column or field table and `# Examples` for a query or request. Attribute a single claim with a footnote whose label is a `sources` entry id (`...sharded daily.[^ga4-schema]`). Give each fact its sharpest form (the table in [SKILL.md](./SKILL.md)): a ` ```mermaid ` fence for joins, lineage, and flows; TeX for a formula; a definition list for term meanings; a task list for a stateful checklist; a footnote for a caveat.
6. Link out to the concepts this one relates to (see `link`), and add it to the directory's `index.md` (see `index`).
7. Append a `log.md` `Creation` entry.

Touches: the new concept file, its directory `index.md`, `log.md`.

## `attest`: define a computation an agent may run but not write

New in v0.2. Use this when a bundle backs a *number* rather than a description, and the risk is an agent inventing plausible SQL instead of running the sanctioned query. The full contract is spec section 10.

1. Give it its own concept, `type: Attested Computation`, so one definition can back a metric, a dashboard, and a report.
2. Declare `runtime` (`bigquery`, `postgres`, `dbt`, `python`, `Looker`). It is required, and it decides how everything else is interpreted.
3. Declare `parameters` as typed named holes, each `{ name, type, required }`. These are the only things an agent may fill.
4. Supply the computation exactly once, either inline under a `# Computation` fence (short, reviewed alongside its contract) or as a `computation:` path to a file (long, generated, or shared with non-OKF tools).
5. Declare the `executor` (`resource` for run instructions, `receipt` for the fields a run must return as evidence) and the `attester` (`resource` for deterministic code, **no LLM**, that turns a receipt into a verdict).
6. Add the usual trust frontmatter. `verified` says the definition matches policy; it does not say any particular run was honest. That is what attestation is for, and they are not interchangeable.

**The line that makes this worth anything.** An agent MAY supply values for the declared parameters. It MUST NOT author or edit the computation. An attester checks *provenance* (the SQL that ran equals the stored computation bound with the claimed parameters, compared canonicalized) and *fidelity* (the reported number matches the receipt's source, re-read by job id rather than trusted from the agent's prose). Consumers surface a failing attestation rather than dropping it.

Touches: one new concept, the computation file if external, `index.md`, `log.md`.

## `migrate`: move a bundle from v0.1 to v0.2

A v0.1 bundle stays consumable, so this is not urgent. It is still worth doing, because the fields a v0.1 bundle lacks are exactly the ones a consumer needs to decide whether to believe it. Two mechanical changes and three judgment calls.

Mechanical:

1. Root `index.md` declares `okf_version: "0.2"`.
2. Every `timestamp: <ISO>` becomes `generated: { by: <actor>, at: <the same ISO> }`. The datetime carries over unchanged; the work is naming the actor honestly.
3. Every `# Citations` body section becomes `sources` frontmatter entries, each with `resource` and a `title`, plus an `id` for any the body cites. Delete the body section.

Judgment:

4. **Pick the actor truthfully.** If the content was agent-written, `generated.by` is the agent (`<producer>/<version>`), not `human:<id>`. Where the specific model was never recorded, say so in the version slot rather than guessing one.
5. **Do not backfill `verified`.** A verification event that never happened is worse than none, because `verified` is precisely the field a consumer trusts to distinguish reviewed knowledge from generated knowledge. Leave concepts unverified until a real human or process confirms them.
6. **Add `status` and `stale_after` only where they are real.** A blanket `stale_after` on every concept teaches consumers to ignore the field.

Then run `okf-validate --strict`, which gates the v0.1 leftovers once the root index declares `"0.2"`, and record the migration in `log.md`, including anything you deliberately left unverified.

Touches: every concept, the root `index.md`, `log.md`.

## `enrich`: turn a source into concepts

Reproduce the reference producer pattern — an inventory, then three passes over it (metadata, web, entity). Use this when pointing the skill at a real dataset, an OpenAPI spec, a wiki space, a website, or a tree of docstrings.

1. **Walk the source exhaustively, before writing anything.** Enumerate *every* unit the source contains, not the ones that happen to be linked from its front door: every table and view in a dataset, every path in an OpenAPI spec, every page in a wiki. For a website, the landing page is an entry point, never the scope — discover the full surface from `sitemap.xml` and `robots.txt`, then from every section and listing page (a blog index, a projects index, an archive, a catalog), following pagination to the end. Write the enumeration down as an explicit inventory (a checklist of unit → intended concept path; see [templates.md](./templates.md)) and treat it as the work-list the passes must burn down. A source with fifty pages yields an inventory of fifty rows; ending with three is the signature of stopping at the front door. The inventory is not frozen at discovery time: the entity pass (step 4) appends a second section for the names that surface while writing, and both sections must be burned down before the gate.
2. **Metadata pass.** For each unit in the inventory, write one concept from the source's own metadata alone: a `type`, the frontmatter you can derive mechanically (name, `description`, `resource`), and a `# Schema`.
3. **Web pass.** Treat the inventory's URLs (and any seed URLs) as authoritative documentation. Fetch each, follow outbound links that look authoritative for the concepts you have, and for each page either (a) enrich one or more existing concepts, (b) mint a standalone `references/<slug>.md` concept (`type: Reference`) for the page, or (c) skip *and record the skip*. Record what you read as `sources` entries, giving each an `id` and, where the page reports them, the credibility signals `author`, `last_modified`, and `usage_count`. Completeness is the goal and the bounds are guardrails, not stopping points: cap the page count and restrict to an allowed set of hosts so the crawl cannot wander, and when a cap or host limit leaves inventory rows uncovered, list what remains in `log.md` rather than calling the source done. Silent truncation is the failure this command exists to prevent.
4. **Entity pass: every name gets a home.** Coverage follows the source's own units, so it inherits the source's depth, and sources routinely *name* things they never *explain*. A CV lists thirty technologies and seven employers in a table; a docs site drops terms like "MCP" or "agent skill" and moves on. Sweep every concept body for those load-bearing names (technologies, organizations, products, people, standards, domain terms) and record each in a second inventory section (see [templates.md](./templates.md)). Then give each its own concept in a domain folder (`technologies/`, `companies/`, `glossary/`). The source's silence about an entity is the reason this pass exists, never a reason to skip it: fill the gap from the rest of the source, from the entity's own authoritative home (its official site or spec, whose URL is the concept's `resource`), and from your own knowledge, with `sources` naming what each contributed (producer knowledge gets its own entry whose `resource` is a scope descriptor rather than a URL, and `generated.by` dates and attributes it, so a reader can tell sourced from recalled). Explain the entity *in the source's context*, not as an encyclopedia entry: what it is in a paragraph or two, then its role here, linked both ways, so the career concept's "Wertarbyte GmbH" cell links to `/companies/wertarbyte.md`, and the company concept links back to the roles, projects, and articles that involve it. Rewrite the mentions as you go: a bare name in a table or list becomes a link, and verify at write time that every path you link resolves to a real concept file (list the directory; do not trust memory of what the bundle contains). Deliberate forward references to concepts you are about to write are fine; a misremembered path is how a pass that wires "both ways" ships broken links the gate only catches later. Two boundaries keep the pass finite. *Granularity:* a term whose whole story is one sentence lives in a definition list inside a glossary concept; anything with its own facts, history, or relationships gets its own file. *Recursion:* the entity set is the closure over names the *source* uses. Names that only appear inside minted entity concepts stay plain prose unless the concept is unintelligible without them (then one more ring, recorded in `log.md`).
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

By default it exits non-zero only on the hard requirement, so it mirrors the permissive consumer. `--strict` turns the connectivity warnings, and on a bundle declaring `okf_version: "0.2"` the provenance warnings, into failures. Use it as the producer gate. The reviewer's checklist behind it:

- **Errors (must fix).** Every non-reserved `.md` opens with a frontmatter block, and every block has a non-empty `type`. Nothing v0.2 added can be an error, because all of it is optional.
- **Structure (should hold).** `index.md` has no frontmatter except a root `okf_version`. `log.md` date headings are `YYYY-MM-DD`. Reserved names are not used for concepts.
- **Provenance (the v0.2 producer gate, `--strict` on a v0.2 bundle).** No leftover `timestamp` or `# Citations` from v0.1, every `sources` entry has a `resource`, every `generated` has a `by`, `status` is one of `draft|stable|deprecated`, and an `Attested Computation` declares `runtime` and supplies a computation. These are only gated once the root index says `"0.2"`: a v0.1 bundle stays valid, since the spec keeps it consumable under documented fallbacks.
- **Connectivity (the producer gate, `--strict`).** No **orphans** (a concept with no concept-to-concept link in or out) and no **broken concept links** (a link whose target is not a concept — a missing file, or a reserved `index.md`/`log.md`). Consumers tolerate both, so they only warn by default; a *producer* resolves them, because an agent that traverses the graph cannot reach an orphan or cross a broken link. This is graph connectivity, not the counts from `export`'s coverage gate — a bundle can cover every source unit and still be a disconnected pile.
- **Warnings (judgment).** A non-ISO log date, an identity that is not in the actor convention, a footnote label that matches no `sources` id, or a `stale_after` that has passed. Reported, never fatal. Fix the ones that are real mistakes; leave the forward-references you meant.

## `health`: inspect knowledge quality without changing conformance

Use Studio's deterministic health tools when the question goes beyond the OKF v0.2 hard rule.

1. Call `okf_health_summary` and keep its bundle fingerprint.
2. Filter the summary by category, severity, or fact-versus-heuristic basis instead of loading every concept.
3. Call `okf_health_finding` for the evidence and rationale behind a selected result.
4. Call `okf_health_affected` for bounded metadata about the concepts involved.
5. Call `okf_health_repair` only when you need to know whether an exact mechanical repair exists. A guided result requires judgment and must not be presented as deterministic.

Health covers conformance, graph connectivity, navigation, provenance, freshness signals, duplication, and coverage hints. Only the conformance category mirrors the validator. Every other category remains a fact about bundle shape or a named heuristic. A fingerprint mismatch means the bundle changed; start from a new summary instead of using stale findings.

Outside Studio, run `okf-validate.mjs`, inspect indexes and links with filesystem search, and report which findings are deterministic versus heuristic. Omit Studio finding IDs, repairability claims, and fingerprints that the available tools cannot produce.

## `retrieve`: select coherent evidence and explain the route

Use Studio's `okf_retrieve` tool when a question needs more than a known concept read.

1. Send the question without a route override first. Studio classifies exact, lexical, relationship, global, temporal, structured, full-context, and mixed requests deterministically.
2. Check the bundle fingerprint, provider disclosure, context budget, omissions, conflicts, and abstention signal before using the packet.
3. Cite the returned concept and section identities. Read a full concept only when the selected section lacks defining context.
4. Override the route only to compare a named alternative. Retain both receipt IDs and explain what evidence changed.
5. Treat repair suggestions as review inputs. Send an accepted proposal through the existing staged-write flow; a receipt never writes the bundle.

The manifest, ranker scores, summaries, and receipts are disposable app data. They are not OKF facts and do not change conformance.

Outside Studio, reproduce the same bounded evidence selection with the available file search, reads, and link traversal. Cite concept paths and sections directly, state omissions or conflicts, and abstain when the necessary evidence is outside the inspected bundle; do not invent a retrieval receipt.

## `export`: produce a bundle from a source

The producer role: turn an existing source into a bundle. The source can be structured (a data catalog, a metadata export, a schema registry) or prose (an internal docs site, a wiki, a webpage, or a set of external URLs).

**Structured sources.**

1. Map each entity to a concept path and a `type`.
2. Translate the entity's metadata into frontmatter (`resource` is the link back into the source system) and a `# Schema` body.
3. Run `enrich` to add what the raw export lacks.
4. Emit the tree, indexes, and a `log.md`, then validate.

**External URLs and webpages.** Yes, `/okf export <url>` is a supported path, and it is exactly what the reference agent's web pass does. OKF fits it well: `resource` holds the page URL, the `sources` family records provenance with its credibility signals, and the body is just markdown.

1. **Map the whole surface first, then fetch.** `export <url>` means the *source behind that URL*, not only the single page at it. When the URL is one page (a lone article), one page becomes one concept. When it is a site or section root (a homepage, a docs root, a blog, a portfolio), it is the entry point to many concepts: enumerate the full surface the way `enrich`'s first step does — `sitemap.xml`, `robots.txt`, and every section and listing page — into an explicit inventory before writing anything, then drive the fetch from that inventory. A multi-section site (a portfolio or CV, a blog with an article list, a projects index, a catalog that lists many entries) captured as a handful of concepts from the homepage's featured links is a *failed* export, not a small one — it silently drops most of the knowledge the user asked to preserve.
2. Place it the canonical way. Mirrored external material lives at `references/<slug>.md` with `type: Reference` (other descriptive types like `Web Page` or `API Reference` are fine). Set `resource` to the canonical URL and `generated.at` to when you fetched it, with `generated.by` naming the agent that did. Where the page states them, carry `last_modified` and any usage figures onto the matching `sources` entry; they are what let a consumer weigh one mirrored page against another. If the page is documentation for a concept you already have, enrich that concept instead of, or in addition to, minting a new `references/` doc.
3. **Extract the substance; do not summarize-and-link.** The bundle must stand on its own, because an agent reads it *instead of* the live site, so the knowledge has to be *in* the concept. Fetch the unit's own page (a section listing gave you the inventory, not the content) and pull the actual material across: the enumerated points, the steps, the definitions, the tables, the numbers, the code, the argument. A body that is a one-sentence summary plus a link back to the source is a **stub**. The knowledge still lives on the web, and the concept is a bookmark. The `resource` URL and the `sources` entries are provenance for re-checking a moving target, never a substitute for the content. (Copyright still applies: re-express the substance in your own structure rather than copying a third party's full prose verbatim, but "four patterns exist, see the link" is not extraction; name and explain the four patterns.)
4. Transform while you extract. Re-express as structural markdown, not raw HTML-to-markdown noise, and upgrade form: a paragraph describing a flow becomes a ` ```mermaid ` fence, a formula written out in words becomes TeX, a terms section becomes a definition list, an enumerated set becomes a list or table.
5. Decompose what you extracted. Run `enrich`'s entity pass: every load-bearing name the concepts now use — each listed skill, employer, product, standard, or undefined domain term — gets its own linked concept, enriched past the source when the source never explains it.
6. Record the source URL as a `sources` entry, and link related pages to each other so the result is a graph, not a pile.
7. Generate indexes and a `log.md`, then validate.

**Caveats to record in the bundle itself.** A webpage is a moving target, so the concept is a dated snapshot; `generated.at`, the source's own `last_modified`, and a `stale_after` when the material has a known shelf life are how a consumer re-checks it later. Bound a multi-URL crawl with a page cap and an allowed-hosts list, the way the reference agent does, so it cannot wander the open web. Respect the source's terms and copyright: prefer summarizing and citing over copying a third party's full text, and keep provenance explicit so a reader can tell what is original and what is borrowed.

**The creation gate — pass it before you call an export done.** Conformance is not completeness: `node okf-validate.mjs` checks only the one hard rule and will happily pass a three-file stub of a fifty-page site. Run this coverage-and-depth review yourself before declaring the bundle finished, and if any line fails, the export is not done — widen the crawl from the inventory and fill the gaps:

- **Coverage.** Every row of the discovery inventory is either a concept or a recorded skip with a reason. The concept count is in the same order of magnitude as the discovered-unit count; a large multi-section source that yielded a dozen files did not cover the source. Every top-level section is represented — for a site that means its profile or CV, every project, every article, and every entry of each listing or catalog, not only the items featured on the front page.
- **Depth (self-contained).** Each concept carries the source's actual substance, re-expressed as structural markdown — the enumerated points, steps, schema, definitions, data, and code — so an agent can answer a real question about the unit from the concept alone, offline. A body that only summarizes and links back to the live URL is a stub: the knowledge is still on the web, not in the bundle. Test each concept — could an agent act on it without opening `resource`? If the honest answer is "no, follow the link," extract more. A folder of stubs is a bookmark list, not a bundle.
- **Decomposition (every name has a home).** No concept leaves the names it relies on bundled and unexplained. Pick any entity a body names — a technology in a skills table, an employer in a CV row, a product, a standard, a domain term the source never defines — and the bundle answers "what is this, and what is its role here?" one link away, in that entity's own concept. A list of thirty bare technology names with no links is the signature failure: coverage reproduced the source's *breadth*, but the bundle stopped exactly where the source stopped instead of supplying the depth the source itself lacks. The entity section of the inventory is burned down (each row a concept or a recorded skip), and the mentions themselves are rewritten as links.
- **Graph, with no dead ends.** Concepts that relate are cross-linked with the relationship named in prose, so the result is a graph and not a pile. An agent traverses the bundle by following those links, so two failure modes strand context: an **orphan** (a concept with no concept link in or out — nothing reaches it, it reaches nothing) and a **broken concept link** (a link whose target is not a concept: a missing file, or a reserved `index.md`/`log.md`). Link every concept to at least one related concept, and link to *concepts*, not to an `index.md` — the index is generated navigation, not a graph node. Run `node okf-validate.mjs <bundle> --strict`, which fails on both, before calling the export done.
- **Provenance.** Every mirrored page has its `resource` URL, a `generated: { by, at }` recording who fetched it and when, and a `sources` entry. Nothing carries a `verified` event that did not actually happen.
- **Navigation.** Each directory's `index.md` lists its concepts, and the root `index.md` reaches every section.
- **Boundary recorded.** If bounds — page cap, host allowlist, `robots.txt` exclusions, paywalled or JS-only pages — left parts of the source uncovered, name them in `log.md` so the gap is visible instead of implied-complete.

The output of either path is a plain directory you can commit, tar, or drop into a larger repo.

## `consume`: read a bundle to answer a question

The consumer role. Be forgiving by design (the spec requires it).

1. Start at the bundle-root `index.md` and descend by progressive disclosure, opening only the branches the question needs.
2. Follow links to assemble the relationship graph (a metric to its source tables, a table to its joins).
3. Tolerate everything optional: missing fields, unknown `type` values, unknown keys, broken links, missing indexes. Never refuse a bundle over them.
4. Read the trust and lifecycle signals before relying on a concept, and pass them on. Derive the tier from `verified` (absent means unverified, non-`human:` actors mean machine-confirmed, a `human:<id>` means human-reviewed), treat `status: deprecated` as history rather than current, and warn when `today >= stale_after` instead of quietly serving stale content.
5. If you also modify the bundle while answering (correcting a fact, adding a source), you have become a producer too: refresh `generated`, append to `log.md`, update the `index.md`, and validate.
