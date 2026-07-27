# OKF templates

Copy, fill, validate. Every example uses bundle-absolute links (beginning with `/`) because the spec recommends them for stability. Relative links like `customers.md` are equally valid. Rules behind these shapes are in [spec.md](./spec.md); the form-per-fact table they follow (diagrams for topology, TeX for formulas, definition lists for terms, task lists for stateful checklists, footnotes for caveats) is in [SKILL.md](./SKILL.md).

## Structured work artifact envelope

In OKF Studio, when a capability names an artifact contract and a work surface is useful, end the response with one fenced `okf-artifact` JSON object. Studio validates this object in Rust before rendering it as trusted work. Prose outside the fence remains conversation text. Invalid artifact JSON also remains prose, so do not describe an unvalidated object as a Studio work surface. Outside Studio, return the same substance in ordinary prose, markdown, or a diff unless the caller explicitly asks for this envelope; never fabricate a fingerprint just to fill the template.

Call `okf_health_summary` immediately before emitting the artifact and copy its exact `bundleFingerprint`. Keep the same portable `artifactId` across revisions. Start at revision 1 with a null `parentRevision`; each continuation increments `revision` and names the previous revision as its parent. A revision sent back by Studio is explicit context: continue from it, never replace it with an older update.

```okf-artifact
{
  "schemaVersion": 1,
  "artifactId": "impact-agent-panel",
  "kind": "change-impact-map",
  "revision": 1,
  "parentRevision": null,
  "bundleFingerprint": "<exact value from okf_health_summary>",
  "title": "Agent Panel change impact",
  "status": "complete",
  "summary": "The panel contract affects its host boundary and reviewed staging.",
  "conceptPaths": ["features/agent-panel.md", "architecture/agent-system.md"],
  "sources": [
    {
      "id": "agent-panel",
      "label": "Agent Panel",
      "kind": "bundle",
      "reference": "features/agent-panel.md"
    }
  ],
  "citations": [
    {
      "sourceId": "agent-panel",
      "claim": "The Agent Panel keeps writes behind reviewed staging."
    }
  ],
  "fields": [
    {
      "id": "target",
      "label": "Target",
      "value": "features/agent-panel.md",
      "editable": true
    },
    {
      "id": "proposed-change",
      "label": "Proposed change",
      "value": "Add a persistent structured-work surface.",
      "editable": true
    }
  ],
  "items": [
    {
      "id": "inspect-host",
      "label": "Inspect the host contract",
      "detail": "Trace direct links before proposing edits.",
      "status": "complete",
      "conceptPath": "features/agent-panel.md",
      "sourceIds": ["agent-panel"]
    }
  ]
}
```

The closed values are:

- `kind`: `source-inventory`, `bundle-plan`, `health-report`, `research-brief`, `change-impact-map`, `migration-plan`, `writing-revision`, or `staged-revision`.
- `status`: `partial` or `complete`.
- source `kind`: `bundle`, `attachment`, or `external`. Bundle references are current bundle-relative concept paths, attachment references are portable attachment IDs, and external references are HTTPS URLs.
- item `status`: `pending`, `in-progress`, `complete`, `blocked`, `advisory`, `unchanged`, `reworded`, `added`, or `removed`. The last four are reserved for a writing revision's claim ledger.

Use bundle-relative Markdown concept paths without a leading slash. Paths may name proposed concepts in `conceptPaths` and `items[].conceptPath`, but a `bundle` source must name a current concept. Every citation and item source ID must resolve within the same object. External research evidence requires claim-level citations.

Each complete artifact has required field IDs:

- `source-inventory`: `scope`
- `bundle-plan`: `destination`, `scope`
- `health-report`: `health-summary`
- `research-brief`: `question`, `conclusion`
- `change-impact-map`: `target`, `proposed-change`
- `migration-plan`: `source-version`, `target-version`, `rollback`
- `writing-revision`: `reader-job`, `purpose`, `revision-mode`
- `staged-revision`: `revision-summary`

Use `partial` when a required field is not yet known. Only planning artifacts (`source-inventory`, `bundle-plan`, `research-brief`, `change-impact-map`, `migration-plan`, and `writing-revision`) may set `editable: true`; those edits remain local until the user explicitly sends a new revision. A `staged-revision` describes reviewed work but does not apply it. Export to conformant Markdown only through reviewed staging.

### Writing revision claim ledger

