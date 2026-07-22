---
type: BigQuery Table
resource: https://bigquery.googleapis.com/v2/projects/bigquery-public-data/datasets/ga4_obfuscated_sample_ecommerce/tables/events_*
title: Events table (Google Analytics BigQuery Export)
description: Contains Google Analytics event export data from the `ga4_obfuscated_sample_ecommerce`
  dataset.
tags:
- events
- Google Analytics
- BigQuery
- ecommerce
- schema
- basic queries
- advanced queries
timestamp: '2026-05-28T22:53:05+00:00'
---

<!-- Modified from the Google knowledge-catalog sample: schema and query sections omitted for the offline compatibility corpus. -->

# Overview
The `events_` table is a sharded BigQuery table containing Google Analytics event export data from the `ga4_obfuscated_sample_ecommerce` dataset.

# Metrics
- [Event Count](../references/metrics/event_count.md) — Total number of events.
- [User Count](../references/metrics/user_count.md) — Total number of unique users.
- [Day Count](../references/metrics/day_count.md) — Total number of unique days.
- [New User Count](../references/metrics/new_user_count.md) — The number of unique users who triggered a first_visit or first_open event.
- [Average Transactions Per Purchaser](../references/metrics/avg_transactions_per_purchaser.md) — The average number of transactions made by purchasers.
- [Average Pageviews](../references/metrics/avg_pageviews.md) — The average number of pageviews per user.
- [Average Spend Per Purchase Session By User](../references/metrics/avg_spend_per_purchase_session_by_user.md) — The average amount of money spent per purchase session for each individual user.
- [Overall Average Spend Per Purchase Session](../references/metrics/overall_avg_spend_per_purchase_session.md) — The overall average amount spent across all unique purchase sessions.
