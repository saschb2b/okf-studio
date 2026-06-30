---
type: Library Notes
title: "Sentry (JavaScript SDK)"
description: "Integrations became tree-shakable functions in v8 (`Sentry.browserTracingIntegration()`, not `new Sentry.BrowserTracing()`), and the Node SDK was re-architected on OpenTelemetry for tracing and..."
tags: [javascript, observability]
timestamp: 2026-06-04T00:00:00Z
---
# Sentry (JavaScript SDK)

**Verified 2026-06-04.** Check the installed `@sentry/*` version first; re-verify if newer than below.

**Current stable**: 10.x (v10 shipped Jul 2025). **LLM default bias**: v7 and earlier. The separate `@sentry/tracing` package, class-based integrations (`new Sentry.BrowserTracing()`), and the old `sentry.client.config.ts` for Next.js.

## The shift
Integrations became tree-shakable functions in v8 (`Sentry.browserTracingIntegration()`, not `new Sentry.BrowserTracing()`), and the Node SDK was re-architected on OpenTelemetry for tracing and auto-instrumentation. v9 moved Next.js client init to `instrumentation-client.ts`; v10 bumped the underlying OpenTelemetry dependencies to v2.

## Stop / Start
| Stop (Sentry v7 and earlier) | Start (Sentry v10) |
| --- | --- |
| `import * as Sentry from '@sentry/tracing'` | Tracing is built into `@sentry/browser`/`node`/`nextjs` |
| `integrations: [new Sentry.BrowserTracing()]` | `integrations: [Sentry.browserTracingIntegration()]` |
| `new Sentry.Replay()` | `Sentry.replayIntegration()` |
| Next.js `sentry.client.config.ts` | `instrumentation-client.ts` (server/edge via `instrumentation.ts`, plus `onRequestError`) |
| `_experiments.enableLogs` | Top-level `enableLogs` (promoted in v10) |
| Assuming `tracesSampleRate` alone wires Node tracing | OpenTelemetry auto-instrumentation; init Sentry before other imports |

## Gotchas
- v10's main breaking change is the OpenTelemetry v2 bump. If a dependency pins OTel v1, stay on v9 or use `@sentry/node-core`.
- On Node and Next.js servers, init Sentry as early as possible (the instrumentation file) so OpenTelemetry can patch modules before import.
- v10 stopped reporting the FID web vital (superseded by INP).

## Companion
Vendor-neutral tracing in [opentelemetry.md](./opentelemetry.md).

## Sources
- https://docs.sentry.io/platforms/javascript/migration/v9-to-v10/
- https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