A `writing-revision` uses `items` as a complete claim ledger. Set `revision-mode` to `style-only` or `enrichment`. Each item names one claim, its before and after text, its status, the affected concept, and the source IDs supporting it. A style-only revision may use only `unchanged` and `reworded`; additions and removals require enrichment scope, and every added claim requires a source.

```okf-artifact
{
  "schemaVersion": 1,
  "artifactId": "revise-refund-definition",
  "kind": "writing-revision",
  "revision": 1,
  "parentRevision": null,
  "bundleFingerprint": "<exact value from okf_health_summary>",
  "title": "Refund definition revision",
  "status": "complete",
  "summary": "Clarifies the settlement boundary without changing the metric.",
  "conceptPaths": ["metrics/net-revenue.md"],
  "sources": [
    {
      "id": "net-revenue",
      "label": "Net revenue",
      "kind": "bundle",
      "reference": "metrics/net-revenue.md"
    }
  ],
  "citations": [],
  "fields": [
    {
      "id": "reader-job",
      "label": "Reader job",
      "value": "Determine when refunds leave net revenue.",
      "editable": true
    },
    {
      "id": "purpose",
      "label": "Purpose",
      "value": "Make the settlement qualifier explicit.",
      "editable": true
    },
    {
      "id": "revision-mode",
      "label": "Revision mode",
      "value": "style-only",
      "editable": false
    }
  ],
  "items": [
    {
      "id": "claim-refund-settlement",
      "label": "Refund settlement boundary",
      "detail": "Reworded while preserving the settlement qualifier.",
      "status": "reworded",
      "conceptPath": "metrics/net-revenue.md",
      "before": "Refunds are excluded from revenue only after settlement.",
      "after": "Revenue excludes a refund after it settles.",
      "sourceIds": ["net-revenue"]
    }
  ]
}
```

## Coverage inventory (the export/enrich work-list)

Before writing a single concept when producing from a source (`export`, `enrich`), enumerate the *whole* surface into a checklist and burn it down. This is the artifact that stops a producer at the front door. Enumerate the way the source lets you: a database's table list, an OpenAPI spec's `paths`, a wiki's page tree, a website's `sitemap.xml` plus its section and listing pages. One discovered unit is one row; keep the list (in scratch, or as a `log.md` note) until every row is a concept or a recorded skip.

```markdown
# Coverage inventory: <source name> (<source root>), <N> units discovered
Discovery: <how the surface was enumerated — e.g. INFORMATION_SCHEMA, spec paths, sitemap.xml + section indexes>

- [ ] <unit> → <concept/path.md>          # one row per unit the source contains
- [ ] <unit> → <concept/path.md>
- [ ] <unit> → <concept/path.md>
- [~] <unit> → skipped: <reason>          # record skips; do not drop silently
```

`N` is the count of units the source actually contains, not a target you may round down. If enumeration found fifty, a bundle of a dozen files has not covered the source. The rows are whatever the source's units are — tables and views, API operations, wiki pages, or a site's articles, entries, and catalog items — grouped into concept folders by domain.

The inventory grows while you write: the entity pass (`enrich` step 4) appends a second section for the load-bearing names concepts use but never explain — technologies, organizations, products, people, standards, domain terms. Same discipline: every row ends as a concept or a recorded skip, and the mention itself is rewritten as a link.

```markdown
# Entities: <M> names mentioned but unexplained
- [ ] React → /technologies/react.md              (mentioned in: /expertise.md, /articles/…)
- [ ] Wertarbyte GmbH → /companies/wertarbyte.md  (mentioned in: /career.md, /projects/…)
- [ ] MCP → /glossary/mcp.md                      (mentioned in: /mcp-servers/index.md, /articles/…)
- [~] GmbH → skipped: legal form, one glossary sentence at most, not load-bearing
```

## Concept document

```markdown
---
type: <descriptive, self-explanatory kind>
title: <human-readable name>
description: <one sentence>
resource: <canonical URI for the underlying asset>
tags: [<tag>, <tag>]
generated: { by: <producer/version | human:id | process:id>, at: <YYYY-MM-DDThh:mm:ssZ> }
verified: { by: human:<id>, at: <YYYY-MM-DDThh:mm:ssZ> }
status: stable
stale_after: <YYYY-MM-DD>
sources:
  - id: <stable-key>
    resource: <url, bundle path, or scope descriptor>
    title: <human-readable label>
    author: <actor>
    last_modified: <YYYY-MM-DD>
---

# Schema
| Column | Type | Description |
|--------|------|-------------|
| `<col>` | `<TYPE>` | <meaning> |

# Examples
\`\`\`sql
-- a representative query
\`\`\`

A claim traced to one source carries a footnote keyed to that source's id.[^<stable-key>]

[^<stable-key>]: <source title>
```

