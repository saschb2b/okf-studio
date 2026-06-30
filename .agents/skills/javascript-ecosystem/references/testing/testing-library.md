---
type: Library Notes
title: "Testing Library (React + user-event)"
description: "From RTL 16, `@testing-library/dom` is a separate peer dependency you install explicitly, and RTL 16 supports React 19."
tags: [javascript, testing]
timestamp: 2026-06-04T00:00:00Z
---
# Testing Library (React + user-event)

**Verified 2026-06-04.** Check the installed `@testing-library/react` and `@testing-library/user-event` versions first; re-verify if newer than below.

**Current stable**: `@testing-library/react` 16, `@testing-library/user-event` 14. **LLM default bias**: RTL 12 to 13 with a bundled `@testing-library/dom`, user-event v13 (synchronous `userEvent.click()`), heavy `fireEvent` usage, and manual `act()` wrapping.

## The shift
From RTL 16, `@testing-library/dom` is a separate peer dependency you install explicitly, and RTL 16 supports React 19. user-event v14 made interactions async around `userEvent.setup()`. The guidance is to simulate real user interactions over dispatching raw events, and to use accessible queries.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| Synchronous `userEvent.click(el)` | `const user = userEvent.setup(); await user.click(el)` |
| Defaulting to `fireEvent` | `userEvent` for realistic interaction sequences |
| Manual `act()` wrapping | `findBy*` queries and `await waitFor(...)` |
| Relying on `@testing-library/dom` being bundled | Install it (and `@types/react-dom`) explicitly alongside RTL 16 |
| `container.querySelector` / `getByTestId` first | Accessible queries (`getByRole`, `getByLabelText`, `getByText`) |

## Gotchas
- user-event is at 14.6.x; do not invent a v15. RTL is at v16, not v14 or v15 as stale corpora may assume.
- Call `userEvent.setup()` before `render`, per test or in a setup helper.

## Companion
React paradigm notes in [../frameworks/react.md](../frameworks/react.md).

## Sources
- https://testing-library.com/docs/user-event/intro/
- https://github.com/testing-library/react-testing-library/releases
