---
name: react-stinky
description: Detect React and TypeScript maintainability smells across the whole component, hook, and module, explain the cost of each, and propose a fix with a source link. Covers prop and API design (naming, booleans, callbacks, variants, controlled state, generics, refs, styling, JSDoc), state and data flow (redundant state, stale closures, context and ref misuse), effects and lifecycle, component structure and hooks, rendering correctness (keys, mutation, impure renders, hydration, the leaked 0 from &&), accessibility and focus management, async handlers, error boundaries, unsafe HTML, TypeScript discipline (any, casts, untyped catch, exhaustiveness), and a cross-file duplication pass. Defers memoization and re-render performance to react-compiler and color literals to theme-colors. Use when reviewing or writing React components or hooks, auditing for maintainability, or asked to sniff, smell-check, lint, or clean up a codebase, folder, file, or pasted snippet. Respects native HTML attributes and library conventions.
tags: [frontend, react, typescript, review]
date: 2026-07-03
---

# React Stinky

A holistic code-smell detector for React and TypeScript. It finds the patterns that make a component, a hook, or a module hard to read, reason about, and change, explains the cost of each, and proposes a concrete fix. Coverage spans prop and API design, state and data flow, effects and lifecycle, component structure, rendering correctness, accessibility, async and error handling, and TypeScript discipline. The full catalog with detection signals, fixes, exceptions, and sources is in [catalog.md](./references/catalog.md); read it before running a scan.

It defers two neighboring concerns to sibling skills so it does not duplicate them: memoization (`useMemo`, `useCallback`, `React.memo`) to `react-compiler`, and color literals to `theme-colors`. If those are not installed, note the finding in one line and move on. Everything else about day-to-day React maintainability is in scope.

## What it sniffs for

Nine pillars. The categories under each, with detection signals and sources, are in [catalog.md](./references/catalog.md).

1. **Component API and props** (the backbone, 18 categories). Component and prop naming, boolean and callback conventions, string-union variants over boolean flags, discriminated unions, controlled and uncontrolled state, children and slot composition, render props, generics, extending HTML, refs, styling APIs, accessibility props, server-component boundaries, JSDoc.
2. **State and data flow.** Derivable values held in `useState`, props copied into state, two sources of truth for one fact, prop drilling, stale closures in timers and async continuations, `useState`/`useRef` role confusion, god contexts and unstable provider values.
3. **Effects and lifecycle.** Effects that compute derived data, replace an event handler, or push data up to the parent; fetches and subscriptions and timers with no cleanup (races and leaks); dependency arrays that do not match what the effect reads; state reset by an effect instead of `key`.
4. **Component structure and hooks.** God components (and god hooks) doing fetching, logic, and presentation at once; views coupled to their environment, with data access and domain rules that belong a layer up and should arrive as behavior-named props (the test is whether it renders in Storybook without mocks); a component defined inside another (remounts every render); stateful logic that wants a custom hook; conditional hooks; positional-parameter sprawl on a hook or util.
5. **Rendering correctness.** Array index as `key` on a list that reorders or edits, direct mutation of state or props, impure renders (randomness and clock reads, `setState` during render, hydration-unsafe browser reads), the stray `0` leaked by `&&`, nested ternaries, copy-pasted JSX blocks.
6. **Accessibility in markup.** `onClick` on a non-interactive element with no `role`, `tabIndex`, or keyboard handler; div soup where semantic elements belong; form controls with no associated label; broken focus management in hand-rolled modals and menus.
7. **Async, events, and error handling.** Async handlers that swallow failures or allow double submits, missing error boundaries around risky subtrees, unsanitized HTML and URL sinks (`dangerouslySetInnerHTML`, `javascript:` hrefs).
8. **TypeScript discipline.** `any` and `as any` and `@ts-ignore`, lying `as` casts and non-null `!`, loose internal types (`object`, `Function`, stringly-typed enums), untyped catch blocks, unions switched on without an exhaustiveness check.
9. **Cross-file duplication** (folder and repo scope only). A component re-implemented inline where a reusable one exists, the same hook or utility copied across files, a type declared in two places. Method in [duplication-pass.md](./references/duplication-pass.md).

## Scope modes

Match the scope to the request, then run the workflow below over it.

| Mode | Trigger | What to scan |
| --- | --- | --- |
| Repo sweep | "smell-check the codebase" | Glob `**/*.tsx` plus hook and module `.ts` (`use-*.ts`, `lib/`). Skip `node_modules`, build output, generated code, `*.test.*`, `*.stories.*` unless asked. Prioritize shared, component, hook, and `ui` directories and exported symbols. |
| Folder scan | one or more directories named | Same, scoped to those directories. |
| File scan | specific files named | Read each fully. Check every component, hook, prop interface, and exported function. |
| Fragment sniff | a pasted function or component, or one named symbol | Check only that surface. State what you assumed about anything off-screen. |