`type` is the only required field. Drop any recommended field you cannot stand behind rather than guessing, and add domain-specific keys freely.

The trust fields are the ones most often filled in wrongly, so be strict with yourself about three of them. `generated.by` is the actor that actually wrote the content, which for agent-written knowledge is `<producer>/<version>` and never `human:<id>`. `verified` records a confirmation that actually happened; omit it entirely rather than seeding it, because it is the sole input to the trust tier a consumer computes. `stale_after` is a real shelf life, not decoration; put it on the concepts that genuinely expire, or consumers learn to ignore it everywhere.

## Bundle-root index.md

The one `index.md` that may carry frontmatter, solely to declare the version.

```markdown
---
okf_version: "0.2"
---

# Sales knowledge

# Datasets
* [orders_db](datasets/orders_db.md) - The transactional sales database.

# Tables
* [Orders](tables/orders.md) - One row per completed customer order.
* [Customers](tables/customers.md) - One row per customer account.

# Metrics
* [Weekly active users](metrics/weekly_active_users.md) - Distinct users active in a 7-day window.
```

## Sub-directory index.md

No frontmatter below the root.

```markdown
# Tables
* [Orders](orders.md) - One row per completed customer order.
* [Customers](customers.md) - One row per customer account.
```

## log.md

Newest first, ISO 8601 date headings.

```markdown
## 2026-05-28
* **Update**: Added the `loyalty_tier` column to the orders schema.

## 2026-05-22
* **Creation**: Documented the orders table and its join to customers.
```

## Worked example: a BigQuery table

`tables/orders.md`

```markdown
---
type: BigQuery Table
title: Orders
description: One row per completed customer order.
resource: https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders
tags: [sales, revenue]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-05-28T14:30:00Z }
verified: { by: human:dpatel, at: 2026-06-02T10:15:00Z }
sources:
  - id: dictionary
    resource: https://wiki.acme.example/sales/orders
    title: Sales warehouse data dictionary
    author: team:data-platform
    last_modified: 2026-05-20
---

# Schema
| Column | Type | Description |
|--------|------|-------------|
| `order_id` | STRING | Globally unique order identifier. |
| `customer_id` | STRING | Foreign key to [customers](/tables/customers.md). |
| `amount_usd` | NUMERIC | Order total in USD, tax included. |
| `created_at` | TIMESTAMP | When the order was placed (UTC). |

# Joins
Joined with [customers](/tables/customers.md) on `customer_id`. One customer has many orders.[^dictionary]

\`\`\`mermaid
erDiagram
  customers ||--o{ orders : "customer_id"
\`\`\`

# Examples
\`\`\`sql
SELECT customer_id, SUM(amount_usd) AS lifetime_value
FROM `acme.sales.orders`
GROUP BY customer_id;
\`\`\`

[^dictionary]: Sales warehouse data dictionary
```

Read the frontmatter as a consumer would. `generated.by` is an agent, so nothing here is hand-written, but `verified` names a `human:` actor, which puts the concept in the **human-reviewed** tier. The `sources` entry carries `last_modified`, so a consumer can see the dictionary changed after this table was documented and weigh that. The footnote is a join key into `sources`, not prose.

## Worked example: a metric

`metrics/weekly_active_users.md`. A metric is a concept whose body is its definition, not a schema.

```markdown
---
type: Metric
title: Weekly active users
description: Distinct users with at least one qualifying event in a trailing 7-day window.
tags: [engagement, growth]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-01T09:00:00Z }
status: stable
stale_after: 2026-12-01
sources:
  - id: defs
    resource: https://wiki.acme.example/metrics/engagement
    title: Engagement metrics definitions
---

# Definition
A user is "active" on a day if they emit at least one event in [events](/tables/events.md)
whose `event_name` is in the qualifying set. WAU on date D counts users active anywhere
in the trailing window:

$$
\mathrm{WAU}(D) = \left|\{\, u \mid \exists\, d \in [D-6,\, D] : \mathrm{active}(u, d) \,\}\right|
$$

The formula is the contract; the prose above says what "active" means.

# Examples
\`\`\`sql
SELECT COUNT(DISTINCT user_id) AS wau
FROM `acme.app.events`
WHERE event_date BETWEEN DATE_SUB(@d, INTERVAL 6 DAY) AND @d
  AND event_name IN ('app_open', 'screen_view');
\`\`\`

# Notes
Bot traffic is excluded upstream in [events](/tables/events.md). Do not re-filter here.[^defs]

[^defs]: Engagement metrics definitions
```

