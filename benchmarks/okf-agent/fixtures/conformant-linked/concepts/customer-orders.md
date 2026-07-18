---
type: BigQuery Table
title: Customer Orders
description: One row per completed customer order.
resource: bigquery://example/commerce/customer_orders
tags: [commerce, orders]
timestamp: 2026-07-01T00:00:00Z
---

# Schema

| Column | Type | Description |
| --- | --- | --- |
| `order_id` | STRING | Unique order identifier. |
| `gross_usd` | NUMERIC | Charged amount before refunds. |
| `refunded_usd` | NUMERIC | Amount returned to the customer. |

The [net revenue metric](/metrics/net-revenue.md) uses this table. Refund anomalies follow the [refund audit](/runbooks/refund-audit.md).

