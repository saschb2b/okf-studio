---
type: Metric
title: Net Revenue
description: Completed order value after confirmed refunds.
tags: [finance, revenue]
timestamp: 2026-07-01T00:00:00Z
---

# Definition

$$
\text{net revenue} = \sum(\text{gross\_usd} - \text{refunded\_usd})
$$

The metric is derived from [customer orders](/concepts/customer-orders.md). Use the [refund audit](/runbooks/refund-audit.md) when the result differs from the finance ledger.

