---
name: react-compiler
description: Write and review React code as if the React Compiler is enabled. Skip manual useMemo, useCallback, and React.memo by default, and audit existing code for stale manual memoization. Use when writing or refactoring any React component in a React 19+ codebase, when reviewing a React PR, when setting up the eslint-plugin-react-hooks configuration, or when seeing memoization patterns in code an LLM produced. Counterweight to pre-compiler React in LLM training corpora, which biases default output toward manual memoization unless prompted otherwise.
tags: [frontend, react, review]
date: 2026-05-12
source_post: react-compiler-year-in-review
---

# React Compiler

## Rule

**The compiler memoizes. You do not.**

In any React 19+ codebase with the compiler enabled, do not add `useMemo`, `useCallback`, or `React.memo` by default. The compiler handles memoization at finer granularity than a human writes, and adding manual versions is at best noise. This is the most common failure mode in LLM-generated React: the bulk of any agent's React training corpus is pre-compiler, so the default output skews toward manual memoization.

## Default behavior when writing React

Write components plainly:

```tsx
function DashboardRow({ entity, onSelect }) {
  const label = formatLabel(entity);
  const total = entity.items.reduce((sum, i) => sum + i.value, 0);
  return (
    <Row onClick={() => onSelect(entity.id)}>
      <Label>{label}</Label>
      <Total>{total}</Total>
    </Row>
  );
}
```

Not:

```tsx
const DashboardRow = memo(({ entity, onSelect }) => {
  const formatted = useMemo(() => ({ /* ... */ }), [entity]);
  const handleClick = useCallback(() => onSelect(entity.id), [entity.id, onSelect]);
  return /* ... */;
});
```

The compiler produces the equivalent of the first from any input that follows the Rules of React. Adding the second by hand is noise and can interfere with the compiler's analysis.

## Three exceptions where manual memoization is still required

Keep manual `useMemo` or `useCallback` only in these cases:

1. **Referential identity for non-React consumers.** Values feeding into `addEventListener`, an `IntersectionObserver`, third-party libraries with their own `===` checks, anything outside React that retains the reference.
2. **Expensive non-render work the compiler cannot see through.** Parsing a large blob, building a large index, calling a heavy library. Keep, and add a comment explaining why.
3. **Effect dependencies that must be stable for correctness.** If a dependency would trip the effect every render without the wrap, keep it.

Anything outside these three cases gets deleted.

## Audit workflow on an existing codebase

1. **Confirm compiler is enabled.** Check `next.config` (`experimental.reactCompiler`), `vite.config` or `babel.config` (`babel-plugin-react-compiler`), or framework defaults for Expo and TanStack Start. If not enabled, propose enabling first. Do not strip memoization on a compiler-off codebase.
2. **Confirm `eslint-plugin-react-hooks` is at v6+.** The compiler rules merged in from the deprecated `eslint-plugin-react-compiler` in late 2025.
3. **Promote lint rules to `error`.** `recommended` ships most at `warn`, which means CI does not fail on silent compiler skips. See [lint-setup.md](./references/lint-setup.md) for the strict configuration.
4. **Sweep manual memoization.** Delete `useMemo`, `useCallback`, `React.memo` that do not match one of the three exceptions.
5. **Run lint. Fix silent skips iteratively.** Silent skips cascade: fixing an upstream skip can reveal a second issue downstream. First run gives the count. Subsequent runs give the truth.
6. **Track `"use no memo"` directives.** Each is a performance cliff with a TODO behind it. Grep the count over time as a health metric.

## When the compiler silently bails

Five patterns drop the surrounding function out of compilation. The lint rules above catch them when configured strictly. Full list, code examples, and fixes in [exceptions.md](./references/exceptions.md).

## Output format for an audit

```
file: <path>
findings:
  - removed: <useMemo | useCallback | memo> @ <line>, compiler handles
  - kept: <useMemo | useCallback> @ <line>, reason: <ref-identity | expensive | effect-dep>
silent bails detected:
  - <pattern> @ <line>: <one-line fix>
```

## Source

Based on [The React Compiler at Eighteen Months](https://saschb2b.com/blog/react-compiler-year-in-review). Sibling detail in [exceptions.md](./references/exceptions.md) and [lint-setup.md](./references/lint-setup.md).