No `verified` key, so a consumer places this in the **unverified** tier. That is the honest state for a definition an agent wrote and nobody has signed off, and it is exactly the signal that would be destroyed by adding a `verified` entry to make the bundle look better. The `stale_after` says the definition is expected to be re-confirmed before December.

## Worked example: a runbook

`runbooks/orders_pipeline_failure.md`. A process is a concept too.

```markdown
---
type: Runbook
title: Orders pipeline failure
description: Recover the orders ingestion pipeline when the daily load fails.
tags: [oncall, pipeline]
generated: { by: human:rkm, at: 2026-06-10T17:45:00Z }
verified: { by: process:runbook-drill, at: 2026-07-01T03:00:00Z }
status: stable
---

# When this fires
The `orders_daily_load` job reports a non-zero exit, or [orders](/tables/orders.md)
is missing yesterday's partition.

# Preflight
Confirm before touching anything:

- [ ] The job logs identify the failing stage
- [ ] The source export for yesterday actually completed
- [ ] No schema-change PR merged since the last green run

# Steps
1. If the source export is late, wait and re-run; do not backfill by hand[^backfill].
2. If the schema changed, update [orders](/tables/orders.md) and the load config together.
3. Re-run `orders_daily_load` for the missing partition only.

# Escalation
Page the data-platform on-call if the partition is still missing after one re-run.

[^backfill]: Hand backfills bypass the dedupe stage and have produced double-counted revenue twice; see the 2026-03 incident review.
```

A subtlety worth internalizing: a human *wrote* this, but the only `verified` actor is a process, so the tier is **machine-confirmed**, not human-reviewed. The tier is computed from who confirmed, never from who authored, because self-authorship is not review. Note also that `[^backfill]` keys to nothing in `sources`; a footnote is still an ordinary footnote when the concept is not using keyed attribution.

## Worked example: a glossary

`glossary.md`. Term meanings are definition lists, not bullet prose; a caveat too small for its own `sources` entry is a footnote. The glossary is the home for a term whose whole story is one or two sentences; an entity with its own facts, history, or relationships graduates to its own concept (next example).

```markdown
---
type: Glossary
title: Sales terms
description: What the sales bundle's recurring terms mean, in one place.
tags: [sales, terminology]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-12T08:00:00Z }
---

# Terms

Order
: A completed checkout. Draft carts are not orders[^carts].

Lifetime value
: A customer's summed order totals, $\mathrm{LTV} = \sum_i \mathrm{amount\_usd}_i$,
  over [orders](/tables/orders.md).

Active user
: Defined by [weekly active users](/metrics/weekly_active_users.md); do not redefine
  per report.

[^carts]: Carts live in the app database and never reach the warehouse export.
```

## Worked example: an entity concept (the entity pass)

`technologies/react.md`. The shape the entity pass (`enrich` step 4) mints for a name the source uses but never explains, here one of thirty technologies a CV listed as bare text. What the source lacks, the concept supplies: a self-contained explanation from the entity's authoritative home and producer knowledge, then the entity's role *in this bundle*, linked both ways so the skills table's "React" cell now points here and this concept points back. The `sources` family says what each input contributed, so sourced and recalled facts stay distinguishable: producer knowledge gets its own entry whose `resource` is a scope descriptor rather than a URL, and the footnotes show which sentence rests on which.

```markdown
---
type: Technology
title: React
description: The declarative UI library most of the portfolio's frontend work builds on.
resource: https://react.dev
tags: [frontend, library, javascript]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-07-16T09:00:00Z }
sources:
  - id: reactdev
    resource: https://react.dev
    title: react.dev, official documentation
  - id: cv
    resource: https://www.saschb2b.com/work
    title: Work, saschb2b.com, where the source names it
  - id: recalled
    resource: producer knowledge at 2026-07-16, not read from a source
    title: Producer knowledge
---

React is a declarative JavaScript library for building component-based user
interfaces, maintained by Meta and a large open-source community. Components
describe their UI as a function of state; React reconciles changes against the
DOM.[^reactdev] Since React 19, the React Compiler handles memoization
automatically.[^recalled]

# Role in this bundle
The primary frontend library in [technical expertise](/expertise.md), used
across most [projects](/projects/synthwave-drive.md) and examined in articles
such as [React state management in 2026](/articles/react-state-management-2026.md)
and [React structure, then and now](/articles/react-structure-then-and-now.md).[^cv]

[^reactdev]: react.dev, official documentation
[^cv]: Work, saschb2b.com
[^recalled]: Producer knowledge, unverified against a source
```

