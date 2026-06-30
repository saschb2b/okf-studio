---
type: Smell Catalog
title: "React Stinky Catalog"
description: "The full smell catalog, in seven pillars."
tags: [react, typescript, code-smells, maintainability]
timestamp: 2026-06-16T00:00:00Z
---
# React Stinky Catalog

The full smell catalog, in seven pillars. Each entry: what to sniff for, the fix, what NOT to flag, and the source. Run the "Don't flag" line before you report anything. The default stink rating is in brackets; raise it when the smell causes a real bug, drop it when the code is internally consistent.

Pillars:
1. Component API and props (categories 1 to 18, the backbone)
2. State and data flow (19 to 22)
3. Effects and lifecycle (23 to 27)
4. Component structure and hooks (28 to 32)
5. Rendering correctness (33 to 37)
6. Accessibility in markup (38 to 40)
7. TypeScript discipline (41 to 43)
8. Cross-file duplication (44, folder and repo scope only)

Defer memoization (`useMemo`, `useCallback`, `React.memo`) to the `react-compiler` skill and color literals to `theme-colors`.

# Pillar 1. Component API and props

## Naming

### 1. boolean-naming [Whiff, Funky if it reads as a bug]
- **Sniff for:** bare custom boolean props that could be read as an enum, string, or array (`loading`, `collapsed`, `icons`, `mobile`); double-negative `no*` prefixes (`noElevation`, `noRipple`) where `noElevation={false}` is a riddle; state booleans missing an intent prefix.
- **Fix:** `is`/`has`/`should` for custom state booleans (`isLoading`, `hasIcons`); `disable*`/`hide*`/`keep*` for opt-out and intent booleans, defaulted to `false` so the JSX shorthand `<X disableRipple />` reads as true; add `@default`.
- **Don't flag:** native HTML attributes stay bare (`disabled`, `required`, `checked`, `open`, `readOnly`). MUI-style bare `open` on a modal is an accepted convention, not a smell.
- **Source:** React Docs, Passing Props (https://react.dev/learn/passing-props-to-a-component).

### 2. callback-naming [Funky]
- **Sniff for:** imperative or setter names without `on` (`setValue`, `delete`, `search`, `close`); generic `onChange` on a custom non-native component; cryptic params (`pos`, `q`, `target`); one lifecycle callback for a durational process (`onAnimationDone` only); a reactive result prop (`lastCloseReason?`) split from its callback; `isLoading`/`errorMessage` props beside a plain `onClick` for an async action.
- **Fix:** `on` + noun + verb (`onValueChange`, `onDelete`, `onSearch`, `onClose`) with descriptive params (`position`, `query`, `targetId`); pass context as an argument (`onClose(reason)`); give lifecycle pairs (`onTransitionStart`/`onTransitionEnd`) and dual-moment callbacks (`onChange` live plus `onChangeCommitted` final); for async, a Promise-returning `onAction(): Promise<void>` so the component derives pending and error itself.
- **Don't flag:** `onChange` is correct and expected on native `<input>`, `<select>`, `<textarea>`.
- **Source:** React Docs, Responding to Events (https://react.dev/learn/responding-to-events#naming-event-handler-props).

### 3. component-naming [Funky]
- **Sniff for:** location-baked names (`HomePageHeroSectionCallToActionButton`); over-generic names (`Item`); CSS or layout-leaking names (`StyledFlexRow`, `FlexContainer`, `StyledDiv`); verb-prefixed components (`RenderUserList`); backend suffixes (`*Manager`, `*Handler`, `*Controller`, `*Service`) on a presentational component; premature single-element decomposition; flat names cramming hierarchy (`MenuButtonItem`, `MenuSectionDividerLine`); separate near-identical variant components (`ErrorAlert`, `SuccessAlert`, `WarningAlert`).
- **Fix:** name by role, domain plus UI pattern (`CallToActionButton`, `ProductCard`, `UserList`); collapse trivial sub-components into one; collapse variant components into one with a `severity` or `variant` prop (`<Alert severity="error" />`); use compound dot-notation (`Menu.Item`, `Menu.Divider`).
- **Don't flag:** a split is right when the part has independent reuse value or complex internal logic. Verb prefixes belong on hooks (`use*`) and utilities (`get*`, `fetch*`), not components.
- **Source:** React Docs, Your First Component (https://react.dev/learn/your-first-component).

### 4. prop-specificity [Whiff, Funky for `Function`/`object[]`/`color: string`]
- **Sniff for:** a TypeScript `enum` for variants (runtime weight, verbose call sites); generic names (`data`, `selected`, `onClick`, `render`, single-letter params like `v`); ambiguous `color: string`; unit-less `size: number`; inconsistent suffixes (`*Label` next to `*Message`); `object[]` or `Function` prop types.
- **Fix:** string unions (`'primary' | 'secondary' | 'danger'`); specific names (`users`, `selectedUserId`, `onUserSelect`, `renderItem`, `emptyContent`); typed callbacks; `backgroundColor: \`#${string}\` | 'currentColor'`; `size: 'sm' | 'md' | 'lg'`; consistent `*Text` suffixes with separate `openText`/`closeText`.
- **Don't flag:** a plain rename is already the win. The template-literal color type is a bonus, not a requirement.
- **Source:** React Docs, Passing Props (https://react.dev/learn/passing-props-to-a-component).

## Prop shape and state

### 5. prop-organization [Funky]
- **Sniff for:** prefix-grouped flat props (`userName`, `userEmail`, `userRole`); props derivable from another prop passed alongside it (`productCount`, `hasProducts` next to `products`); a boolean explosion of mutually exclusive flags; generic field names on a domain object (`Coordinates`, `x`, `y`); a cluster of `toolbar*` props that is really a sub-component; internal UI state exposed as props (`isDropdownOpen`, `highlightedIndex`); inline object, array, or arrow props; cross-cutting concerns on a display component (`trackImpressions`, `impressionThreshold`).
- **Fix:** group related props into a typed object (`user: User`); derive inside the component; collapse booleans into union axes (`variant`, `size`); use domain names (`LatLng`, `lat`, `lng`); extract a `ReactNode` slot (`toolbar`); keep interaction state internal (data in, selection out); hoist static values to module-level constants; move cross-cutting logic into a hook (`useImpressionTracker`).
- **Don't flag:** inline values only matter when the child is memoized or an effect depends on them. A wrapper arrow `(p) => setSelected(p)` is equivalent to passing `setSelected` directly.
- **Source:** React Docs, Passing Props (https://react.dev/learn/passing-props-to-a-component).

### 6. enumerated-variants [Funky]
- **Sniff for:** mutually exclusive boolean sets for one concept (`isSmall`/`isLarge`; `isError`/`isWarning`/`isSuccess`; `alignLeft`/`alignCenter`/`alignRight`); boolean explosions mixing several dimensions (`isOutlined`/`isFilled`/`isPrimary`/`isClickable`); booleans modeling async state (`isLoading`/`isError`/`isEmpty`/`isRefreshing`); behavior expressed as a boolean (`isClickable`, `isInteractive`); raw numeric design props (`gap?: number`, `padding?: number`).
- **Fix:** one string-union prop per independent dimension (`size?: 'sm' | 'md' | 'lg'`, `severity?`, `align?`, separate `variant` plus `color`); model async as a single `status` state-machine union; derive interactivity from `onClick`/`onDelete` presence; constrain spacing to a finite scale.
- **Don't flag:** spacing as a theme multiplier mapped to `theme.spacing` (MUI `gap={2}`) is fine. The rule is a finite scale, not raw pixels.
- **Source:** MUI, Button API (https://mui.com/material-ui/api/button/).

### 7. discriminated-unions [Funky, Rancid when it permits an impossible state]
- **Sniff for:** a flat interface with a discriminant plus optional per-state props (`status` + `errorMessage?` + `successData?`; `type` + optional `options?`/`min?`/`max?`); union arms that still share every prop as optional and so constrain nothing; per-variant props repeated as optional across all arms; all-optional content allowing empty or conflicting values (`src?` + `name?`).
- **Fix:** a `|` union keyed by the discriminant, each arm listing only its props and making them required where needed (`{ status: 'error'; errorMessage: string }`); `never`-type the forbidden props (`href?: never`, `onClick?: never`) to make variants mutually exclusive; make per-variant props required.
- **Don't flag:** `never`-exclusivity makes prop spreading and delegation harder, so it suits leaf components, not intermediate wrappers. React itself uses a runtime warning, not `never`, for the value plus defaultValue clash.
- **Source:** TypeScript, Discriminated Unions (https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).

### 8. controlled-uncontrolled [Funky, Rancid when state is reset by effect]
- **Sniff for:** invented setter and state names instead of the native contract (`toggled`/`setToggled`, `initialDate`); custom dual-mode trios (`expanded`/`startExpanded`/`onToggle`); per-operation callbacks as the only API for multi-value state (`onAddTag` + `onRemoveTag` with no `value`/`onChange`); resetting internal state via a `resetTrigger` prop plus `useEffect`, or a redundant id prop driving `useEffect(() => setDraft(...))`.
- **Fix:** `checked`/`onChange` for booleans, `value`/`onChange`/`defaultValue` for the general case; apply the same trio per dimension (`open`/`defaultOpen`/`onOpenChange`); for multi-value report the whole new array via one `onChange(next)`; reset by remounting with `key={id}` at the call site.
- **Don't flag:** per-operation `onAdd`/`onRemove` callbacks are fine as a supplement to `value`/`onChange` when the parent must react differently per operation.
- **Source:** React Docs, controlled input and You Might Not Need an Effect (https://react.dev/reference/react-dom/components/input).

### 9. default-values [Funky, Rancid when `||` clobbers a valid falsy value]
- **Sniff for:** `Component.defaultProps` (deprecated in React 19); `||` fallbacks that clobber legitimate falsy values (`min || 0`, `value || 50` breaks `value={0}`); defaults buried in body variables; inline object or array defaults (`filters = {}`, `sortOrder = []`) that create a new reference each render and feed an effect or memo dependency; optional callbacks forcing `?.()` scattered across call sites.
- **Fix:** destructuring defaults in the signature (`size = 40`); hoist object and array defaults to a stable module-level constant (`const EMPTY_FILTERS = {}`); default callbacks to a module-level `noop`; document with `@default`.
- **Don't flag:** `??` in the body is correct, just less discoverable than the signature. Keep a callback `undefined` (no `noop`) when its presence is what conditionally renders UI. Freeze shared module constants if consumers might mutate them.
- **Source:** MDN, Destructuring default values (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment#default_value).

## Composition and types

### 10. children-pattern [Funky]
- **Sniff for:** primary content as a named prop (`content: ReactNode`) instead of `children`; string-typed slots (`title: string`, `iconName?: string`) that block rich content; a config array (`options: Array<{...}>`) where compound components would compose better; raw data props forcing prop drilling (`userName`, `userAvatar`, `navItems` into a `Layout`); paired `XComponent` plus `XProps` sub-component overrides; a polymorphic `as` prop where `asChild` fits; a data-heavy object passed into a `'use client'` wrapper.
- **Fix:** `children` for primary content; `ReactNode` slots for secondary areas (`header`, `footer`, `icon`); compound components (`Select` plus `SelectOption`); pre-rendered `ReactNode` slots to avoid drilling; group overrides into `slots` and `slotProps` objects; `asChild`; pass Server Component `children` through the client wrapper to keep data off the bundle.
- **Don't flag:** config props are the right call for data-driven, fixed-layout components (a `DataGrid`).
- **Source:** React Docs, Passing JSX as children (https://react.dev/learn/passing-props-to-a-component#passing-jsx-as-children).

### 11. render-props [Funky]
- **Sniff for:** a static `ReactNode` slot where the content needs runtime state (`optionContent` cannot see highlighted or selected; `fallback` cannot show the error or a reset); swapped prefixes (`renderLabel` returning a string, `getOption` returning JSX); zero-argument render functions wrapping static content (`renderIcon={() => <Icon/>}`); one broad `children(state)` callback dumping all internal state.
- **Fix:** a render function that passes the per-item or per-error state (`renderOption(option, { isHighlighted, isSelected })`, `renderFallback(error, reset)`); `render*` for JSX and `get*` for data; a plain `ReactNode` slot when no data flows back; scoped render props (`renderRow`, `renderEmpty`, `renderPagination`) that each expose only their slice.
- **Don't flag:** a static slot is correct for genuinely static content.
- **Source:** MUI, Autocomplete API (https://mui.com/material-ui/api/autocomplete/).

### 12. generic-props [Funky]
- **Sniff for:** `unknown[]` or `unknown` in list-style props that should share a type; a `string` value prop disconnected from its `options`; `key: string` in column definitions where typos compile; a fixed item shape (`{ id; label }`) forcing consumers to remap; a bare `name: string` field prop with no link to the form shape.
- **Fix:** introduce a type parameter with a constraint (`<T>`, `<V extends string>`, `<T extends { id: string }>`) and derive the props from it (`items: T[]`, `value: V`, `key: keyof T & string`); use two params (`TForm`, `K extends keyof TForm & string`) with indexed access `TForm[K]` to tie a field to its form.
- **Don't flag:** `unknown` is still type-safe, so this is a lower-severity smell. It just pushes the cast onto every consumer.
- **Source:** TypeScript, Generics and Generic Constraints (https://www.typescriptlang.org/docs/handbook/2/generics.html).

### 13. extending-html [Funky, Rancid when style override order is wrong]
- **Sniff for:** re-declaring props already inherited after `extends` (`onClick`, `disabled`, `type`), which also narrows the event type; hand-listing HTML attributes (`className`, `id`, `style`, `role`) instead of extending; an over-broad `Omit` that strips then re-declares props that already worked; a polymorphic `as: string` typed with `HTMLAttributes<HTMLElement>` (accepts `"banana"`); `onSubmit` plus `isSubmitting` instead of the React 19 `action`; `{...rest}` spread after `className`, letting consumers silently override internal styling.
- **Fix:** `extends React.ComponentProps<'button'>` and add only the genuinely new props; `Omit` only the single prop you redefine; polymorphic via `<E extends React.ElementType = 'div'>` with `ComponentPropsWithoutRef<E>`; `action: (data: FormData) => Promise<void>`; spread `{...rest}` before the explicit props and `Omit` the props you manage internally.
- **Don't flag:** simplifying `onChange` to `(value: string)` is good for a single-purpose wrapper. Keep the native event signature when consumers need `event.target.name` (multi-field forms).
- **Source:** React Docs, Common Components (https://react.dev/reference/react-dom/components/common).

### 14. ref-forwarding [Funky]
- **Sniff for:** a props interface with no `ref` support, so consumers cannot `.focus()` or measure; `ref?: any`; a raw DOM ref where a scoped imperative API was wanted; a ref aimed at the wrapper `<div>` when consumers need `.focus()` or `.select()` (an input method); over-exposed handles that duplicate props (`getValue`/`setValue` next to `value`/`onChange`).
- **Fix:** extend `React.ComponentProps<'button'>` to inherit ref-as-prop (React 19) and native attributes; type a forwarded ref as `React.Ref<HTMLInputElement>`; expose a focused handle via `useImperativeHandle` (`play`, `pause`, `seek`); target the inner `<input>` and offer a separate `containerRef` for layout; keep handles to genuine imperative operations.
- **Don't flag:** a separate `containerRef` for layout measurement is legitimate. An imperative handle also doubles as documentation of supported operations.
- **Source:** React Docs, useImperativeHandle (https://react.dev/reference/react/useImperativeHandle).

### 15. styling-api [Funky]
- **Sniff for:** raw style props (`backgroundColor`, `textColor`, `fontSize`, `borderRadius`, `hoverColor`) and open `color: string`; no `className` prop, forcing wrapper divs; `style?: CSSProperties` as the primary styling hook (no media queries, pseudo-classes, or variables); many flat `*ClassName` props (`headerClassName`, `bodyClassName`); per-breakpoint props (`mobileColumns`, `tabletColumns`, `desktopColumns`); CSS-mirroring props (`display`, `flexDirection`, `gap`, `padding`, `overflow`); a loose `Record<string, unknown>` where `SxProps<Theme>` is meant.
- **Fix:** encode design decisions as `variant`/`size`/`color` unions mapped to theme tokens; accept `className` and merge with `clsx` or `cn`; group sub-element styles into a `classes` object; accept a responsive object (`number | { xs?, sm?, md? }`); expose semantic `direction` and `spacing` instead of raw CSS props; type sx hatches as `SxProps<Theme>`.
- **Don't flag:** accept both `className` and `style` when dynamic runtime values (positioning) are genuinely required. An sx escape hatch is idiomatic in MUI; flag only the loose type, not the hatch.
- **Source:** MUI component style APIs (https://mui.com/material-ui/api/button/).

## Correctness and boundaries (highest severity)

### 16. accessibility-props [Rancid]
- **Sniff for:** icon-only or image components where the accessibility attribute is optional or missing (`'aria-label'?: string`, `alt?: string`); ARIA attributes typed loosely (`role?: string`, `'aria-live'?: string`); duplicated label props that can drift (`aria-label` next to a `title`); custom form controls lacking `aria-labelledby`, `aria-describedby`, or `aria-invalid` hooks despite having `errorMessage` and `isRequired`.
- **Fix:** make `aria-label` and `alt` required (use `alt=""` for decorative images); narrow ARIA props to literal unions (`role?: 'status' | 'alert'`, `'aria-live'?: 'polite' | 'assertive' | 'off'`); prefer `aria-labelledby` pointing at the rendered title over a duplicated `aria-label`; map `errorMessage` to `aria-invalid` and `isRequired` to `aria-required` internally.
- **Don't flag:** MUI's Dialog auto-generates the `aria-labelledby` id, so consumers rarely pass it. `alt=""` is correct and intentional for decorative images and differs from omitting `alt`. (This is the prop-type half; the markup half is Pillar 6, accessibility in markup.)
- **Source:** MDN, aria-label (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label).

### 17. server-component-props [Rancid]
- **Sniff for:** passing a function as a prop from a Server to a Client Component (runtime crash); spreading server data fields onto a client wrapper that only animates; an `onSubmit` plus manual `isPending` pair; non-serializable prop types (`RegExp`, class instances, `WeakMap`, `Symbol`, functions); a whole page marked `'use client'` because a couple of buttons need interactivity.
- **Fix:** mark the function `'use server'` and pass it as `action`; use the donut pattern, passing Server-rendered `children` through the Client wrapper; name the prop `action` and derive `isPending` from `useActionState` or `useFormStatus`; convert to a serializable equivalent (`RegExp` to `.source`); keep the page a Server Component and pass only `productId` plus a Server Action to a small client leaf.
- **Don't flag:** `Date`, `Map`, `Set`, `BigInt`, typed arrays, and plain objects and arrays are serializable and cross the boundary fine.
- **Source:** Next.js, Server and Client Components (https://nextjs.org/docs/app/getting-started/server-and-client-components).

## Documentation

### 18. jsdoc [Whiff]
- **Sniff for:** JSDoc that restates the prop name (`/** The delay. */`); missing `@default` on optional props; vague callback docs that omit when it fires and what the params mean; a component description and `@example` placed on the interface instead of the function, so hovering the component shows nothing; generic example values (`title="Title"`); a plain `// don't use` comment instead of `@deprecated`.
- **Fix:** describe behavior and units ("Delay in milliseconds before the tooltip appears"); add `@default`; document the trigger and parameter meaning; put the description and `@example` on the function and the prop docs on the interface; use realistic example values; use the `@deprecated` tag so tooling shows strikethrough.
- **Don't flag:** keep this the lowest-severity category. Do not bury a clean component in doc-comment findings.
- **Source:** TypeScript, JSDoc Reference (https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html).

# Pillar 2. State and data flow

### 19. redundant-state [Funky, Rancid when the copy drifts]
- **Sniff for:** a `useState` holding a value you can compute from props or other state (`const [fullName, setFullName]` from `first` and `last`; `const [visibleItems]` filtered from `items` and `query`); a `useEffect` that exists only to keep that state in sync.
- **Fix:** compute it during render (`const fullName = `${first} ${last}``; `const visible = items.filter(...)`). Delete the state and the syncing effect. If the computation is heavy, that is the one case for `useMemo`, which the `react-compiler` skill covers.
- **Don't flag:** state is correct when the value must persist across renders independently of its inputs (a captured snapshot, an optimistic value, user edits in progress).
- **Source:** React, Choosing the State Structure (https://react.dev/learn/choosing-the-state-structure#avoid-redundant-state).

### 20. props-in-state [Rancid]
- **Sniff for:** `useState(props.value)` or `useState(() => props.value)` where the component then expects later `props.value` changes to show, but nothing syncs them; constructor-style copying of props into state.
- **Fix:** read the prop directly when it should stay live. If the component owns edits, name the prop `defaultValue`/`initialX` to signal it seeds only the first render, and reset on identity change with `key={id}` rather than an effect.
- **Don't flag:** seeding initial state from a prop is a valid, common pattern when the name says it is initial (`defaultValue`, `initialCount`) and later changes are intentionally ignored.
- **Source:** React, Choosing the State Structure (https://react.dev/learn/choosing-the-state-structure#don-t-mirror-props-in-state).

### 21. duplicated-state [Funky, Rancid when the copies disagree]
- **Sniff for:** the same fact stored twice (`selectedItem` object plus `selectedId`; a list and a `selectedIndex` into a different list); nested state that duplicates a parent's data; an id and the full object both held in state; several `useState` values set together from one source that could be one value or derived from each other.
- **Fix:** store the minimal source of truth (usually the id) and derive the rest during render. One fact, one home.
- **Don't flag:** a denormalized cache held deliberately for performance, with a clear single writer, is a considered tradeoff rather than an accident.
- **Source:** React, Choosing the State Structure (https://react.dev/learn/choosing-the-state-structure#avoid-duplication-in-state).

### 22. prop-drilling [Funky]
- **Sniff for:** a prop threaded through three or more layers that do not use it, only forward it; intermediate components whose signatures grow only to pass data down; the same `user`/`theme`/`locale` passed at every level.
- **Fix:** for shared, slowly-changing data, lift it into Context with a typed provider and a `use*` consumer hook. For one-off structure, pass pre-rendered `children` or named `ReactNode` slots so the middle layers never see the data (see category 10).
- **Don't flag:** passing a prop down one or two levels is normal and clearer than a context. Context is for genuinely cross-cutting data, not to avoid every handoff.
- **Source:** React, Passing Data Deeply with Context (https://react.dev/learn/passing-data-deeply-with-context).

# Pillar 3. Effects and lifecycle

### 23. effect-for-derived [Funky, Rancid when it cascades renders]
- **Sniff for:** a `useEffect` whose only job is `setState` from props or other state; chains of effects that each set state the next one reads; "when X changes, recompute Y into state".
- **Fix:** compute Y during render and delete the effect and its state (see category 19). Effects are for synchronizing with systems outside React, not for transforming data already in render scope.
- **Don't flag:** an effect that writes to something external (localStorage, the document title, an analytics call) is doing real synchronization, not deriving state.
- **Source:** React, You Might Not Need an Effect (https://react.dev/learn/you-might-not-need-an-effect#updating-state-based-on-props-or-state).

### 24. effect-for-event [Funky]
- **Sniff for:** logic in a `useEffect` that should run in response to a specific user action (POST on a `submitted` flag toggling; showing a toast when a `count` prop crosses a threshold); effects that run "because a value changed" when the real trigger was an event.
- **Fix:** move the logic into the event handler that caused it (`onSubmit`, `onClick`). Reserve effects for synchronization that must happen because the component is displayed, regardless of which event led there.
- **Don't flag:** when the cause genuinely is "the component rendered with this prop" and there is no originating event (an initial fetch for the displayed id), an effect or a data library is correct.
- **Source:** React, You Might Not Need an Effect (https://react.dev/learn/you-might-not-need-an-effect#sharing-logic-between-event-handlers).

### 25. missing-cleanup [Rancid]
- **Sniff for:** a `fetch` in `useEffect` with no `ignore`/`AbortController` guard (race: a slow earlier response overwrites a newer one); `addEventListener`, `setInterval`, `setTimeout`, or a subscription with no matching teardown in the returned cleanup; a websocket or observer opened and never closed.
- **Fix:** return a cleanup function. For fetches, set an `ignore` flag or abort on cleanup and drop stale results; for listeners, timers, and subscriptions, remove or clear the exact thing you set up. Prefer a data library (TanStack Query, RSC) over hand-rolled fetch effects.
- **Don't flag:** an effect with no external resource to release needs no cleanup. Not every effect requires one.
- **Source:** React, Synchronizing with Effects (https://react.dev/learn/synchronizing-with-effects#fetching-data).

### 26. effect-deps [Funky, Rancid when staleness causes a visible bug]
- **Sniff for:** a dependency array that does not match what the effect reads; a `[]` on an effect that uses props, state, or derived values (`useEffect(() => { setHistory(getHistory()); setX(seedFromKey(key)); }, [])`); an over-broad array that re-runs the effect too often; an `// eslint-disable-next-line react-hooks/exhaustive-deps` hiding the mismatch.
- **Fix:** list every reactive value the effect reads, or remove the need for the dependency (hoist static values, wrap an unstable function, lift the value). For a deliberate run-once-on-mount load of client-only data (localStorage, an SSR-unsafe API), say so in a comment, or read the external store with `useSyncExternalStore` instead of mirroring it into state via an effect.
- **Don't flag:** a genuinely run-once mount effect whose `[]` is intentional and whose referenced values are stable for the component's life is acceptable, especially with a comment. The goal is an honest dependency array, not a longer one that loops.
- **Source:** React, Removing Effect Dependencies (https://react.dev/learn/removing-effect-dependencies).

### 27. reset-with-key [Funky]
- **Sniff for:** resetting all internal state when an identity prop changes by way of a `useEffect(() => { setX(initial); ... }, [id])`, or a `resetTrigger`/`version` prop that exists only to re-init state.
- **Fix:** remount the subtree with `key={id}` at the call site. React throws away and rebuilds the state for free, with no effect and no reset prop. (This is the markup-side twin of category 8.)
- **Don't flag:** resetting one field in response to a real event (not an identity change) belongs in that event handler, not a `key`.
- **Source:** React, You Might Not Need an Effect (https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes).

# Pillar 4. Component structure and hooks

### 28. god-component [Funky]
- **Sniff for:** one component that fetches data, holds many `useState`/`useReducer`, runs business logic, and renders a large tree; hundreds of lines; a dozen handlers defined inline; mixed concerns that change for unrelated reasons.
- **Fix:** extract stateful logic into custom hooks (`useGameState`, `useSeedInput`) and extract presentational chunks into subcomponents. Aim for a component that reads as a short composition of named parts.
- **Don't flag:** length alone is not a smell. A long but linear, single-purpose render with no tangled state can be perfectly maintainable. Judge by number of responsibilities, not lines.
- **Source:** React, Reusing Logic with Custom Hooks (https://react.dev/learn/reusing-logic-with-custom-hooks).

### 29. nested-component-def [Rancid]
- **Sniff for:** a `function Child() {}` or a `const Child = (...) => ...` defined inside another component's body and rendered as `<Child />`; a component created inside `map` or a render helper that returns a component type.
- **Fix:** hoist the component to module scope (or pass data as props). A component defined inline is a brand-new type every render, so React unmounts and remounts it, losing its state and DOM and thrashing performance.
- **Don't flag:** a small arrow that returns JSX and is called as a function (`{renderRow(item)}`), not mounted as `<Row />`, is just a helper and is fine. The smell is mounting a freshly-defined component type.
- **Source:** React, Your First Component (https://react.dev/learn/your-first-component#nesting-and-organizing-components).

### 30. extract-custom-hook [Funky]
- **Sniff for:** the same `useState` plus `useEffect` cluster copy-pasted across components (a fetch-and-loading block, a media-query listener, a debounce); stateful logic interleaved with unrelated rendering.
- **Fix:** extract a `use*` hook that owns the state and effects and returns the values. Reuse it across components; the logic gets one home and a name.
- **Don't flag:** a one-off piece of stateful logic used in a single place does not need a hook yet. Extract on the second use, not in anticipation.
- **Source:** React, Reusing Logic with Custom Hooks (https://react.dev/learn/reusing-logic-with-custom-hooks#extracting-your-own-custom-hook-from-a-component).

### 31. conditional-hooks [Rancid]
- **Sniff for:** a hook called inside an `if`, a loop, a `&&`, or after an early `return`; a hook count that can vary between renders; hooks called from a regular function that is not a component or a `use*` hook.
- **Fix:** call every hook unconditionally at the top level, then branch on the result. Move conditions inside the hook (pass `enabled` flags) rather than around the call.
- **Don't flag:** the React 19 `use(promise)` API may be called conditionally by design; it is the documented exception, not a violation of the Rules of Hooks.
- **Source:** React, Rules of Hooks (https://react.dev/reference/rules/rules-of-hooks).

### 32. positional-hook-params [Funky]
- **Sniff for:** a hook or utility with three or more positional parameters, especially where the later ones are optional flags, numbers, or enums (`useGame(pool, seed, excluded, retryKey, gameType)`), so call sites read `useThing(a, b, undefined, 0, "custom")`.
- **Fix:** keep the one or two required positional arguments, then collect the rest into a single options object (`useGame(pool, seed, { retryKey, gameType })`). Call sites become self-labeling and new options do not shift positions. This applies equally to a hook's typed contract (a `useGame: (a, b, c, d, e) => ...` prop or interface), not just the implementation.
- **Don't flag:** one or two clear positional params (a value and a callback, like `useState(initial)`) are idiomatic and need no object.
- **Source:** React Docs, Passing Props (https://react.dev/learn/passing-props-to-a-component). (The prop-organization principle, category 5, applied to a function signature.)

# Pillar 5. Rendering correctness

### 33. index-keys [Funky, Rancid on a list that reorders or edits]
- **Sniff for:** `key={index}` or `key={i}` on a list that can reorder, filter, insert, or delete; missing `key` on mapped elements; a non-stable key (`key={Math.random()}`) that remounts every item.
- **Fix:** key by a stable, unique id from the data (`key={item.id}`). The key tells React which item is which across renders; an index gives the wrong answer the moment the list changes, corrupting input state and animations.
- **Don't flag:** an index key is acceptable for a list that is static, never reordered, and has no per-item state or input. The bug only appears when items move.
- **Source:** React, Rendering Lists (https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key).

### 34. direct-mutation [Rancid]
- **Sniff for:** mutating state in place (`state.items.push(x)`, `obj.field = y`, `arr.sort()`) then calling `setState(sameRef)`; mutating a prop; splicing an array held in state; building the next state by editing the current one.
- **Fix:** produce a new value (`setItems([...items, x])`, `setObj({ ...obj, field: y })`, `[...arr].sort()`). React compares by reference, so an in-place edit can render stale UI or skip updates. Never write to props.
- **Don't flag:** mutating a brand-new local object you just created this render, before it enters state, is fine. The rule is about values React already holds.
- **Source:** React, Updating Objects in State (https://react.dev/learn/updating-objects-in-state).

### 35. ternary-sprawl [Funky]
- **Sniff for:** nested ternaries inside JSX (`{a ? <X/> : b ? <Y/> : <Z/>}`), several deep; long `&&` chains gating blocks; the same condition repeated across multiple branches; an entire screen rendered as one giant conditional expression.
- **Fix:** lift the decision out of JSX into a variable or an early `return`, or extract a subcomponent per branch. For more than two states, a small lookup map or a `switch` in a helper reads better than nested `?:`.
- **Don't flag:** a single short ternary for a two-way choice (`{isOpen ? <Close/> : <Open/>}`) is clear and idiomatic.
- **Source:** React, Conditional Rendering (https://react.dev/learn/conditional-rendering).

### 36. repeated-markup [Funky]
- **Sniff for:** three or more JSX blocks that are near-identical and differ only in data (a `left`/`right` pair of the same panel repeated per content type; a `switch` whose arms render the same element shape; the same element duplicated for "A" and "B" sides); copy-pasted conditional branches kept in sync by hand.
- **Fix:** extract one parameterized helper or subcomponent and call it with the differing data (`renderPanel('left')` and `renderPanel('right')`, or a `<Panel side="left" />` that switches on the content type internally). One shape, one place to change.
- **Don't flag:** two short, diverging blocks, or blocks that look alike today but are expected to evolve apart. Duplication is cheaper than the wrong abstraction; flag clear, mechanical copy-paste, not every similarity.
- **Source:** React, Rendering Lists (https://react.dev/learn/rendering-lists). (The DRY twin of component-naming, category 3, for inline JSX rather than whole components.)

### 37. inline-jsx-churn [Whiff, Funky against a memoized child]
- **Sniff for:** a new object, array, or arrow literal created in JSX props (`style={{...}}`, `options={[...]}`, `onChange={() => ...}`) that feeds a memoized child component or an effect dependency.
- **Fix:** hoist truly-static values to module-level constants; for values that depend on render, this is memoization territory, which the `react-compiler` skill owns. Without the compiler, a stable reference matters only when a `React.memo` child or an effect dep actually reads it.
- **Don't flag:** inline literals on plain DOM elements or non-memoized children are fine and not worth a finding. Do not turn this into a blanket "no inline functions" rule.
- **Source:** React Docs, Passing Props (https://react.dev/learn/passing-props-to-a-component). (Overlaps categories 5 and 9; defer the memo angle to `react-compiler`.)

# Pillar 6. Accessibility in markup

### 38. clickable-nonsemantic [Rancid]
- **Sniff for:** `onClick` on a `<div>`, `<span>`, `<Box>`, `<Stack>`, `<Paper>`, or other non-interactive element with no `role`, no `tabIndex`, and no keyboard handler; a custom "button" that only works with a mouse; a clickable card or row that keyboard users cannot reach or trigger.
- **Fix:** render a real control (`<button>`, `<a>`, MUI `Button`/`IconButton`, `CardActionArea`, or `component="button"`). If you must keep the element, add `role="button"`, `tabIndex={0}`, and an `onKeyDown` that fires on Enter and Space. Links use `<a href>`, not `onClick` navigation.
- **Don't flag:** a click handler on a genuinely non-interactive surface where the same action is also available through a real focusable control nearby (a backdrop that closes a dialog, with an explicit close button) is a known pattern.
- **Source:** MDN, button role (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/button_role).

### 39. semantic-html [Funky]
- **Sniff for:** `<div>` soup where a semantic element fits (`<div onClick>` for a button, `<div>` lists instead of `<ul>/<li>`, headings faked with styled `<div>`, navigation not in `<nav>`, a `<div>` form without `<form>`); heading levels chosen for size, not structure.
- **Fix:** use the element that matches the meaning (`<button>`, `<nav>`, `<ul>`, `<main>`, `<header>`, `<h1>`..`<h6>` in order). Semantic elements bring focus, keyboard behavior, and screen-reader semantics for free; style them with CSS.
- **Don't flag:** a `<div>` used purely for layout or grouping with no semantic role is exactly what `<div>` is for. Not every element needs a semantic tag.
- **Source:** MDN, HTML elements reference (https://developer.mozilla.org/en-US/docs/Web/HTML/Element).

### 40. label-association [Rancid]
- **Sniff for:** an `<input>`, `<select>`, or `<textarea>` with no associated `<label htmlFor>`, no `aria-label`, and no `aria-labelledby`; placeholder text used as the only label; an icon-only control with no accessible name.
- **Fix:** associate a visible `<label htmlFor={id}>` with the control's `id`, or wrap the control in the label. When no visible label exists, give an `aria-label`. Placeholder is a hint, not a label.
- **Don't flag:** a control already labeled by a component that wires the association for you (MUI `TextField` with its `label` prop) is fine. Verify the wiring before flagging.
- **Source:** MDN, the label element (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label).

# Pillar 7. TypeScript discipline

### 41. any-escape [Funky, Rancid when it hides a real bug]
- **Sniff for:** `any`, `as any`, `: any` params, `any[]`, `Promise<any>`; `@ts-ignore` or `@ts-expect-error` suppressing a real error; an untyped third-party value flowing through the app as `any`.
- **Fix:** type the value, or use `unknown` and narrow with a guard before use. For external data, validate at the boundary (a schema like Zod) and let the parsed type flow inward. Replace `@ts-ignore` with a typed fix or a narrowly-scoped, commented `@ts-expect-error`.
- **Don't flag:** a single, commented `any` at a genuinely untyped boundary can be pragmatic. Prefer `unknown`, but do not block a change over one well-justified escape.
- **Source:** typescript-eslint, no-explicit-any (https://typescript-eslint.io/rules/no-explicit-any/).

### 42. unsafe-assertion [Funky, Rancid when the cast is false]
- **Sniff for:** an `as` cast that changes the type to something the value is not (`as User` on a partial object, `as unknown as T` to silence the checker); a non-null assertion `!` on a value that can be null or undefined (`document.getElementById(id)!`, `data!.field`); casting away `readonly` or a union arm.
- **Fix:** narrow with a runtime check (`if (!el) return`, `typeof`, `in`, a discriminant) so the type follows the check; reach for a type guard or schema validation instead of asserting. Use `!` only where you can prove non-null and a check is genuinely impossible.
- **Don't flag:** a `const` assertion (`as const`) is a different, safe tool. A narrowing assertion the compiler cannot see but you can prove (a ref set in the same effect) may be acceptable with a comment.
- **Source:** TypeScript, Everyday Types and type assertions (https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions).

### 43. loose-internal-types [Whiff, Funky for `Function`/`object`]
- **Sniff for:** `object`, `{}`, or `Function` as a type; a `string` or `number` where a finite set of values is meant (a status, a mode, a kind) in internal (non-prop) code; an index signature (`Record<string, unknown>`) standing in for a known shape; implicit `any` from an untyped function.
- **Fix:** model the real shape (an interface or a string-union type); type callbacks with their signature (`(id: string) => void`, not `Function`); replace stringly-typed states with a union (`type Status = 'idle' | 'loading' | 'done'`).
- **Don't flag:** `unknown` for a genuinely unknown value, and `Record<string, T>` for a real dictionary, are correct. This is the internal-code twin of prop-specificity (category 4); apply the same "a rename or a union is already a win" judgment.
- **Source:** TypeScript, Everyday Types (https://www.typescriptlang.org/docs/handbook/2/everyday-types.html).

# Pillar 8. Cross-file duplication

This pillar runs only in folder and repo-sweep scope, after the per-file pass, because it compares files against each other. The method (inventory, cluster, confirm, report) is in [duplication-pass.md](./duplication-pass.md).

### 44. duplicate-implementation [Funky]
- **Sniff for:** the same UI built twice (a named, reusable component plus an inline reimplementation of it in another file); a `type` or `interface` declared independently in two files (`interface CategorySection` in both the component and its caller); a utility or constant copy-pasted instead of imported; two components with the same prop shape and the same rendered tree.
- **Fix:** keep one canonical version and use it everywhere (replace the inline reimplementation with the existing component, move the shared `type` into a common module and import it, import the utility instead of copying it). When neither copy is canonical, extract a shared one. Name the concrete drift risk (what breaks when one copy changes and the other does not).
- **Don't flag:** superficial similarity across different domains (two unrelated card layouts), framework-required boilerplate, generated code, test fixtures, and two-line helpers clearer inlined. Duplication is a smell only when the copies encode the same decision and must change together. For duplicated hook logic see category 30; for duplicated JSX within one file see category 36.
- **Source:** React, Reusing Logic with Custom Hooks (https://react.dev/learn/reusing-logic-with-custom-hooks). (The cross-file form of the DRY principle; pairs with categories 30 and 36.)
