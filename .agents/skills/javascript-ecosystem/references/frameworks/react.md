---
type: Library Notes
title: "React"
description: "React 19 made Actions, the `use()` primitive, `ref` as a regular prop, and `<form action>` first-class."
tags: [javascript, frameworks]
timestamp: 2026-06-05T00:00:00Z
---
# React

**Verified 2026-06-05.** Check the installed `react` version first; re-verify if newer than below.

**Current stable**: 19.2 (Oct 2025); 19.2 added stable `<Activity>` and `useEffectEvent`. React Compiler 1.0 shipped Oct 2025. **LLM default bias**: React 16.8 through 18. Class-component muscle memory, defensive `useMemo`/`useCallback`/`React.memo`, `useEffect` data fetching, `forwardRef`.

## The shift
React 19 made Actions, the `use()` primitive, `ref` as a regular prop, and `<form action>` first-class. The React Compiler auto-memoizes at build time, so hand-written memoization is mostly noise. In framework setups, Server Components and Server Actions are the default mental model, not an experiment.

## Stop / Start
| Stop (LLM default) | Start (React 19 + Compiler) |
| --- | --- |
| Defensive `useMemo` / `useCallback` / `React.memo` | Enable the Compiler and let it memoize |
| `forwardRef(...)` to pass a ref | Accept `ref` as a normal prop |
| `useEffect` + state to read a promise or context | `use(promise)` / `use(context)` during render |
| Controlled `onSubmit` + manual pending flags | `<form action={fn}>` with `useActionState`, `useFormStatus`, `useOptimistic` |
| `ReactDOM.render` (legacy entry) | `createRoot` / `hydrateRoot` from `react-dom/client` |
| Treating RSC as experimental | RSC + Server Actions as the framework default |

## Gotchas
- React 19 removed string refs, legacy context, `propTypes`, and `ReactDOM.render`. Run the official codemods on upgrade.
- The Compiler is opt-in per build tool (Babel, Vite, Metro, Rsbuild) and assumes the Rules of React. Lint with `eslint-plugin-react-hooks` v6+ at error before enabling.
- Keep manual memoization only for referential identity passed to non-React consumers, genuinely expensive non-render work, or effect-dependency stability. The compiler handles everything else, so do not strip these three cases blindly.
- `use()` follows render purity but, unlike a hook, may be called conditionally.
- The Actions hook is `useActionState` (returns `[state, action, isPending]`), not the Canary-era `useFormState`. `propTypes` and `defaultProps` are removed for function components; use TypeScript types and default parameters.

## Companion
The strict `eslint-plugin-react-hooks` config and the five silent compiler-bail patterns are inlined in [react-rules.md](./react-rules.md). The standalone **react-compiler** skill is an optional deeper dive on the same material; it is not required.

## Agent skills
React ships an official `llms.txt` (react.dev/llms.txt) for agent context. There is no first-party React skill; the popular `react-best-practices` skill is Vercel's (`npx skills add vercel-labs/agent-skills`), not from the React team.

## Sources
- https://react.dev/versions
- https://react.dev/blog/2024/12/05/react-19
- https://react.dev/blog/2025/10/07/react-compiler-1
