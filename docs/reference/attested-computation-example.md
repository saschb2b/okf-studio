---
type: Attested Computation
title: Attested Computation Example
description: A worked example of the OKF v0.2 type, and the fixture Studio's own attestation gate is exercised against.
tags: [reference, okf, attestation]
runtime: bigquery
parameters:
  - { name: fiscal_year, type: integer, required: true }
  - { name: region, type: string, required: false }
computation: /reference/computations/recognized-revenue.sql
executor:
  resource: https://cloud.google.com/bigquery/docs/running-queries
  receipt: [job_id, executed_sql, result]
attester:
  resource: /reference/computations/recognized-revenue-attester.py
generated: { by: claude/unrecorded, at: 2026-07-27T00:00:00Z }
---

# What this is

A worked `type: Attested Computation`, kept in the reference section for two reasons: it shows a producer what the type looks like when every family is declared, and it is the concept Studio's own attestation gate is tested against.

The figures are illustrative. The *shape* is not — this is the arrangement [OKF parsing](../architecture/okf-parsing.md) describes, and the one the reader panel and the agent gate both read.

# Why the type exists

An agent asked for revenue can write plausible SQL and report a number from it. Nothing in the prose of an answer distinguishes that from a number produced by the query the business actually sanctions.

So the query lives here, in the bundle, and a run must return evidence of what it executed. Studio compares that evidence against this file. An agent may bind `fiscal_year` and `region`; it must not author or edit the computation.

# What Studio can and cannot check

Studio checks **provenance**: that the executed text is this computation with its parameters bound, compared canonicalized so comments, whitespace and case do not matter. That check needs no database and no code execution, which is why a reader can do it.

Studio does not check **fidelity** — re-reading the authoritative result by job id — because only the executor's runtime can. It reports that as unavailable, never as passed. A run that clears provenance is not fully attested, and Studio says so.

Studio never executes the computation, the executor, or the attester.

# Checking a run

The reader's computation panel has a **Check a run…** button that takes a receipt. A run of the sanctioned query for fiscal 2026 returns something like:

```json
{
  "job_id": "bq:job_abc123",
  "executed_sql": "SELECT SUM(o.amount_usd) AS recognized_revenue FROM `finance.orders` AS o WHERE o.fiscal_year = 2026 AND (NULL IS NULL OR o.region = NULL) AND o.status = 'recognized'",
  "result": "12345"
}
```

An agent reporting a figure from this computation ends its turn with an `okf-receipt` fence naming this concept, and Studio labels the answer before the number is taken at face value. See [OKF parsing](../architecture/okf-parsing.md) for both doors.
