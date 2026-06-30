---
type: Library Notes
title: "Clerk"
description: "Clerk is the leading managed and hosted identity provider, with prebuilt components (`<ClerkProvider>`, `<SignIn/>`, `<UserButton/>`) and hooks (`useUser`, `useAuth`)."
tags: [javascript, auth]
timestamp: 2026-06-04T00:00:00Z
---
# Clerk

**Verified 2026-06-04.** Check the installed `@clerk/nextjs` version first; re-verify if newer than below.

**Current stable**: `@clerk/nextjs` v7 (Core 3); `@clerk/clerk-react` v5. **LLM default bias**: pre-Core 2 Clerk. `authMiddleware()`, synchronous `auth()`, and `@clerk/nextjs` v4/v5 import paths.

## The shift
Clerk is the leading managed and hosted identity provider, with prebuilt components (`<ClerkProvider>`, `<SignIn/>`, `<UserButton/>`) and hooks (`useUser`, `useAuth`). The big paradigm break: `authMiddleware()` became `clerkMiddleware()` and `auth()` became async in the Core 2 / v6 jump, carried into v7 / Core 3.

## Stop / Start
| Stop (pre-Core 2) | Start (current Clerk) |
| --- | --- |
| `authMiddleware()` | `clerkMiddleware()` from `@clerk/nextjs/server` with `createRouteMatcher` |
| `const { userId } = auth()` (sync) | `const { userId } = await auth()` (async since v6) |
| `clerkClient.users...` as a singleton | `const client = await clerkClient()` (async factory) |
| Installing old majors | `@clerk/nextjs` v7 (Core 3) / `@clerk/clerk-react` v5 |
| `redirectUrl`-style props | `fallbackRedirectUrl` / `forceRedirectUrl` |

## Gotchas
- "Core" version is not the npm package version: Core 2 is v6, Core 3 is v7. Do not conflate them.
- The async `auth()` change is the single most common thing LLMs get wrong in App Router code. Always `await` it.
- Clerk is managed SaaS (data on Clerk, usage pricing, vendor lock-in), categorically different from self-hosting Auth.js or Better Auth.
- App Router requires `clerkMiddleware()` present, or `auth()` throws.

## Agent skills
Clerk publishes official agent skills (`npx skills add clerk/skills`) and an MCP server (mcp.clerk.com/mcp, clerk.com/docs/guides/ai). Prefer them.

## Sources
- https://clerk.com/docs/reference/nextjs/overview
- https://clerk.com/docs/guides/development/upgrading/upgrade-guides/nextjs-v6
