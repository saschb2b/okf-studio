---
type: Library Notes
title: "React Native (with Expo)"
description: "The New Architecture (Fabric renderer, TurboModules, JSI) is enabled by default since React Native 0.76."
tags: [javascript, mobile]
timestamp: 2026-06-05T00:00:00Z
---
# React Native (with Expo)

**Verified 2026-06-05.** Check the installed `react-native` and Expo SDK versions first; re-verify if newer than below.

**Current stable**: React Native 0.85; New Architecture default since 0.76; Expo SDK 56. **LLM default bias**: `npx react-native init`, the old bridge architecture, bare React Native as the default path, and class components.

## The shift
The New Architecture (Fabric renderer, TurboModules, JSI) is enabled by default since React Native 0.76. The official docs now recommend building new apps with a framework, featuring Expo first, with Expo Router for file-based routing. The legacy `react-native init` was removed.

## Stop / Start
| Stop (LLM default) | Start (current) |
| --- | --- |
| `npx react-native init MyApp` | `npx create-expo-app@latest` (or `npx @react-native-community/cli@latest init` for bare) |
| Bare React Native as the default path | A framework first (Expo), per the official Get Started |
| Old bridge architecture / manual `newArchEnabled` opt-in | New Architecture on by default (0.76+); opt out only if needed |
| Hand-rolled navigation | Expo Router (file-based, universal across iOS, Android, web) |
| Class components and legacy lifecycles | Function components and Hooks |

## Gotchas
- `react-native init` was deprecated at the end of 2024 and removed in 0.77; uninstall the global `react-native-cli`.
- Expo is a production-grade framework now, not just a prototyping sandbox; the bare workflow remains for constrained cases.
- Expo SDK 56 bundles React Native 0.85.

## Agent skills
Expo publishes official agent skills (`npx skills add expo/skills`: building-native-ui, expo-api-routes, upgrading-expo, and more), documented at docs.expo.dev/skills. For Expo and React Native work, prefer the official skill.

## Sources
- https://reactnative.dev/docs/getting-started
- https://reactnative.dev/architecture/landing-page
- https://docs.expo.dev/router/introduction/
