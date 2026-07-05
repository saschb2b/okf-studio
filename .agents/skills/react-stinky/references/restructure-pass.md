---
type: Playbook
title: "React Stinky: Restructure Pass"
description: "A dependency-graph method for planning the fix when findings cluster on structural smells; map every relation as a node graph, then rewire to the fewest one-layer edges."
tags: [react, typescript, refactoring, architecture, decoupling]
timestamp: 2026-07-03T00:00:00Z
---
# React Stinky: Restructure Pass

The catalog detects smells one at a time; this pass plans the fix when the findings are structural. Model the component's dependencies as an explicit node graph, read the smells off the graph's shape, then rewire to the cleanest shape and check the result against the same rules. Write the graph down (adjacency lists in the analysis; a small before/after in the report) instead of holding it in your head; the point is that every edge is enumerated and every restructuring claim is checkable.

Run it when findings cluster on the structural smells (duplicated-state 21, prop-drilling 22, effect-data-to-parent 28, god-component 32, coupled-view 33, duplicate-implementation 57), or when the request is to restructure, decouple, or make a component reusable. Skip it when a local fix closes the finding; a 40-line component does not need a graph.

## 1. Build the graph

Nodes: the component and each rendered child; every external thing it touches (API or query calls, stores, contexts, the router, browser APIs, module singletons, domain functions); every fact it holds (props in, state owned, derived values).

Edges, labeled by kind. Every hook call, import, context read, and callback is an edge; module-level singletons and effect side-channels count too.

- **props-down**: parent passes data to a child.
- **events-up**: child reports through a callback.
- **reach-out**: a view pulls from the environment (fetch, store, context, router). These are the coupling edges.
- **pass-through**: a prop enters a component that never reads it, only forwards it.
- **sync**: an effect mirrors one node into another, or two components couple through paired effects.
- **duplicate-path**: the same fact arrives by two routes (a prop and a context, an object and its id).

## 2. Read the shape

| Graph shape | Smell | Category |
| --- | --- | --- |
| reach-out edge below the composition layer | coupled-view | 33 |
| pass-through chain three or more deep | prop-drilling | 22 |
| one node fanning out to fetch, domain rules, many state nodes, and a large render | god-component | 32 |
| two paths or two nodes for one fact | duplicated-state | 21 |
| upward data edge from an effect, or a sync cycle between two components | effect-data-to-parent | 28 |
| the same subgraph appearing in two files | duplicate-implementation | 57 |
| a state node whose readers all sit in a different subtree | state owned at the wrong level; move it to the lowest common ancestor |

## 3. Rewire

Apply in order; each rule constrains the next.

1. **One fact, one home, at the lowest common ancestor of its readers and writers.** State placed lower than its readers forces sync edges; higher than needed forces drilling.
2. **Edges travel one layer: props down, events up.** A reach-out edge from a reusable view moves up to the composition layer (page, container, or a hook composed there) and re-enters as a prop named for the behavior it drives (`canEdit`, `dueLabel`, `onSubmit`).
3. **Count consumers before making anything generic.** Genericize when the graph shows a second real consumer (or one concretely scheduled); a generic component with one consumer is speculative coupling wearing a clean shirt.
4. **Arbitrate the leftover tension by edge count.** If a lift created a pass-through chain three or more deep, do not drill: pass pre-rendered `children` or slots so the middle layers never see the data, or use context for app-wide, slow-changing facts (category 25 rules apply). If a context would serve fewer than three consumers or a fast-changing value, stay with props.
5. **Prefer the rewiring that deletes the most wrong edges while adding the fewest new nodes.** One moved boundary beats three new abstractions.

## 4. Verify and report

Redraw the graph after the change and check: no reach-out edges below the composition layer; no pass-through chain of three or more; one path per fact; the leaf renders in Storybook or a test from plain props, no mocks. If the new graph is not simpler than the old one (fewer wrong edges, no new smell such as a god container), the restructure is not justified; say so and keep the local fix instead.

Report the before and after as two short edge lists under the relevant finding, and name what each removed edge buys (renders in Storybook without mocks, the pricing rule becomes a unit-testable function, the type has one home). Use a Mermaid diagram only when the user asks for a picture.
