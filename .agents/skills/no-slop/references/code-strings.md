---
type: Reference
title: "no-slop: strings in code"
description: "Test names, error messages, and log lines are read by a human at the worst moment, when a test fails or production breaks."
tags: [writing, ai-slop, style, editing]
generated: { by: claude-code/unversioned, at: 2026-07-29T00:00:00Z }
---
# no-slop: strings in code

Test names, error messages, and log lines are read by a human at the worst moment, when a test fails or production breaks. Generic filler there costs the most.

This is the surface that calls for strict mode, since a misread error message costs something and nobody wants voice in one. Apply the caps and the actor rules from [ste.md](ste.md) here, not the relaxed variant.

## Test names

| Tell | Fix |
|---|---|
| "should work correctly" / "works as expected" | name the condition and the expected result |
| "test1", "test2", auto-numbered | one behavior per test, named for it |
| Named after the unit ("testUserService") | named after the scenario |

Before:

```js
it('should work correctly', () => { ... })
```

After:

```js
it('returns 404 when the user does not exist', () => { ... })
```

A test name is the failure message you read first. "when X, then Y" tells you what broke without opening the body.

## Error messages

| Tell | Fix |
|---|---|
| "An error occurred" / "Something went wrong" | state what failed, where, and the cause |
| Over-apology ("Oops! So sorry, something went wrong") | what happened and the recovery action, no apology |
| Exclamation marks and emotion | plain and factual |

Before:

```js
throw new Error("An error occurred")
```

After:

```js
throw new Error(`Failed to parse config at ${path}: ${cause.message}`)
```

For user-facing strings, "Couldn't save your changes, check your connection and retry" beats "Oops! Something went wrong. Please try again later!". Tell the user what happened and what to do.

## Log lines

| Tell | Fix |
|---|---|
| Emoji and cheerleader tone ("Yay! User created!!!") | terse, no emoji, no exclamation |
| Full chatty sentences with data inlined | short message, data in structured fields |

Before:

```js
logger.info("Successfully created the user!!!")
```

After:

```js
logger.info("user created", { userId })
```

## Not register, send elsewhere

Placeholder and over-verbose identifiers (`data2`, `temp`, `userDataObjectForCurrentUser`) and casing drift within one scope are about the code's identity, not its prose. Those belong in a simplify or code-review pass.
