---
type: Library Notes
title: "Vercel AI SDK (`ai`)"
description: "v5 split messages into `UIMessage` (UI state, an ordered `parts` array) versus `ModelMessage` (LLM input), moved to native SSE streaming, and renamed the tool surface."
tags: [javascript, ai-sdk]
timestamp: 2026-06-04T00:00:00Z
---
# Vercel AI SDK (`ai`)

**Verified 2026-06-04.** Check the installed `ai` and `@ai-sdk/*` provider versions first; re-verify if newer than below.

**Current stable**: 6.0 (v6 shipped Dec 2025; v5 Jul 2025). **LLM default bias**: v3/v4 patterns. A single `Message` type with `message.content` strings, tools defined with `parameters`, `maxTokens`, `maxSteps`, `useChat` managing input internally, and providers imported as classes.

## The shift
v5 split messages into `UIMessage` (UI state, an ordered `parts` array) versus `ModelMessage` (LLM input), moved to native SSE streaming, and renamed the tool surface. v6 added a first-class agent model (`Agent`, `ToolLoopAgent`), stable MCP support, tool-execution approval, and combined tool calling plus structured output in one call.

## Stop / Start
| Stop (v3/v4) | Start (v6) |
| --- | --- |
| `tool({ parameters: z.object(...) })` | `tool({ inputSchema: z.object(...) })` (and `outputSchema`) |
| `generateText({ maxSteps: 5 })` | `generateText({ stopWhen: stepCountIs(5) })` |
| Reading `message.content` | Iterating the typed `message.parts` array |
| `maxTokens` | `maxOutputTokens` |
| `CoreMessage` / `Message` types | `ModelMessage` (to the model) and `UIMessage` (to the UI) |
| `useChat` with built-in input state + `api` | A `transport` (`DefaultChatTransport`), managing input yourself |
| Hand-rolling agent loops around `generateText` | A reusable `Agent` / `ToolLoopAgent` |

## Gotchas
- Run the official codemod: `npx @ai-sdk/codemod v6`. v5 to v6 is minimal-change; v4 to v5 is the heavy migration.
- Provider packages are version-skewed from core: with `ai` v6 use `@ai-sdk/openai` v3 and `@ai-sdk/anthropic` v3, and they export factory functions, not classes. Do not pin them to `ai`'s major.
- `ToolLoopAgent` defaults to `stopWhen: stepCountIs(20)`; set it explicitly to control loop length and cost.

## Companion
Direct provider access in [anthropic-sdk.md](./anthropic-sdk.md) and [openai-sdk.md](./openai-sdk.md).

## Agent skills
The AI SDK ships an official agent skill (`npx skills add vercel/ai`) and coding-agent docs (ai-sdk.dev/docs/getting-started/coding-agents). Prefer them.

## Sources
- https://vercel.com/blog/ai-sdk-6
- https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0
