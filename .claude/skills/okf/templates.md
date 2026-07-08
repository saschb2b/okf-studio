# OKF templates

Copy, fill, validate. Every example uses bundle-absolute links (beginning with `/`) because the spec recommends them for stability. Relative links like `customers.md` are equally valid. Rules behind these shapes are in [spec.md](./spec.md); the form-per-fact table they follow (diagrams for topology, TeX for formulas, definition lists for terms, task lists for stateful checklists, footnotes for caveats) is in [SKILL.md](./SKILL.md).

## Concept document

```markdown
---
type: <descriptive, self-explanatory kind>
title: <human-readable name>
description: <one sentence>
resource: <canonical URI for the underlying asset>
tags: [<tag>, <tag>]
timestamp: <YYYY-MM-DDThh:mm:ssZ>
---

# Schema
| Column | Type | Description |
|--------|------|-------------|
| `<col>` | `<TYPE>` | <meaning> |

# Examples
\`\`\`sql
-- a representative query
\`\`\`

# Citations
[1] [<source title>](<url>)
```

`type` is the only required field. Drop any recommended field you cannot stand behind rather than guessing, and add domain-specific keys freely.

## Bundle-root index.md

The one `index.md` that may carry frontmatter, solely to declare the version.

```markdown
---
okf_version: "0.1"
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
timestamp: 2026-05-28T14:30:00Z
---

# Schema
| Column | Type | Description |
|--------|------|-------------|
| `order_id` | STRING | Globally unique order identifier. |
| `customer_id` | STRING | Foreign key to [customers](/tables/customers.md). |
| `amount_usd` | NUMERIC | Order total in USD, tax included. |
| `created_at` | TIMESTAMP | When the order was placed (UTC). |

# Joins
Joined with [customers](/tables/customers.md) on `customer_id`. One customer has many orders.

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

# Citations
[1] [Sales warehouse data dictionary](https://wiki.acme.example/sales/orders)
```

## Worked example: a metric

`metrics/weekly_active_users.md`. A metric is a concept whose body is its definition, not a schema.

```markdown
---
type: Metric
title: Weekly active users
description: Distinct users with at least one qualifying event in a trailing 7-day window.
tags: [engagement, growth]
timestamp: 2026-06-01T09:00:00Z
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
Bot traffic is excluded upstream in [events](/tables/events.md). Do not re-filter here.

# Citations
[1] [Engagement metrics definitions](https://wiki.acme.example/metrics/engagement)
```

## Worked example: a runbook

`runbooks/orders_pipeline_failure.md`. A process is a concept too.

```markdown
---
type: Runbook
title: Orders pipeline failure
description: Recover the orders ingestion pipeline when the daily load fails.
tags: [oncall, pipeline]
timestamp: 2026-06-10T17:45:00Z
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

## Worked example: a glossary

`glossary.md`. Term meanings are definition lists, not bullet prose; a caveat too small for `# Citations` is a footnote.

```markdown
---
type: Glossary
title: Sales terms
description: What the sales bundle's recurring terms mean, in one place.
tags: [sales, terminology]
timestamp: 2026-06-12T08:00:00Z
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

## Worked example: an external page mirrored as a reference

`references/ga4-export-schema.md`. This is the canonical shape for turning a webpage or external URL into a bundle concept (`/okf export <url>`). `resource` is the live URL, `timestamp` is when you fetched it, and the body is a transformed summary, not a paste. Other concepts cite it.

```markdown
---
type: Reference
title: GA4 BigQuery Export schema
description: Google's reference for the tables and columns GA4 exports to BigQuery.
resource: https://support.google.com/analytics/answer/7029846
tags: [ga4, external, documentation]
timestamp: 2026-06-18T11:00:00Z
---

# Summary
GA4 exports one `events_YYYYMMDD` table per day into a per-property dataset.
Each row is one event, with nested `event_params` and `user_properties` records.

# Key points
* The export is append-only; intraday data lands in `events_intraday_YYYYMMDD`.
* `event_timestamp` is microseconds since the Unix epoch (UTC).
* Cited by [events](/tables/events.md) and [weekly active users](/metrics/weekly_active_users.md).

# Citations
[1] [BigQuery Export schema](https://support.google.com/analytics/answer/7029846)
```

A `references/` concept is an ordinary concept (it just happens to mirror something external), so it validates like any other and shows up in the graph. Keep the snapshot honest: the `timestamp` plus the cited URL tell a reader how to re-check it, and you should summarize and cite rather than copy a third party's full text.
