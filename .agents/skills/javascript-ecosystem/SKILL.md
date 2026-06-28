---
name: javascript-ecosystem
description: Default to the latest stable major versions of JavaScript and TypeScript frameworks and their current paradigms, instead of the older versions and patterns that dominate LLM training data. A version-and-paradigm changelog index that routes to per-tool notes. Use when writing, reviewing, scaffolding, or upgrading any JS or TS project, when choosing dependency versions, when an agent emits an outdated pattern, or when working with React, Angular, Vue, Svelte, Solid, Next.js, Nuxt, React Router, Remix, SvelteKit, Astro, TanStack Start, Material UI, Tailwind, shadcn, Mantine, Chakra, TanStack Query, Redux, Zustand, Jotai, TypeScript, Vite, Node, ESLint, pnpm, Bun, or Biome. Check the project's installed version first; this snapshot ages.
tags: [javascript, typescript, frontend, tooling]
date: 2026-06-05
source_post: llm-default-react-stack
---

# JavaScript Ecosystem

LLMs default to the framework versions and patterns their training data over-represents, which skew years behind the current stable releases. This skill is a changelog index that pulls default output forward to the latest stable major and its paradigm.

> "Every AI coding tool in 2026 produces the same React app. The brand on the box is different. The code inside is not."
>
> from [The LLM Default React Stack](https://www.saschb2b.com/blog/llm-default-react-stack)

## Rule

**Write for the version the project actually has, targeting the current paradigm, not the version your training data over-represents.** Version numbers move fast; the paradigm shifts move slowly. When unsure, trust the paradigm direction and verify the exact version against the source.

## Snapshot and freshness

This skill is a dated snapshot of a fast-moving ecosystem, and a snapshot is technical debt: it ages. Treat it as a cache of the official docs, not an oracle.

- **Snapshot date: 2026-06-05** (the `date` in the frontmatter). Each notes file also carries its own `Verified` date.
- **Staleness rule.** If today is more than roughly 6 months past the snapshot date, or past a notes file's `Verified` date, treat that file's version numbers and "current stable" claims as suspect. The paradigm sections (`The shift` and the Start column) age far slower than version numbers, so trust those longer and verify the numbers.
- **Verify the one tool you are about to use.** When a version-specific claim matters for the task, confirm it against that tool's official release notes or migration guide first. If you have web access and find an entry stale, apply the current paradigm and, if you maintain this repo, refresh the notes file.

### Is the installed skill itself outdated?

Skills are distributed via skills.sh and copied into your project, so an installed copy is a pinned snapshot that does not update itself.

1. **Detect.** Compare the snapshot date above to today. A gap of many months means the copy is likely behind newer releases, and several notes files probably are too.
2. **Update.** Re-install the latest from the source, which overwrites the local copy:
   ```sh
   npx skills@latest add saschb2b/skills --skill javascript-ecosystem
   ```
3. **Confirm.** Check that the snapshot date moved forward (`skills-lock.json` records the new content hash). Maintainers: see [MAINTENANCE.md](./MAINTENANCE.md).

## How to use this skill

1. **Check the installed version first.** Read `package.json` and the lockfile. The installed major decides which paradigm applies. Never assume it from memory.
2. **Find the tool in the index** below and open its notes file for the Stop/Start table.
3. **Write and review against the Start column.** Rewrite the Stop-column patterns; those are the stale defaults an agent reaches for unprompted.
4. **Greenfield.** Scaffold on the latest stable major and its paradigm, not the version your training data over-represents.
5. **This snapshot is dated.** Each notes file carries a verified date and a current-stable version. If the installed version is newer, or the file looks stale, confirm against the official release notes linked in the file before trusting it. The paradigm sections age far slower than the version numbers.

## Index

Each notes file holds the current stable version, the LLM default bias, the paradigm shift, and a Stop/Start table.

### Frameworks
| Tool | Headline shift | Notes |
| --- | --- | --- |
| React | Compiler auto-memoizes; Actions, `use()`, RSC default | [react.md](./references/frameworks/react.md) |
| Angular | Signals, zoneless, standalone, `@if`/`@for` | [angular.md](./references/frameworks/angular.md) |
| Vue | `<script setup>` Composition API, Pinia, Vapor coming | [vue.md](./references/frameworks/vue.md) |
| Svelte | Runes (`$state`/`$derived`/`$effect`), snippets | [svelte.md](./references/frameworks/svelte.md) |
| Solid | 1.x stable; 2.0 makes async first-class | [solid.md](./references/frameworks/solid.md) |

### Meta-frameworks
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Next.js | App Router + RSC default; explicit `"use cache"`; Turbopack | [nextjs.md](./references/meta-frameworks/nextjs.md) |
| Nuxt | `app/` srcDir default; Nitro 3 waits for Nuxt 5 | [nuxt.md](./references/meta-frameworks/nuxt.md) |
| React Router | Remix v2 merged in; framework mode is the successor | [react-router.md](./references/meta-frameworks/react-router.md) |
| SvelteKit | Runes; remote functions (experimental) | [sveltekit.md](./references/meta-frameworks/sveltekit.md) |
| Astro | Content Layer API, Server Islands, Actions | [astro.md](./references/meta-frameworks/astro.md) |
| TanStack Start | v1 RC full-stack on Router + Vite; `createServerFn` | [tanstack-start.md](./references/meta-frameworks/tanstack-start.md) |
| TanStack Router | v1 type-safe routing; typed search params, loaders | [tanstack-router.md](./references/meta-frameworks/tanstack-router.md) |
| AnalogJS | The Vite-based fullstack Angular meta-framework | [analog.md](./references/meta-frameworks/analog.md) |

### UI and styling
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Material UI | v9 (no v2/v8); CSS-variables theming; Grid v2 `size` | [mui.md](./references/ui/mui.md) |
| Tailwind CSS | v4 CSS-first `@theme`; no config file; Oxide engine | [tailwind.md](./references/ui/tailwind.md) |
| shadcn/ui | `shadcn` CLI; React 19 + Tailwind v4; `data-slot`; OKLCH | [shadcn.md](./references/ui/shadcn.md) |
| Mantine | Emotion gone since v7; v9 is React 19.2+ | [mantine.md](./references/ui/mantine.md) |
| Chakra UI | v3 rewrite on Ark UI; namespaced compound API | [chakra.md](./references/ui/chakra.md) |
| UnoCSS | Atomic engine; `presetWind4` tracks Tailwind v4 | [unocss.md](./references/ui/unocss.md) |
| Motion | `framer-motion` is now `motion`; import `motion/react` | [motion.md](./references/ui/motion.md) |
| Headless UI | Radix `radix-ui`, Base UI `@base-ui/react`, React Aria | [headless-ui.md](./references/ui/headless-ui.md) |
| CSS-in-JS | styled-components in maintenance; build-time, RSC-safe CSS | [css-in-js.md](./references/ui/css-in-js.md) |
| Angular Material | v22 standalone imports; M3 `mat.theme()`; CDK headless | [angular-material.md](./references/ui/angular-material.md) |

### Data and state
| Tool | Headline shift | Notes |
| --- | --- | --- |
| TanStack Query | v5 single object arg; `useSuspenseQuery`; `gcTime` | [tanstack-query.md](./references/data/tanstack-query.md) |
| SWR | v2 `isLoading`, `useSWRMutation`; minimal SWR cache | [swr.md](./references/data/swr.md) |
| Redux Toolkit | Redux is RTK now; `createSlice`; RTK Query built-in | [redux-toolkit.md](./references/data/redux-toolkit.md) |
| Zustand | v5 `useShallow`; native `useSyncExternalStore` | [zustand.md](./references/data/zustand.md) |
| Jotai | v2 vanilla store; async atoms hold promises | [jotai.md](./references/data/jotai.md) |
| NgRx | Angular state; SignalStore (`@ngrx/signals`); functional Store | [ngrx.md](./references/data/ngrx.md) |
| Pinia | Official Vue store (not Vuex); v3 setup stores | [pinia.md](./references/data/pinia.md) |

Picking one: a server-cache library (TanStack Query) for fetched data, a client-state library (Zustand or Jotai) for local global state, and Redux Toolkit for genuinely complex shared client state. Keep server data out of the client-state libraries.

### Tooling and language
| Tool | Headline shift | Notes |
| --- | --- | --- |
| TypeScript | ESM-first strict configs; Go-based `tsgo` in preview | [typescript.md](./references/tooling/typescript.md) |
| Vite | ESM-only; Rolldown unifies the bundler | [vite.md](./references/tooling/vite.md) |
| Node.js | Native TS type stripping; `node:test`; `--watch` | [node.md](./references/tooling/node.md) |
| ESLint | Flat config (`eslint.config.js`) is the only system | [eslint.md](./references/tooling/eslint.md) |
| Package managers | pnpm security-by-default; Bun full toolchain | [package-managers.md](./references/tooling/package-managers.md) |
| Biome | One Rust binary for lint + format; type-aware rules | [biome.md](./references/tooling/biome.md) |
| Storybook | v10 ESM-only; testing via the Vitest addon | [storybook.md](./references/tooling/storybook.md) |
| Turborepo | v2 `tasks` key (not `pipeline`); Rust; `turbo watch` | [turborepo.md](./references/tooling/turborepo.md) |
| Nx | v22 Project Crystal inferred targets; polyglot | [nx.md](./references/tooling/nx.md) |

### Testing
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Vitest | The default Vite-project runner; stable Browser Mode | [vitest.md](./references/testing/vitest.md) |
| Playwright | The modern e2e default; role locators, auto-wait | [playwright.md](./references/testing/playwright.md) |
| Jest | v30, but legacy for new Vite/ESM projects | [jest.md](./references/testing/jest.md) |
| Testing Library | RTL 16; async `userEvent.setup()`; accessible queries | [testing-library.md](./references/testing/testing-library.md) |
| Cypress | v15, now runner-up to Playwright for new e2e | [cypress.md](./references/testing/cypress.md) |
| Angular testing | Karma deprecated; Vitest default in v21; TestBed standalone | [angular-testing.md](./references/testing/angular-testing.md) |

New Vite + React + TS default: Vitest (unit and component) plus Testing Library plus Playwright (e2e). Jest and Cypress are the secondary choices, not the defaults.

### Mobile
| Tool | Headline shift | Notes |
| --- | --- | --- |
| React Native | New Architecture default (0.76+); Expo and Expo Router | [react-native.md](./references/mobile/react-native.md) |

### Backend
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Express | v5 auto-forwards async rejections; new routing syntax | [express.md](./references/backend/express.md) |
| Hono | Web-standard, runtime-agnostic; zero-codegen RPC | [hono.md](./references/backend/hono.md) |
| Fastify | v5 needs Node 20+; deprecations removed | [fastify.md](./references/backend/fastify.md) |
| Nitro | Deploy-anywhere; Nitro 3 + h3 v2 rewrite (beta) | [nitro.md](./references/backend/nitro.md) |
| Drizzle ORM | 1.0 RC; RQB v2; validators as subpaths | [drizzle.md](./references/backend/drizzle.md) |
| Prisma ORM | v7 drops the Rust engine; driver adapters required | [prisma.md](./references/backend/prisma.md) |
| tRPC | v11 native TanStack Query options; RSC support | [trpc.md](./references/backend/trpc.md) |

### Forms and validation
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Zod | v4 rewrite; top-level `z.email()`; unified `error` param | [zod.md](./references/forms/zod.md) |
| React Hook Form | v7 spread `register`; validate via a resolver | [react-hook-form.md](./references/forms/react-hook-form.md) |
| TanStack Form | v1 stable, headless; Standard Schema (no resolver) | [tanstack-form.md](./references/forms/tanstack-form.md) |

New-project default: React Hook Form + Zod 4 via `@hookform/resolvers`, or TanStack Form + Zod 4 (direct via Standard Schema) for the type-safety-first, multi-framework path. Formik is unmaintained.

### Auth
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Auth.js | NextAuth renamed; v5 beta and maintenance-only | [auth-js.md](./references/auth/auth-js.md) |
| Better Auth | TS-native, DB-owned; the rising default for new apps | [better-auth.md](./references/auth/better-auth.md) |
| Clerk | Managed; `clerkMiddleware()` and async `auth()` | [clerk.md](./references/auth/clerk.md) |

Self-hosted new-project default is Better Auth (the Auth.js team steers new work there); Clerk for managed. Lucia is sunset; do not recommend it.

### Internationalization
| Tool | Headline shift | Notes |
| --- | --- | --- |
| i18next | TypeScript-first; module augmentation; Selector API | [i18next.md](./references/i18n/i18next.md) |
| next-intl | App Router native; `AppConfig` typing; `setRequestLocale` | [next-intl.md](./references/i18n/next-intl.md) |
| Paraglide JS | Compiler-based typed message functions; tree-shakable | [paraglide.md](./references/i18n/paraglide.md) |
| Transloco | Angular runtime i18n; `@jsverse/transloco`; `provideTransloco` | [transloco.md](./references/i18n/transloco.md) |

Two architectures: runtime dictionaries (i18next, next-intl) with types layered on, versus compiled message functions (Paraglide) that tree-shake.

### Dates and time
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Temporal | Stage 4 / ES2026; immutable types replace `Date` | [temporal.md](./references/dates/temporal.md) |
| date-fns | v4 first-class time zones via `@date-fns/tz` | [date-fns.md](./references/dates/date-fns.md) |
| Day.js | ~2 KB immutable Moment drop-in; plugin-gated | [dayjs.md](./references/dates/dayjs.md) |

Prefer native Temporal where supported (or via polyfill); date-fns or Day.js as the lightweight interim. Moment.js is legacy; do not start new projects on it.

### API codegen
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Hey API | REST SDK + TanStack options factories, not hooks | [hey-api.md](./references/api-codegen/hey-api.md) |
| GraphQL Codegen | Client preset + `graphql()` document; fragment masking | [graphql-codegen.md](./references/api-codegen/graphql-codegen.md) |
| Orval | Hooks-first but options-capable (`useQuery: false`) | [orval.md](./references/api-codegen/orval.md) |
| openapi-fetch | Types-only + `createClient`; `$api.useQuery(...)` | [openapi-fetch.md](./references/api-codegen/openapi-fetch.md) |

Modern codegens stopped emitting framework-specific named hooks (`useGetPetQuery`). They emit framework-agnostic options factories (REST) and typed documents (GraphQL) that you spread or pass into the data library's own hook (`useQuery({ ...getPetOptions(...) })`, `useQuery(MyDocument)`). For full setup, use the dedicated **codegen-api** skill.

### GraphQL clients
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Apollo Client | v4 splits React out (`@apollo/client/react`); RxJS | [apollo-client.md](./references/graphql/apollo-client.md) |
| urql | v5 exchange-based; opt-in Graphcache; TypedDocumentNode | [urql.md](./references/graphql/urql.md) |
| graphql-request | v7 minimal fetch client; TypedDocumentNode; Graffle rewrite | [graphql-request.md](./references/graphql/graphql-request.md) |

Apollo or urql for stateful UIs (Apollo recommends its own typed documents over the codegen client preset); graphql-request for scripts and SSR. Relay remains the compiler-driven option for large apps.

### Email
| Tool | Headline shift | Notes |
| --- | --- | --- |
| React Email | v6 unified `react-email` package; async `render()` | [react-email.md](./references/email/react-email.md) |
| Resend | API-first; pass a React component; batch, idempotency | [resend.md](./references/email/resend.md) |
| Nodemailer | v8 SMTP; `'NoAuth'` is now `'ENOAUTH'`; SESv2 | [nodemailer.md](./references/email/nodemailer.md) |

Modern transactional stack: React Email for templates, an API provider (Resend) to send, Nodemailer when you need raw SMTP.

### Payments
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Stripe | PaymentIntents + Payment Element; Checkout Sessions | [stripe.md](./references/payments/stripe.md) |
| Polar | Merchant-of-record; checkout + webhooks grant benefits | [polar.md](./references/payments/polar.md) |

Stripe (a PSP) when you own tax registration and want maximum control; a merchant-of-record (Polar, Paddle, Stripe Managed Payments) to make worldwide tax someone else's problem.

### Observability
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Sentry | v10 functional integrations; Node SDK on OpenTelemetry | [sentry.md](./references/observability/sentry.md) |
| OpenTelemetry JS | SDK 2.x; traces and metrics stable; `api` stays 1.x | [opentelemetry.md](./references/observability/opentelemetry.md) |
| PostHog | `defaults` snapshot init; region hosts; one bundled SDK | [posthog.md](./references/observability/posthog.md) |

Three complementary layers: errors and replay via Sentry, vendor-neutral traces and metrics via OpenTelemetry, product analytics via PostHog.

### Headless CMS
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Payload | v3 runs inside a Next.js app; served from `/admin` | [payload.md](./references/cms/payload.md) |
| Sanity | Config-as-code Studio v5; GROQ + TypeGen typed queries | [sanity.md](./references/cms/sanity.md) |
| Strapi | v5 Document Service API; `documentId`; flattened responses | [strapi.md](./references/cms/strapi.md) |

Payload for code-first TS inside Next.js; Sanity for structured content with GROQ and typed queries; Strapi for a self-hosted Node backend.

### AI SDKs
| Tool | Headline shift | Notes |
| --- | --- | --- |
| Vercel AI SDK | v6 agents; `UIMessage` parts; `inputSchema`, `stopWhen` | [vercel-ai-sdk.md](./references/ai-sdk/vercel-ai-sdk.md) |
| Anthropic SDK | Messages API; `messages.stream()`; cache without beta header | [anthropic-sdk.md](./references/ai-sdk/anthropic-sdk.md) |
| OpenAI SDK | Responses API (`responses.create`) over chat completions | [openai-sdk.md](./references/ai-sdk/openai-sdk.md) |

Vercel AI SDK for provider-agnostic app code (chat UIs, streaming, agents); the official provider SDKs for direct access. The dedicated **claude-api** skill covers building Anthropic apps in depth.

## When a tool is not in the index

The catalogue is not exhaustive, and it dates. For any tool not listed, or when a notes file looks stale, apply the same method by hand:

1. Read the installed version from `package.json` and the lockfile.
2. Open the tool's official release notes, changelog, or migration guide for that major.
3. Identify the paradigm the current major moved to, and the pattern it replaced.
4. Write the Start pattern. Flag the Stop pattern if the code or your default reaches for it.
5. If the tool deserves a permanent entry, add one with [_template.md](./_template.md).

## Companion skills (optional, never required)

This skill is self-contained, including the deep teachable material. The version and paradigm correction live in each notes file; the longer artifacts are inlined as deep-dive files inside this skill, so installing `javascript-ecosystem` alone gives 100% of the teaching with no other skill present:

- [api-codegen/setup.md](./references/api-codegen/setup.md). Codegen configs, the fragment-masking example, the gql.tada path, DX pitfalls.
- [frameworks/react-rules.md](./references/frameworks/react-rules.md). The strict React Compiler lint config and the five silent-bail patterns.
- [ui/theme-colors.md](./references/ui/theme-colors.md). The color-role vocabulary, `alpha()`, and the audit workflow.

There are no cross-skill file links anywhere, only by-name pointers. The sibling skills below are optional standalone alternatives on those same topics (distilled from the same blog posts). You do not need any of them; they are the maintained source if an inlined copy drifts, and `claude-api` goes further than this skill's paradigm scope.

- **react-compiler**. Standalone deep-dive on the React Compiler.
- **codegen-api**. Standalone deep-dive on typesafe API codegen.
- **theme-colors**. Standalone deep-dive on role-based color.
- **claude-api**. Building Anthropic/Claude API apps end to end (beyond version-and-paradigm currency).

### Prefer first-party agent guidance

When a tool ships its own official agent guidance, it is the most authoritative and current source. Load it and prefer it; treat this skill as the cross-ecosystem index that routes you there, not a replacement. Known first-party resources (verified 2026-06-05):

- **Official agent skills** (`npx skills add <repo>`): Angular (`angular/skills`), Next.js (`vercel-labs/next-skills`), Prisma (`prisma/skills`), Vercel AI SDK (`vercel/ai`), Expo (`expo/skills`), Better Auth (`better-auth/skills`), Clerk (`clerk/skills`).
- **Official MCP servers**: Svelte and SvelteKit, Nuxt, Astro (its Docs MCP replaced llms.txt), shadcn/ui, Prisma, Clerk, Better Auth.
- **`llms.txt` / `llms-full.txt`** (fetch `<docs-site>/llms.txt` for the official docs as agent context): React, Vue, SolidJS, Vite, Bun, Zod, Drizzle, TanStack, React Native, and most of the above. Tailwind and TypeScript do not publish one.

Each per-tool notes file links its first-party resource under an "Agent skills" heading where one exists.

## Extending this skill

Add a tool by copying [_template.md](./_template.md) into the right category folder and adding one row to the matching table above. Keep volatile version numbers inside the notes file, never in this index, so there is a single place to re-verify. Re-verify a notes file whenever you work on its tool and the snapshot date looks old.

## Source

Based on [The LLM Default React Stack](https://www.saschb2b.com/blog/llm-default-react-stack).