The `recalled` entry is the pattern that matters here. A `sources` entry may name a population or scope it cannot link to, which is what lets producer knowledge be declared rather than quietly blended into sourced text. A reader can now see which sentence came from the official docs and which came from the agent, and re-check only the second.

## Worked example: an external page mirrored as a reference

`references/ga4-export-schema.md`. This is the canonical shape for turning a webpage or external URL into a bundle concept (`/okf export <url>`). `resource` is the live URL, `generated.at` is when you fetched it, `generated.by` is what fetched it, and the body is a transformed summary, not a paste. Other concepts cite it.

```markdown
---
type: Reference
title: GA4 BigQuery Export schema
description: Google's reference for the tables and columns GA4 exports to BigQuery.
resource: https://support.google.com/analytics/answer/7029846
tags: [ga4, external, documentation]
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-18T11:00:00Z }
stale_after: 2026-12-18
sources:
  - id: ga4-schema
    resource: https://support.google.com/analytics/answer/7029846
    title: BigQuery Export schema
    author: team:ga4-docs
    last_modified: 2026-05-30
    usage_count: 5000
usage_window: { from: 2026-06-01, to: 2026-06-30 }
---

# Summary
GA4 exports one `events_YYYYMMDD` table per day into a per-property dataset.
Each row is one event, with nested `event_params` and `user_properties` records.

# Key points
* The export is append-only; intraday data lands in `events_intraday_YYYYMMDD`.[^ga4-schema]
* `event_timestamp` is microseconds since the Unix epoch (UTC).
* Cited by [events](/tables/events.md) and [weekly active users](/metrics/weekly_active_users.md).

[^ga4-schema]: BigQuery Export schema
```

A `references/` concept is an ordinary concept (it just happens to mirror something external), so it validates like any other and shows up in the graph. Keep the snapshot honest: `generated.at` plus the source URL tell a reader how to re-check it, `last_modified` tells them whether the upstream page has moved since, and `stale_after` puts a date on when the mirror should be re-fetched. Summarize and cite rather than copying a third party's full text.

## Worked example: an attested computation

`computations/revenue_fy.md`. New in v0.2, and the shape to reach for whenever the bundle backs a *number* rather than a description. The point is the asymmetry: an agent may fill `parameters` and run this, but may not write or edit the SQL, and a deterministic attester checks afterwards that it did neither.

```markdown
---
type: Attested Computation
title: Revenue for fiscal year
description: Recognized revenue for a fiscal year, per Finance's definition.
status: stable
runtime: bigquery
parameters:
  - { name: year, type: integer, required: true }
executor:
  resource: /skills/run-on-bq.md
  receipt: [job_id, executed_sql, result]
attester:
  resource: /attesters/revenue.py
generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }
verified: { by: human:ahormati, at: 2026-06-25T09:00:00Z }
stale_after: 2026-09-23
sources:
  - id: rev-policy
    resource: https://wiki.acme/finance/revenue-recognition
    title: Revenue recognition policy
---

Recognized revenue follows the shipment date, not the order date.[^rev-policy]
Used by [monthly revenue](/metrics/monthly_revenue.md).

# Computation
\`\`\`sql
SELECT SUM(amount_usd) AS revenue
FROM `acme.finance.recognized_revenue`
WHERE fiscal_year = @year;
\`\`\`

[^rev-policy]: Revenue recognition policy
```

Long or generated SQL goes in a file instead: set `computation: /computations/lib/revenue.sql` and drop the `# Computation` fence. Use one form or the other, never both.

Two things this example is making explicit. `verified` says a human agreed the *definition* matches Finance's policy; it says nothing about any particular run, which is what the attester is for. And the attester checks both halves: *provenance*, that the executed SQL equals this computation bound with the claimed `year`, compared canonicalized so formatting is not a loophole; and *fidelity*, that the number a consumer displays matches the receipt's result re-read by `job_id` rather than copied out of the agent's prose.
