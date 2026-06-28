---
type: Library Notes
title: "React Compiler rules (full teachable reference)"
description: "Self-contained reference for enabling the React Compiler safely, so this skill teaches the whole thing without any other skill installed."
tags: [javascript, frameworks]
timestamp: 2026-06-05T00:00:00Z
---
# React Compiler rules (full teachable reference)

Self-contained reference for enabling the React Compiler safely, so this skill teaches the whole thing without any other skill installed. The standalone **react-compiler** skill is an optional deeper dive on the same material.

## Strict lint config

The compiler's lint rules are merged into `eslint-plugin-react-hooks` (the v6 generation; react.dev currently labels the reference page `rc`). There is no separate `eslint-plugin-react-compiler` package anymore. react.dev recommends enabling the bundled preset rather than hand-listing rules:

```sh
npm install -D eslint-plugin-react-hooks@latest
```

```js
// eslint.config.mjs
import reactHooks from "eslint-plugin-react-hooks";

export default [
  // bundles the classic rules plus the React Compiler diagnostics
  reactHooks.configs["recommended-latest"],
];
```

The diagnostics live under the `react-hooks/` namespace. The names react.dev actually lists include `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`, `react-hooks/unsupported-syntax`, `react-hooks/immutability`, `react-hooks/purity`, `react-hooks/refs`, `react-hooks/set-state-in-render`, `react-hooks/set-state-in-effect`, `react-hooks/preserve-manual-memoization`, `react-hooks/incompatible-library`, and `react-hooks/static-components`. Raise any you want CI to hard-block from `warn` to `error`. `react-hooks/unsupported-syntax` is the load-bearing one for catching silent compiler bails.

## Five patterns that drop a component out of compilation

1. **Mutating props or closures during render** (`entity.lastSeen = Date.now()` in the body). Fix: compute a new value, or move the side effect into a handler/effect.
2. **Reading a ref during render** (`ref.current?.offsetWidth` in the body). Fix: move the read into `useEffect`/`useLayoutEffect`.
3. **Class components.** Not compiled at all. Convert to function components, or accept they stay unmemoized.
4. **Unsupported syntax inside an otherwise-fine component** (the biggest trap), silent unless lint is strict:
   - Reassigning a destructured prop (`value = value ?? def`). Fix: introduce a new variable.
   - A mutated counter captured in `.map()` lambdas (`globalIndex++`). Fix: precompute offsets and use `offset + i`.
   - A dynamic `import()` inside an effect. Fix: hoist to a module-level cached promise.
5. **The `"use no memo"` escape hatch.** Skips the function entirely. Each one is a performance cliff; treat it as a TODO and grep the count as a health metric.

| Failure mode | Rule that flags it |
| --- | --- |
| Mutation during render | `react-hooks/immutability` / `react-hooks/purity` |
| Setting state during render | `react-hooks/set-state-in-render` |
| Reading a ref during render | `react-hooks/refs` |
| Syntax the compiler cannot compile | `react-hooks/unsupported-syntax` |
| Class components | Not lintable (design choice) |

The `recommended-latest` preset enables all of these; do not rely on rule names beyond what the plugin docs list for your installed version.

## Cleanup is iterative

Once a component bails, downstream rules may not surface their own findings on it; analysis stops at the first failure. Fixing an upstream bail can reveal a second. First run gives the count; later runs give the truth.

## Source

From [The React Compiler at Eighteen Months](https://saschb2b.com/blog/react-compiler-year-in-review). The standalone **react-compiler** skill covers the same material if installed.
