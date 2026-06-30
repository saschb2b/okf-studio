---
type: Library Notes
title: "OpenAI JS/TS SDK (`openai`)"
description: "The Responses API (`client.responses.create`) is OpenAI's recommended API for new projects (Chat Completions remains supported and is not deprecated)."
tags: [javascript, ai-sdk]
timestamp: 2026-06-04T00:00:00Z
---
# OpenAI JS/TS SDK (`openai`)

**Verified 2026-06-04.** Check the installed `openai` version first; re-verify if newer than below.

**Current stable**: 6.x (6.42); v6 shipped Sep 2025, v5 May 2025. **LLM default bias**: v4. `client.chat.completions.create({ messages, model: 'gpt-4o' })`, reading `choices[0].message.content`, and manual transcript management. Older still, the v3 `Configuration`/`OpenAIApi` class pattern.

## The shift
The Responses API (`client.responses.create`) is OpenAI's recommended API for new projects (Chat Completions remains supported and is not deprecated). Responses takes `input` plus separate `instructions`, exposes `output_text` and a typed `output` array, supports stateful chaining via `previous_response_id`, and ships built-in tools (web search, file search, code interpreter).

## Stop / Start
| Stop (v4) | Start (current) |
| --- | --- |
| `client.chat.completions.create({ messages, model })` | `client.responses.create({ model, input, instructions })` for new code |
| `response.choices[0].message.content` | `response.output_text` (or iterate the typed `output` array) |
| Replaying the full message transcript every turn | `previous_response_id` for server-side state chaining |
| Bolting on custom web-search/RAG/tool plumbing | Built-in tools (`web_search`, `file_search`, `code_interpreter`) |
| `response_format: { type: 'json_object' }` coaxing | Structured Outputs with a strict JSON schema (`zodTextFormat`) |
| Defaulting to `gpt-4o` | A current model id (verify the exact id for your account) |

## Gotchas
- v6.0.0 had a breaking change: tool-call output types are now `string | Array<...>`, not string-only. Update callsites.
- Responses is recommended but Chat Completions is not deprecated, so existing apps need not rush; new apps should start on Responses.
- The Assistants API is separately deprecated (sunset in 2026) in favor of Responses. For multi-agent workflows, `@openai/agents` is a separate framework on top of this SDK.

## Sources
- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://github.com/openai/openai-node/releases
