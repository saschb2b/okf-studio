---
type: Runbook
title: Refund Audit
description: Checks refund inputs before escalating a net-revenue mismatch.
tags: [finance, refunds, audit]
timestamp: 2026-07-01T00:00:00Z
---

# Steps

1. Compare `gross_usd` and `refunded_usd` in [customer orders](/concepts/customer-orders.md).
2. Recalculate [net revenue](/metrics/net-revenue.md).
3. Record unresolved differences with the order IDs and ledger period.

