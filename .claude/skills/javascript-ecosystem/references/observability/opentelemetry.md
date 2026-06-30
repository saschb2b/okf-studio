---
type: Library Notes
title: "OpenTelemetry JS"
description: "SDK 2.0 dropped Node 14/16 (now `^18.19.0 || >=20.6.0`), raised TypeScript to 5.0.4+, retargeted ES2022, and removed classes and namespaces for tree-shaking, while keeping `@opentelemetry/api`..."
tags: [javascript, observability]
timestamp: 2026-06-04T00:00:00Z
---
# OpenTelemetry JS

**Verified 2026-06-04.** Check the installed `@opentelemetry/*` SDK versions first; re-verify if newer than below.

**Current stable**: SDK 2.x (stable packages >= 2.0.0, experimental >= 0.200.0). The `@opentelemetry/api` package stays on 1.x by design. **LLM default bias**: SDK 1.x packages, Node 14/16 setups, and class/namespace-heavy configuration with manual `NodeTracerProvider` wiring.

## The shift
SDK 2.0 dropped Node 14/16 (now `^18.19.0 || >=20.6.0`), raised TypeScript to 5.0.4+, retargeted ES2022, and removed classes and namespaces for tree-shaking, while keeping `@opentelemetry/api` stable so instrumentation code is unaffected. Traces and metrics are stable; logs are a separate, pre-stable Logs Bridge API.

## Stop / Start
| Stop (SDK 1.x habits) | Start (SDK 2.x) |
| --- | --- |
| Installing on Node 14/16 | Node `^18.19.0 || >=20.6.0` |
| Hand-wiring every instrumentation | `getNodeAutoInstrumentations()` from `auto-instrumentations-node` |
| `new NodeTracerProvider()` + manual processor/exporter boilerplate | `NodeSDK({ traceExporter, metricReader, instrumentations }).start()` |
| Treating metrics as experimental | Metrics are stable; use `PeriodicExportingMetricReader` |
| Expecting a stable logs API in `@opentelemetry/api` | The separate `@opentelemetry/api-logs` (alpha) |
| Class/namespace imports | The functional exports per the 2.x upgrade guide |

## Gotchas
- `@opentelemetry/api` stays on 1.x; there is no "2.0" API package. Pin SDK packages (>=2.0.0) and experimental packages (>=0.200.0) consistently.
- Logs are still alpha in JS and will fold into the core API once stabilized.
- Load `sdk.start()` before importing instrumented libraries (preload via `--require`/`--import`).

## Companion
Errors and frontend performance via [sentry.md](./sentry.md).

## Sources
- https://opentelemetry.io/blog/2025/otel-js-sdk-2-0/
- https://opentelemetry.io/docs/languages/js/
