---
type: Reference
title: "React Compiler Exceptions"
description: "Five patterns drop the surrounding function out of compilation, often silently."
tags: [react, react-compiler, memoization, lint]
timestamp: 2026-05-12T00:00:00Z
---
# React Compiler Exceptions

Five patterns drop the surrounding function out of compilation, often silently. The lint rules in `eslint-plugin-react-hooks` v6+ catch each one, but `recommended` ships most at `warn`. Without promoting them to `error`, the regression shows up later as a re-render bug nobody is looking for.

## 1. Mutating props or closures during render

```tsx
function Row({ entity }: Props) {
  entity.lastSeen = Date.now(); // mutation during render
  return <span>{entity.name}</span>;
}
```

Fix: do not mutate. Compute a new value or push the side effect into a handler or effect.

## 2. Reading a ref during render

```tsx
function Tooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const width = ref.current?.offsetWidth; // reads ref in render body
  return <div ref={ref}>{width}px</div>;
}
```

Fix: move the read into `useEffect` or `useLayoutEffect`. The compiler flags but does not rewrite.

## 3. Legacy class components

Class components are not compiled at all. They run as they always did. Convert to function components if you want compilation, or accept they stay unmemoized.

## 4. Unsupported syntax inside otherwise-fine components

The biggest trap. The compiler bails on individual syntax patterns it cannot reason about, silently unless `react-hooks/unsupported-syntax` is at `error`.

### Reassigning a destructured prop

```tsx
// Surrounding component is silently skipped.
function Field({ value }: Props) {
  value = value ?? defaultValue;
  return <input defaultValue={value} />;
}
```

Fix: introduce a new variable.

```tsx
function Field({ value }: Props) {
  const resolved = value ?? defaultValue;
  return <input defaultValue={resolved} />;
}
```

### Mutated counter captured inside `.map()` lambdas

```tsx
// Impure mutation during render; flagged by react-hooks/purity.
let globalIndex = 0;
return (
  <>
    {groupA.map((row, i) => render(row, i, globalIndex++))}
    {groupB.map((row, i) => render(row, i, globalIndex++))}
  </>
);
```

Fix: precompute offsets and use them in the map.

```tsx
const offsetA = 0;
const offsetB = groupA.length;
return (
  <>
    {groupA.map((row, i) => render(row, i, offsetA + i))}
    {groupB.map((row, i) => render(row, i, offsetB + i))}
  </>
);
```

### Dynamic `import()` inside an effect

```tsx
// The compiler bails here; the recommended-latest preset flags it.
useEffect(() => {
  void import("heavy-lib").then(({ default: lib }) => {
    /* ... */
  });
}, []);
```

Fix: hoist the dynamic import to a module-level cached promise.

```tsx
const heavyLibPromise = import("heavy-lib");

useEffect(() => {
  void heavyLibPromise.then(({ default: lib }) => {
    /* ... */
  });
}, []);
```

## 5. The `"use no memo"` escape hatch

```tsx
function ComplicatedLegacyThing() {
  "use no memo";
  // compiler skips this function entirely
}
```

Use sparingly. Every `"use no memo"` is a performance cliff hidden in the codebase. Treat each one as a TODO with a comment explaining why the code is not yet compiler-safe. Grep the directive over time as a health metric.

## Lint coverage map

| Failure mode | Rule that flags it |
| --- | --- |
| 1. Mutation during render | `react-hooks/immutability` / `react-hooks/purity` |
| 2. Ref read during render | `react-hooks/refs` |
| 3. Class components | Not lintable. Design choice. |
| 4. Unsupported syntax | `react-hooks/unsupported-syntax` |
| 5. `"use no memo"` | Grep the directive; treat each as a TODO |

Enable the `recommended-latest` preset and raise the ones you want to block CI to `error`. Full config in [lint-setup.md](./lint-setup.md).

## Source

Patterns and fixes from [The React Compiler at Eighteen Months](https://saschb2b.com/blog/react-compiler-year-in-review).
