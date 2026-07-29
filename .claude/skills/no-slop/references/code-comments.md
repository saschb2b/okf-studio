---
type: Reference
title: "no-slop: code comments"
description: "The slop comment is written for the reviewer of one change and then stranded in code that outlives the review."
tags: [writing, ai-slop, style, editing]
generated: { by: claude-code/unversioned, at: 2026-07-29T00:00:00Z }
---
# no-slop: code comments

The slop comment is written for the reviewer of one change and then stranded in code that outlives the review. The fix is almost always to delete it or move it to the commit message, which has its own tells once the text lands there, catalogued in [commits-and-prs.md](commits-and-prs.md). The "after" has fewer comments than the "before", and the code reads no worse for it.

Two checks catch most of it. First, audience and lifespan: would this comment make sense to someone reading the file later who never saw this change? If it only reads as "here is what I just did," it belongs in the commit message. Second, density: match the file. If the surrounding code is documented, continue at that level like a senior would. If it is not, add nothing unless the comment is load-bearing, meaning a non-obvious *why*, never a *what*.

## The tells (kill on sight)

| Tell | Fix |
|---|---|
| Comment narrates the change ("// floating button must name itself Back like NestedTopBar does") | move it to the commit message, the code stands on its own |
| Restates the code ("// increment the counter" above `count++`) | delete |
| Over-documents one touched line in an otherwise comment-free unit | match surrounding density, so add nothing or document the whole unit |
| Explains *what* instead of *why* | keep the why, and only when it is non-obvious |
| Apologetic or defensive ("// bit hacky but it works for now") | fix the code, or state the constraint as a fact |
| Auto-docstring on a self-evident function (`/** Gets the name. */`) | delete unless it is public API that needs the contract |
| TODO or placeholder left from generation ("// TODO implement", "// rest of logic here") | finish it or remove it |

## Comment narrates the change

Before:

```kotlin
.clickable(
    // The hand-rolled arrow carries no semantics of its own, so the
    // floating button must name itself "Back" like NestedTopBar does.
    onClick = onBack, role = Role.Button, onClickLabel = "Back",
)
```

After:

```kotlin
.clickable(onClick = onBack, role = Role.Button, onClickLabel = "Back")
```

The reasoning is real and worth recording. It goes in the commit message, where a reviewer reads it once in context, not in the file, where every future reader steps over it.

## Restates the code

Before:

```kotlin
// loop over the users and send each one an email
for (user in users) sendEmail(user)
```

After:

```kotlin
for (user in users) sendEmail(user)
```

## Over-documents one touched line

A single function gains a three-line comment over the one line the change touched, while the other twenty lines carry none. Delete it. The inconsistency is the tell. If that line truly needs explaining, the surrounding code probably does too. If it does not, neither does this one.

## What versus why

Before:

```kotlin
// set the timeout to 30 seconds
val timeout = 30_000
```

After:

```kotlin
// the upstream gateway drops idle connections at 35s, stay under that
val timeout = 30_000
```

The first restates the value. The second records the why that the value alone cannot tell you. Keep it only when the constraint is genuinely non-obvious.

## Apologetic comment

Before:

```kotlin
// this is kind of a hack but it works for now
return data.filter { it != null }
```

After, when there is nothing to say:

```kotlin
return data.filter { it != null }
```

After, when there is a real constraint:

```kotlin
// upstream sends null entries during cache warmup, drop them
return data.filter { it != null }
```

## Auto-docstring

Before:

```kotlin
/**
 * Gets the user's name.
 * @return the user's name
 */
fun getName(): String = name
```

After:

```kotlin
fun getName(): String = name
```

Keep a docstring only when the function is public API and the doc states something the signature does not, such as units, a nullability contract, side effects, or thrown errors.

## Don't over-correct

The fix is not "strip every comment." A genuine non-obvious why earns its place: a workaround for a known upstream bug, a non-intuitive ordering constraint, a magic number with a source. And a codebase that documents everything has a house style, so match it. The target is the comment that narrates a change or restates the code, not the comment that carries knowledge the code cannot.
