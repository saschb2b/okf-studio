---
type: Library Notes
title: "Nx"
description: "\"Project Crystal\" (Nx 18) inverts configuration: plugins infer targets from the tool's own config files (`vite.config.ts`, `nest-cli.json`) instead of hand-written `project.json` targets."
tags: [javascript, tooling]
timestamp: 2026-06-04T00:00:00Z
---
# Nx

**Verified 2026-06-04.** Check the installed `nx` version first; re-verify if newer than below.

**Current stable**: v22 (22.7); v23 in beta. **LLM default bias**: Nx 15 and 16, where every project needed an explicit `project.json` listing all targets, and `nx.json` leaned on `tasksRunnerOptions`. LLMs also still treat Lerna as a live competitor.

## The shift
"Project Crystal" (Nx 18) inverts configuration: plugins infer targets from the tool's own config files (`vite.config.ts`, `nest-cli.json`) instead of hand-written `project.json` targets. Nx 22 is a polyglot build platform (Java/Gradle, Maven, .NET) with Self-Healing CI and a Terminal UI. The inference model (`createNodesV2`) is the default authoring path.

## Stop / Start
| Stop (Nx 15 to 16 habits) | Start (current Nx) |
| --- | --- |
| Hand-writing every target in `project.json` | Project Crystal plugins infer `build`/`test`/`serve` from tool config |
| Authoring plugins with `createNodes` (V1) | `createNodesV2` (V1 removed in Nx 22) |
| `tasksRunnerOptions` for cache config | `nx.json` `targetDefaults` and modern cache config |
| "Lerna is a dead competing tool" | Lerna is Nx-stewarded, runs on the Nx engine, for multi-package npm publishing |
| Treating Nx as Angular or JS-only | Nx 22 is polyglot (Gradle, Maven, .NET) |
| `create-nx-workspace` expecting v16 defaults | v22 defaults (inferred tasks, Terminal UI) |

## Gotchas
- Use the `convert-to-inferred` generators to migrate explicit targets to Project Crystal rather than deleting `project.json` by hand.
- Config precedence is inferred tasks, then `targetDefaults`, then project-level config. The old "project.json is required" advice is wrong.
- Upgrade with `nx migrate latest` then `nx migrate --run-migrations`, not a manual version bump.

## Sources
- https://nx.dev/blog/nx-22-release
- https://nx.dev/docs/concepts/inferred-tasks
