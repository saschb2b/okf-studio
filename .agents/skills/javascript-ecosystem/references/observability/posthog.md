---
type: Library Notes
title: "PostHog (product analytics)"
description: "Initialization now centers on a dated `defaults` snapshot (e.g."
tags: [javascript, observability]
timestamp: 2026-06-04T00:00:00Z
---
# PostHog (product analytics)

**Verified 2026-06-04.** Check the installed `posthog-js` version first; re-verify if newer than below.

**Current stable**: `posthog-js` 1.x (continuously released). **LLM default bias**: older builds with a verbose per-option config, the legacy single host `api_host: 'https://app.posthog.com'`, manual `posthog.capture` for everything, and no `defaults` snapshot.

## The shift
Initialization now centers on a dated `defaults` snapshot (e.g. `defaults: '2026-01-30'`) so PostHog can ship new behavior without breaking existing apps, and one SDK bundles autocapture, web analytics, session replay, feature flags, and surveys. Region is explicit via `api_host` pointing at `https://us.i.posthog.com` or `https://eu.i.posthog.com`.

## Stop / Start
| Stop (LLM default) | Start (current PostHog) |
| --- | --- |
| `api_host: 'https://app.posthog.com'` | `https://us.i.posthog.com` or `https://eu.i.posthog.com` (pick your region) |
| Hand-tuning many init options for current behavior | A `defaults: '<YYYY-MM-DD>'` snapshot, then override what you need |
| Manually capturing every click and pageview | Autocapture plus automatic pageview and pageleave events |
| Bolting on a separate replay or feature-flag tool | Replay and flags from the same `posthog-js` instance |
| `posthog.isFeatureEnabled` synchronously at load | `posthog.onFeatureFlags(cb)` or bootstrap flags to avoid flicker |

## Gotchas
- For Next.js and React, prefer the framework packages (`@posthog/next`, `@posthog/react`) for SSR-safe init.
- The EU vs US host must match where the project was created, or events are silently misrouted. The `i.posthog.com` host is for ingestion; the dashboard UI lives on `app`/`eu`/`us`.posthog.com.
- posthog-js ships many releases per day; pin a version in production.

## Sources
- https://posthog.com/docs/libraries/js/config
- https://github.com/PostHog/posthog-js/releases