Folder and repo-sweep scope additionally run a cross-file duplication pass ([duplication-pass.md](./references/duplication-pass.md)) to catch DRY smells a single-file scan cannot: a component re-implemented inline elsewhere, the same hook or type copy-pasted across files. Single-file and fragment scope cannot see this, so say cross-file duplication was not checked rather than implying the code is unique.

## Workflow per target

1. Locate the components, hooks, prop interfaces, and modules in scope.
2. Walk each against the catalog's per-file pillars (1 to 8).
3. Run the matching "Don't flag" line before reporting. If it applies, suppress the finding.
4. Rate the smell (see ratings below).
5. Emit a finding with location, the cost, and a before to after fix.
6. In folder or repo scope, run the cross-file duplication pass (Pillar 9, [duplication-pass.md](./references/duplication-pass.md)) after the per-file pass and fold its findings in.
7. When findings cluster on the structural smells (duplicated state, prop drilling, effect data to parent, god component, coupled view), or the request is to restructure, decouple, or make a component reusable, plan the fix with the dependency-graph method in [restructure-pass.md](./references/restructure-pass.md): map every relation as a labeled edge, then rewire to the fewest one-layer edges before proposing code.
8. End with a summary count. If nothing survives the guard, say it smells fresh.

## Stink ratings

- **Rancid.** A bug or a break in correctness, accessibility, or the server boundary. Fix now. (A missing `aria-label` or keyboard handler on a control, a function across the RSC boundary, `value || 50` eating `value={0}`, a mutated state array, conditional hooks, props copied into state that then drift, a stray `0` rendered by `{count && ...}`, `Date.now()` ids that break hydration, unsanitized `dangerouslySetInnerHTML`.)
- **Funky.** A genuine maintainability drag, not a bug. Should fix. (A boolean explosion that wants one union, a god component, an effect computing derived data, an async save with no pending or error state, a config array that wants compound components.)
- **Whiff.** Minor or stylistic. Optional. (A bare `loading` on a custom prop, a loose `Record<string, unknown>` sx type, JSDoc that restates the name.)

## Don't flag (the guard that keeps this useful)

The catalog carries a per-smell exception line. These cut across all of them. Honor them or this skill becomes a nuisance.

- Native HTML attribute names stay bare. Do not `is`-prefix `disabled`, `required`, `checked`, `open`, or rename `onChange` on a native `<input>`.
- Established library conventions are not smells. Match the library already in the file (MUI `open`, `slots`, `sx`; Radix `asChild`).
- Config-object props are correct for data-driven, fixed-layout components such as a data grid.
- An effect is the right tool for true external synchronization (subscriptions, non-React widgets, browser APIs). Flag only effects that compute derived data or replace an event handler.
- Props copied into state are fine when you intentionally seed initial state and the name says so (`defaultValue`). Flag only when a later prop change is expected to update it.
- Index keys are fine for a static list that never reorders, inserts, or deletes.
- A component defined inside another is fine for a tiny, stateless render helper. Flag it when it holds state, is memoized, or is non-trivial.
- `any` at a genuine untyped boundary is sometimes pragmatic. Prefer `unknown` plus narrowing, but do not block on it.
- One finding per real problem. Prefer the smallest fix that removes the smell. Respect a consistent local convention over the catalog default.
- Defer memoization to `react-compiler` and color literals to `theme-colors` rather than duplicating them.

## Output format

```
React Stinky report, <scope>

src/components/SeedRow.tsx
  [Rancid] clickable-nonsemantic (a11y markup), line 297
    Smell: a <Stack> (renders a div) has onClick but no role, tabIndex, or keyboard handler.
    Cost: keyboard and screen-reader users cannot trigger it; it is invisible to assistive tech.
    Fix: render a real control (component="button" or an IconButton), or add
      role="button" tabIndex={0} and an onKeyDown for Enter and Space.
    Source: MDN button role (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/button_role)

  [Funky] effect-for-derived (state and effects), line 40
    Smell: a useEffect plus setState computes `fullName` from `first` and `last`.
    Cost: an extra render and a state value that can drift from its inputs.
    Fix: compute during render, `const fullName = `${first} ${last}``. Delete the effect and the state.
    Source: React, You Might Not Need an Effect (https://react.dev/learn/you-might-not-need-an-effect)

Summary: 1 rancid, 1 funky across 1 file.
```

When the scope is clean, say so plainly: "Smells fresh. No maintainability smells found in `<scope>`."

## Source

The 18 component-API categories (Pillar 1) are distilled from the `cant-maintain` React API-design challenge set, each traced to its React, TypeScript, MDN, Next.js, or MUI source. The remaining pillars extend the same maintainability lens to state, effects, structure, rendering, accessibility, async and error handling, and types, each sourced to the canonical React docs, MDN, or TypeScript handbook in [catalog.md](./references/catalog.md).
