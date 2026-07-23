---
type: BigQuery Table
resource: https://bigquery.googleapis.com/v2/projects/bigquery-public-data/datasets/crypto_bitcoin/tables/transactions
title: Bitcoin Transactions
description: A comprehensive table detailing all transactions on the Bitcoin blockchain.
tags:
- bitcoin
- blockchain
- transactions
- crypto
- public data
- etl
timestamp: '2026-05-28T22:45:04+00:00'
---

<!-- Modified from the Google knowledge-catalog sample: schema and query sections omitted for the offline compatibility corpus. -->

The `transactions` table in the [crypto_bitcoin](../datasets/crypto_bitcoin.md) dataset provides a complete record of every transaction ever processed on the Bitcoin blockchain. Each row represents a single transaction, offering granular details such as its hash, size, associated [block](blocks.md) information, and detailed arrays for both [inputs](inputs.md) and [outputs](outputs.md).
