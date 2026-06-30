---
type: Library Notes
title: "Anthropic TypeScript SDK (`@anthropic-ai/sdk`)"
description: "The Messages API (`client.messages.create` with a structured `messages` array and content blocks) is the API; legacy Text Completions is obsolete."
tags: [javascript, ai-sdk]
timestamp: 2026-06-04T00:00:00Z
---
# Anthropic TypeScript SDK (`@anthropic-ai/sdk`)

**Verified 2026-06-04.** Check the installed `@anthropic-ai/sdk` version first; re-verify if newer than below.

**Current stable**: 0.x (0.100, pre-1.0 but production-grade and actively versioned). **LLM default bias**: the ~0.2x to 0.4x era. The legacy `client.completions.create` Text Completions API with `prompt: "\n\nHuman: ... \n\nAssistant:"`, an `anthropic-beta` header for prompt caching, and hand-built SSE parsing.

## The shift
The Messages API (`client.messages.create` with a structured `messages` array and content blocks) is the API; legacy Text Completions is obsolete. Streaming is ergonomic via `client.messages.stream()`, prompt caching no longer needs a beta header, and tool use, the memory tool, and code execution are first-class.

## Stop / Start
| Stop (legacy) | Start (current) |
| --- | --- |
| `client.completions.create({ prompt: "\n\nHuman:..." })` | `client.messages.create({ messages: [...] })` |
| Concatenating Human/Assistant turns into one prompt string | A `messages` array of role + content-block objects |
| Manual SSE parsing with `stream: true` | `client.messages.stream(...)` with `.on('text')` / `await .finalMessage()` |
| Sending an `anthropic-beta` header for prompt caching | `cache_control: { type: 'ephemeral' }` on the block |
| Guessing cache effectiveness | Reading `usage.cache_creation_input_tokens` / `cache_read_input_tokens` |
| Ad hoc freeform-JSON tools | The typed `tools` param with `input_schema`, handling `tool_use`/`tool_result` blocks |

## Gotchas
- Pre-1.0 versioning means minor bumps can carry breaking changes; pin exact versions.
- Caching is prefix-based: place stable content (system, tools) first and set `cache_control` breakpoints deliberately.
- For managed deployments use `@anthropic-ai/bedrock-sdk` or `@anthropic-ai/vertex-sdk`.

## Companion
The Messages API and the prompt-caching paradigm are covered in the table above. For building Anthropic apps end to end (caching strategy, model migration), the **claude-api** skill is an optional deeper dive that goes beyond version-and-paradigm currency.

## Sources
- https://github.com/anthropics/anthropic-sdk-typescript
- https://platform.claude.com/docs/en/api/sdks/typescript
