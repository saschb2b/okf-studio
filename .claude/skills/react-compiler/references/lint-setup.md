---
type: Reference
title: "React Compiler Lint Setup"
description: "Since late 2025, the compiler's lint rules live in `eslint-plugin-react-hooks` v6+."
tags: [react, react-compiler, memoization, lint]
timestamp: 2026-05-12T00:00:00Z
---
# React Compiler Lint Setup

Since late 2025, the compiler's lint rules live in `eslint-plugin-react-hooks` v6+. The standalone `eslint-plugin-react-compiler` was deprecated and merged in. If your project uses `eslint-config-next` v16+ or any modern framework preset that pulls in `eslint-plugin-react-hooks` v7, the plugin is already loaded transitively. No additional install.

## Configuration

The compiler diagnostics ship inside `eslint-plugin-react-hooks`. react.dev recommends enabling the bundled preset rather than hand-listing rules:

```sh
npm install -D eslint-plugin-react-hooks@latest
```

```js
// eslint.config.mjs
import reactHooks from "eslint-plugin-react-hooks";

export default [
  reactHooks.configs["recommended-latest"],
];
```

The preset bundles the classic rules plus the React Compiler diagnostics. To make a specific diagnostic block CI rather than warn, raise it to `error` explicitly:

```js
{
  plugins: { "react-hooks": reactHooks },
  rules: { "react-hooks/unsupported-syntax": "error" },
}
```

## The rules that matter

The diagnostics live under the `react-hooks/` namespace. The ones react.dev lists:

| Rule | What it catches |
| --- | --- |
| `react-hooks/rules-of-hooks` | Hooks called conditionally or outside components. |
| `react-hooks/exhaustive-deps` | Effect and callback dependency correctness. The compiler relies on it. |
| `react-hooks/unsupported-syntax` | Components silently bailed out of compilation for syntax reasons. The load-bearing one. |
| `react-hooks/immutability`, `react-hooks/purity` | Mutation or impure work during render. |
| `react-hooks/set-state-in-render`, `react-hooks/set-state-in-effect` | State updates in the wrong phase. |
| `react-hooks/refs` | Reading or writing a ref during render. |
| `react-hooks/preserve-manual-memoization` | Keeps existing manual memoization correct instead of silently dropping it. |
| `react-hooks/incompatible-library` | Hooks from libraries that violate the Rules of React. |
| `react-hooks/static-components`, `react-hooks/component-hook-factories` | Components or hooks defined in ways the compiler cannot track. |

Do not assume rule names beyond what the plugin docs list for your installed version; react.dev currently labels the page `rc`.

## Silent skips cascade

Once a component bails, downstream rules sometimes do not surface their own findings on the same component. The analysis stops at the first failure. Fixing an upstream skip can immediately reveal a second issue.

Treat lint cleanup as iterative, not one-shot. The first run gives the count. Subsequent runs give the truth.

## Why `recommended` is not enough

`recommended` ships `unsupported-syntax` at `warn`. CI configurations that fail only on `error` skim past it. The result: silent compiler bails land in production as re-render regressions nobody profiled for. Promote to `error` to make silent skips visible at build time.

## Source

Configuration from [The React Compiler at Eighteen Months](https://saschb2b.com/blog/react-compiler-year-in-review).
