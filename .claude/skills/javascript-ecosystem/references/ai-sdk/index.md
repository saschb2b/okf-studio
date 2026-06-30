# AI SDKs

- [Anthropic TypeScript SDK (`@anthropic-ai/sdk`)](anthropic-sdk.md) - The Messages API (`client.messages.create` with a structured `messages` array and content blocks) is the API; legacy Text Completions is obsolete.
- [OpenAI JS/TS SDK (`openai`)](openai-sdk.md) - The Responses API (`client.responses.create`) is OpenAI's recommended API for new projects (Chat Completions remains supported and is not deprecated).
- [Vercel AI SDK (`ai`)](vercel-ai-sdk.md) - v5 split messages into `UIMessage` (UI state, an ordered `parts` array) versus `ModelMessage` (LLM input), moved to native SSE streaming, and renamed the tool surface.
